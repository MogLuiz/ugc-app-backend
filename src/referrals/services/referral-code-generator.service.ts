import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { ReferralCodesRepository } from '../repositories/referral-codes.repository';

@Injectable()
export class ReferralCodeGeneratorService {
  private readonly logger = new Logger(ReferralCodeGeneratorService.name);
  private static readonly CODE_LENGTH = 8;
  private static readonly MAX_RETRIES = 3;
  private static readonly ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

  constructor(private readonly referralCodesRepository: ReferralCodesRepository) {}

  async generateUniqueCode(): Promise<string> {
    for (let attempt = 1; attempt <= ReferralCodeGeneratorService.MAX_RETRIES; attempt++) {
      const code = this.generate();
      const existing = await this.referralCodesRepository.findByCode(code);
      if (!existing) {
        return code;
      }
      this.logger.warn(`Referral code collision on attempt ${attempt}: ${code}`);
    }
    throw new Error(
      `Failed to generate unique referral code after ${ReferralCodeGeneratorService.MAX_RETRIES} attempts`,
    );
  }

  private generate(): string {
    const bytes = randomBytes(ReferralCodeGeneratorService.CODE_LENGTH);
    const alphabet = ReferralCodeGeneratorService.ALPHABET;
    let code = '';
    for (let i = 0; i < ReferralCodeGeneratorService.CODE_LENGTH; i++) {
      code += alphabet[bytes[i] % alphabet.length];
    }
    return code;
  }
}
