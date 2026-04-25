import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LegalAcceptance } from './entities/legal-acceptance.entity';
import { RecordLegalAcceptanceDto } from './dto/record-legal-acceptance.dto';
import { CURRENT_LEGAL_TERM_VERSIONS, SIGNUP_TERM_TYPE_BY_ROLE } from './legal.constants';
import { UserRole } from '../common/enums/user-role.enum';
import { LegalTermType } from '../common/enums/legal-term-type.enum';
import { User } from '../users/entities/user.entity';

type AcceptanceContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class LegalService {
  constructor(
    @InjectRepository(LegalAcceptance)
    private readonly legalAcceptanceRepository: Repository<LegalAcceptance>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  getCurrentVersion(termType: LegalTermType): string {
    return CURRENT_LEGAL_TERM_VERSIONS[termType];
  }

  validateSignupAcceptance(role: UserRole, dto: RecordLegalAcceptanceDto): void {
    this.validateAccepted(dto);
    const expectedTermType = SIGNUP_TERM_TYPE_BY_ROLE[role];

    if (dto.termType !== expectedTermType) {
      throw new BadRequestException('termType incompatível com o perfil informado');
    }

    this.validateCurrentVersion(dto.termType, dto.termVersion);
  }

  validateAccepted(dto: RecordLegalAcceptanceDto): void {
    if (dto.accepted !== true) {
      throw new BadRequestException('É necessário aceitar o termo para continuar');
    }
  }

  validateCurrentVersion(termType: LegalTermType, termVersion: string): void {
    const currentVersion = this.getCurrentVersion(termType);
    if (termVersion !== currentVersion) {
      throw new BadRequestException('termVersion não corresponde à versão atual do termo');
    }
  }

  async recordAcceptance(
    userId: string,
    dto: RecordLegalAcceptanceDto,
    context: AcceptanceContext = {},
  ): Promise<LegalAcceptance> {
    this.validateAccepted(dto);
    this.validateCurrentVersion(dto.termType, dto.termVersion);

    const existing = await this.legalAcceptanceRepository.findOne({
      where: {
        userId,
        termType: dto.termType,
        termVersion: dto.termVersion,
      },
    });

    if (existing) {
      return existing;
    }

    const acceptance = this.legalAcceptanceRepository.create({
      userId,
      termType: dto.termType,
      termVersion: dto.termVersion,
      acceptedAt: new Date(),
      ipAddress: context.ipAddress?.trim() || null,
      userAgent: context.userAgent?.trim() || null,
    });

    return this.legalAcceptanceRepository.save(acceptance);
  }

  async findCurrentAcceptance(userId: string, termType: LegalTermType): Promise<LegalAcceptance | null> {
    return this.legalAcceptanceRepository.findOne({
      where: {
        userId,
        termType,
        termVersion: this.getCurrentVersion(termType),
      },
    });
  }

  async resolveCurrentAcceptance(
    userId: string,
    termType: LegalTermType,
    dto?: RecordLegalAcceptanceDto,
    context: AcceptanceContext = {},
  ): Promise<LegalAcceptance> {
    const existing = await this.findCurrentAcceptance(userId, termType);
    if (existing) {
      return existing;
    }

    if (!dto) {
      throw new BadRequestException('É necessário aceitar o termo vigente para continuar');
    }

    if (dto.termType !== termType) {
      throw new BadRequestException('termType incompatível com o fluxo atual');
    }

    return this.recordAcceptance(userId, dto, context);
  }

  async getCurrentStatus(authUserId: string, termType: LegalTermType) {
    const user = await this.usersRepository.findOne({
      where: { authUserId },
    });
    if (!user) {
      throw new NotFoundException(
        'Usuário não encontrado. Complete o cadastro em POST /users/bootstrap',
      );
    }

    const currentVersion = this.getCurrentVersion(termType);
    const acceptance = await this.findCurrentAcceptance(user.id, termType);

    return {
      termType,
      currentVersion,
      accepted: Boolean(acceptance),
      acceptedAt: acceptance?.acceptedAt.toISOString() ?? null,
    };
  }
}
