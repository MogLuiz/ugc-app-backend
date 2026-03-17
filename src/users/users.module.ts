import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Profile } from '../profiles/entities/profile.entity';
import { CreatorProfile } from '../profiles/entities/creator-profile.entity';
import { CompanyProfile } from '../profiles/entities/company-profile.entity';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AuthModule } from '../auth/auth.module';
import { Portfolio } from '../portfolio/entities/portfolio.entity';
import { PortfolioMedia } from '../portfolio/entities/portfolio-media.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Profile, CreatorProfile, CompanyProfile, Portfolio, PortfolioMedia]),
    AuthModule,
  ],
  controllers: [UsersController],
  providers: [UsersRepository, UsersService],
  exports: [UsersService, UsersRepository],
})
export class UsersModule { }
