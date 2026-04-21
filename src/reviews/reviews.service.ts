import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Review } from './entities/review.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewerRole } from './enums/reviewer-role.enum';
import { ContractRequest } from '../contract-requests/entities/contract-request.entity';
import { ContractRequestStatus } from '../common/enums/contract-request-status.enum';
import { Profile } from '../profiles/entities/profile.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../common/enums/user-role.enum';

export type ReviewResponse = {
  id: string;
  reviewerRole: ReviewerRole;
  rating: number;
  comment: string | null;
  createdAt: string;
};

export type ContractReviewsResponse = {
  contractRequestId: string;
  reviews: ReviewResponse[];
};

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
    @InjectRepository(ContractRequest)
    private readonly contractRequestRepo: Repository<ContractRequest>,
    @InjectRepository(Profile)
    private readonly profileRepo: Repository<Profile>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    authUserId: string,
    contractRequestId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewResponse> {
    const trimmedComment = dto.comment?.trim() ?? null;

    if (trimmedComment !== null && trimmedComment.length > 1000) {
      throw new BadRequestException(
        'O comentário pode ter no máximo 1000 caracteres',
      );
    }

    const finalComment = trimmedComment?.length ? trimmedComment : null;

    return this.dataSource.transaction(async (manager) => {
      const actor = await manager.findOne(User, { where: { authUserId } });
      if (!actor) {
        throw new NotFoundException('Usuário não encontrado');
      }

      const contractRequest = await manager.findOne(ContractRequest, {
        where: { id: contractRequestId },
      });
      if (!contractRequest) {
        throw new NotFoundException('Contratação não encontrada');
      }

      const isCreator = actor.id === contractRequest.creatorUserId;
      const isCompany = actor.id === contractRequest.companyUserId;

      if (!isCreator && !isCompany) {
        throw new ForbiddenException(
          'Você não pode avaliar uma contratação da qual não faz parte',
        );
      }

      if (contractRequest.status !== ContractRequestStatus.COMPLETED) {
        throw new ForbiddenException(
          'Avaliações só podem ser criadas em contratos com status COMPLETED',
        );
      }

      const revieweeUserId = isCreator
        ? contractRequest.companyUserId
        : contractRequest.creatorUserId;

      const reviewerRole = isCreator ? ReviewerRole.CREATOR : ReviewerRole.COMPANY;

      const existing = await manager.findOne(Review, {
        where: { contractRequestId, reviewerUserId: actor.id },
      });
      if (existing) {
        throw new ConflictException('Você já avaliou esta contratação');
      }

      const review = manager.create(Review, {
        contractRequestId,
        reviewerUserId: actor.id,
        revieweeUserId,
        reviewerRole,
        rating: dto.rating,
        comment: finalComment,
      });

      const saved = await manager.save(Review, review);

      await this.recalculateProfileReputation(revieweeUserId, manager);

      return this.toResponse(saved);
    });
  }

  async findByContract(
    authUserId: string,
    contractRequestId: string,
  ): Promise<ContractReviewsResponse> {
    const actor = await this.dataSource
      .getRepository(User)
      .findOne({ where: { authUserId } });

    if (!actor) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const contractRequest = await this.contractRequestRepo.findOne({
      where: { id: contractRequestId },
    });
    if (!contractRequest) {
      throw new NotFoundException('Contratação não encontrada');
    }

    if (
      actor.id !== contractRequest.creatorUserId &&
      actor.id !== contractRequest.companyUserId
    ) {
      throw new ForbiddenException(
        'Você não tem permissão para ver as avaliações desta contratação',
      );
    }

    const reviews = await this.reviewRepo.find({
      where: { contractRequestId },
      order: { createdAt: 'ASC' },
    });

    return {
      contractRequestId,
      reviews: reviews.map((r) => this.toResponse(r)),
    };
  }

  private async recalculateProfileReputation(
    userId: string,
    manager: import('typeorm').EntityManager,
  ): Promise<void> {
    const result = await manager
      .getRepository(Review)
      .createQueryBuilder('r')
      .select('AVG(r.rating)', 'avg')
      .addSelect('COUNT(*)', 'count')
      .where('r.reviewee_user_id = :userId', { userId })
      .getRawOne<{ avg: string | null; count: string }>();

    const averageRating = result?.avg != null ? parseFloat(result.avg) : 0;
    const reviewCount = result?.count != null ? parseInt(result.count, 10) : 0;

    await manager.update(Profile, { userId }, { averageRating, reviewCount });
  }

  private toResponse(review: Review): ReviewResponse {
    return {
      id: review.id,
      reviewerRole: review.reviewerRole,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt.toISOString(),
    };
  }
}
