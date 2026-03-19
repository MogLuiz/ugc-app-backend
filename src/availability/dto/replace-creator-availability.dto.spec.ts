import 'reflect-metadata';
import { validate } from 'class-validator';
import { AvailabilityDayOfWeek } from '../../common/enums/availability-day-of-week.enum';
import { AvailabilityDayInputDto } from './replace-creator-availability.dto';

describe('AvailabilityDayInputDto', () => {
  it('aceita dia ativo com horarios preenchidos', async () => {
    const dto = new AvailabilityDayInputDto();
    dto.dayOfWeek = AvailabilityDayOfWeek.MONDAY;
    dto.isActive = true;
    dto.startTime = '09:00';
    dto.endTime = '18:00';

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejeita dia ativo sem horarios', async () => {
    const dto = new AvailabilityDayInputDto();
    dto.dayOfWeek = AvailabilityDayOfWeek.MONDAY;
    dto.isActive = true;
    dto.startTime = null;
    dto.endTime = null;

    const errors = await validate(dto);

    expect(errors[0]?.constraints).toMatchObject({
      availabilityDaySemantics:
        'Quando isActive = true, startTime e endTime são obrigatórios',
    });
  });

  it('rejeita dia inativo com horarios nao nulos', async () => {
    const dto = new AvailabilityDayInputDto();
    dto.dayOfWeek = AvailabilityDayOfWeek.TUESDAY;
    dto.isActive = false;
    dto.startTime = '09:00';
    dto.endTime = '18:00';

    const errors = await validate(dto);

    expect(errors[0]?.constraints).toMatchObject({
      availabilityDaySemantics:
        'Quando isActive = false, startTime e endTime devem ser null',
    });
  });
});
