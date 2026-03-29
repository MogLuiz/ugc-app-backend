import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard';
import { AuthUser } from '../common/interfaces/auth-user.interface';

@Controller('auth')
export class AuthController {
  @Get('me')
  @UseGuards(SupabaseAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return {
      authUserId: user.authUserId,
      email: user.email,
      role: user.role,
    };
  }
}
