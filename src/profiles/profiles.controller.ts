import { Body, Controller, Delete, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateCreatorProfileDto } from './dto/update-creator-profile.dto';
import { UpdateCompanyProfileDto } from './dto/update-company-profile.dto';
import { ListMarketplaceCreatorsDto } from './dto/list-marketplace-creators.dto';

@Controller('profiles')
@UseGuards(SupabaseAuthGuard)
export class ProfilesController {
  constructor(private profilesService: ProfilesService) {}

  @Get('me')
  getMe(@CurrentUser() user: AuthUser) {
    return this.profilesService.getMe(user.authUserId);
  }

  @Get('creators')
  listMarketplaceCreators(
    @CurrentUser() user: AuthUser,
    @Query() query: ListMarketplaceCreatorsDto,
  ) {
    return this.profilesService.listMarketplaceCreators(user, query);
  }

  @Get('creators/:creatorId')
  getMarketplaceCreatorDetail(
    @CurrentUser() user: AuthUser,
    @Param('creatorId') creatorId: string,
  ) {
    return this.profilesService.getMarketplaceCreatorDetail(user, creatorId);
  }

  @Patch('me')
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profilesService.updateProfile(user.authUserId, dto);
  }

  @Patch('me/creator')
  updateCreatorProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateCreatorProfileDto,
  ) {
    return this.profilesService.updateCreatorProfile(user.authUserId, dto);
  }

  @Patch('me/company')
  updateCompanyProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateCompanyProfileDto,
  ) {
    return this.profilesService.updateCompanyProfile(user.authUserId, dto);
  }

  @Delete('me/portfolio/media/:mediaId')
  removePortfolioMedia(
    @CurrentUser() user: AuthUser,
    @Param('mediaId') mediaId: string,
  ) {
    return this.profilesService.removePortfolioMedia(user.authUserId, mediaId);
  }
}
