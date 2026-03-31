import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { PartnerGuard } from '../guards/partner.guard';
import { ReferralsService } from '../services/referrals.service';
import { ListReferralsQueryDto } from '../dto/list-referrals-query.dto';
import { ListCommissionsQueryDto } from '../dto/list-commissions-query.dto';

@Controller('partners')
@UseGuards(SupabaseAuthGuard)
export class PartnersController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Get('me')
  @UseGuards(PartnerGuard)
  async getProfile(@CurrentUser() user: AuthUser) {
    return this.referralsService.getMyPartnerProfile(user);
  }

  @Get('me/referral-code')
  @UseGuards(PartnerGuard)
  async getReferralCode(@CurrentUser() user: AuthUser) {
    return this.referralsService.getMyReferralCode(user);
  }

  @Get('me/referrals')
  @UseGuards(PartnerGuard)
  async getReferrals(
    @CurrentUser() user: AuthUser,
    @Query() query: ListReferralsQueryDto,
  ) {
    return this.referralsService.getMyReferrals(user, query);
  }

  @Get('me/commissions')
  @UseGuards(PartnerGuard)
  async getCommissions(
    @CurrentUser() user: AuthUser,
    @Query() query: ListCommissionsQueryDto,
  ) {
    return this.referralsService.getMyCommissions(user, query);
  }

  @Get('me/dashboard')
  @UseGuards(PartnerGuard)
  async getDashboard(@CurrentUser() user: AuthUser) {
    return this.referralsService.getMyDashboard(user);
  }
}
