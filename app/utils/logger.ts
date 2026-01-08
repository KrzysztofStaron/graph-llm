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

    if (process.env.NODE_ENV === 'development') {
      return;
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

  // Helper to log images with console.image()
  image(url: string, label?: string, meta?: LogMeta): void {
    if (typeof window !== 'undefined' && url) {
      console.log(`[IMAGE] ${label || 'Image'}:`, meta);
      // Use console.image if available (some browsers), otherwise log URL
      if (typeof (console as any).image === 'function') {
        (console as any).image(url);
      } else {
        // Fallback: create a styled console log with the image
        console.log(
          '%c ',
          `font-size: 100px; background: url(${url}) no-repeat center; background-size: contain; padding: 50px 100px;`
        );
      }
    }
    this.info(`Image: ${label || url.substring(0, 50)}`, { ...meta, imageUrl: url.substring(0, 100) });
  }

  // Helper to log structured data with better formatting
  structure(label: string, data: unknown, meta?: LogMeta): void {
    if (typeof window !== 'undefined') {
      console.group(`[STRUCTURE] ${label}`);
      console.log(data);
      console.groupEnd();
    }
    this.debug(`Structure: ${label}`, { ...meta, data });
  }
}

const logger = new Logger();

export default logger;

