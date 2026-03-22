import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { GeocodingStatus } from '../../common/enums/geocoding-status.enum';
import { User } from '../../users/entities/user.entity';

@Entity('profiles')
export class Profile {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'birth_date', type: 'date', nullable: true })
  birthDate: Date | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  gender: string | null;

  @Column({ name: 'photo_url', type: 'varchar', length: 500, nullable: true })
  photoUrl: string | null;

  @Column({
    type: 'decimal',
    precision: 3,
    scale: 2,
    default: 0,
    transformer: {
      to: (value?: number | null) => value ?? 0,
      from: (value: string) => parseFloat(value),
    },
  })
  rating: number;

  @Column({ name: 'address_street', type: 'varchar', length: 255, nullable: true })
  addressStreet: string | null;

  @Column({ name: 'address_number', type: 'varchar', length: 50, nullable: true })
  addressNumber: string | null;

  @Column({ name: 'address_city', type: 'varchar', length: 100, nullable: true })
  addressCity: string | null;

  @Column({ name: 'address_state', type: 'varchar', length: 50, nullable: true })
  addressState: string | null;

  @Column({ name: 'address_zip_code', type: 'varchar', length: 20, nullable: true })
  addressZipCode: string | null;

  @Column({ name: 'formatted_address', type: 'varchar', length: 500, nullable: true })
  formattedAddress: string | null;

  @Column({ name: 'address_hash', type: 'varchar', length: 64, nullable: true })
  addressHash: string | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: {
      to: (value?: number | null) => value ?? null,
      from: (value: string | null) => (value == null ? null : parseFloat(value)),
    },
  })
  latitude: number | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: {
      to: (value?: number | null) => value ?? null,
      from: (value: string | null) => (value == null ? null : parseFloat(value)),
    },
  })
  longitude: number | null;

  @Column({
    name: 'geocoding_status',
    type: 'varchar',
    length: 20,
    default: GeocodingStatus.PENDING,
  })
  geocodingStatus: GeocodingStatus;

  @Column({ name: 'geocoded_at', type: 'timestamptz', nullable: true })
  geocodedAt: Date | null;

  @Column({ name: 'has_valid_coordinates', type: 'boolean', default: false })
  hasValidCoordinates: boolean;

  @Column({ type: 'text', nullable: true })
  bio: string | null;

  @Column({ name: 'onboarding_step', type: 'int', default: 1 })
  onboardingStep: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToOne(() => User, (user) => user.profile)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
