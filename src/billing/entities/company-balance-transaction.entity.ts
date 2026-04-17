import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BalanceTransactionType } from '../enums/balance-transaction-type.enum';

/**
 * Ledger imutável de débitos e créditos do saldo da empresa.
 * Positivo = entrada (crédito). Negativo = saída (uso ou reembolso).
 */
@Entity('company_balance_transactions')
@Index('IDX_cbt_company_user_id', ['companyUserId'])
@Index('IDX_cbt_reference', ['referenceType', 'referenceId'])
@Index('IDX_cbt_type_reference', ['type', 'referenceId'])
export class CompanyBalanceTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_user_id', type: 'uuid' })
  companyUserId: string;

  /** Valor em centavos. Positivo = crédito, negativo = débito. */
  @Column({ name: 'amount_cents', type: 'int' })
  amountCents: number;

  @Column({ type: 'varchar', length: 50 })
  type: BalanceTransactionType;

  /** Tipo da entidade de referência: 'payment' | 'refund_request'. */
  @Column({ name: 'reference_type', type: 'varchar', length: 50 })
  referenceType: string;

  @Column({ name: 'reference_id', type: 'uuid' })
  referenceId: string;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
