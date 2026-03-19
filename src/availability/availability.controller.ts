import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { AvailabilityService } from './availability.service';
import { ReplaceCreatorAvailabilityDto } from './dto/replace-creator-availability.dto';

@Controller('creator/availability')
@UseGuards(SupabaseAuthGuard)
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get()
  async getCreatorAvailability(@CurrentUser() user: AuthUser) {
    return this.availabilityService.getCreatorAvailability(user);
  }

  @Put()
  async replaceCreatorAvailability(
    @CurrentUser() user: AuthUser,
    @Body() dto: ReplaceCreatorAvailabilityDto,
  ) {
    return this.availabilityService.replaceCreatorAvailability(user, dto);
  }
}
