import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';

@Controller('contract-requests')
@UseGuards(SupabaseAuthGuard)
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  /**
   * Submete avaliação de uma contratação concluída.
   * Apenas os participantes do contrato (creator ou empresa) podem avaliar.
   * Apenas contratos com status COMPLETED permitem avaliação.
   * Retorna 409 se o usuário já avaliou este contrato.
   */
  @Post(':id/reviews')
  async create(
    @CurrentUser() user: AuthUser,
    @Param('id') contractRequestId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.create(user.authUserId, contractRequestId, dto);
  }

  /**
   * Retorna as avaliações de uma contratação.
   * Apenas os participantes do contrato (creator ou empresa) têm acesso.
   */
  @Get(':id/reviews')
  async findByContract(
    @CurrentUser() user: AuthUser,
    @Param('id') contractRequestId: string,
  ) {
    return this.reviewsService.findByContract(user.authUserId, contractRequestId);
  }
}
