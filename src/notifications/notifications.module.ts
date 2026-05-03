import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContractRequest } from '../contract-requests/entities/contract-request.entity';
import { CreatorPayout } from '../payments/entities/creator-payout.entity';
import { Review } from '../reviews/entities/review.entity';
import { User } from '../users/entities/user.entity';
import { Notification } from './entities/notification.entity';
import { UserPushToken } from './entities/user-push-token.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { DevicesController } from './devices.controller';
import { CompanyNotificationsListener } from './listeners/company-notifications.listener';
import { CreatorNotificationsListener } from './listeners/creator-notifications.listener';
import { ExpoPushProvider } from './providers/expo-push.provider';
import { PUSH_PROVIDER } from './providers/push-provider.interface';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      UserPushToken,
      User,
      ContractRequest,
      CreatorPayout,
      Review,
    ]),
  ],
  controllers: [NotificationsController, DevicesController],
  providers: [
    NotificationsService,
    CreatorNotificationsListener,
    CompanyNotificationsListener,
    ExpoPushProvider,
    {
      provide: PUSH_PROVIDER,
      useExisting: ExpoPushProvider,
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
