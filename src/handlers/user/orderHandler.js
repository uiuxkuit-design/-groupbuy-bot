import { Scenes } from 'telegraf';
import { orderService }   from '../../services/orderService.js';
import { productService } from '../../services/productService.js';
import { myOrderActions, cancelConfirm, backToMain } from '../../keyboards/index.js';
import { formatPrice, progressBar } from '../../utils/helpers.js';
import { config } from '../../config/env.js';
import logger from '../../utils/logger.js';

// ── Scene: Place Order (multi-step) ───────────────────────────

export const placeOrderScene = new Scenes.WizardScene(
  'user:place-order',

  // Step 1: Quantity
  async (ctx) => {
    const { productName } = ctx.wizard.state;
    await ctx.reply(
      `🛒 *Placing order for:* ${productName}\n\nStep 1/2 — How many units? (enter a number):`,
      { parse_mode: 'Markdown' }
    );
    return ctx.wizard.next();
  },

  // Step 2: Notes
  async (ctx) => {
    if (!ctx.message?.text) return ctx.reply('Please send a number.');
    const qty = parseInt(ctx.message.text, 10);
    if (isNaN(qty) || qty < 1) return ctx.reply('❌ Invalid quantity. Enter a positive number:');
    ctx.wizard.state.quantity = qty;
    await ctx.reply('Step 2/2 — Any special notes or size/colour? (or type `skip`):', {
      parse_mode: 'Markdown',
    });
    return ctx.wizard.next();
  },

  // Step 3: Confirm & submit
  async (ctx) => {
    if (!ctx.message?.text) return ctx.reply('Please send a message.');
    ctx.wizard.state.notes =
      ctx.message.text.toLowerCase() === 'skip' ? null : ctx.message.text.trim();

    try {
      const { order, series } = await orderService.place({
        productId: ctx.wizard.state.productId,
        userId:    ctx.from.id,
        username:  ctx.from.username,
        fullName:  [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
        quantity:  ctx.wizard.state.quantity,
        notes:     ctx.wizard.state.notes,
      });

      await ctx.reply(
        `✅ *Order Placed!*\n\n` +
        `📦 ${ctx.wizard.state.productName}\n` +
        `🔢 Qty: ${order.quantity}\n` +
        `📊 Series #${series.series_number}\n` +
        `📝 Notes: ${order.notes ?? '—'}\n\n` +
        `👉 Next step: send your *payment proof* (screenshot/receipt).\n` +
        `Use /myorders to manage your order.`,
        { parse_mode: 'Markdown', ...myOrderActions(order.id, 'pending') }
      );

      // Notify admins
      for (const adminId of config.bot.adminIds) {
        try {
          await ctx.telegram.sendMessage(
            adminId,
            `🔔 *New Order!*\n\n` +
            `👤 @${ctx.from.username ?? ctx.from.id} (${ctx.from.first_name})\n` +
            `📦 ${ctx.wizard.state.productName}\n` +
            `📊 Series #${series.series_number}\n` +
            `🔢 Qty: ${order.quantity}\n` +
            `🆔 Order: \`${order.id.slice(0, 8)}\``,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [[
                  { text: '📋 View Order', callback_data: `admin:order:view:${order.id}` }
                ]]
              }
            }
          );
        } catch { /* admin may not have started the bot */ }
      }
    } catch (err) {
      logger.error('placeOrderScene final step:', err);
      await ctx.reply(`❌ ${err.message}`);
    }

    return ctx.scene.leave();
  }
);

// ── Action: My Orders ─────────────────────────────────────────

export async function handleMyOrders(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  try {
    const orders = await orderService.listByUser(ctx.from.id);
    if (!orders.length) {
      const msg = '📭 You have no orders yet.\n\nUse /products to browse products.';
      return ctx.callbackQuery ? ctx.editMessageText(msg) : ctx.reply(msg);
    }

    const buttons = orders.map(o => {
      const icon   = { pending: '⏳', confirmed: '✅', cancelled: '❌' }[o.status] ?? '❓';
      const label  = `${icon} ${o.products?.name ?? 'N/A'} — Series #${o.series?.series_number}`;
      return [{ text: label, callback_data: `user:order:view:${o.id}` }];
    });
    buttons.push([{ text: '🏠 Main Menu', callback_data: 'user:main' }]);

    const text = `📋 *My Orders* (${orders.length})`;
    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons },
      });
    } else {
      await ctx.reply(text, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons },
      });
    }
  } catch (err) {
    logger.error('handleMyOrders:', err);
    const msg = '❌ Error loading orders.';
    ctx.callbackQuery ? ctx.editMessageText(msg) : ctx.reply(msg);
  }
}

