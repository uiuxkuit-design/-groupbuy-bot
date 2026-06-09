/**
 * CANCEL SERVICE
 * Handles order cancellation with full cascade automation.
 *
 * PAID order cancel flow:
 *   1. Mark order cancelled
 *   2. Decrement series.current_count
 *   3. Re-open series if it was closed
 *   4. Promote first user(s) from waiting list
 *   5. Announce slot opened in group (if no waiting list promotion)
 *   6. Notify the cancelled user
 *
 * UNPAID/PENDING order cancel flow:
 *   1. Mark order cancelled
 *   2. No count change needed
 *   3. Notify user
 */
import { supabase }            from '../config/supabase.js';
import { seriesService }       from './seriesService.js';
import { waitingListPromoter } from '../automation/waitingListPromoter.js';
import { groupNotifier }       from './groupNotifier.js';
import { formatPrice }         from '../utils/helpers.js';
import { config }              from '../config/env.js';
import logger                  from '../utils/logger.js';

class CancelService {
  constructor() { this._bot = null; }
  init(bot) {
    this._bot = bot;
    waitingListPromoter.init(bot);
  }

  /**
   * Cancel an order.
   * @param {string} orderId
   * @param {'user'|'admin'|'timeout'} reason
   * @param {string|null} note
   */
  async cancel(orderId, reason = 'user', note = null) {
    // Fetch full order with all relations
    const { data: order, error: fErr } = await supabase
      .from('orders')
      .select(`
        *,
        products(id, name, price, image),
        series(id, series_number, status, current_count, target_count, product_id, group_message_id),
        users(telegram_id, fullname)
      `)
      .eq('id', orderId)
      .single();
    if (fErr) throw fErr;

    if (order.payment_status === 'cancelled') {
      throw new Error('Order is already cancelled.');
    }

    const wasPaid = order.payment_status === 'paid';

    // ── 1. Cancel the order ──────────────────────────────────
    const { error: cErr } = await supabase
      .from('orders')
      .update({
        payment_status: 'cancelled',
        cancel_reason:  note ?? reason,
      })
      .eq('id', orderId);
    if (cErr) throw cErr;

    // Cancel any pending payment record too
    await supabase
      .from('payments')
      .update({ status: 'rejected', note: `Order cancelled: ${reason}` })
      .eq('order_id', orderId)
      .eq('status', 'pending')
      .catch(() => {});

    logger.info(`Order cancelled: ${orderId} | reason=${reason} | wasPaid=${wasPaid}`);

    let seriesResult = null;
    let promoted     = { promoted: [] };

    if (wasPaid) {
      // ── 2 & 3. Decrement count, potentially re-open series ──
      seriesResult = await seriesService.decrementCount(
        order.series.id,
        order.quantity
      );

      // ── 4. Promote from waiting list ─────────────────────────
      promoted = await waitingListPromoter.promote(
        order.series.product_id,
        order.series.id,
        order.quantity
      );

      // ── 5. Group announcement ─────────────────────────────────
      if (promoted.promoted.length === 0) {
        // No one on waiting list — announce slot opened publicly
        await groupNotifier.announceSlotOpened(
          order.products,
          seriesResult.series
        ).catch(() => {});
      }
    }

    // ── 6. Notify the user ────────────────────────────────────
    await this._notifyUser(order, reason, note).catch(() => {});

    return { order, seriesResult, promoted };
  }

  /**
   * Bulk cancel all unpaid orders older than N hours.
   */
  async bulkCancelStale(hours = 48) {
    const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    const { data, error } = await supabase
      .from('orders')
      .select('id')
      .eq('payment_status', 'unpaid')
      .lt('created_at', cutoff);
    if (error) throw error;
    if (!data?.length) return { cancelled: 0 };

    const results = await Promise.allSettled(
      data.map(o => this.cancel(o.id, 'timeout', 'Auto-cancelled: no payment after 48h'))
    );
    const cancelled = results.filter(r => r.status === 'fulfilled').length;
    logger.info(`Bulk stale cancel: ${cancelled}/${data.length} orders cancelled`);
    return { cancelled };
  }

  async _notifyUser(order, reason, note) {
    const tgId = order.users?.telegram_id;
    if (!tgId || !this._bot) return;

    const msgs = {
      user:    'You cancelled this order.',
      admin:   'This order was cancelled by an admin.',
      timeout: 'This order was automatically cancelled due to non-payment after 48 hours.',
    };

    await this._bot.telegram.sendMessage(tgId,
      `❌ *Order Cancelled*\n\n` +
      `📦 ${order.products?.name}\n` +
      `📊 Series #${order.series?.series_number}\n` +
      `💰 ${formatPrice((order.products?.price ?? 0) * order.quantity)}\n` +
      `🆔 \`${order.id.slice(0, 8)}\`\n\n` +
      `${msgs[reason] ?? reason}` +
      (note && note !== reason ? `\n📝 ${note}` : ''),
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[
          { text: '📋 My Orders', callback_data: 'user:myorders' },
        ]]},
      }
    );
  }
}

export const cancelService = new CancelService();
