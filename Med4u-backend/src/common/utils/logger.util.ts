import { ConfigService } from '@nestjs/config';
import { utilities as nestWinstonModuleUtilities, WinstonModuleOptions } from 'nest-winston';
import * as winston from 'winston';

export function winstonConfig(config: ConfigService): WinstonModuleOptions {
  const nodeEnv = config.get<string>('NODE_ENV', 'development');
  const logLevel = config.get<string>('LOG_LEVEL', 'debug');
  const appName = config.get<string>('APP_NAME', 'Med4U');

  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.ms(),
        nestWinstonModuleUtilities.format.nestLike(appName, {
          colors: nodeEnv !== 'production',
          prettyPrint: nodeEnv !== 'production',
        }),
      ),
    }),
  ];

  if (nodeEnv === 'production') {
    transports.push(
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
      }),
      new winston.transports.File({
        filename: 'logs/combined.log',
        format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
      }),
    );
  }

  return {
    level: logLevel,
    transports,
  };
}
