import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PortfolioMediaType } from '../portfolio/entities/portfolio-media-type.enum';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

@Injectable()
export class UploadsService {
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {
    const url = this.configService.get<string>('SUPABASE_URL');
    const key = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!url || !key) {
      throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios para upload');
    }

    this.supabase = createClient(url, key);
  }

  private getMaxSizeBytes(): number {
    const mb = this.configService.get<number>('MAX_AVATAR_SIZE_MB') ?? 5;
    return mb * 1024 * 1024;
  }

  private getAvatarBucket(): string {
    return this.configService.get<string>('AVATAR_BUCKET') ?? 'avatars';
  }

  private getPortfolioImageBucket(): string {
    return this.configService.get<string>('PORTFOLIO_IMAGE_BUCKET') ?? 'portfolio-images';
  }

  private getPortfolioVideoBucket(): string {
    return this.configService.get<string>('PORTFOLIO_VIDEO_BUCKET') ?? 'portfolio-videos';
  }

  private getPortfolioAllowedImageMimeTypes(): string[] {
    return (
      this.configService.get<string>('ALLOWED_PORTFOLIO_IMAGE_MIME_TYPES') ??
      'image/jpeg,image/png,image/webp'
    )
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private getPortfolioAllowedVideoMimeTypes(): string[] {
    return (
      this.configService.get<string>('ALLOWED_PORTFOLIO_VIDEO_MIME_TYPES') ??
      'video/mp4,video/quicktime,video/webm'
    )
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  validateFile(mimetype: string, size: number): void {
    if (!ALLOWED_MIME.includes(mimetype)) {
      throw new BadRequestException(
        `Tipo de arquivo não permitido. Aceitos: ${ALLOWED_MIME.join(', ')}`,
      );
    }

    const maxSize = this.getMaxSizeBytes();
    if (size > maxSize) {
      const mb = this.configService.get<number>('MAX_AVATAR_SIZE_MB') ?? 5;
      throw new BadRequestException(`Arquivo muito grande. Máximo: ${mb}MB`);
    }
  }

  async uploadAvatar(userId: string, buffer: Buffer, mimetype: string): Promise<string> {
    this.validateFile(mimetype, buffer.length);

    const ext = MIME_EXT[mimetype] ?? 'jpg';
    const path = `${userId}/profile-${Date.now()}.${ext}`;

    const { error } = await this.supabase.storage
      .from(this.getAvatarBucket())
      .upload(path, buffer, {
        contentType: mimetype,
        upsert: true,
      });

    if (error) {
      throw new BadRequestException(`Falha no upload: ${error.message}`);
    }

    const { data: urlData } = this.supabase.storage.from(this.getAvatarBucket()).getPublicUrl(path);
    return urlData.publicUrl;
  }

  async uploadPortfolioMedia(userId: string, buffer: Buffer, mimetype: string) {
    const imageMimeTypes = this.getPortfolioAllowedImageMimeTypes();
    const videoMimeTypes = this.getPortfolioAllowedVideoMimeTypes();
    const isImage = imageMimeTypes.includes(mimetype);
    const isVideo = videoMimeTypes.includes(mimetype);

    if (!isImage && !isVideo) {
      throw new BadRequestException('Tipo de mídia não permitido para portfólio');
    }

    const maxMb = isImage
      ? this.configService.get<number>('MAX_PORTFOLIO_IMAGE_SIZE_MB') ?? 10
      : this.configService.get<number>('MAX_PORTFOLIO_VIDEO_SIZE_MB') ?? 50;
    const maxBytes = maxMb * 1024 * 1024;

    if (buffer.length > maxBytes) {
      throw new BadRequestException(`Arquivo muito grande. Máximo: ${maxMb}MB`);
    }

    const ext = MIME_EXT[mimetype] ?? (isVideo ? 'mp4' : 'jpg');
    const bucket = isImage ? this.getPortfolioImageBucket() : this.getPortfolioVideoBucket();
    const path = `${userId}/${Date.now()}.${ext}`;

    const { error } = await this.supabase.storage.from(bucket).upload(path, buffer, {
      contentType: mimetype,
      upsert: true,
    });

    if (error) {
      throw new BadRequestException(`Falha no upload: ${error.message}`);
    }

    const { data: urlData } = this.supabase.storage.from(bucket).getPublicUrl(path);

    return {
      type: isImage ? PortfolioMediaType.IMAGE : PortfolioMediaType.VIDEO,
      storagePath: path,
      publicUrl: urlData.publicUrl,
      thumbnailUrl: null,
      mimeType: mimetype,
    };
  }
}
