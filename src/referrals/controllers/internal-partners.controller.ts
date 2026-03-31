import {
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InternalPartnerApiKeyGuard } from '../guards/internal-partner-api-key.guard';
import { ReferralsService } from '../services/referrals.service';

@Controller('internal/partners')
@UseGuards(InternalPartnerApiKeyGuard)
export class InternalPartnersController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Post(':userId/activate')
  activate(@Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string) {
    return this.referralsService.activatePartnerByUserId(userId);
  }

  @Post(':userId/deactivate')
  deactivate(@Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string) {
    return this.referralsService.deactivatePartnerByUserId(userId);
  }
}
