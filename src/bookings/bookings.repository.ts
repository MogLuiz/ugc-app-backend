import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Booking } from './entities/booking.entity';
import { BookingStatus } from '../common/enums/booking-status.enum';

@Injectable()
export class BookingsRepository {
  constructor(
    @InjectRepository(Booking)
    private readonly repo: Repository<Booking>,
  ) {}

  private repository(manager?: EntityManager): Repository<Booking> {
    return manager ? manager.getRepository(Booking) : this.repo;
  }

  async createAndSave(data: Partial<Booking>, manager: EntityManager): Promise<Booking> {
    const repository = this.repository(manager);
    return repository.save(repository.create(data));
  }

  async findById(id: string): Promise<Booking | null> {
    return this.repo.findOne({
      where: { id },
      relations: ['jobType'],
    });
  }

  async findByIdForUpdate(id: string, manager: EntityManager): Promise<Booking | null> {
    return this.repository(manager).findOne({
      where: { id },
      relations: ['jobType'],
      lock: { mode: 'pessimistic_write' },
    });
  }

  async findOverlappingBlockingBookings(
    creatorUserId: string,
    startDateTime: Date,
    endDateTime: Date,
    manager: EntityManager,
  ): Promise<Booking[]> {
    return this.repository(manager)
      .createQueryBuilder('booking')
      .setLock('pessimistic_write')
      .where('booking.creator_user_id = :creatorUserId', { creatorUserId })
      .andWhere('booking.status IN (:...statuses)', {
        statuses: [BookingStatus.PENDING, BookingStatus.CONFIRMED],
      })
      .andWhere('booking.start_date_time < :endDateTime', { endDateTime })
      .andWhere('booking.end_date_time > :startDateTime', { startDateTime })
      .orderBy('booking.start_date_time', 'ASC')
      .getMany();
  }

  async findCalendarBookings(
    creatorUserId: string,
    startDateTime: Date,
    endDateTime: Date,
  ): Promise<Booking[]> {
    return this.repo
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.jobType', 'jobType')
      .where('booking.creator_user_id = :creatorUserId', { creatorUserId })
      .andWhere('booking.start_date_time < :endDateTime', { endDateTime })
      .andWhere('booking.end_date_time > :startDateTime', { startDateTime })
      .orderBy('booking.start_date_time', 'ASC')
      .getMany();
  }

  async save(booking: Booking, manager?: EntityManager): Promise<Booking> {
    return this.repository(manager).save(booking);
  }
}
