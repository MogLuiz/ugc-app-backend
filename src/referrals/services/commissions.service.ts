import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  CommissionsRepository,
  CreateCommissionData,
} from '../repositories/commissions.repository';

@Injectable()
export class CommissionsService {
  constructor(private readonly commissionsRepository: CommissionsRepository) {}

  async createCommission(data: CreateCommissionData, manager?: EntityManager): Promise<void> {
    await this.commissionsRepository.insertIdempotent(data, manager);
  }
}
