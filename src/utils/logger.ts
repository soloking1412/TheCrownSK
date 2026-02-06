import winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Sensitive data patterns to redact
const SENSITIVE_PATTERNS = [
  /0x[a-fA-F0-9]{64}/g,  // Private keys
  /privateKey['":\s]+['"]?[a-fA-F0-9x]+['"]?/gi, // Private key in objects
  /password['":\s]+['"]?[^'"}\s,]+['"]?/gi, // Passwords
  /secret['":\s]+['"]?[^'"}\s,]+['"]?/gi, // Secrets
  /apiKey['":\s]+['"]?[^'"}\s,]+['"]?/gi, // API keys
];

/**
 * Redact sensitive data from log messages
 */
function redactSensitive(text: string): string {
  let redacted = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  return redacted;
}

/**
 * Recursively redact sensitive data from objects
 */
function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ['privateKey', 'password', 'secret', 'apiKey', 'key', 'token'];
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      result[key] = redactSensitive(value);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactObject(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}

const logFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  // Redact sensitive data from message
  const safeMessage = redactSensitive(String(message));

  let log = `${timestamp} [${level}]: ${safeMessage}`;

  if (Object.keys(meta).length > 0) {
    // Redact sensitive data from metadata
    const safeMeta = redactObject(meta);
    log += ` ${JSON.stringify(safeMeta)}`;
  }

  if (stack) {
    log += `\n${redactSensitive(String(stack))}`;
  }

  return log;
});

export const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat
  ),
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), logFormat),
    }),
  ],
});

// Only add file logging in production
if (process.env.NODE_ENV === 'production') {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    })
  );

  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    })
  );
}
