import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { CompanyBalanceService } from './company-balance.service';
import { RequestRefundDto } from './dto/request-refund.dto';

@Controller('company-balance')
@UseGuards(SupabaseAuthGuard)
export class CompanyBalanceController {
  constructor(
    private readonly balanceService: CompanyBalanceService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  @Get()
  async getBalance(@CurrentUser() authUser: AuthUser) {
    const user = await this.resolveUser(authUser);
    return this.balanceService.getBalanceWithHistory(user.id);
  }

  @Post('refund-request')
  async requestRefund(
    @CurrentUser() authUser: AuthUser,
    @Body() dto: RequestRefundDto,
  ) {
    const user = await this.resolveUser(authUser);
    return this.balanceService.requestRefund(user.id, dto.amountCents, dto.reason ?? null);
  }

  /**
   * Lista os reembolsos da empresa autenticada.
   * companyUserId vem do token JWT — nunca aceito via client.
   */
  @Get('refund-requests')
  async getRefundRequests(@CurrentUser() authUser: AuthUser) {
    const user = await this.resolveUser(authUser);
    return this.balanceService.listCompanyRefundRequests(user.id);
  }

  private async resolveUser(authUser: AuthUser) {
    const user = await this.userRepo.findOne({ where: { authUserId: authUser.authUserId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }
}
