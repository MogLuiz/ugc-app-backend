import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { ContractRequest } from '../contract-requests/entities/contract-request.entity';
import { ContractRequestsRepository } from '../contract-requests/contract-requests.repository';
import { OpenOffer } from '../open-offers/entities/open-offer.entity';
import { OpenOfferApplication } from '../open-offers/entities/open-offer-application.entity';
import { OpenOffersRepository } from '../open-offers/open-offers.repository';
import { CreatorController } from './creator.controller';
import { CreatorService } from './creator.service';
import { CreatorOffersService } from './creator-offers.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ContractRequest, OpenOffer, OpenOfferApplication]),
    AuthModule,
    UsersModule,
    SchedulingModule,
  ],
  controllers: [CreatorController],
  providers: [CreatorService, CreatorOffersService, ContractRequestsRepository, OpenOffersRepository],
})
export class CreatorModule {}
