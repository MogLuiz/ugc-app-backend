import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InternalAdminGuard } from '../payments/guards/internal-admin.guard';
import { CompanyBalanceService } from './company-balance.service';
import { RefundRequestStatus } from './enums/refund-request-status.enum';
import { ApproveRefundDto, MarkRefundPaidDto, RejectRefundDto } from './dto/admin-refund.dto';

@Controller('admin/refund-requests')
@UseGuards(InternalAdminGuard)
export class AdminRefundController {
  constructor(private readonly balanceService: CompanyBalanceService) {}

  @Get()
  async list(@Query('status') status?: RefundRequestStatus) {
    return this.balanceService.listRefundRequests(status);
  }

  @Patch(':id/approve')
  async approve(@Param('id') id: string, @Body() dto: ApproveRefundDto) {
    return this.balanceService.approveRefund(id, dto.adminNote ?? null);
  }

  @Patch(':id/reject')
  async reject(@Param('id') id: string, @Body() dto: RejectRefundDto) {
    return this.balanceService.rejectRefund(id, dto.adminNote);
  }

  @Patch(':id/mark-paid')
  async markPaid(@Param('id') id: string, @Body() dto: MarkRefundPaidDto) {
    return this.balanceService.markRefundPaid(id, dto.processedBy, dto.adminNote ?? null);
  }
}
