import logger from '../utils/logger.js';

export function globalErrorHandler(err, ctx) {
  logger.error(`Unhandled error for update ${ctx.update?.update_id}:`, err);
  try { ctx.reply('⚠️ An unexpected error occurred. Please try again.'); } catch {}
}
