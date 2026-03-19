import { Controller, Get, Param, Post, Query, UseGuards, Body } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { GetCreatorCalendarDto } from './dto/get-creator-calendar.dto';

@Controller()
@UseGuards(SupabaseAuthGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post('bookings')
  async createBooking(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateBookingDto,
  ) {
    return this.bookingsService.createBooking(user, dto);
  }

  @Get('creator/calendar')
  async getCreatorCalendar(
    @CurrentUser() user: AuthUser,
    @Query() query: GetCreatorCalendarDto,
  ) {
    return this.bookingsService.getCreatorCalendar(user, query);
  }

  @Post('bookings/:id/accept')
  async acceptBooking(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookingsService.acceptBooking(user, id);
  }

  @Post('bookings/:id/reject')
  async rejectBooking(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookingsService.rejectBooking(user, id);
  }

  @Post('bookings/:id/cancel')
  async cancelBooking(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookingsService.cancelBooking(user, id);
  }
}
