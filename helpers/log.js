const log = require('console-log-level')(
  { 
    prefix: () => new Date().toLocaleTimeString(),
    level: process.env.CONSOLE_LOG_LEVEL || 'info'
  }
);

module.exports = {
  debug: log.debug,
  error: log.error,
  fatal: log.fatal,
  info: log.info,
  trace: log.trace,
  warn: log.warn,
};
