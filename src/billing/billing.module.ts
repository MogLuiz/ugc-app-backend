import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from '../auth/auth.module';
import { CompanyBalance } from './entities/company-balance.entity';
import { CompanyBalanceTransaction } from './entities/company-balance-transaction.entity';
import { RefundRequest } from './entities/refund-request.entity';
import { Payment } from '../payments/entities/payment.entity';
import { ContractRequest } from '../contract-requests/entities/contract-request.entity';
import { User } from '../users/entities/user.entity';
import { CompanyBalanceService } from './company-balance.service';
import { CompanyBalanceController } from './company-balance.controller';
import { AdminRefundController } from './admin-refund.controller';
import { InviteExpirationService } from './invite-expiration.service';
import { JobCompletionService } from './job-completion.service';
import { InternalAdminGuard } from '../payments/guards/internal-admin.guard';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([
      CompanyBalance,
      CompanyBalanceTransaction,
      RefundRequest,
      Payment,
      ContractRequest,
      User,
    ]),
    AuthModule,
  ],
  controllers: [CompanyBalanceController, AdminRefundController],
  providers: [CompanyBalanceService, InviteExpirationService, JobCompletionService, InternalAdminGuard],
  exports: [CompanyBalanceService],
})
export class BillingModule {}
