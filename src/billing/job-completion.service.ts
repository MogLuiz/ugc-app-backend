import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ContractRequest } from '../contract-requests/entities/contract-request.entity';
import { ContractRequestStatus } from '../common/enums/contract-request-status.enum';
import {
  CONTRACT_REQUEST_COMPLETED_EVENT,
  ContractRequestCompletedEvent,
} from '../contract-requests/events/contract-request-completed.event';
import {
  CONTRACT_AWAITING_COMPLETION_CONFIRMATION_EVENT,
  ContractAwaitingCompletionConfirmationEvent,
} from '../contract-requests/events/contract-awaiting-completion-confirmation.event';

const COMPLETION_DEADLINE_HOURS = 72;

/**
 * Crons de transição de estado pós-job.
 *
 * Regras:
 * 1. ACCEPTED com endsAt passado → AWAITING_COMPLETION_CONFIRMATION
 *    contestDeadlineAt = now + 72h é setado imediatamente na entrada.
 * 2. AWAITING_COMPLETION_CONFIRMATION com contestDeadlineAt expirado:
 *    a. ≥ 1 confirmação → COMPLETED (auto-conclusão explícita)
 *    b. 0 confirmações  → COMPLETED por aprovação tácita (completedByTacitApproval = true)
 *    Se não houver contestação até o prazo, o serviço é concluído automaticamente.
 *
 * Ambos os métodos são idempotentes: o UPDATE usa WHERE no status atual,
 * evitando race conditions com chamadas concorrentes.
 */
@Injectable()
export class JobCompletionService {
  private readonly logger = new Logger(JobCompletionService.name);

