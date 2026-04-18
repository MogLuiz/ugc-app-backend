import { CreatorService } from './creator.service';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';

@Controller('creator')
@UseGuards(SupabaseAuthGuard)
export class CreatorController {
  constructor(private readonly creatorService: CreatorService) { }

  @Get('dashboard')
  getDashboard(@CurrentUser() user: AuthUser) {
    return this.creatorService.getDashboard(user);
  }

  @Get('invites')
  listInvites(@CurrentUser() user: AuthUser) {
    return this.creatorService.listInvites(user);
  }

  @Get('upcoming-campaigns')
  listUpcoming(@CurrentUser() user: AuthUser) {
    return this.creatorService.listUpcomingCampaigns(user);
  }

  @Get('activity')
  getActivity(@CurrentUser() user: AuthUser) {
    return this.creatorService.getActivitySource(user);
  }
}
