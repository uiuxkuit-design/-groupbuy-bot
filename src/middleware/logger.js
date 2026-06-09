import logger from '../utils/logger.js';

export async function requestLogger(ctx, next) {
  const type   = ctx.updateType ?? 'unknown';
  const userId = ctx.from?.id ?? 'N/A';
  const user   = ctx.from?.username ? `@${ctx.from.username}` : (ctx.from?.first_name ?? 'N/A');
  const text   = ctx.message?.text ?? ctx.callbackQuery?.data ?? '';
  logger.info(`[${type}] ${user} (${userId}): ${text.slice(0, 80)}`);
  return next();
}
