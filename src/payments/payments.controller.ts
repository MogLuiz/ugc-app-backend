import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { User } from '../users/entities/user.entity';
import { PaymentsService } from './payments.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { ProcessPaymentDto } from './dto/process-payment.dto';
import { PaymentStatus } from './enums/payment-status.enum';

@Controller('payments')
@UseGuards(SupabaseAuthGuard)
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

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
   * Lista os pagamentos da empresa autenticada.
   * O companyUserId vem sempre do token JWT — nunca aceito via client.
   */
  @Get()
  async getCompanyPayments(
    @CurrentUser() authUser: AuthUser,
    @Query('status') status?: PaymentStatus,
  ) {
    const user = await this.resolveUser(authUser);
    return this.paymentsService.getCompanyPayments(user.id, status);
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

  private async resolveUser(authUser: AuthUser): Promise<User> {
    const user = await this.userRepo.findOne({ where: { authUserId: authUser.authUserId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }
}
