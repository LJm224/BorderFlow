import { LoggerService } from '@nestjs/common';
import pino, { Logger } from 'pino';

export class PinoLogger implements LoggerService {
  private readonly logger: Logger = pino({
    level: process.env.LOG_LEVEL ?? 'info',
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
  });

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('info', message, optionalParams[0]);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    const [stack, context] = optionalParams;
    this.write('error', message, context, typeof stack === 'string' ? { stack } : undefined);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams[0]);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams[0]);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('trace', message, optionalParams[0]);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('fatal', message, optionalParams[0]);
  }

  private write(level: 'info' | 'error' | 'warn' | 'debug' | 'trace' | 'fatal', message: unknown, context: unknown, extra?: Record<string, unknown>): void {
    const fields = typeof message === 'object' && message !== null ? message as Record<string, unknown> : undefined;
    const payload = { context, ...extra, ...fields };
    const text = fields ? undefined : String(message);
    this.logger[level](payload, text);
  }
}
