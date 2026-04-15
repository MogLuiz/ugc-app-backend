import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { SupabaseAuthGuard } from '../../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { InternalAdminGuard } from '../guards/internal-admin.guard';
import { MarkPaidDto, PayoutsService } from './payouts.service';

class MarkPayoutPaidBody {
  @IsString()
  @IsNotEmpty()
  markedPaidBy: string;

  @IsString()
  @IsNotEmpty()
  internalNote: string;

  @IsOptional()
  @IsString()
  receiptUrl?: string;
}

@Controller('payouts')
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  /**
   * Creator autenticado consulta seus repasses pendentes/histórico.
   */
  @Get('my')
  @UseGuards(SupabaseAuthGuard)
  getMyPayouts(@CurrentUser() authUser: AuthUser) {
    return this.payoutsService.getMyPayouts(authUser);
  }

  /**
   * Admin marca um repasse como pago (PIX realizado externamente).
   * Restrito a INTERNAL_ADMIN_API_KEY — nunca exposto no frontend.
   * Registra auditoria: markedPaidBy, paidAt, internalNote.
   */
  @Patch(':payoutId/mark-paid')
  @UseGuards(InternalAdminGuard)
  markAsPaid(
    @Param('payoutId', ParseUUIDPipe) payoutId: string,
    @Body() body: MarkPayoutPaidBody,
  ) {
    const dto: MarkPaidDto = {
      markedPaidBy: body.markedPaidBy,
      internalNote: body.internalNote,
      receiptUrl: body.receiptUrl,
    };
    return this.payoutsService.markAsPaid(payoutId, dto);
  }
}
