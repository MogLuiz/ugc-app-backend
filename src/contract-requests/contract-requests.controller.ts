import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { ContractRequestsService } from './contract-requests.service';
import { PreviewContractRequestDto } from './dto/preview-contract-request.dto';
import { CreateContractRequestDto } from './dto/create-contract-request.dto';
import { ListCompanyContractRequestsDto } from './dto/list-company-contract-requests.dto';
import { RejectContractRequestDto } from './dto/reject-contract-request.dto';

@Controller('contract-requests')
@UseGuards(SupabaseAuthGuard)
export class ContractRequestsController {
  constructor(
    private readonly contractRequestsService: ContractRequestsService,
  ) {}

  @Post('preview')
  async preview(
    @CurrentUser() user: AuthUser,
    @Body() dto: PreviewContractRequestDto,
  ) {
    return this.contractRequestsService.preview(user, dto);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateContractRequestDto,
  ) {
    return this.contractRequestsService.create(user, dto);
  }

  @Get('my-company')
  async listMyCompany(
    @CurrentUser() user: AuthUser,
    @Query() query: ListCompanyContractRequestsDto,
  ) {
    return this.contractRequestsService.listMyCompany(user, query);
  }

  @Get('my-creator/pending')
  async listMyCreatorPending(@CurrentUser() user: AuthUser) {
    return this.contractRequestsService.listMyCreatorPending(user);
  }

  @Patch(':id/accept')
  async accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.contractRequestsService.accept(user, id);
  }

  @Patch(':id/reject')
  async reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectContractRequestDto,
  ) {
    return this.contractRequestsService.reject(user, id, dto);
  }
}
