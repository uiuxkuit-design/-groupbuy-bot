import { orderService }  from '../../services/orderService.js';
import { adminMainMenu, adminOrderActions } from '../../keyboards/index.js';
import { formatPrice, progressBar, nowLabel } from '../../utils/helpers.js';
import { config } from '../../config/env.js';
import logger from '../../utils/logger.js';

/**
 * Post a group announcement when a series closes.
 */
async function announceSeriesClosed(bot, { product, closedSeries, nextSeries }) {
  const msg =
    `🔒 *SERIES #${closedSeries.series_number} — CLOSED!*\n\n` +
    `📦 *${product.name}*\n` +
    `${closedSeries.target}/${closedSeries.target} confirmed orders reached!\n\n` +
    `✅ Series #${closedSeries.series_number} is now locked.\n` +
    `🟢 *Series #${nextSeries.series_number} is now OPEN!*\n` +
    `New orders will be placed in Series #${nextSeries.series_number}.`;

  try {
    await bot.telegram.sendMessage(config.bot.groupChatId, msg, { parse_mode: 'Markdown' });
  } catch (err) {
    logger.error('Failed to send series-closed announcement:', err);
  }
}

export async function handlePendingOrders(ctx) {
  await ctx.answerCbQuery();
  try {
    const orders = await orderService.listPending();
    if (!orders.length) {
      return ctx.editMessageText('📭 No pending orders at the moment.', adminMainMenu());
    }

    const buttons = orders.map(o => [{
      text:          `#${o.id.slice(0, 8)} — ${o.products?.name} — @${o.username ?? o.user_id}`,
      callback_data: `admin:order:view:${o.id}`,
    }]);
    buttons.push([{ text: '◀️ Main Menu', callback_data: 'admin:main' }]);

    await ctx.editMessageText(
      `📋 *Pending Orders* (${orders.length})`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } }
    );
  } catch (err) {
    logger.error('handlePendingOrders:', err);
    await ctx.editMessageText('❌ Error loading orders.');
  }
}

export async function handleViewOrder(ctx, orderId) {
  await ctx.answerCbQuery();
  try {
    const order = await orderService.getById(orderId);
    const text  =
      `📋 *Order Details*\n\n` +
      `🆔 ID: \`${order.id.slice(0, 8)}\`\n` +
      `👤 User: @${order.username ?? order.user_id} (${order.full_name ?? '—'})\n` +
      `📦 Product: ${order.products?.name ?? '—'}\n` +
      `💰 Price: ${formatPrice(order.products?.price ?? 0)}\n` +
      `🔢 Qty: ${order.quantity}\n` +
      `📊 Series: #${order.series?.series_number ?? '?'}\n` +
      `📎 Payment: ${order.payment_proof ? 'Uploaded ✅' : 'Not uploaded ❌'}\n` +
      `🕐 Placed: ${nowLabel()}\n` +
      `📝 Notes: ${order.notes ?? '—'}`;

    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...adminOrderActions(orderId),
    });
  } catch (err) {
    logger.error('handleViewOrder:', err);
    await ctx.editMessageText('❌ Error loading order details.');
  }
}

export async function handleConfirmOrder(ctx, orderId) {
  await ctx.answerCbQuery('Confirming…');
  try {
    const result = await orderService.confirm(orderId);
    const { order, series, confirmed, seriesClosed, nextSeries } = result;

    // Notify the user
    try {
      await ctx.telegram.sendMessage(
        order.user_id,
        `✅ *Your order has been confirmed!*\n\n` +
        `📦 Product: ${order.products?.name ?? 'N/A'}\n` +
        `📊 Series #${series.series_number}\n` +
        `🔢 Qty: ${order.quantity}\n\n` +
        `Thank you for your order! 🎉`,
        { parse_mode: 'Markdown' }
      );
    } catch { /* user may have blocked the bot */ }

    let responseText = `✅ Order \`${orderId.slice(0, 8)}\` confirmed!\n` +
                       `Series #${series.series_number}: ${confirmed}/${series.target} orders`;

    if (seriesClosed) {
      responseText += `\n\n🔒 *Series #${series.series_number} CLOSED!*\n` +
                      `🟢 Series #${nextSeries.series_number} is now OPEN.`;

      // Announce in group
      const product = await (await import('../../services/productService.js'))
        .productService.getById(series.product_id);
      await announceSeriesClosed(ctx, {
        product,
        closedSeries: series,
        nextSeries,
      });
    }

    await ctx.editMessageText(responseText, { parse_mode: 'Markdown', ...adminMainMenu() });
  } catch (err) {
    logger.error('handleConfirmOrder:', err);
    await ctx.editMessageText(`❌ Error: ${err.message}`);
  }
}

export async function handleCancelOrder(ctx, orderId) {
  await ctx.answerCbQuery('Cancelling…');
  try {
    const order = await orderService.cancel(orderId, 'Cancelled by admin');

    try {
      await ctx.telegram.sendMessage(
        order.user_id,
        `❌ *Your order has been cancelled.*\n\nOrder ID: \`${orderId.slice(0, 8)}\`\n\n` +
        `If you have questions, please contact the admin.`,
        { parse_mode: 'Markdown' }
      );
    } catch { /* user may have blocked the bot */ }

    await ctx.editMessageText(`✅ Order cancelled.`, adminMainMenu());
  } catch (err) {
    logger.error('handleCancelOrder:', err);
    await ctx.editMessageText(`❌ Error: ${err.message}`);
  }
}

export async function handleDashboard(ctx) {
  await ctx.answerCbQuery();
  try {
    const pending   = await orderService.listPending();
    const products  = await (await import('../../services/productService.js'))
      .productService.listActive();

    const productLines = products.map(p => {
      const active    = p.series?.find(s => s.status === 'active');
      const confirmed = active?.orders?.filter(o => o.status === 'confirmed').length ?? 0;
      const bar       = progressBar(confirmed, active?.target ?? 1);
      return `📦 *${p.name}*\n   ${bar}`;
    }).join('\n\n');

    const text =
      `📊 *Admin Dashboard*\n\n` +
      `⏳ Pending orders: *${pending.length}*\n` +
      `📦 Active products: *${products.length}*\n\n` +
      `*Series Progress:*\n${productLines || '—'}`;

    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...adminMainMenu() });
  } catch (err) {
    logger.error('handleDashboard:', err);
    await ctx.editMessageText('❌ Error loading dashboard.');
  }
}
