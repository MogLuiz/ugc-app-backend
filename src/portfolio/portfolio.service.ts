import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Portfolio } from './entities/portfolio.entity';
import { PortfolioMedia } from './entities/portfolio-media.entity';
import { PortfolioMediaStatus } from './entities/portfolio-media-status.enum';
import { PortfolioMediaType } from './entities/portfolio-media-type.enum';

type CreatePortfolioMediaInput = {
  userId: string;
  type: PortfolioMediaType;
  storagePath: string;
  publicUrl: string;
  thumbnailUrl?: string | null;
  mimeType: string;
};

@Injectable()
export class PortfolioService {
  constructor(
    @InjectRepository(Portfolio)
    private portfolioRepo: Repository<Portfolio>,
    @InjectRepository(PortfolioMedia)
    private portfolioMediaRepo: Repository<PortfolioMedia>,
  ) {}

  async getOrCreatePortfolio(userId: string) {
    let portfolio = await this.portfolioRepo.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (!portfolio) {
      portfolio = this.portfolioRepo.create({
        user: { id: userId },
      });
      portfolio = await this.portfolioRepo.save(portfolio);
    }

    return portfolio;
  }

  async createMedia(input: CreatePortfolioMediaInput) {
    const portfolio = await this.getOrCreatePortfolio(input.userId);
    const currentCount = await this.portfolioMediaRepo.count({
      where: { portfolioId: portfolio.id },
    });

    const media = this.portfolioMediaRepo.create({
      portfolioId: portfolio.id,
      type: input.type,
      storagePath: input.storagePath,
      publicUrl: input.publicUrl,
      thumbnailUrl: input.thumbnailUrl ?? null,
      mimeType: input.mimeType,
      sortOrder: currentCount,
      status: PortfolioMediaStatus.READY,
    });

    return this.portfolioMediaRepo.save(media);
  }

  async removeMedia(userId: string, mediaId: string) {
    const media = await this.portfolioMediaRepo.findOne({
      where: { id: mediaId },
      relations: ['portfolio', 'portfolio.user'],
    });

    if (!media) {
      throw new NotFoundException('Mídia do portfólio não encontrada');
    }

    if (media.portfolio.user.id !== userId) {
      throw new ForbiddenException('Você não pode remover esta mídia');
    }

    await this.portfolioMediaRepo.remove(media);
  }

  async buildPortfolioPayload(userId: string) {
    const portfolio = await this.portfolioRepo.findOne({
      where: { user: { id: userId } },
    });

    if (!portfolio) {
      return null;
    }

    const media = await this.portfolioMediaRepo.find({
      where: { portfolioId: portfolio.id },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });

    return {
      id: portfolio.id,
      userId,
      media: media.map((item) => ({
        id: item.id,
        type: item.type,
        url: item.publicUrl,
        thumbnailUrl: item.thumbnailUrl,
        sortOrder: item.sortOrder,
        status: item.status,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
      createdAt: portfolio.createdAt,
      updatedAt: portfolio.updatedAt,
    };
  }
}
