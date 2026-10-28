import {
  ArgumentsHost,
  ConsoleLogger,
  HttpException,
  Logger,
} from '@nestjs/common';
import { WinstonLogger } from 'nest-winston';
import { PassThrough } from 'stream';
import * as winston from 'winston';
import { GlobalExceptionFilter } from './global-exception.filter';
import { ErrorCode } from '../types/error-code.enum';

describe('GlobalExceptionFilter logging', () => {
  let logger: winston.Logger;
  let output: string[];
  const originalEnvironment = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    output = [];
    const stream = new PassThrough();
    stream.on('data', (chunk) => output.push(chunk.toString()));
    logger = winston.createLogger({
      format: winston.format.json(),
      transports: [new winston.transports.Stream({ stream })],
    });
    Logger.overrideLogger(new WinstonLogger(logger));
  });

  afterEach(() => {
    logger.close();
    Logger.overrideLogger(new ConsoleLogger());
    if (originalEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment;
  });

  function catchException(exception: unknown) {
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const request = {
      url: '/api/example',
      method: 'GET',
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-agent'),
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;

    new GlobalExceptionFilter().catch(exception, host);
    return { response, record: JSON.parse(output.join('')) };
  }

  it('preserves the server error response and error log level', () => {
    const { response, record } = catchException(
      new Error('database unavailable'),
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
      message: '서버 오류가 발생했습니다.',
      timestamp: expect.any(String),
      path: '/api/example',
      method: 'GET',
    });
    expect(record.level).toBe('error');
    expect(record).toEqual(
      expect.objectContaining({
        message: '서버 오류가 발생했습니다.',
        errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
        status: 500,
        method: 'GET',
        url: '/api/example',
        userAgent: 'test-agent',
        ip: '127.0.0.1',
      }),
    );
    expect(record.context).toBe('GlobalExceptionFilter');
    expect(record.stack).toEqual([
      expect.stringContaining('Error: database unavailable'),
    ]);
  });

  it.each([
    [400, 'warn'],
    [302, 'info'],
  ])('preserves the response and log level for status %i', (status, level) => {
    const { response, record } = catchException(
      new HttpException('example', status),
    );

    expect(response.status).toHaveBeenCalledWith(status);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'example', success: false }),
    );
    expect(record.level).toBe(level);
    expect(record.message).toBe('example');
    expect(record.status).toBe(status);
  });
});
