import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Portfolio } from './entities/portfolio.entity';
import { PortfolioMedia } from './entities/portfolio-media.entity';
import { PortfolioService } from './portfolio.service';

@Module({
  imports: [TypeOrmModule.forFeature([Portfolio, PortfolioMedia])],
  providers: [PortfolioService],
  exports: [PortfolioService],
})
export class PortfolioModule {}
