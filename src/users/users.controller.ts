import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { BootstrapUserDto } from './dto/bootstrap-user.dto';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post('bootstrap')
  @UseGuards(SupabaseAuthGuard)
  async bootstrap(
    @CurrentUser() user: AuthUser,
    @Body() dto: BootstrapUserDto,
  ) {
    return this.usersService.bootstrap(
      user.authUserId,
      user.email ?? '',
      dto.role,
      dto.referralCode,
      dto.name,
    );
  }
}
