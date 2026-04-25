import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { BootstrapUserDto } from './dto/bootstrap-user.dto';
import { Request } from 'express';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post('bootstrap')
  @UseGuards(SupabaseAuthGuard)
  async bootstrap(
    @CurrentUser() user: AuthUser,
    @Body() dto: BootstrapUserDto,
    @Req() request: Request,
  ) {
    return this.usersService.bootstrap(
      user.authUserId,
      user.email ?? '',
      dto.role,
      dto.referralCode,
      user.displayName,
      dto.legalAcceptance,
      {
        userAgent: request.headers['user-agent'] ?? null,
        ipAddress: request.ip ?? null,
      },
    );
  }
}
