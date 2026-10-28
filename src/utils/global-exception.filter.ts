import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { CustomException } from './custom-exception';
import { ErrorCode } from '../types/error-code.enum';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let errorCode: string;
    let message: string;
    let details: any;

    if (exception instanceof CustomException) {
      // 커스텀 예외 처리
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse() as any;
      errorCode = exceptionResponse.errorCode;
      message = exceptionResponse.message;
      details = exceptionResponse.details;
    } else if (exception instanceof HttpException) {
      // 기본 HTTP 예외 처리
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        errorCode = this.getErrorCodeByStatus(status);
        message = exceptionResponse;
      } else {
        errorCode = this.getErrorCodeByStatus(status);
        message = (exceptionResponse as any).message || exception.message;
        details = exceptionResponse;
      }
    } else {
      // 예상치 못한 오류 처리
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      errorCode = ErrorCode.INTERNAL_SERVER_ERROR;
      message = '서버 오류가 발생했습니다.';
      details = process.env.NODE_ENV === 'development' ? exception : undefined;
    }

    // 에러 로깅
    this.logError(exception, request, status, errorCode, message);

    // 응답 형태 통일
    const errorResponse = {
      success: false,
      errorCode,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      ...(details && { details }),
    };

    response.status(status).json(errorResponse);
  }

  private getErrorCodeByStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.INVALID_INPUT_VALUE;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.RESOURCE_NOT_FOUND;
      case HttpStatus.METHOD_NOT_ALLOWED:
        return ErrorCode.METHOD_NOT_ALLOWED;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.TOO_MANY_REQUESTS;
      case HttpStatus.INTERNAL_SERVER_ERROR:
      default:
        return ErrorCode.INTERNAL_SERVER_ERROR;
    }
  }

  private logError(
    exception: unknown,
    request: Request,
    status: number,
    errorCode: string,
    message: string,
  ): void {
    const logMessage = {
      errorCode,
      message,
      status,
      method: request.method,
      url: request.url,
      userAgent: request.get('User-Agent'),
      ip: request.ip,
      timestamp: new Date().toISOString(),
    };

    if (status >= 500) {
      this.logger.error(
        logMessage,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else if (status >= 400) {
      this.logger.warn(logMessage);
    } else {
      this.logger.log(logMessage);
    }
  }
}
