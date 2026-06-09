/**
 * DEADLINE WATCHER
 * Posts countdown alerts to the group when a series deadline is near.
 * Runs every 1 hour.
 *
 * Alert thresholds: 48h, 24h, 6h, 1h before deadline
 * Each threshold fires exactly once (tracked in `deadline_alerts_sent` column).
 */
import { supabase }                             from '../config/supabase.js';
import { formatPrice, progressBar, deadlineLabel } from '../utils/helpers.js';
import { config }                               from '../config/env.js';
import logger                                   from '../utils/logger.js';

const THRESHOLDS = [
  { hours: 48, key: 'h48', emoji: '⏳', label: '48 hours' },
  { hours: 24, key: 'h24', emoji: '⚠️',  label: '24 hours' },
  { hours: 6,  key: 'h6',  emoji: '🔥', label: '6 hours'  },
  { hours: 1,  key: 'h1',  emoji: '🚨', label: '1 hour'   },
];

class DeadlineWatcher {
  constructor() { this._bot = null; }
  init(bot) { this._bot = bot; }

  async run() {
    logger.info('[DeadlineWatcher] Running…');
    const series = await this._fetchActiveSeries();

    for (const s of series) {
      if (!s.products?.deadline) continue;
      const hoursLeft = this._hoursUntil(s.products.deadline);
      if (hoursLeft < 0) {
        await this._handleExpired(s);
        continue;
      }
      for (const t of THRESHOLDS) {
        if (hoursLeft <= t.hours && !this._alreadySent(s.deadline_alerts_sent, t.key)) {
          await this._postAlert(s, t, hoursLeft);
          await this._markSent(s.id, t.key, s.deadline_alerts_sent);
          break; // one alert per run per series
        }
      }
    }
  }

  async _fetchActiveSeries() {
    const { data, error } = await supabase
      .from('series')
      .select(`
        id, series_number, current_count, target_count, deadline_alerts_sent,
        products(id, name, price, image, product_code, deadline)
      `)
      .eq('status', 'active');
    if (error) { logger.error('DeadlineWatcher fetch:', error); return []; }
    return data ?? [];
  }

  _hoursUntil(iso) {
    return (new Date(iso).getTime() - Date.now()) / 3600000;
  }

  _alreadySent(sentJson, key) {
    const sent = sentJson ?? {};
    return sent[key] === true;
  }

  async _postAlert(series, threshold, hoursLeft) {
    const p     = series.products;
    const bar   = progressBar(series.current_count, series.target_count);
    const hStr  = hoursLeft < 1
      ? `${Math.round(hoursLeft * 60)} minutes`
      : `${Math.round(hoursLeft)} hours`;

    const text =
      `${threshold.emoji} *Only ${hStr} left!*\n\n` +
      `📦 *${p.name}*\n` +
      `📊 Series #${series.series_number}\n` +
      `${bar}\n` +
      `💰 ${formatPrice(p.price)}\n\n` +
      `⏰ This series closes in *${hStr}*.\n` +
      `Don't miss your chance to order!`;

    try {
      if (p.image) {
        await this._bot.telegram.sendPhoto(config.bot.groupChatId, p.image, {
          caption: text,
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[
            { text: '🛒 Order Now', callback_data: `group:order:${p.id}` },
          ]]},
        });
      } else {
        await this._bot.telegram.sendMessage(config.bot.groupChatId, text, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[
            { text: '🛒 Order Now', callback_data: `group:order:${p.id}` },
          ]]},
        });
      }
      logger.info(`[DeadlineWatcher] ${threshold.label} alert posted for series ${series.id}`);
    } catch (err) {
      logger.error('[DeadlineWatcher] Failed to post alert:', err);
    }
  }

  async _markSent(seriesId, key, existing) {
    const updated = { ...(existing ?? {}), [key]: true };
    await supabase
      .from('series')
      .update({ deadline_alerts_sent: updated })
      .eq('id', seriesId)
      .catch(err => logger.error('[DeadlineWatcher] markSent:', err));
  }

  async _handleExpired(series) {
    const p = series.products;
    logger.warn(`[DeadlineWatcher] Deadline expired for series ${series.id} (${p?.name})`);
    // Could auto-close or notify admins
    for (const adminId of config.bot.adminIds) {
      try {
        await this._bot.telegram.sendMessage(adminId,
          `⏰ *Deadline Expired*\n\n` +
          `📦 ${p?.name}\n` +
          `📊 Series #${series.series_number}: ${series.current_count}/${series.target_count}\n\n` +
          `The deadline has passed. Please review and close manually if needed.`,
          {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[
              { text: '📊 View Series', callback_data: `admin:product:stats:${p?.id}` },
            ]]},
          }
        );
      } catch { /* admin blocked */ }
    }
  }
}

export const deadlineWatcher = new DeadlineWatcher();
