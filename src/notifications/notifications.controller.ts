import { Body, Controller, Delete, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { NotificationsService } from './notifications.service';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { UnregisterPushTokenDto } from './dto/unregister-push-token.dto';

@Controller()
@UseGuards(SupabaseAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('notifications')
  listMyNotifications(@CurrentUser() user: AuthUser, @Query() query: ListNotificationsDto) {
    return this.notificationsService.listMyNotifications(user, query);
  }

  @Get('notifications/unread-count')
  getUnreadCount(@CurrentUser() user: AuthUser) {
    return this.notificationsService.getUnreadCount(user);
  }

  @Patch('notifications/:id/read')
  markAsRead(@CurrentUser() user: AuthUser, @Param('id') notificationId: string) {
    return this.notificationsService.markAsRead(user, notificationId);
  }

  @Patch('notifications/read-all')
  markAllAsRead(@CurrentUser() user: AuthUser) {
    return this.notificationsService.markAllAsRead(user);
  }

  @Delete('devices/push-token')
  unregisterPushToken(@CurrentUser() user: AuthUser, @Body() dto: UnregisterPushTokenDto) {
    return this.notificationsService.unregisterPushToken(user, dto.token);
  }
}
