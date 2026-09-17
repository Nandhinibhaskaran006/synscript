/**
 * SynScript Structured Logger
 * Provides standardized, production-friendly logging across server, API, auth, and socket events.
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const CURRENT_LEVEL = process.env.LOG_LEVEL
  ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] ?? LOG_LEVELS.INFO
  : LOG_LEVELS.INFO;

function formatTimestamp() {
  return new Date().toISOString();
}

function formatMessage(level, category, message, meta = null) {
  const timestamp = formatTimestamp();
  const metaStr = meta ? ` | ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level.padEnd(5)}] [${category.toUpperCase()}] ${message}${metaStr}`;
}

const logger = {
  debug(category, message, meta) {
    if (CURRENT_LEVEL <= LOG_LEVELS.DEBUG) {
      console.debug(formatMessage('DEBUG', category, message, meta));
    }
  },

  info(category, message, meta) {
    if (CURRENT_LEVEL <= LOG_LEVELS.INFO) {
      console.log(formatMessage('INFO', category, message, meta));
    }
  },

  warn(category, message, meta) {
    if (CURRENT_LEVEL <= LOG_LEVELS.WARN) {
      console.warn(formatMessage('WARN', category, message, meta));
    }
  },

  error(category, message, meta) {
    if (CURRENT_LEVEL <= LOG_LEVELS.ERROR) {
      console.error(formatMessage('ERROR', category, message, meta));
    }
  },

  // HTTP Request Logging Middleware for Express
  httpMiddleware(req, res, next) {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const statusCode = res.statusCode;
      const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
      logger[level]('HTTP', `${req.method} ${req.originalUrl} -> ${statusCode} (${duration}ms)`, {
        ip: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      });
    });
    next();
  },

  // Specialized event helpers
  authSuccess(action, userId, username, email) {
    logger.info('AUTH', `Auth success: ${action}`, { userId, username, email });
  },

  authFailure(action, reason, emailOrUsername) {
    logger.warn('AUTH', `Auth failed: ${action} - ${reason}`, { identity: emailOrUsername });
  },

  socketConnect(socketId, userId, username) {
    logger.info('SOCKET', `Client connected: ${socketId}`, { userId, username });
  },

  socketDisconnect(socketId, userId, reason) {
    logger.info('SOCKET', `Client disconnected: ${socketId}`, { userId, reason });
  },

  roomEvent(event, roomId, userId, username, meta = {}) {
    logger.info('ROOM', `[${roomId}] ${event} by ${username || userId}`, { roomId, userId, ...meta });
  },
};

module.exports = logger;
