import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadsService } from './uploads.service';
import { ProfilesService } from '../profiles/profiles.service';
import { UsersRepository } from '../users/users.repository';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { PortfolioService } from '../portfolio/portfolio.service';
import { getPortfolioUploadMaxSizeBytes } from '../config/env.validation';
import { PortfolioUploadExceptionFilter } from './portfolio-upload.exception-filter';

@Controller('uploads')
@UseGuards(SupabaseAuthGuard)
export class UploadsController {
  constructor(
    private uploadsService: UploadsService,
    private profilesService: ProfilesService,
    private usersRepository: UsersRepository,
    private portfolioService: PortfolioService,
  ) {}

  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async uploadAvatar(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo não enviado. Use o campo "file" no form-data.');
    }

    const dbUser = await this.usersRepository.findByAuthUserIdWithProfiles(user.authUserId);
    if (!dbUser) {
      throw new BadRequestException('Complete o cadastro em POST /users/bootstrap antes de enviar avatar.');
    }

    const photoUrl = await this.uploadsService.uploadAvatar(
      dbUser.id,
      file.buffer,
      file.mimetype,
    );

    return this.profilesService.updatePhotoUrl(user.authUserId, photoUrl);
  }

  @Post('portfolio-media')
  @UseFilters(new PortfolioUploadExceptionFilter())
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: getPortfolioUploadMaxSizeBytes() },
    }),
  )
  async uploadPortfolioMedia(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo não enviado. Use o campo "file" no form-data.');
    }

    const dbUser = await this.usersRepository.findByAuthUserIdWithProfiles(user.authUserId);
    if (!dbUser) {
      throw new BadRequestException('Complete o cadastro em POST /users/bootstrap antes de enviar mídia.');
    }

    const uploaded = await this.uploadsService.uploadPortfolioMedia(
      dbUser.id,
      file.buffer,
      file.mimetype,
    );

    await this.portfolioService.createMedia({
      userId: dbUser.id,
      type: uploaded.type,
      storagePath: uploaded.storagePath,
      publicUrl: uploaded.publicUrl,
      thumbnailUrl: uploaded.thumbnailUrl,
      mimeType: uploaded.mimeType,
    });

    return this.profilesService.getMe(user.authUserId);
  }
}
