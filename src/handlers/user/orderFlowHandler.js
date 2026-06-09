import { productService }     from '../../services/productService.js';
import { seriesService }      from '../../services/seriesService.js';
import { orderService }       from '../../services/orderService.js';
import { userService }        from '../../services/userService.js';
import { waitingListService } from '../../services/waitingListService.js';
import {
  sizeKeyboard, colorKeyboard, quantityKeyboard,
  paymentConfirm, myOrdersList, waitingListKeyboard, backToMain,
} from '../../keyboards/index.js';
import { formatPrice, progressBar, deadlineLabel } from '../../utils/helpers.js';
import { config } from '../../config/env.js';
import logger from '../../utils/logger.js';

// ─── Ensure user exists in DB ────────────────────────────────
async function ensureUser(ctx) {
  return userService.upsert({
    telegramId: ctx.from.id,
    fullname:   [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
    phone:      null,
  });
}

// ─── Group "Order Now" button ────────────────────────────────
export async function handleGroupOrder(ctx, productId) {
  await ctx.answerCbQuery().catch(() => {});

  try {
    const user    = await ensureUser(ctx);
    const product = await productService.getById(productId);
    const series  = await seriesService.getActive(productId);

    if (!product.is_active) {
      return ctx.reply('❌ This product is no longer available.');
    }

    if (!series) {
      // No active series — offer waiting list
      const isOnList = await waitingListService.isOnList(user.id, productId);
      return ctx.reply(
        `⏸ *No Active Series*\n\n📦 ${product.name}\n\nAll current slots are filled. Join the waiting list to be notified when the next series opens!`,
        { parse_mode: 'Markdown', ...waitingListKeyboard(productId, isOnList) }
      );
    }

    // Check if already ordered
    const existing = await orderService.listByUser(user.id);
    const hasOrder = existing.some(
      o => o.product_id === productId &&
           o.series_id  === series.id &&
           ['unpaid', 'pending_review', 'paid'].includes(o.payment_status)
    );

    if (hasOrder) {
      return ctx.reply(
        '✅ You already have an order in this series!\n\nUse /myorders to view it.',
        backToMain()
      );
    }

    // Show product details + size picker
    const bar = progressBar(series.current_count, series.target_count);
    const info =
      `📦 *${product.name}*\n` +
      `💰 ${formatPrice(product.price)}\n` +
      `📊 Series #${series.series_number}: ${bar}\n` +
      `${deadlineLabel(product.deadline)}\n\n` +
      `👇 Select your size:`;

    if (product.sizes?.length) {
      await ctx.reply(info, {
        parse_mode: 'Markdown',
        ...sizeKeyboard(product.sizes, productId),
      });
    } else {
      // No sizes — go straight to color or quantity
      await handleSizeSelected(ctx, productId, null, user);
    }
  } catch (err) {
    logger.error('handleGroupOrder:', err);
    await ctx.reply(`❌ ${err.message}`);
  }
}

// ─── Step: size selected ────────────────────────────────────
export async function handleSizeSelected(ctx, productId, size, userOverride) {
  await ctx.answerCbQuery().catch(() => {});

  try {
    const product = await productService.getById(productId);

    if (product.colors?.length) {
      await ctx.editMessageText(
        `✅ Size: *${size ?? '—'}*\n\n👇 Now select your color:`,
        { parse_mode: 'Markdown', ...colorKeyboard(product.colors, productId, size ?? 'none') }
      );
    } else {
      // No colors — go to quantity
      await ctx.editMessageText(
        `✅ Size: *${size ?? '—'}*\n\n👇 How many would you like?`,
        { parse_mode: 'Markdown', ...quantityKeyboard(productId, size ?? 'none', 'none') }
      );
    }
  } catch (err) {
    logger.error('handleSizeSelected:', err);
    await ctx.reply(`❌ ${err.message}`);
  }
}

// ─── Step: color selected ───────────────────────────────────
export async function handleColorSelected(ctx, productId, size, color) {
  await ctx.answerCbQuery().catch(() => {});
  await ctx.editMessageText(
    `✅ Size: *${size === 'none' ? '—' : size}* | Color: *${color}*\n\n👇 How many would you like?`,
    { parse_mode: 'Markdown', ...quantityKeyboard(productId, size, color) }
  );
}

// ─── Step: quantity selected → place order ───────────────────
export async function handleQuantitySelected(ctx, productId, size, color, quantity) {
  await ctx.answerCbQuery().catch(() => {});

  try {
    const user    = await ensureUser(ctx);
    const product = await productService.getById(productId);
    const series  = await seriesService.getActive(productId);

    if (!series) {
      return ctx.editMessageText('❌ Series is no longer active. Please try again.');
    }

    const order = await orderService.place({
      userId:    user.id,
      productId: productId,
      seriesId:  series.id,
      size:      size === 'none' ? null : size,
      color:     color === 'none' ? null : color,
      quantity:  parseInt(quantity, 10),
    });

    const total = product.price * parseInt(quantity, 10);

    const paymentInfo =
      `✅ *Order Placed!*\n\n` +
      `📦 ${product.name}\n` +
      `👕 Size: ${size === 'none' ? '—' : size}  |  🎨 Color: ${color === 'none' ? '—' : color}\n` +
      `🔢 Qty: ${quantity}  |  💰 Total: ${formatPrice(total)}\n` +
      `📊 Series #${series.series_number}\n\n` +
      `━━━━━━━━━━━━━━\n` +
      `💳 *Payment Instructions*\n\n` +
      `Please transfer *${formatPrice(total)}* to:\n\n` +
      `🏦 Bank: Example Bank\n` +
      `💳 Account: 1234-5678-9012\n` +
      `👤 Name: Group Buy Store\n\n` +
      `After payment, upload your receipt below.`;

    await ctx.editMessageText(paymentInfo, {
      parse_mode: 'Markdown',
      ...paymentConfirm(order.id),
    });

    // Notify admins of new order
    for (const adminId of config.bot.adminIds) {
      try {
        await ctx.telegram.sendMessage(
          adminId,
          `🔔 *New Order*\n\n` +
          `👤 ${ctx.from.first_name} (@${ctx.from.username ?? ctx.from.id})\n` +
          `📦 ${product.name} — Series #${series.series_number}\n` +
          `👕 ${size === 'none' ? '—' : size}  |  🎨 ${color === 'none' ? '—' : color}  |  🔢 ${quantity}\n` +
          `💰 ${formatPrice(total)}\n` +
          `🆔 \`${order.id.slice(0, 8)}\``,
          { parse_mode: 'Markdown' }
        );
      } catch { /* admin blocked bot */ }
    }

  } catch (err) {
    logger.error('handleQuantitySelected:', err);
    await ctx.editMessageText(`❌ ${err.message}`);
  }
}

// ─── Upload payment proof trigger ───────────────────────────
export async function handleUploadPaymentTrigger(ctx, orderId) {
  await ctx.answerCbQuery().catch(() => {});
  ctx.scene.state = { orderId };
  await ctx.scene.enter('user:upload-payment');
}

// ─── Waiting list join/leave ─────────────────────────────────
export async function handleJoinWaitingList(ctx, productId) {
  await ctx.answerCbQuery().catch(() => {});
  try {
    const user   = await ensureUser(ctx);
    const result = await waitingListService.join(user.id, productId);

    if (result.alreadyJoined) {
      return ctx.editMessageText(
        `⏳ You're already on the waiting list at position #${result.queue_position}.\n\nWe'll notify you when a new series opens!`,
        waitingListKeyboard(productId, true)
      );
    }
    await ctx.editMessageText(
      `✅ *Added to Waiting List!*\n\n` +
      `You're at position *#${result.queue_position}*.\n` +
      `We'll notify you as soon as a new series opens.`,
      { parse_mode: 'Markdown', ...waitingListKeyboard(productId, true) }
    );
  } catch (err) {
    logger.error('handleJoinWaitingList:', err);
    await ctx.editMessageText(`❌ ${err.message}`);
  }
}

export async function handleLeaveWaitingList(ctx, productId) {
  await ctx.answerCbQuery().catch(() => {});
  try {
    const user = await ensureUser(ctx);
    await waitingListService.leave(user.id, productId);
    await ctx.editMessageText(
      '✅ Removed from waiting list.',
      waitingListKeyboard(productId, false)
    );
  } catch (err) {
    logger.error('handleLeaveWaitingList:', err);
    await ctx.editMessageText(`❌ ${err.message}`);
  }
}

// ─── My Orders ───────────────────────────────────────────────
export async function handleMyOrders(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  try {
    const user   = await ensureUser(ctx);
    const orders = await orderService.listByUser(user.id);

    if (!orders.length) {
      const msg = '📭 No orders yet.\n\nBrowse products in the group to place your first order.';
      return ctx.callbackQuery
        ? ctx.editMessageText(msg, backToMain())
        : ctx.reply(msg, backToMain());
    }

    const header = `📋 *My Orders* (${orders.length})`;
    const kb     = myOrdersList(orders);

    if (ctx.callbackQuery) {
      await ctx.editMessageText(header, { parse_mode: 'Markdown', ...kb });
    } else {
      await ctx.reply(header, { parse_mode: 'Markdown', ...kb });
    }
  } catch (err) {
    logger.error('handleMyOrders:', err);
    ctx.reply(`❌ ${err.message}`);
  }
}

export async function handleViewOrder(ctx, orderId) {
  await ctx.answerCbQuery().catch(() => {});
  try {
    const order = await orderService.getById(orderId);
    const statusLabels = {
      unpaid:        '⏳ Awaiting Payment',
      pending_review: '🔍 Payment Under Review',
      paid:           '✅ Confirmed',
      refunded:       '↩️ Refunded',
    };

    const text =
      `📋 *Order Details*\n\n` +
      `📦 ${order.products?.name}\n` +
      `📊 Series #${order.series?.series_number}\n` +
      `👕 Size: ${order.size ?? '—'}  |  🎨 Color: ${order.color ?? '—'}\n` +
      `🔢 Qty: ${order.quantity}  |  💰 ${formatPrice((order.products?.price ?? 0) * order.quantity)}\n` +
      `📌 Status: ${statusLabels[order.payment_status] ?? order.payment_status}\n` +
      `🕐 Placed: ${new Date(order.created_at).toLocaleString()}`;

    const buttons = [];
    if (order.payment_status === 'unpaid') {
      buttons.push([{ text: '📎 Upload Payment', callback_data: `user:payment:upload:${orderId}` }]);
    }
    buttons.push([{ text: '◀️ My Orders', callback_data: 'user:myorders' }]);

    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons },
    });
  } catch (err) {
    logger.error('handleViewOrder:', err);
    await ctx.editMessageText(`❌ ${err.message}`);
  }
}
