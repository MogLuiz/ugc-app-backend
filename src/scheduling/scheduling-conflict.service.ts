import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { BookingsRepository } from '../bookings/bookings.repository';
import { ContractRequestsRepository } from '../contract-requests/contract-requests.repository';

export type SchedulingConflictCheckParams = {
  creatorUserId: string;
  startsAt: Date;
  endsAt: Date;
  manager?: EntityManager;
  ignoreContractRequestId?: string;
};

@Injectable()
export class SchedulingConflictService {
  constructor(
    private readonly bookingsRepository: BookingsRepository,
    private readonly contractRequestsRepository: ContractRequestsRepository,
  ) {}

  async hasConflicts(params: SchedulingConflictCheckParams): Promise<boolean> {
    const [bookingConflicts, contractRequestConflicts] = await Promise.all([
      this.bookingsRepository.findOverlappingBlockingBookings(
        params.creatorUserId,
        params.startsAt,
        params.endsAt,
        params.manager,
      ),
      this.contractRequestsRepository.findOverlappingAcceptedRequests(
        params.creatorUserId,
        params.startsAt,
        params.endsAt,
        params.manager,
        params.ignoreContractRequestId,
      ),
    ]);

    return bookingConflicts.length > 0 || contractRequestConflicts.length > 0;
  }

  async ensureNoConflicts(params: SchedulingConflictCheckParams): Promise<void> {
    const hasConflicts = await this.hasConflicts(params);

    if (hasConflicts) {
      throw new BadRequestException(
        'O creator já possui um compromisso conflitante para o horário informado',
      );
    }
  }
}
