import { Scenes } from 'telegraf';
import { createProductScene } from '../scenes/admin/createProductScene.js';
import { uploadPaymentScene, rejectPaymentScene } from '../scenes/user/orderScene.js';
import logger from '../utils/logger.js';

export function buildStage() {
  const stage = new Scenes.Stage([
    createProductScene,
    uploadPaymentScene,
    rejectPaymentScene,
  ]);

  stage.command('cancel', async (ctx) => {
    await ctx.scene.leave();
    await ctx.reply('❌ Bekor qilindi.');
  });

  logger.info('Scenes registered');
  return stage;
}