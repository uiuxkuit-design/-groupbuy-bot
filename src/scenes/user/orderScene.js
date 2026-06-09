import { Scenes } from 'telegraf';
import { productService }     from '../../services/productService.js';
import { seriesService }      from '../../services/seriesService.js';
import { orderService }       from '../../services/orderService.js';
import { paymentService }     from '../../services/paymentService.js';
import { userService }        from '../../services/userService.js';
import { waitingListService } from '../../services/waitingListService.js';
import {
  sizeKeyboard, colorKeyboard, quantityKeyboard,
  paymentConfirm, waitingListKeyboard, backToMain,
} from '../../keyboards/index.js';
import { formatPrice, progressBar, deadlineLabel } from '../../utils/helpers.js';
import { config } from '../../config/env.js';
import logger from '../../utils/logger.js';

// ─── Scene: upload payment proof ────────────────────────────
export const uploadPaymentScene = new Scenes.BaseScene('user:upload-payment');

uploadPaymentScene.enter(async (ctx) => {
  await ctx.reply(
    '📎 *Upload Payment Proof*\n\n' +
    'Please send a *photo* of your payment receipt/screenshot now.\n\n' +
    '_Type /cancel to abort._',
    { parse_mode: 'Markdown' }
  );
});

uploadPaymentScene.command('cancel', async (ctx) => {
  await ctx.reply('❌ Upload cancelled.', backToMain());
  return ctx.scene.leave();
});

uploadPaymentScene.on('photo', async (ctx) => {
  const { orderId } = ctx.scene.state;
  if (!orderId) {
    await ctx.reply('❌ Session expired. Please start your order again.');
    return ctx.scene.leave();
  }

  const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;

  try {
    const payment = await paymentService.submit({ orderId, checkImage: fileId });
    const order   = await orderService.getById(orderId);

    await ctx.reply(
      '✅ *Payment proof submitted!*\n\n' +
      'Our team will verify your payment and confirm your order.\n' +
      'You will be notified once approved.\n\n' +
      `🆔 Order ref: \`${orderId.slice(0, 8)}\``,
      { parse_mode: 'Markdown', ...backToMain() }
    );

    // Notify all admins
    for (const adminId of config.bot.adminIds) {
      try {
        await ctx.telegram.sendPhoto(adminId, fileId, {
          caption:
            `💳 *New Payment Proof*\n\n` +
            `👤 ${ctx.from.first_name} (@${ctx.from.username ?? ctx.from.id})\n` +
            `📦 ${order.products?.name}\n` +
            `📊 Series #${order.series?.series_number}\n` +
            `🔢 Qty: ${order.quantity}  |  Size: ${order.size ?? '—'}  |  Color: ${order.color ?? '—'}\n` +
            `💰 Total: ${formatPrice((order.products?.price ?? 0) * order.quantity)}\n` +
            `🆔 \`${orderId.slice(0, 8)}\``,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Approve', callback_data: `admin:payment:approve:${payment.id}` },
              { text: '❌ Reject',  callback_data: `admin:payment:reject:${payment.id}` },
            ]],
          },
        });
      } catch { /* admin blocked bot */ }
    }
    logger.info(`Payment proof submitted: order=${orderId}`);
  } catch (err) {
    logger.error('uploadPaymentScene photo:', err);
    await ctx.reply(`❌ Error: ${err.message}`);
  }
  return ctx.scene.leave();
});

uploadPaymentScene.on('message', async (ctx) => {
  await ctx.reply('⚠️ Please send a *photo* of your payment receipt.', { parse_mode: 'Markdown' });
});

// ─── Scene: reject payment with reason ──────────────────────
export const rejectPaymentScene = new Scenes.BaseScene('admin:reject-payment');

rejectPaymentScene.enter(async (ctx) => {
  await ctx.reply(
    '❌ *Reject Payment*\n\nEnter the reason for rejection (this will be sent to the user):\n\n_Or type /cancel_',
    { parse_mode: 'Markdown' }
  );
});

rejectPaymentScene.command('cancel', async (ctx) => {
  await ctx.reply('Cancelled.', { reply_markup: { inline_keyboard: [[{ text: '◀️ Pending Payments', callback_data: 'admin:payments:pending' }]] } });
  return ctx.scene.leave();
});

rejectPaymentScene.on('text', async (ctx) => {
  const { paymentId } = ctx.scene.state;
  if (!paymentId) return ctx.scene.leave();

  try {
    const payment = await paymentService.reject({
      paymentId,
      adminTelegramId: ctx.from.id,
      note: ctx.message.text.trim(),
    });

    // Fetch order to notify user
    const order = await orderService.getById(payment.order_id);
    try {
      await ctx.telegram.sendMessage(
        order.users?.telegram_id,
        `❌ *Payment Rejected*\n\n` +
        `📦 ${order.products?.name}\n` +
        `🆔 Order: \`${order.id.slice(0, 8)}\`\n\n` +
        `📝 Reason: ${ctx.message.text.trim()}\n\n` +
        `Please re-upload a valid payment proof.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '📎 Upload Again', callback_data: `user:payment:upload:${order.id}` },
            ]],
          },
        }
      );
    } catch { /* user blocked bot */ }

    await ctx.reply(
      '✅ Payment rejected and user notified.',
      { reply_markup: { inline_keyboard: [[{ text: '◀️ Pending Payments', callback_data: 'admin:payments:pending' }]] } }
    );
  } catch (err) {
    logger.error('rejectPaymentScene:', err);
    await ctx.reply(`❌ Error: ${err.message}`);
  }
  return ctx.scene.leave();
});
