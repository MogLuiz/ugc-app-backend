import './instrument';
import { BadRequestException, Logger, ValidationError, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const logger = new Logger('ConfigBootstrap');

function formatValidationErrors(errors: ValidationError[]): string[] {
  const messages: string[] = [];

  const visit = (error: ValidationError) => {
    if (error.constraints) {
      messages.push(...Object.values(error.constraints));
    }

    if (error.children?.length) {
      error.children.forEach(visit);
    }
  };

  errors.forEach(visit);
  return messages;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const allowedOrigins = [
    'http://localhost:5173',
    process.env.FRONTEND_URL,
  ].filter(Boolean) as string[];
  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: (errors) => {
        const messages = formatValidationErrors(errors);

        return new BadRequestException({
          message:
            messages[0] ?? 'Dados inválidos. Revise os campos informados e tente novamente.',
          errors: messages,
        });
      },
    }),
  );
  logger.log('[CONFIG] Environment loaded successfully');
  logger.log('[CONFIG] All required variables present');
  const port = process.env.PORT || 3000;
  await app.listen(port);
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(message);
  process.exit(1);
});
