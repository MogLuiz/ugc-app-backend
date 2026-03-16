import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DocumentType } from '../../common/enums/document-type.enum';
import { User } from '../../users/entities/user.entity';

@Entity('company_profiles')
export class CompanyProfile {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'document_type', type: 'enum', enum: DocumentType, nullable: true })
  documentType: DocumentType | null;

  @Column({ name: 'document_number', type: 'varchar', length: 20, nullable: true })
  documentNumber: string | null;

  @Column({ name: 'company_name', type: 'varchar', length: 255, nullable: true })
  companyName: string | null;

  @Column({ name: 'job_title', type: 'varchar', length: 100, nullable: true })
  jobTitle: string | null;

  @Column({ name: 'business_niche', type: 'varchar', length: 255, nullable: true })
  businessNiche: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
