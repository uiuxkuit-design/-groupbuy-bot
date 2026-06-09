/**
 * WAITING LIST PROMOTER
 * When a slot opens (order cancelled or new series), promotes the first user
 * from the waiting list: removes them from the list, places their order
 * automatically, and sends them a payment request DM.
 */
import { supabase }       from '../config/supabase.js';
import { orderService }   from '../services/orderService.js';
import { productService } from '../services/productService.js';
import { formatPrice }    from '../utils/helpers.js';
import logger             from '../utils/logger.js';

class WaitingListPromoter {
  constructor() { this._bot = null; }
  init(bot) { this._bot = bot; }

  /**
   * Promote the first N users from the waiting list into a series.
   * Called after:
   *   - An order is cancelled (slotsFreed = order.quantity)
   *   - A new series opens (slotsFreed = series.target_count or Infinity)
   *
   * @param {string}  productId
   * @param {string}  seriesId
   * @param {number}  slotsFreed   how many slots are now available
   */
  async promote(productId, seriesId, slotsFreed = 1) {
    const waiting = await this._getWaiting(productId, slotsFreed);
    if (!waiting.length) {
      logger.info(`[WaitingListPromoter] No waiting users for product ${productId}`);
      return { promoted: [] };
    }

    const product = await productService.getById(productId);
    const promoted = [];

    for (const entry of waiting) {
      try {
        // Place order on their behalf
        const order = await orderService.place({
          userId:    entry.user_id,
          productId,
          seriesId,
          size:      null,
          color:     null,
          quantity:  1,
        });

        // Remove from waiting list
        await this._removeFromWaiting(entry.user_id, productId);

        // Reorder queue positions
        await this._reorderQueue(productId);

        // Send payment request DM
        await this._sendPaymentRequest(entry, product, order, seriesId);

        promoted.push({ userId: entry.user_id, orderId: order.id });
        logger.info(`[WaitingListPromoter] Promoted user ${entry.user_id} → order ${order.id}`);
      } catch (err) {
        logger.error(`[WaitingListPromoter] Failed to promote user ${entry.user_id}:`, err.message);
      }
      await sleep(150); // rate-limit
    }

    return { promoted };
  }

  /** Promote all waiting users when a NEW series opens */
  async promoteAll(productId, newSeriesId) {
    const { count } = await supabase
      .from('waiting_list')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', productId);
    return this.promote(productId, newSeriesId, count ?? 999);
  }

  async _getWaiting(productId, limit) {
    const { data, error } = await supabase
      .from('waiting_list')
      .select('id, user_id, queue_position, users(telegram_id, fullname)')
      .eq('product_id', productId)
      .order('queue_position', { ascending: true })
      .limit(limit);
    if (error) { logger.error('[WaitingListPromoter] _getWaiting:', error); return []; }
    return data ?? [];
  }

  async _removeFromWaiting(userId, productId) {
    await supabase
      .from('waiting_list')
      .delete()
      .eq('user_id', userId)
      .eq('product_id', productId);
  }

  async _reorderQueue(productId) {
    // Re-number queue positions sequentially after a removal
    const { data } = await supabase
      .from('waiting_list')
      .select('id')
      .eq('product_id', productId)
      .order('queue_position', { ascending: true });
    if (!data) return;

    const updates = data.map((row, i) =>
      supabase.from('waiting_list').update({ queue_position: i + 1 }).eq('id', row.id)
    );
    await Promise.allSettled(updates);
  }

  async _sendPaymentRequest(entry, product, order, seriesId) {
    const tgId = entry.users?.telegram_id;
    if (!tgId || !this._bot) return;

    // Fetch series info for the number
    const { data: series } = await supabase
      .from('series')
      .select('series_number')
      .eq('id', seriesId)
      .single();

    const msg =
      `🎉 *Good news! Your spot is confirmed!*\n\n` +
      `You've been promoted from the waiting list!\n\n` +
      `📦 *${product.name}*\n` +
      `📊 Series #${series?.series_number ?? '?'}\n` +
      `💰 Price: ${formatPrice(product.price)}\n\n` +
      `━━━━━━━━━━━━━━\n` +
      `💳 *Please complete your payment now.*\n\n` +
      `Transfer *${formatPrice(product.price)}* to:\n` +
      `🏦 Bank: Example Bank\n` +
      `💳 Account: 1234-5678-9012\n` +
      `👤 Name: Group Buy Store\n\n` +
      `Upload your receipt below. Your spot will be held for *24 hours*.`;

    try {
      await this._bot.telegram.sendMessage(tgId, msg, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '📎 Upload Payment', callback_data: `user:payment:upload:${order.id}` },
          ]],
        },
      });
    } catch (err) {
      logger.warn(`[WaitingListPromoter] Could not DM ${tgId}: ${err.message}`);
    }
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
export const waitingListPromoter = new WaitingListPromoter();
