import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UserRole } from '../common/enums/user-role.enum';
import type { MarketplaceSortBy } from '../profiles/dto/list-marketplace-creators.dto';
import { AGE_YEARS_SQL } from './marketplace-creator-age-sql';

function mapRawAgeYears(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export type MarketplaceCreatorListItem = {
  id: string;
  name: string;
  avatarUrl: string | null;
  coverImageUrl: string | null;
  rating: number;
  location: string;
  bio: string | null;
  tags: string[];
  niche: string;
  minPrice: number | null;
  ageYears: number | null;
  creatorLatitude: number | null;
  creatorLongitude: number | null;
  creatorHasValidCoordinates: boolean;
};

/** Resposta pública de item na listagem GET /profiles/creators (sem birth_date). */
export type MarketplaceCreatorListItemResponse = MarketplaceCreatorListItem;

export type MarketplaceCreatorDetailItem = MarketplaceCreatorListItem & {
  addressCity: string | null;
  addressState: string | null;
  creatorLatitude: number | null;
  creatorLongitude: number | null;
  creatorHasValidCoordinates: boolean;
  creatorServiceRadiusKm: number | null;
};

export type ListMarketplaceCreatorsParams = {
  search?: string;
  serviceTypeId?: string;
  sortBy: MarketplaceSortBy;
  page: number;
  limit: number;
  minAge?: number;
  maxAge?: number;
};

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

  async listMarketplaceCreators(
    params: ListMarketplaceCreatorsParams,
  ): Promise<{ items: MarketplaceCreatorListItem[]; total: number }> {
    const baseQuery = this.repo
      .createQueryBuilder('user')
      .innerJoin('user.profile', 'profile')
      .innerJoin('user.creatorProfile', 'creatorProfile')
      .leftJoin(
        'creator_job_types',
        'cjt',
        'cjt.creator_profile_user_id = user.id AND cjt.is_active = true',
      )
      .leftJoin(
        'job_types',
        'jt',
        'jt.id = cjt.job_type_id AND jt.is_active = true',
      )
      .where('user.role = :role', { role: UserRole.CREATOR });

    if (params.search) {
      const normalizedSearch = `%${params.search.toLowerCase()}%`;
      baseQuery.andWhere(
        new Brackets((qb) => {
          qb.where('LOWER(profile.name) LIKE :search', {
            search: normalizedSearch,
          }).orWhere('LOWER(jt.name) LIKE :search', {
            search: normalizedSearch,
          });
        }),
      );
    }

    if (params.serviceTypeId) {
      baseQuery.andWhere('jt.id = :serviceTypeId', {
        serviceTypeId: params.serviceTypeId,
      });
    }

    const ageFilterBase =
      'profile.birth_date IS NOT NULL AND profile.birth_date <= CURRENT_DATE';
    if (params.minAge != null) {
      baseQuery.andWhere(
        `${ageFilterBase} AND (${AGE_YEARS_SQL}) >= :minAge`,
        { minAge: params.minAge },
      );
    }
    if (params.maxAge != null) {
      baseQuery.andWhere(
        `${ageFilterBase} AND (${AGE_YEARS_SQL}) <= :maxAge`,
        { maxAge: params.maxAge },
      );
    }

    const total = await baseQuery
      .clone()
      .select('user.id')
      .distinct(true)
      .getCount();

    const query = baseQuery
      .clone()
      .select('user.id', 'id')
      .addSelect('profile.name', 'name')
      .addSelect('profile.photo_url', 'avatarUrl')
      .addSelect('profile.photo_url', 'coverImageUrl')
      .addSelect('profile.rating', 'rating')
      .addSelect('profile.bio', 'bio')
      .addSelect('profile.address_city', 'addressCity')
      .addSelect('profile.address_state', 'addressState')
      .addSelect('profile.latitude', 'creatorLatitude')
      .addSelect('profile.longitude', 'creatorLongitude')
      .addSelect('profile.has_valid_coordinates', 'creatorHasValidCoordinates')
      .addSelect('creatorProfile.service_radius_km', 'creatorServiceRadiusKm')
      .addSelect(
        `
          CASE
            WHEN profile.address_city IS NOT NULL AND profile.address_state IS NOT NULL
              THEN profile.address_city || '/' || profile.address_state
            WHEN profile.address_city IS NOT NULL
              THEN profile.address_city
            WHEN profile.address_state IS NOT NULL
              THEN profile.address_state
            ELSE 'Localização não informada'
          END
        `,
        'location',
      )
      .addSelect(
        `CASE WHEN profile.birth_date IS NOT NULL AND profile.birth_date <= CURRENT_DATE THEN ${AGE_YEARS_SQL} ELSE NULL END`,
        'ageYears',
      )
      .addSelect(
        `COALESCE(NULLIF(MIN(jt.name), ''), 'Serviços UGC')`,
        'niche',
      )
      .addSelect(
        `
          ARRAY_REMOVE(
            ARRAY_AGG(DISTINCT jt.name),
            NULL
          )
        `,
        'tags',
      )
      .addSelect(
        `
          MIN(
            CASE
              WHEN cjt.base_price_cents IS NOT NULL
                THEN cjt.base_price_cents::decimal / 100
              ELSE jt.price
            END
          )
        `,
        'minPrice',
      )
      .groupBy('user.id')
      .addGroupBy('profile.user_id')
      .addGroupBy('creatorProfile.user_id');

    if (params.sortBy === 'avaliacao') {
      query.orderBy('profile.rating', 'DESC', 'NULLS LAST');
      query.addOrderBy('profile.name', 'ASC');
    } else if (params.sortBy === 'preco') {
      query.orderBy('minPrice', 'ASC', 'NULLS LAST');
      query.addOrderBy('profile.name', 'ASC');
    } else {
      query.orderBy('profile.rating', 'DESC', 'NULLS LAST');
      query.addOrderBy('profile.name', 'ASC');
    }

    const rows = await query
      .offset((params.page - 1) * params.limit)
      .limit(params.limit)
      .getRawMany<{
        id: string;
        name: string;
        avatarUrl: string | null;
        coverImageUrl: string | null;
        rating: string | number;
        location: string;
        bio: string | null;
        niche: string | null;
        tags: string[] | null;
        minPrice: string | number | null;
        ageYears: string | number | null;
        creatorLatitude: string | number | null;
        creatorLongitude: string | number | null;
        creatorHasValidCoordinates: boolean | null;
      }>();

    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        avatarUrl: row.avatarUrl,
        coverImageUrl: row.coverImageUrl,
        rating:
          typeof row.rating === 'number' ? row.rating : parseFloat(row.rating ?? '0'),
        location: row.location,
        bio: row.bio,
        tags: Array.isArray(row.tags) ? row.tags.filter(Boolean) : [],
        niche: row.niche || 'Serviços UGC',
        minPrice:
          row.minPrice == null
            ? null
            : typeof row.minPrice === 'number'
              ? row.minPrice
              : parseFloat(row.minPrice),
        ageYears: mapRawAgeYears(row.ageYears),
        creatorLatitude:
          row.creatorLatitude == null
            ? null
            : typeof row.creatorLatitude === 'number'
              ? row.creatorLatitude
              : parseFloat(row.creatorLatitude),
        creatorLongitude:
          row.creatorLongitude == null
            ? null
            : typeof row.creatorLongitude === 'number'
              ? row.creatorLongitude
              : parseFloat(row.creatorLongitude),
        creatorHasValidCoordinates: row.creatorHasValidCoordinates === true,
      })),
      total,
    };
  }

  async findMarketplaceCreatorById(
    creatorId: string,
  ): Promise<MarketplaceCreatorDetailItem | null> {
    const row = await this.repo
      .createQueryBuilder('user')
      .innerJoin('user.profile', 'profile')
      .innerJoin('user.creatorProfile', 'creatorProfile')
      .leftJoin(
        'creator_job_types',
        'cjt',
        'cjt.creator_profile_user_id = user.id AND cjt.is_active = true',
      )
      .leftJoin(
        'job_types',
        'jt',
        'jt.id = cjt.job_type_id AND jt.is_active = true',
      )
      .where('user.id = :creatorId', { creatorId })
      .andWhere('user.role = :role', { role: UserRole.CREATOR })
      .select('user.id', 'id')
      .addSelect('profile.name', 'name')
      .addSelect('profile.photo_url', 'avatarUrl')
      .addSelect('profile.photo_url', 'coverImageUrl')
      .addSelect('profile.rating', 'rating')
      .addSelect('profile.bio', 'bio')
      .addSelect('profile.address_city', 'addressCity')
      .addSelect('profile.address_state', 'addressState')
      .addSelect('profile.latitude', 'creatorLatitude')
      .addSelect('profile.longitude', 'creatorLongitude')
      .addSelect('profile.has_valid_coordinates', 'creatorHasValidCoordinates')
      .addSelect('creatorProfile.service_radius_km', 'creatorServiceRadiusKm')
      .addSelect(
        `
          CASE
            WHEN profile.address_city IS NOT NULL AND profile.address_state IS NOT NULL
              THEN profile.address_city || '/' || profile.address_state
            WHEN profile.address_city IS NOT NULL
              THEN profile.address_city
            WHEN profile.address_state IS NOT NULL
              THEN profile.address_state
            ELSE 'Localização não informada'
          END
        `,
        'location',
      )
      .addSelect(
        `CASE WHEN profile.birth_date IS NOT NULL AND profile.birth_date <= CURRENT_DATE THEN ${AGE_YEARS_SQL} ELSE NULL END`,
        'ageYears',
      )
      .addSelect(
        `COALESCE(NULLIF(MIN(jt.name), ''), 'Serviços UGC')`,
        'niche',
      )
      .addSelect(
        `
          ARRAY_REMOVE(
            ARRAY_AGG(DISTINCT jt.name),
            NULL
          )
        `,
        'tags',
      )
      .addSelect(
        `
          MIN(
            CASE
              WHEN cjt.base_price_cents IS NOT NULL
                THEN cjt.base_price_cents::decimal / 100
              ELSE jt.price
            END
          )
        `,
        'minPrice',
      )
      .groupBy('user.id')
      .addGroupBy('profile.user_id')
      .addGroupBy('creatorProfile.user_id')
      .getRawOne<{
        id: string;
        name: string;
        avatarUrl: string | null;
        coverImageUrl: string | null;
        rating: string | number;
        location: string;
        bio: string | null;
        addressCity: string | null;
        addressState: string | null;
        creatorLatitude: string | number | null;
        creatorLongitude: string | number | null;
        creatorHasValidCoordinates: boolean | string;
        creatorServiceRadiusKm: string | number | null;
        niche: string | null;
        tags: string[] | null;
        minPrice: string | number | null;
        ageYears: string | number | null;
      }>();

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      name: row.name,
      avatarUrl: row.avatarUrl,
      coverImageUrl: row.coverImageUrl,
      rating:
        typeof row.rating === 'number' ? row.rating : parseFloat(row.rating ?? '0'),
      location: row.location,
      bio: row.bio,
      ageYears: mapRawAgeYears(row.ageYears),
      addressCity: row.addressCity,
      addressState: row.addressState,
      creatorLatitude:
        row.creatorLatitude == null
          ? null
          : typeof row.creatorLatitude === 'number'
            ? row.creatorLatitude
            : parseFloat(row.creatorLatitude),
      creatorLongitude:
        row.creatorLongitude == null
          ? null
          : typeof row.creatorLongitude === 'number'
            ? row.creatorLongitude
            : parseFloat(row.creatorLongitude),
      creatorHasValidCoordinates:
        row.creatorHasValidCoordinates === true ||
        row.creatorHasValidCoordinates === 'true',
      creatorServiceRadiusKm:
        row.creatorServiceRadiusKm == null
          ? null
          : typeof row.creatorServiceRadiusKm === 'number'
            ? row.creatorServiceRadiusKm
            : parseFloat(row.creatorServiceRadiusKm),
      tags: Array.isArray(row.tags) ? row.tags.filter(Boolean) : [],
      niche: row.niche || 'Serviços UGC',
      minPrice:
        row.minPrice == null
          ? null
          : typeof row.minPrice === 'number'
            ? row.minPrice
            : parseFloat(row.minPrice),
    };
  }
}
