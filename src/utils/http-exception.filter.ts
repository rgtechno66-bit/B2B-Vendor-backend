import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';

@Catch(BadRequestException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();

    const exceptionResponse = exception.getResponse();

    // Type assertion to handle the exception response correctly
    let message: string;

    if (typeof exceptionResponse === 'string') {
      // Handle case where response is a string
      message = exceptionResponse;
    } else {
      // Handle case where response is an object
      const responseObject = exceptionResponse as {
        message: string | string[];
      };
      message = Array.isArray(responseObject.message)
        ? responseObject.message
            .map((msg) => {
              if (msg.toLowerCase().includes('should not be empty')) {
                return 'Field is required'; // Customize this message as needed
              }
              return 'Invalid field'; // Customize for invalid fields
            })
            .join(', ')
        : responseObject.message;
    }

    response.status(status).json({
      message: message,
      error: 'Bad Request',
      statusCode: status,
    });
  }
}
