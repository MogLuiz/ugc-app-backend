import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { GetLegalAcceptanceStatusDto } from './dto/get-legal-acceptance-status.dto';
import { LegalService } from './legal.service';

@Controller('legal')
export class LegalController {
  constructor(private readonly legalService: LegalService) {}

  @Get('acceptances/status')
  @UseGuards(SupabaseAuthGuard)
  getAcceptanceStatus(
    @CurrentUser() user: AuthUser,
    @Query() query: GetLegalAcceptanceStatusDto,
  ) {
    return this.legalService.getCurrentStatus(user.authUserId, query.termType);
  }
}
