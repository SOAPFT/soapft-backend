import * as winston from 'winston';
import {
  WinstonModuleOptions,
  utilities as nestWinstonModuleUtilities,
} from 'nest-winston';
import * as DailyRotateFile from 'winston-daily-rotate-file';
import * as fs from 'fs';

// ECS에서의 환경변수 설정
const isEcs =
  process.env.AWS_EXECUTION_ENV?.startsWith('AWS_ECS_') ||
  Boolean(
    process.env.ECS_CONTAINER_METADATA_URI_V4 ||
      process.env.ECS_CONTAINER_METADATA_URI,
  );
const logFormat = process.env.LOG_FORMAT || (isEcs ? 'json' : 'text');

// 로그 디렉토리 확인
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs');
}

// 커스텀 트랜스포트 포맷 설정
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json(),
);

// 즉시 기록을 위한 설정
const fileOptions = {
  flags: 'a',
  flush: true,
};

export const winstonConfig: WinstonModuleOptions = {
  transports: [
    new winston.transports.Console({
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        logFormat === 'json'
          ? winston.format.json()
          : nestWinstonModuleUtilities.format.nestLike('SOAPFT', {
              prettyPrint: true,
              colors: true,
            }),
      ),
    }),

    // 에러 로그 로테이션
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '7d',
      format: fileFormat,
      options: fileOptions, // 즉시 기록 설정 추가
      auditFile: 'logs/error-audit.json', // 파일 상태 추적
    }),

    // 통합 로그 로테이션
    new DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '7d',
      format: fileFormat,
      options: fileOptions, // 즉시 기록 설정 추가
      auditFile: 'logs/combined-audit.json', // 파일 상태 추적
    }),

    // HTTP 로그 전용
    new DailyRotateFile({
      filename: 'logs/http-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'debug',
      maxSize: '20m',
      maxFiles: '7d',
      options: fileOptions,
      auditFile: 'logs/http-audit.json',
      format: winston.format.combine(
        winston.format((info) =>
          info.context === 'HttpLogger' ? info : false,
        )(),
        winston.format.timestamp(),
        winston.format.json(),
      ),
    }),
  ],
  exitOnError: false,
  handleExceptions: true,
};
