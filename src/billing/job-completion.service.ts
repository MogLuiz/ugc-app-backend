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

/**
 * Crons de transição de estado pós-job.
 *
 * Regras:
 * 1. ACCEPTED com endsAt passado → AWAITING_COMPLETION_CONFIRMATION
 *    (passa do horário final NÃO conclui; apenas abre janela de confirmação)
 * 2. AWAITING_COMPLETION_CONFIRMATION com contestDeadlineAt expirado
 *    E ≥ 1 confirmação → COMPLETED (auto-conclusão)
 *    Contratos sem nenhuma confirmação (contestDeadlineAt IS NULL) permanecem
 *    para triagem operacional/admin — nunca são auto-concluídos.
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
   * NÃO gera nenhum efeito financeiro — apenas muda o status.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async transitionJobsToAwaitingConfirmation(): Promise<void> {
    const now = new Date();

    const overdue = await this.contractRequestRepo
      .createQueryBuilder('cr')
      .select(['cr.id'])
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

    for (const contract of overdue) {
      try {
        const result = await this.contractRequestRepo.update(
          { id: contract.id, status: ContractRequestStatus.ACCEPTED },
          {
            status: ContractRequestStatus.AWAITING_COMPLETION_CONFIRMATION,
            completionPhaseEnteredAt: now,
          },
        );

        if (result.affected && result.affected > 0) {
          this.logger.log(`Contrato ${contract.id} → AWAITING_COMPLETION_CONFIRMATION`);
        }
      } catch (err) {
        this.logger.error(
          `Erro ao transicionar contrato ${contract.id}: ${String(err)}`,
        );
      }
    }
  }

  /**
   * Auto-conclui contratos em AWAITING_COMPLETION_CONFIRMATION cujo contestDeadlineAt
   * expirou E há pelo menos uma confirmação registrada.
   *
   * Contratos sem contestDeadlineAt (ninguém confirmou) são ignorados —
   * ficam na fila operacional para resolução manual/admin.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async autoCompleteExpiredContests(): Promise<void> {
    const now = new Date();

    const toComplete = await this.contractRequestRepo
      .createQueryBuilder('cr')
      .select([
        'cr.id',
        'cr.creatorUserId',
        'cr.companyUserId',
        'cr.creatorBasePrice',
        'cr.totalPrice',
        'cr.currency',
      ])
      .where('cr.status = :status', {
        status: ContractRequestStatus.AWAITING_COMPLETION_CONFIRMATION,
      })
      .andWhere('cr.contest_deadline_at IS NOT NULL')
      .andWhere('cr.contest_deadline_at < :now', { now })
      .andWhere(
        '(cr.creator_confirmed_completed_at IS NOT NULL OR cr.company_confirmed_completed_at IS NOT NULL)',
      )
      .getMany();

    if (toComplete.length === 0) return;

    this.logger.log(
      `Auto-concluindo ${toComplete.length} contrato(s) com prazo de contestação expirado`,
    );

    for (const contract of toComplete) {
      try {
        const result = await this.contractRequestRepo.update(
          {
            id: contract.id,
            status: ContractRequestStatus.AWAITING_COMPLETION_CONFIRMATION,
          },
          {
            status: ContractRequestStatus.COMPLETED,
            completedAt: now,
          },
        );

        if (result.affected && result.affected > 0) {
          this.logger.log(`Contrato ${contract.id} auto-concluído`);

          this.eventEmitter.emit(CONTRACT_REQUEST_COMPLETED_EVENT, {
            contractRequestId: contract.id,
            creatorUserId: contract.creatorUserId,
            companyUserId: contract.companyUserId,
            creatorBasePrice: contract.creatorBasePrice,
            totalPrice: contract.totalPrice,
            currency: contract.currency,
            completedAt: now,
          } satisfies ContractRequestCompletedEvent);
        }
      } catch (err) {
        this.logger.error(
          `Erro ao auto-concluir contrato ${contract.id}: ${String(err)}`,
        );
      }
    }
  }
}
