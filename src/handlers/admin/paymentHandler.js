import { paymentService }     from '../../services/paymentService.js';
import { productService }     from '../../services/productService.js';
import { waitingListService } from '../../services/waitingListService.js';
import { groupNotifier }      from '../../services/groupNotifier.js';
import { adminMainMenu }      from '../../keyboards/index.js';
import { formatPrice, progressBar } from '../../utils/helpers.js';
import logger from '../../utils/logger.js';

export async function handlePendingPayments(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  try {
    const payments = await paymentService.listPending();

    if (!payments.length) {
      return ctx.editMessageText('📭 No pending payments.', adminMainMenu());
    }

    const buttons = payments.map(p => {
      const order = p.orders;
      const user  = order?.users;
      const label = `💳 ${user?.fullname ?? user?.telegram_id} — ${order?.products?.name}`;
      return [{ text: label, callback_data: `admin:payment:view:${p.id}` }];
    });
    buttons.push([{ text: '◀️ Admin Menu', callback_data: 'admin:main' }]);

    await ctx.editMessageText(
      `💳 *Pending Payments* (${payments.length})`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } }
    );
  } catch (err) {
    logger.error('handlePendingPayments:', err);
    await ctx.editMessageText('❌ Error loading payments.');
  }
}

export async function handleViewPayment(ctx, paymentId) {
  await ctx.answerCbQuery().catch(() => {});
  try {
    const payments = await paymentService.listPending();
    const payment  = payments.find(p => p.id === paymentId);
    if (!payment) return ctx.editMessageText('❌ Payment not found.');

    const order   = payment.orders;
    const user    = order?.users;
    const product = order?.products;

    const text =
      `💳 *Payment Review*\n\n` +
      `👤 ${user?.fullname ?? '—'} (@${user?.telegram_id ?? '—'})\n` +
      `📱 Phone: ${user?.phone ?? '—'}\n\n` +
      `📦 ${product?.name}\n` +
      `📊 Series #${order?.series?.series_number}\n` +
      `🔢 Qty: ${order?.quantity}  |  Size: ${order?.size ?? '—'}  |  Color: ${order?.color ?? '—'}\n` +
      `💰 Total: ${formatPrice((product?.price ?? 0) * (order?.quantity ?? 1))}\n` +
      `⏰ Submitted: ${new Date(payment.created_at).toLocaleString()}`;

    // Send receipt photo with action buttons
    await ctx.telegram.sendPhoto(ctx.from.id, payment.check_image, {
      caption: text,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Approve', callback_data: `admin:payment:approve:${paymentId}` },
            { text: '❌ Reject',  callback_data: `admin:payment:reject:${paymentId}` },
          ],
          [{ text: '◀️ Back', callback_data: 'admin:payments:pending' }],
        ],
      },
    });
    // Dismiss the list message
    await ctx.editMessageText('👆 Review the payment above.', {
      reply_markup: { inline_keyboard: [[{ text: '◀️ Back', callback_data: 'admin:payments:pending' }]] },
    });
  } catch (err) {
    logger.error('handleViewPayment:', err);
    await ctx.editMessageText(`❌ ${err.message}`);
  }
}

export async function handleApprovePayment(ctx, paymentId) {
  await ctx.answerCbQuery('Approving…').catch(() => {});
  try {
    const result = await paymentService.approve({
      paymentId,
      adminTelegramId: ctx.from.id,
    });

    const { order, series, closed, nextSeries } = result;

    // Notify the user
    try {
      await ctx.telegram.sendMessage(
        order.users?.telegram_id ?? order.user_id,
        `✅ *Payment Approved!*\n\n` +
        `📦 Your order has been confirmed.\n` +
        `📊 Series #${series.series_number}\n` +
        `🔢 Qty: ${order.quantity}  |  Size: ${order.size ?? '—'}  |  Color: ${order.color ?? '—'}\n\n` +
        `Thank you for your order! 🎉`,
        { parse_mode: 'Markdown' }
      );
    } catch { /* user blocked bot */ }

    let responseText =
      `✅ Payment approved!\n` +
      `📊 Series #${series.series_number}: ${series.current_count}/${series.target_count}\n` +
      `${progressBar(series.current_count, series.target_count)}`;

    if (closed && nextSeries) {
      const product = await productService.getById(series.product_id);

      responseText +=
        `\n\n🔒 *Series #${series.series_number} CLOSED!*\n` +
        `🟢 Series #${nextSeries.series_number} opened.`;

      // Announce to group
      await groupNotifier.announceSeriesClosed(product, series, nextSeries);

      // Notify waiting list
      const waiting = await waitingListService.listByProduct(series.product_id);
      if (waiting.length) {
        await groupNotifier.notifyWaitingList(ctx, waiting, product, nextSeries);
        logger.info(`Notified ${waiting.length} waiting list users`);
      }
    }

    await ctx.editMessageText(responseText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '◀️ Pending Payments', callback_data: 'admin:payments:pending' }]] },
    });
  } catch (err) {
    logger.error('handleApprovePayment:', err);
    await ctx.editMessageText(`❌ ${err.message}`);
  }
}

export async function handleRejectPayment(ctx, paymentId) {
  await ctx.answerCbQuery().catch(() => {});
  ctx.scene.state = { paymentId };
  await ctx.scene.enter('admin:reject-payment');
}
