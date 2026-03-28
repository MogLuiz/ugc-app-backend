import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { User } from '../../users/entities/user.entity';
import { PartnerProfilesRepository } from '../repositories/partner-profiles.repository';
import { PartnerStatus } from '../enums/partner-status.enum';

@Injectable()
export class PartnerGuard implements CanActivate {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly partnerProfilesRepository: PartnerProfilesRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user: AuthUser }>();
    const authUser = request.user;

    if (!authUser?.authUserId) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    const user = await this.userRepo.findOne({ where: { authUserId: authUser.authUserId } });
    if (!user) {
      throw new ForbiddenException('Usuário não encontrado');
    }

    const partnerProfile = await this.partnerProfilesRepository.findByUserId(user.id);

    if (!partnerProfile || partnerProfile.status !== PartnerStatus.ACTIVE) {
      throw new ForbiddenException('Perfil de parceiro não está ativo');
    }

    return true;
  }
}
