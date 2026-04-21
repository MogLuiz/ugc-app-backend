import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
} from '@nestjs/common';
import { MulterError } from 'multer';
import { Response } from 'express';
import { getPortfolioUploadLimitExceededMessage } from '../config/env.validation';

@Catch(MulterError)
export class PortfolioUploadExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost) {
    if (exception.code !== 'LIMIT_FILE_SIZE') {
      throw new BadRequestException(exception.message);
    }

    const response = host.switchToHttp().getResponse<Response>();
    response.status(400).json({
      statusCode: 400,
      message: getPortfolioUploadLimitExceededMessage(),
      error: 'Bad Request',
    });
  }
}
