/**
 * PAYMENT REMINDER
 * Sends DMs to users who have unpaid orders older than N hours.
 * Runs every 6 hours. Tracks last-reminded to avoid spam.
 *
 * Reminder schedule:
 *   6h  after order → first nudge
 *   24h after order → second nudge
 *   48h after order → final warning (admin also notified)
 */
import { supabase }     from '../config/supabase.js';
import { formatPrice }  from '../utils/helpers.js';
import { config }       from '../config/env.js';
import logger           from '../utils/logger.js';

const REMINDER_HOURS = [6, 24, 48];

class PaymentReminder {
  constructor() { this._bot = null; }
  init(bot) { this._bot = bot; }

  async run() {
    logger.info('[PaymentReminder] Running…');
    const unpaid = await this._fetchUnpaid();
    if (!unpaid.length) {
      logger.info('[PaymentReminder] No unpaid orders found');
      return;
    }

    let sent = 0;
    for (const order of unpaid) {
      const hoursSince = this._hoursSince(order.created_at);
      const tier       = this._reminderTier(hoursSince, order.reminder_count ?? 0);
      if (!tier) continue;

      await this._sendReminder(order, tier);
      await this._bumpReminderCount(order.id);

      if (tier === 3) {
        await this._alertAdmins(order);
      }
      sent++;
      await sleep(100); // rate-limit
    }
    logger.info(`[PaymentReminder] Sent ${sent} reminders`);
  }

  async _fetchUnpaid() {
    const cutoff = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
    const { data, error } = await supabase
      .from('orders')
      .select(`
        id, created_at, quantity, size, color, reminder_count,
        products(name, price),
        series(series_number, deadline),
        users(telegram_id, fullname)
      `)
      .eq('payment_status', 'unpaid')
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true });
    if (error) { logger.error('PaymentReminder fetch:', error); return []; }
    return data ?? [];
  }

  _hoursSince(iso) {
    return (Date.now() - new Date(iso).getTime()) / 3600000;
  }

  /** Returns tier 1/2/3 if we should send now, else null */
  _reminderTier(hoursSince, reminderCount) {
    if (hoursSince >= 48 && reminderCount < 3) return 3;
    if (hoursSince >= 24 && reminderCount < 2) return 2;
    if (hoursSince >= 6  && reminderCount < 1) return 1;
    return null;
  }

  async _sendReminder(order, tier) {
    const tgId   = order.users?.telegram_id;
    if (!tgId) return;

    const total  = formatPrice((order.products?.price ?? 0) * order.quantity);
    const emojis = ['', '💳', '⚠️', '🚨'];
    const labels = ['', 'Reminder', 'Second reminder', 'Final warning'];
    const texts  = [
      '',
      'You still have a pending order waiting for payment.',
      'Your order will be cancelled if payment is not received soon.',
      '⏰ This is your LAST reminder. Your order may be released to the waiting list.',
    ];

    const msg =
      `${emojis[tier]} *Payment ${labels[tier]}*\n\n` +
      `📦 ${order.products?.name}\n` +
      `📊 Series #${order.series?.series_number}\n` +
      `🔢 Qty: ${order.quantity}${order.size ? ' | 👕 ' + order.size : ''}${order.color ? ' | 🎨 ' + order.color : ''}\n` +
      `💰 Total: ${total}\n\n` +
      `${texts[tier]}\n\n` +
      `Tap below to upload your payment receipt:`;

    try {
      await this._bot.telegram.sendMessage(tgId, msg, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '📎 Upload Payment', callback_data: `user:payment:upload:${order.id}` },
            { text: '❌ Cancel Order',   callback_data: `user:order:cancel:${order.id}` },
          ]],
        },
      });
      logger.info(`[PaymentReminder] Tier-${tier} sent to ${tgId} for order ${order.id}`);
    } catch (err) {
      logger.warn(`[PaymentReminder] Could not DM ${tgId}: ${err.message}`);
    }
  }

  async _alertAdmins(order) {
    const msg =
      `🚨 *48h Unpaid Order Alert*\n\n` +
      `👤 ${order.users?.fullname ?? order.users?.telegram_id}\n` +
      `📦 ${order.products?.name} — Series #${order.series?.series_number}\n` +
      `💰 ${formatPrice((order.products?.price ?? 0) * order.quantity)}\n` +
      `🆔 \`${order.id.slice(0, 8)}\`\n\n` +
      `User has not paid after 48 hours.`;

    for (const adminId of config.bot.adminIds) {
      try {
        await this._bot.telegram.sendMessage(adminId, msg, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '❌ Cancel Order', callback_data: `admin:order:force-cancel:${order.id}` },
            ]],
          },
        });
      } catch { /* admin may have blocked */ }
      await sleep(50);
    }
  }

  async _bumpReminderCount(orderId) {
    await supabase.rpc('increment_reminder_count', { order_id: orderId }).catch(() => {
      // Fallback if RPC not set up
      supabase.from('orders')
        .update({ reminder_count: supabase.raw('COALESCE(reminder_count,0)+1') })
        .eq('id', orderId)
        .catch(() => {});
    });
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
export const paymentReminder = new PaymentReminder();
