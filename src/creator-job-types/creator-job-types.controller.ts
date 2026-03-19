import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { CreatorJobTypesService } from './creator-job-types.service';
import { ReplaceCreatorJobTypesDto } from './dto/replace-creator-job-types.dto';

@Controller('creator/job-types')
@UseGuards(SupabaseAuthGuard)
export class CreatorJobTypesController {
  constructor(
    private readonly creatorJobTypesService: CreatorJobTypesService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return this.creatorJobTypesService.listForCreator(user);
  }

  @Put()
  async replace(
    @CurrentUser() user: AuthUser,
    @Body() dto: ReplaceCreatorJobTypesDto,
  ) {
    return this.creatorJobTypesService.replaceForCreator(user, dto);
  }
}
