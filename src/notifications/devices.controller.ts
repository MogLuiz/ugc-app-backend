import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { NotificationsService } from './notifications.service';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';

@Controller('devices')
@UseGuards(SupabaseAuthGuard)
export class DevicesController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('push-token')
  registerPushToken(@CurrentUser() user: AuthUser, @Body() dto: RegisterPushTokenDto) {
    return this.notificationsService.registerPushToken(user, dto);
  }
}
