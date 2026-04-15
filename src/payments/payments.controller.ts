import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { PaymentsService } from './payments.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { ProcessPaymentDto } from './dto/process-payment.dto';

@Controller('payments')
@UseGuards(SupabaseAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Inicia o pagamento de um contrato aceito.
   * Retorna o preferenceId para o frontend renderizar o Brick do Mercado Pago.
   */
  @Post('initiate')
  initiatePayment(
    @Body() dto: InitiatePaymentDto,
    @CurrentUser() authUser: AuthUser,
  ) {
    return this.paymentsService.initiatePayment(dto, authUser);
  }

  /**
   * Processa o pagamento com os dados do cartão coletados pelo Payment Brick.
   * Chamado pelo frontend no onSubmit do Brick.
   */
  @Post(':paymentId/process')
  processPayment(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: ProcessPaymentDto,
    @CurrentUser() authUser: AuthUser,
  ) {
    return this.paymentsService.processPayment(paymentId, dto, authUser);
  }

  /**
   * Consulta o status atual de um pagamento.
   * Acessível pela empresa (pagante) ou pelo creator (recebedor).
   */
  @Get(':paymentId')
  getPayment(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @CurrentUser() authUser: AuthUser,
  ) {
    return this.paymentsService.getPaymentById(paymentId, authUser);
  }
}
