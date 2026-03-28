import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  CONTRACT_REQUEST_COMPLETED_EVENT,
  ContractRequestCompletedEvent,
} from '../../contract-requests/events/contract-request-completed.event';
import { ReferralsService } from '../services/referrals.service';

@Injectable()
export class ContractCompletedListener {
  private readonly logger = new Logger(ContractCompletedListener.name);

  constructor(private readonly referralsService: ReferralsService) {}

  @OnEvent(CONTRACT_REQUEST_COMPLETED_EVENT)
  async handleContractCompleted(event: ContractRequestCompletedEvent): Promise<void> {
    try {
      await this.referralsService.handleContractCompleted(event);
    } catch (error) {
      this.logger.error(
        `Failed to process contract-request.completed for contractRequestId=${event.contractRequestId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }
}
