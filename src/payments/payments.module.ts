import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ContractRequest } from '../contract-requests/entities/contract-request.entity';
import { User } from '../users/entities/user.entity';
import { Payment } from './entities/payment.entity';
import { CreatorPayout } from './entities/creator-payout.entity';
import { PaymentProviderEvent } from './entities/payment-provider-event.entity';
import { PAYMENT_PROVIDER } from './providers/payment-provider.interface';
import { MercadoPagoProvider } from './providers/mercado-pago/mercado-pago.provider';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { WebhooksService } from './webhooks/webhooks.service';
import { WebhooksController } from './webhooks/webhooks.controller';
import { PayoutsService } from './payouts/payouts.service';
import { PayoutsController } from './payouts/payouts.controller';
import { InternalAdminGuard } from './guards/internal-admin.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Payment,
      CreatorPayout,
      PaymentProviderEvent,
      ContractRequest,
      User,
    ]),
    AuthModule,
  ],
  controllers: [
    PaymentsController,
    WebhooksController,
    PayoutsController,
  ],
  providers: [
    {
      provide: PAYMENT_PROVIDER,
      useClass: MercadoPagoProvider,
    },
    MercadoPagoProvider,
    PaymentsService,
    WebhooksService,
    PayoutsService,
    InternalAdminGuard,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
