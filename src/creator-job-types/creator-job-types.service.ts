import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { UsersRepository } from '../users/users.repository';
import { UserRole } from '../common/enums/user-role.enum';
import { JobTypesRepository } from '../job-types/job-types.repository';
import { CreatorJobTypesRepository } from './creator-job-types.repository';
import { ReplaceCreatorJobTypesDto } from './dto/replace-creator-job-types.dto';
import { JobType } from '../job-types/entities/job-type.entity';

export type CreatorJobTypeView = {
  id: string;
  name: string;
  mode: string;
  durationMinutes: number;
  price: number;
  selected: boolean;
  basePriceCents: number | null;
};

@Injectable()
export class CreatorJobTypesService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly jobTypesRepository: JobTypesRepository,
    private readonly creatorJobTypesRepository: CreatorJobTypesRepository,
  ) {}

  async listForCreator(authUser: AuthUser): Promise<CreatorJobTypeView[]> {
    const user = await this.resolveCreator(authUser);
    const [allActive, selected] = await Promise.all([
      this.jobTypesRepository.findActive(),
      this.creatorJobTypesRepository.findByCreator(user.id),
    ]);

    const selectedMap = new Map(
      selected.map((s) => [s.jobTypeId, s]),
    );

    return allActive.map((jt: JobType) => {
      const entry = selectedMap.get(jt.id);
      return {
        id: jt.id,
        name: jt.name,
        mode: jt.mode,
        durationMinutes: jt.durationMinutes,
        price: jt.price,
        selected: !!entry,
        basePriceCents: entry?.basePriceCents ?? null,
      };
    });
  }

  async replaceForCreator(
    authUser: AuthUser,
    dto: ReplaceCreatorJobTypesDto,
  ): Promise<CreatorJobTypeView[]> {
    const user = await this.resolveCreator(authUser);

    if (dto.jobTypeIds.length > 0) {
      const activeJobTypes = await this.jobTypesRepository.findActive();
      const activeIds = new Set(activeJobTypes.map((jt) => jt.id));
      const invalid = dto.jobTypeIds.filter((id) => !activeIds.has(id));
      if (invalid.length > 0) {
        throw new BadRequestException(
          `Os seguintes tipos de job não estão ativos: ${invalid.join(', ')}`,
        );
      }
    }

    await this.creatorJobTypesRepository.replaceForCreator(
      user.id,
      dto.jobTypeIds,
    );

    return this.listForCreator(authUser);
  }

  private async resolveCreator(authUser: AuthUser) {
    const user = await this.usersRepository.findByAuthUserIdWithProfiles(
      authUser.authUserId,
    );
    if (!user || user.role !== UserRole.CREATOR) {
      throw new ForbiddenException(
        'Apenas criadores podem gerenciar tipos de trabalho',
      );
    }
    return user;
  }
}
