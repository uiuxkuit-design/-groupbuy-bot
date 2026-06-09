import { Telegraf, session } from 'telegraf';
import { config }            from '../config/env.js';
import { requestLogger }     from '../middleware/logger.js';
import { globalErrorHandler }from '../middleware/errorHandler.js';
import { groupNotifier }     from '../services/groupNotifier.js';
import { cancelService }     from '../services/cancelService.js';
import { broadcastService }  from '../services/broadcastService.js';
import { scheduler }         from '../automation/scheduler.js';
import { buildStage }        from './scenes.js';
import { registerCommands }  from './commands.js';
import { registerActions }   from './actions.js';
import logger                from '../utils/logger.js';

export function createBot() {
  const bot = new Telegraf(config.bot.token);

  groupNotifier.init(bot);
  cancelService.init(bot);
  broadcastService.init(bot);
  scheduler.init(bot);

  bot.use(requestLogger);
  bot.use(session({ defaultSession: () => ({}) }));
  bot.use(buildStage().middleware());

  registerCommands(bot);
  registerActions(bot);

  bot.catch(globalErrorHandler);
  logger.info('Bot assembled');
  return bot;
}
