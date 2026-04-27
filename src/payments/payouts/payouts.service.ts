import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { User } from '../../users/entities/user.entity';
import { CreatorPayout } from '../entities/creator-payout.entity';
import { Payment } from '../entities/payment.entity';
import { PayoutStatus } from '../enums/payout-status.enum';
import {
  CREATOR_PAYOUT_UPDATED_EVENT,
  CreatorPayoutUpdatedEvent,
} from '../events/creator-payout-updated.event';

export class MarkPaidDto {
  /** Identificador do admin que está executando o repasse. */
  markedPaidBy: string;
  /** Nota obrigatória: ex: "PIX enviado via Nubank às 14:32". */
  internalNote: string;
  /** URL do comprovante (opcional). */
  receiptUrl?: string;
}

export type CreatorPayoutResponseDto = {
  id: string;
  paymentId: string;
  creatorUserId: string;
  amountCents: number;
  currency: string;
  status: PayoutStatus;
  scheduledFor: Date | null;
  paidAt: Date | null;
  markedPaidBy: string | null;
  internalNote: string | null;
  receiptUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  payment?: {
    creatorNetServiceAmountCents: number;
    transportFeeAmountCents: number;
    contractRequestId: string;
    gatewayName: string;
  };
};

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    @InjectRepository(CreatorPayout)
    private readonly payoutRepo: Repository<CreatorPayout>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Lista os repasses do creator autenticado.
   * Ordenados por data de criação decrescente.
   */
  async getMyPayouts(authUser: AuthUser): Promise<CreatorPayoutResponseDto[]> {
    const user = await this.userRepo.findOne({ where: { authUserId: authUser.authUserId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const payouts = await this.payoutRepo.find({
      where: { creatorUserId: user.id },
      relations: ['payment'],
      order: { createdAt: 'DESC' },
    });

    return payouts.map((p) => this.toDto(p));
  }

  /**
   * Marca um repasse como pago (admin only).
   * Registra auditoria: quem pagou, quando, nota interna.
   */
  async markAsPaid(payoutId: string, dto: MarkPaidDto): Promise<CreatorPayoutResponseDto> {
    const payout = await this.payoutRepo.findOne({
      where: { id: payoutId },
      relations: ['payment'],
    });

    if (!payout) throw new NotFoundException('Repasse não encontrado');

    if (payout.status === PayoutStatus.PAID) {
      throw new BadRequestException('Repasse já foi marcado como pago');
    }

    if (payout.status === PayoutStatus.CANCELED) {
      throw new BadRequestException('Não é possível pagar um repasse cancelado');
    }

    payout.status = PayoutStatus.PAID;
    payout.paidAt = new Date();
    payout.markedPaidBy = dto.markedPaidBy;
    payout.internalNote = dto.internalNote;
    if (dto.receiptUrl) payout.receiptUrl = dto.receiptUrl;

    const saved = await this.payoutRepo.save(payout);

    // Atualiza resumo no Payment
    await this.paymentRepo.update(
      { id: payout.paymentId },
      { payoutStatus: PayoutStatus.PAID },
    );

    this.logger.log(
      `Repasse marcado como pago: id=${saved.id} creatorUserId=${saved.creatorUserId} amount=${saved.amountCents} markedBy=${dto.markedPaidBy}`,
    );

    this.eventEmitter.emit(CREATOR_PAYOUT_UPDATED_EVENT, {
      payoutId: saved.id,
      creatorUserId: saved.creatorUserId,
      paymentId: saved.paymentId,
      contractRequestId: payout.payment?.contractRequestId ?? '',
      status: saved.status,
      occurredAt: new Date(),
    } satisfies CreatorPayoutUpdatedEvent);

    return this.toDto(saved);
  }

  // ---------------------------------------------------------------------------

  private toDto(payout: CreatorPayout): CreatorPayoutResponseDto {
    return {
      id: payout.id,
      paymentId: payout.paymentId,
      creatorUserId: payout.creatorUserId,
      amountCents: payout.amountCents,
      currency: payout.currency,
      status: payout.status,
      scheduledFor: payout.scheduledFor,
      paidAt: payout.paidAt,
      markedPaidBy: payout.markedPaidBy,
      internalNote: payout.internalNote,
      receiptUrl: payout.receiptUrl,
      createdAt: payout.createdAt,
      updatedAt: payout.updatedAt,
      ...(payout.payment && {
        payment: {
          creatorNetServiceAmountCents: payout.payment.creatorNetServiceAmountCents,
          transportFeeAmountCents: payout.payment.transportFeeAmountCents,
          contractRequestId: payout.payment.contractRequestId,
          gatewayName: payout.payment.gatewayName,
        },
      }),
    };
  }
}
