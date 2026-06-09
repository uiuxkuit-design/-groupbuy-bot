import { config } from '../config/env.js';
import logger from '../utils/logger.js';

export async function adminGuard(ctx, next) {
  if (!config.bot.adminIds.includes(ctx.from?.id)) {
    logger.warn(`Unauthorized: ${ctx.from?.id}`);
    await ctx.reply('⛔ Admin access only.');
    return;
  }
  return next();
}
