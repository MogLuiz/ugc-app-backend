import {
  Column,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * Saldo interno da empresa na plataforma.
 * Criado lazily na primeira creditação.
 *
 * Invariante: available_cents >= 0 (garantido por lock pessimista em useCredit).
 */
@Entity('company_balance')
@Index('IDX_company_balance_company_user_id', ['companyUserId'], { unique: true })
export class CompanyBalance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_user_id', type: 'uuid', unique: true })
  companyUserId: string;

  /** Saldo disponível em centavos. Nunca negativo. */
  @Column({ name: 'available_cents', type: 'int', default: 0 })
  availableCents: number;

  /**
   * Limite máximo de crédito acumulável (antifraude leve).
   * Padrão: R$ 5.000,00. Admin pode ajustar por empresa.
   */
  @Column({ name: 'max_credit_cents', type: 'int', default: 500000 })
  maxCreditCents: number;

  @Column({ type: 'varchar', length: 3, default: 'BRL' })
  currency: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToOne(() => User)
  @JoinColumn({ name: 'company_user_id' })
  companyUser: User;
}
