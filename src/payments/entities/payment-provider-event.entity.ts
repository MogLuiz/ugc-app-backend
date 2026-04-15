import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type EventProcessingStatus = 'received' | 'processed' | 'failed' | 'ignored' | 'orphan';

/**
 * Persiste todos os eventos recebidos do provider de pagamento.
 *
 * Responsabilidades:
 * - Idempotência: UNIQUE(external_event_id) garante que o mesmo evento não seja processado duas vezes
 * - Auditoria: payload bruto sempre preservado
 * - Troubleshooting: histórico de status de processamento
 * - Reprocessamento: eventos com status 'orphan' ou 'failed' podem ser reprocessados
 *
 * processingStatus:
 * - received:  evento recebido, aguardando processamento
 * - processed: processado com sucesso
 * - failed:    falhou durante processamento; internalNote contém detalhes
 * - ignored:   evento duplicado (violou UNIQUE constraint)
 * - orphan:    Payment não encontrado no momento do processamento; reprocessável
 */
@Entity('payment_provider_events')
@Index('IDX_payment_provider_events_provider_status', ['provider', 'processingStatus'])
@Index('IDX_payment_provider_events_external_payment_id', ['externalPaymentId'])
@Index('IDX_payment_provider_events_created_at', ['createdAt'])
export class PaymentProviderEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Nome do gateway (ex: 'mercado_pago'). */
  @Column({ type: 'varchar', length: 50 })
  provider: string;

  /**
   * ID único do evento no provider.
   * UNIQUE constraint garante idempotência.
   */
  @Column({ name: 'external_event_id', type: 'varchar', length: 100, unique: true })
  externalEventId: string;

  /** ID do pagamento no provider (ex: payment ID do MP). */
  @Column({ name: 'external_payment_id', type: 'varchar', length: 100, nullable: true })
  externalPaymentId: string | null;

  /** Tipo do evento (ex: 'payment.updated', 'payment.created'). */
  @Column({ name: 'event_type', type: 'varchar', length: 100 })
  eventType: string;

  /** Payload bruto recebido — nunca modificado. */
  @Column({ name: 'raw_payload', type: 'jsonb' })
  rawPayload: object;

  @Column({ name: 'processing_status', type: 'varchar', length: 30, default: 'received' })
  processingStatus: EventProcessingStatus;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