export async function handleViewOrder(ctx, orderId) {
  await ctx.answerCbQuery();
  try {
    const order = await orderService.getById(orderId);
    if (!order || order.user_id !== ctx.from.id) {
      return ctx.editMessageText('❌ Order not found.');
    }

    const statusLabels = { pending: '⏳ Pending', confirmed: '✅ Confirmed', cancelled: '❌ Cancelled' };
    const text =
      `📋 *Order Details*\n\n` +
      `📦 ${order.products?.name ?? 'N/A'}\n` +
      `💰 ${formatPrice(order.products?.price ?? 0)} × ${order.quantity}\n` +
      `📊 Series #${order.series?.series_number}\n` +
      `📌 Status: ${statusLabels[order.status] ?? order.status}\n` +
      `📎 Payment: ${order.payment_proof ? '✅ Uploaded' : '❌ Not uploaded'}\n` +
      `📝 Notes: ${order.notes ?? '—'}`;

    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...myOrderActions(orderId, order.status),
    });
  } catch (err) {
    logger.error('handleViewOrder (user):', err);
    await ctx.editMessageText('❌ Error loading order.');
  }
}

export async function handleProofUpload(ctx) {
  // User sends a photo as payment proof
  const photo = ctx.message?.photo;
  if (!photo?.length) return ctx.reply('Please send a photo as payment proof.');

  const pendingOrderId = ctx.session?.awaitingProofForOrder;
  if (!pendingOrderId) {
    return ctx.reply('Please use the button in your order to upload payment proof.');
  }

  try {
    const fileId = photo[photo.length - 1].file_id;
    const order  = await orderService.attachPaymentProof(pendingOrderId, fileId);

    // Verify the order belongs to this user
    if (order.user_id !== ctx.from.id) throw new Error('Unauthorized');

    delete ctx.session.awaitingProofForOrder;

    await ctx.reply('📎 Payment proof uploaded! An admin will verify your payment shortly.', backToMain());

    // Forward to admins
    for (const adminId of config.bot.adminIds) {
      try {
        await ctx.telegram.sendPhoto(adminId, fileId, {
          caption: `💳 *Payment Proof*\n\n👤 @${ctx.from.username ?? ctx.from.id}\n🆔 Order: \`${pendingOrderId.slice(0, 8)}\``,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Confirm Order', callback_data: `admin:order:confirm:${pendingOrderId}` },
              { text: '❌ Cancel Order',  callback_data: `admin:order:cancel:${pendingOrderId}` },
            ]]
          },
        });
      } catch { /* admin blocked bot */ }
    }
  } catch (err) {
    logger.error('handleProofUpload:', err);
    await ctx.reply(`❌ ${err.message}`);
  }
}

export async function handleRequestProof(ctx, orderId) {
  await ctx.answerCbQuery();
  ctx.session.awaitingProofForOrder = orderId;
  await ctx.editMessageText(
    '📎 *Upload Payment Proof*\n\nPlease send a *photo* (screenshot) of your payment receipt now.',
    { parse_mode: 'Markdown' }
  );
}

export async function handleCancelOrderRequest(ctx, orderId) {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    '⚠️ Are you sure you want to cancel this order?',
    cancelConfirm(orderId)
  );
}

export async function handleCancelOrderConfirm(ctx, orderId) {
  await ctx.answerCbQuery('Cancelling…');
  try {
    const order = await orderService.getById(orderId);
    if (order.user_id !== ctx.from.id) throw new Error('Unauthorized');

    await orderService.cancel(orderId, 'Cancelled by user');
    await ctx.editMessageText('✅ Your order has been cancelled.', backToMain());
  } catch (err) {
    logger.error('handleCancelOrderConfirm:', err);
    await ctx.editMessageText(`❌ ${err.message}`);
  }
}
