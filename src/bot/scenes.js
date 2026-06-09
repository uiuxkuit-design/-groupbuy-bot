import { Scenes } from 'telegraf';
import { createProductScene }                    from '../scenes/admin/createProductScene.js';
import { uploadPaymentScene, rejectPaymentScene } from '../scenes/user/orderScene.js';
import logger from '../utils/logger.js';

export function buildStage() {
  const stage = new Scenes.Stage([
    createProductScene,
    uploadPaymentScene,
    rejectPaymentScene,
  ]);
  logger.info('Scenes registered: admin:create-product, user:upload-payment, admin:reject-payment');
  return stage;
}
