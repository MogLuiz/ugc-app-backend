import { Controller, Get, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { JobTypesService } from './job-types.service';

@Controller('job-types')
@UseGuards(SupabaseAuthGuard)
export class JobTypesController {
  constructor(private readonly jobTypesService: JobTypesService) {}

  @Get()
  async listActive() {
    return this.jobTypesService.listActive();
  }
}
