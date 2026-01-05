import { sendToLoki } from '../api/sendToLoki';
import { getOrCreateClientId } from './clientId';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogMeta {
  [key: string]: unknown;
}

class Logger {
  private sendLog(level: LogLevel, message: unknown, meta?: LogMeta): void {
    const logEntry = {
      message,
      level,
      timestamp: new Date().toISOString(),
      meta: {
        ...meta,
        clientId: getOrCreateClientId(),
        userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
      },
    };

    // Log to console immediately
    if (typeof window !== 'undefined') {
      const consoleMethod = level === 'error' ? console.error : 
                           level === 'warn' ? console.warn : 
                           level === 'debug' ? console.debug : 
                           console.log;
      consoleMethod(`[${level.toUpperCase()}]`, message, meta);
    }

    // Send to Loki asynchronously (fire and forget)
    sendToLoki(logEntry).catch(() => {
      // Silently fail - don't break app if Loki is down
    });
  }

  info(message: unknown, meta?: LogMeta): void {
    this.sendLog('info', message, meta);
  }

  warn(message: unknown, meta?: LogMeta): void {
    this.sendLog('warn', message, meta);
  }

  error(message: unknown, meta?: LogMeta): void {
    this.sendLog('error', message, meta);
  }

  debug(message: unknown, meta?: LogMeta): void {
    this.sendLog('debug', message, meta);
  }
}

const logger = new Logger();

export default logger;

