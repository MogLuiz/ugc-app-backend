import { Controller, Get, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { CompanyOffersService, type CompanyOffersHubResponse } from './company-offers.service';

@Controller('company')
@UseGuards(SupabaseAuthGuard)
export class CompanyController {
  constructor(private readonly companyOffersService: CompanyOffersService) {}

  @Get('offers/hub')
  getOffersHub(@CurrentUser() user: AuthUser): Promise<CompanyOffersHubResponse> {
    return this.companyOffersService.getOffersHub(user);
  }
}
