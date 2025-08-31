const logger = require('./utils/logger');
const app = require('./app');

logger.info('Starting test...');

try {
  logger.info('Loading logger...');
  logger.info('Logger loaded successfully');

  logger.info('Loading app...');
  logger.info('App loaded successfully');

  logger.info('Starting app...');
  app.start().then(() => {
    logger.info('App started successfully');
  }).catch((error) => {
    logger.error('Failed to start app:', error);
    process.exit(1);
  });
} catch (error) {
  logger.error('Error during startup:', error);
  process.exit(1);
}
