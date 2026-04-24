import { Controller, Get, UseGuards } from '@nestjs/common';
import { CreatorService } from './creator.service';
import { CreatorOffersService } from './creator-offers.service';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';

@Controller('creator')
@UseGuards(SupabaseAuthGuard)
export class CreatorController {
  constructor(
    private readonly creatorService: CreatorService,
    private readonly creatorOffersService: CreatorOffersService,
  ) {}

  @Get('offers/hub')
  getOffersHub(@CurrentUser() user: AuthUser) {
    return this.creatorOffersService.getOffersHub(user);
  }

  @Get('dashboard')
  getDashboard(@CurrentUser() user: AuthUser) {
    return this.creatorService.getDashboard(user);
  }

  @Get('activity')
  getActivity(@CurrentUser() user: AuthUser) {
    return this.creatorService.getActivitySource(user);
  }
}
