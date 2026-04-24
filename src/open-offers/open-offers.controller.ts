import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { OpenOffersService } from './open-offers.service';
import { CreateOpenOfferDto } from './dto/create-open-offer.dto';
import { ListAvailableOffersDto } from './dto/list-available-offers.dto';

@Controller('open-offers')
@UseGuards(SupabaseAuthGuard)
export class OpenOffersController {
  constructor(private readonly openOffersService: OpenOffersService) {}

  // ─── Company ──────────────────────────────────────────────────────────────

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOpenOfferDto) {
    return this.openOffersService.create(user, dto);
  }

  @Get('my/:id')
  getMyDetail(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.openOffersService.getMyCompanyDetail(user, id);
  }

  @Patch('my/:id/cancel')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.openOffersService.cancelOffer(user, id);
  }

  @Post('my/:id/select/:applicationId')
  selectCreator(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
  ) {
    return this.openOffersService.selectCreator(user, id, applicationId);
  }

  // ─── Creator ──────────────────────────────────────────────────────────────

  @Get('available')
  listAvailable(@CurrentUser() user: AuthUser, @Query() query: ListAvailableOffersDto) {
    return this.openOffersService.listAvailable(user, query);
  }

  @Get('available/:id')
  getAvailableDetail(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.openOffersService.getAvailableDetail(user, id);
  }

  @Post('available/:id/apply')
  apply(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.openOffersService.apply(user, id);
  }

  @Delete('available/:id/apply')
  withdraw(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.openOffersService.withdraw(user, id);
  }

  @Get('applications/my')
  listMyApplications(@CurrentUser() user: AuthUser) {
    return this.openOffersService.listMyApplications(user);
  }
}
