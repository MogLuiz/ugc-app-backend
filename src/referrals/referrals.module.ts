import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { PartnerProfile } from './entities/partner-profile.entity';
import { ReferralCode } from './entities/referral-code.entity';
import { Referral } from './entities/referral.entity';
import { Commission } from './entities/commission.entity';
import { PartnerProfilesRepository } from './repositories/partner-profiles.repository';
import { ReferralCodesRepository } from './repositories/referral-codes.repository';
import { ReferralsRepository } from './repositories/referrals.repository';
import { CommissionsRepository } from './repositories/commissions.repository';
import { ReferralCodeGeneratorService } from './services/referral-code-generator.service';
import { ReferralsService } from './services/referrals.service';
import { CommissionsService } from './services/commissions.service';
import { PartnersController } from './controllers/partners.controller';
import { PartnerGuard } from './guards/partner.guard';
import { ContractCompletedListener } from './listeners/contract-completed.listener';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, PartnerProfile, ReferralCode, Referral, Commission]),
  ],
  controllers: [PartnersController],
  providers: [
    PartnerProfilesRepository,
    ReferralCodesRepository,
    ReferralsRepository,
    CommissionsRepository,
    ReferralCodeGeneratorService,
    ReferralsService,
    CommissionsService,
    PartnerGuard,
    ContractCompletedListener,
  ],
  exports: [ReferralsService],
})
export class ReferralsModule {}