  constructor(
    @InjectRepository(ContractRequest)
    private readonly contractRequestRepo: Repository<ContractRequest>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Detecta contratos ACCEPTED cujo horário final (startsAt + durationMinutes) já passou
   * e os move para AWAITING_COMPLETION_CONFIRMATION.
   *
   * Seta contestDeadlineAt = now + 72h imediatamente — o prazo nasce na entrada,
   * não na primeira confirmação.
   * NÃO gera nenhum efeito financeiro — apenas muda o status.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async transitionJobsToAwaitingConfirmation(): Promise<void> {
    const now = new Date();

    const overdue = await this.contractRequestRepo
      .createQueryBuilder('cr')
      .select(['cr.id', 'cr.creatorUserId', 'cr.companyUserId'])
      .where('cr.status = :status', { status: ContractRequestStatus.ACCEPTED })
      .andWhere(
        `cr.starts_at + (cr.duration_minutes || ' minutes')::interval < :now`,
        { now },
      )
      .getMany();

    if (overdue.length === 0) return;

    this.logger.log(
      `Transicionando ${overdue.length} contrato(s) para AWAITING_COMPLETION_CONFIRMATION`,
    );

    const contestDeadlineAt = new Date(now.getTime() + COMPLETION_DEADLINE_HOURS * 60 * 60 * 1000);

    for (const contract of overdue) {
      try {
        const result = await this.contractRequestRepo.update(
          { id: contract.id, status: ContractRequestStatus.ACCEPTED },
          {
            status: ContractRequestStatus.AWAITING_COMPLETION_CONFIRMATION,
            completionPhaseEnteredAt: now,
            contestDeadlineAt,
          },
        );

        if (result.affected && result.affected > 0) {
          this.logger.log(`Contrato ${contract.id} → AWAITING_COMPLETION_CONFIRMATION`);
          this.eventEmitter.emit(
            CONTRACT_AWAITING_COMPLETION_CONFIRMATION_EVENT,
            {
              contractRequestId: contract.id,
              creatorUserId: contract.creatorUserId,
              companyUserId: contract.companyUserId,
              contestDeadlineAt,
              occurredAt: now,
            } satisfies ContractAwaitingCompletionConfirmationEvent,
          );
        }
      } catch (err) {
        this.logger.error(
          `Erro ao transicionar contrato ${contract.id}: ${String(err)}`,
        );
      }
    }
  }

  /**
   * Auto-conclui contratos em AWAITING_COMPLETION_CONFIRMATION cujo contestDeadlineAt expirou.
   * Dois cenários cobertos:
   *
   * A. ≥ 1 confirmação → COMPLETED (auto-conclusão explícita)
   * B. 0 confirmações  → COMPLETED por aprovação tácita (completedByTacitApproval = true)
   *    "Se não houver contestação até o prazo, o serviço é concluído automaticamente."
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async autoCompleteExpiredContests(): Promise<void> {
    const now = new Date();

    const baseSelect = [
      'cr.id',
      'cr.creatorUserId',
      'cr.companyUserId',
      'cr.serviceGrossAmountCents',
      'cr.companyTotalAmountCents',
      'cr.currency',
    ];

    const [withConfirmation, withoutConfirmation] = await Promise.all([
      // Branch A: prazo expirado + ≥1 confirmação
      this.contractRequestRepo
        .createQueryBuilder('cr')
        .select(baseSelect)
        .where('cr.status = :status', { status: ContractRequestStatus.AWAITING_COMPLETION_CONFIRMATION })
        .andWhere('cr.contest_deadline_at IS NOT NULL')
        .andWhere('cr.contest_deadline_at < :now', { now })
        .andWhere(
          '(cr.creator_confirmed_completed_at IS NOT NULL OR cr.company_confirmed_completed_at IS NOT NULL)',
        )
        .getMany(),

      // Branch B: prazo expirado + 0 confirmações (aprovação tácita)
      this.contractRequestRepo
        .createQueryBuilder('cr')
        .select(baseSelect)
        .where('cr.status = :status', { status: ContractRequestStatus.AWAITING_COMPLETION_CONFIRMATION })
        .andWhere('cr.contest_deadline_at IS NOT NULL')
        .andWhere('cr.contest_deadline_at < :now', { now })
        .andWhere('cr.creator_confirmed_completed_at IS NULL')
        .andWhere('cr.company_confirmed_completed_at IS NULL')
        .getMany(),
    ]);

    if (withConfirmation.length === 0 && withoutConfirmation.length === 0) return;

    this.logger.log(
      `Auto-concluindo contratos: ${withConfirmation.length} com confirmação, ${withoutConfirmation.length} por aprovação tácita`,
    );

    const complete = async (contract: { id: string; creatorUserId: string; companyUserId: string; serviceGrossAmountCents: number; companyTotalAmountCents: number; currency: string }, tacitApproval: boolean) => {
      try {
        const result = await this.contractRequestRepo.update(
          { id: contract.id, status: ContractRequestStatus.AWAITING_COMPLETION_CONFIRMATION },
          {
            status: ContractRequestStatus.COMPLETED,
            completedAt: now,
            ...(tacitApproval && { completedByTacitApproval: true }),
          },
        );

        if (result.affected && result.affected > 0) {
          this.logger.log(
            `Contrato ${contract.id} concluído${tacitApproval ? ' por aprovação tácita' : ''}`,
          );

          this.eventEmitter.emit(CONTRACT_REQUEST_COMPLETED_EVENT, {
            contractRequestId: contract.id,
            creatorUserId: contract.creatorUserId,
            companyUserId: contract.companyUserId,
            serviceGrossAmountCents: contract.serviceGrossAmountCents,
            companyTotalAmountCents: contract.companyTotalAmountCents,
            currency: contract.currency,
            completedAt: now,
          } satisfies ContractRequestCompletedEvent);
        }
      } catch (err) {
        this.logger.error(`Erro ao concluir contrato ${contract.id}: ${String(err)}`);
      }
    };

    await Promise.all([
      ...withConfirmation.map((c) => complete(c, false)),
      ...withoutConfirmation.map((c) => complete(c, true)),
    ]);
  }
}
