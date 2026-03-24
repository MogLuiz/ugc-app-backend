import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '../users/entities/user.entity';
import { Profile } from '../profiles/entities/profile.entity';
import { CreatorProfile } from '../profiles/entities/creator-profile.entity';
import { CompanyProfile } from '../profiles/entities/company-profile.entity';
import { Portfolio } from '../portfolio/entities/portfolio.entity';
import { PortfolioMedia } from '../portfolio/entities/portfolio-media.entity';
import { AvailabilityRule } from '../availability/entities/availability-rule.entity';
import { JobType } from '../job-types/entities/job-type.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { CreatorJobType } from '../creator-job-types/entities/creator-job-type.entity';
import { ContractRequest } from '../contract-requests/entities/contract-request.entity';
import { PlatformSetting } from '../platform-settings/entities/platform-setting.entity';
import { Conversation } from '../conversations/entities/conversation.entity';
import { ConversationParticipant } from '../conversations/entities/conversation-participant.entity';
import { Message } from '../conversations/entities/message.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: (configService: ConfigService) => {
        const databaseUrl = configService.get<string>('DATABASE_URL');
        if (databaseUrl) {
          return {
            type: 'postgres',
            url: databaseUrl,
            entities: [
              User,
              Profile,
              CreatorProfile,
              CompanyProfile,
              Portfolio,
              PortfolioMedia,
              AvailabilityRule,
              JobType,
              CreatorJobType,
              Booking,
              ContractRequest,
              PlatformSetting,
              Conversation,
              ConversationParticipant,
              Message,
            ],
            synchronize: false,
            logging: configService.get<string>('NODE_ENV') === 'development',
            ssl: { rejectUnauthorized: false },
          };
        }
        const host = configService.get<string>('DB_HOST') ?? '';
        const isSupabase = host.includes('supabase.co');
        return {
          type: 'postgres',
          host,
          port: configService.get<number>('DB_PORT'),
          username: configService.get<string>('DB_USERNAME'),
          password: configService.get<string>('DB_PASSWORD'),
          database: configService.get<string>('DB_DATABASE'),
          entities: [
            User,
            Profile,
            CreatorProfile,
            CompanyProfile,
            Portfolio,
            PortfolioMedia,
            AvailabilityRule,
            JobType,
            CreatorJobType,
            Booking,
            ContractRequest,
            PlatformSetting,
            Conversation,
            ConversationParticipant,
            Message,
          ],
          synchronize: false,
          logging: configService.get<string>('NODE_ENV') === 'development',
          ...(isSupabase && {
            ssl: { rejectUnauthorized: false },
          }),
        };
      },
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
