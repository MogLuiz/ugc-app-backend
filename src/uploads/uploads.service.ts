import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'avatars';
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
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
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: mimetype,
        upsert: true,
      });

    if (error) {
      throw new BadRequestException(`Falha no upload: ${error.message}`);
    }

    const { data: urlData } = this.supabase.storage.from(BUCKET).getPublicUrl(path);
    return urlData.publicUrl;
  }
}
