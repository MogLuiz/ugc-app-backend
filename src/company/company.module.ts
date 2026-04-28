import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { OpenOffer } from '../open-offers/entities/open-offer.entity';
import { OpenOfferApplication } from '../open-offers/entities/open-offer-application.entity';
import { ContractRequest } from '../contract-requests/entities/contract-request.entity';
import { Payment } from '../payments/entities/payment.entity';
import { OpenOffersRepository } from '../open-offers/open-offers.repository';
import { ContractRequestsRepository } from '../contract-requests/contract-requests.repository';
import { CompanyController } from './company.controller';
import { CompanyOffersService } from './company-offers.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([OpenOffer, OpenOfferApplication, ContractRequest, Payment]),
    AuthModule,
    UsersModule,
  ],
  controllers: [CompanyController],
  providers: [CompanyOffersService, OpenOffersRepository, ContractRequestsRepository],
})
export class CompanyModule {}
