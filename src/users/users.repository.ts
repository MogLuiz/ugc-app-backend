import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UserRole } from '../common/enums/user-role.enum';

@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  async findByAuthUserId(authUserId: string): Promise<User | null> {
    return this.repo.findOne({ where: { authUserId } });
  }

  async findByAuthUserIdWithProfiles(authUserId: string): Promise<User | null> {
    return this.repo.findOne({
      where: { authUserId },
      relations: ['profile', 'creatorProfile', 'companyProfile'],
    });
  }

  async create(data: {
    authUserId: string;
    email: string;
    role: UserRole;
    phone?: string;
  }): Promise<User> {
    const user = this.repo.create(data);
    return this.repo.save(user);
  }

  async updatePhone(userId: string, phone: string | null): Promise<void> {
    await this.repo.update(userId, { phone });
  }
}
