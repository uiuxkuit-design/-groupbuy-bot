/**
 * GROUP NOTIFIER
 * All outbound messages to the Telegram group.
 * Handles: product cards, progress updates, series close/open announcements,
 * waiting list DMs, and slot-reopened alerts.
 */
import { config }                                  from '../config/env.js';
import { formatPrice, progressBar, deadlineLabel } from '../utils/helpers.js';
import logger                                      from '../utils/logger.js';

let _bot = null;

export const groupNotifier = {
  init(bot) { _bot = bot; },

  // ── Post full product card when published ─────────────────────
  async postProductCard(product, series) {
    const caption = buildCaption(product, series);
    const kb      = orderKb(product.id);

    try {
      let msg;
      if (product.image) {
        msg = await _bot.telegram.sendPhoto(config.bot.groupChatId, product.image, {
          caption, parse_mode: 'Markdown', reply_markup: kb,
        });
      } else {
        msg = await _bot.telegram.sendMessage(config.bot.groupChatId, caption, {
          parse_mode: 'Markdown', reply_markup: kb,
        });
      }

      // Store message_id on the series for future edits
      if (msg?.message_id) {
        const { supabase } = await import('../config/supabase.js');
        await supabase.from('series')
          .update({ group_message_id: msg.message_id })
          .eq('id', series.id)
          .catch(() => {});
      }

      logger.info(`Product card posted: ${product.name} (msg ${msg?.message_id})`);
      return msg;
    } catch (err) {
      logger.error('postProductCard failed:', err);
    }
  },

  // ── Live progress update: "7/10 collected" ────────────────────
  async postProgressUpdate(product, series) {
    if (!product || !series) return;
    const bar     = progressBar(series.current_count, series.target_count);
    const isLast  = series.current_count === series.target_count - 1;
    const almost  = series.current_count >= Math.ceil(series.target_count * 0.8);

    let header = `📊 *${product.name}* — Series #${series.series_number}\n${bar}`;
    if (isLast)   header += `\n🔥 *1 slot left! Last chance!*`;
    else if (almost) header += `\n⚡ Almost full!`;

    // Try to edit the pinned card first
    if (series.group_message_id) {
      await this.updateGroupCard(
        config.bot.groupChatId,
        series.group_message_id,
        product,
        series
      );
      return;
    }

    // Otherwise post a brief progress message
    try {
      await _bot.telegram.sendMessage(config.bot.groupChatId, header, {
        parse_mode: 'Markdown',
        reply_markup: orderKb(product.id),
      });
    } catch (err) {
      logger.warn('postProgressUpdate failed:', err.message);
    }
  },

  // ── Edit the original group card (progress bar update) ────────
  async updateGroupCard(chatId, messageId, product, series) {
    const caption = buildCaption(product, series);
    const kb      = series.status === 'active' ? orderKb(product.id) : undefined;

    try {
      if (product.image) {
        await _bot.telegram.editMessageCaption(chatId, messageId, undefined, caption, {
          parse_mode: 'Markdown',
          ...(kb ? { reply_markup: kb } : {}),
        });
      } else {
        await _bot.telegram.editMessageText(chatId, messageId, undefined, caption, {
          parse_mode: 'Markdown',
          ...(kb ? { reply_markup: kb } : {}),
        });
      }
    } catch (err) {
      logger.warn('updateGroupCard failed (message may have been deleted):', err.message);
    }
  },

  // ── Series closed + new series opened ─────────────────────────
  async announceSeriesClosed(product, closedSeries, nextSeries) {
    const closedBar = progressBar(closedSeries.target_count, closedSeries.target_count);

    const text =
      `🔒 *SERIES #${closedSeries.series_number} — CLOSED!*\n\n` +
      `📦 *${product.name}*\n` +
      `${closedBar}\n` +
      `✅ ${closedSeries.target_count}/${closedSeries.target_count} slots filled!\n\n` +
      `━━━━━━━━━━━━━━\n` +
      `🟢 *Series #${nextSeries.series_number} is now OPEN*\n` +
      `🎯 Target: ${nextSeries.target_count} orders\n` +
      `💰 ${formatPrice(product.price)}\n\n` +
      `Be the first to join Series #${nextSeries.series_number}!`;

    try {
      await _bot.telegram.sendMessage(config.bot.groupChatId, text, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: `🛒 Join Series #${nextSeries.series_number}`, callback_data: `group:order:${product.id}` },
          ]],
        },
      });
    } catch (err) {
      logger.error('announceSeriesClosed failed:', err);
    }
  },

  // ── Slot reopened after cancellation ─────────────────────────
  async announceSlotOpened(product, series) {
    const bar  = progressBar(series.current_count, series.target_count);
    const text =
      `🔓 *A slot just opened!*\n\n` +
      `📦 *${product.name}*\n` +
      `📊 Series #${series.series_number}\n` +
      `${bar}\n\n` +
      `Order now before it fills up again!`;

    try {
      await _bot.telegram.sendMessage(config.bot.groupChatId, text, {
        parse_mode: 'Markdown',
        reply_markup: orderKb(product.id),
      });
    } catch (err) {
      logger.error('announceSlotOpened failed:', err);
    }
  },

  // ── DM all waiting list users when a new series opens ─────────
  async notifyWaitingList(waitingUsers, product, series) {
    let notified = 0;
    for (const entry of waitingUsers) {
      const tgId = entry.users?.telegram_id;
      if (!tgId) continue;
      try {
        await _bot.telegram.sendMessage(tgId,
          `🔔 *Your wait is over!*\n\n` +
          `A new series just opened for a product you were waiting for!\n\n` +
          `📦 *${product.name}*\n` +
          `📊 Series #${series.series_number} — ${series.target_count} slots\n` +
          `💰 ${formatPrice(product.price)}\n\n` +
          `Tap below to place your order now!`,
          {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[
              { text: '🛒 Order Now', callback_data: `group:order:${product.id}` },
            ]]},
          }
        );
        notified++;
        await sleep(60); // Telegram rate-limit: ~15 msg/s
      } catch { /* user may have blocked the bot */ }
    }
    logger.info(`Waiting list notified: ${notified}/${waitingUsers.length} users for ${product.name}`);
  },
};

// ── Helpers ────────────────────────────────────────────────────
function buildCaption(product, series) {
  const bar    = progressBar(series.current_count, series.target_count);
  const sizes  = product.sizes?.length  ? `👕 *Sizes:*  ${product.sizes.join('  |  ')}\n`  : '';
  const colors = product.colors?.length ? `🎨 *Colors:* ${product.colors.join('  |  ')}\n` : '';
  const dl     = deadlineLabel(product.deadline);
  const closed = series.status === 'closed';

  return (
    `📦 *${product.name}*\n` +
    `🔖 Code: \`${product.product_code}\`\n\n` +
    `💰 Price: *${formatPrice(product.price)}*\n` +
    `${sizes}${colors}\n` +
    `📊 ${closed ? '🔒' : '🟢'} Series #${series.series_number}\n` +
    `${bar}\n` +
    `${dl}\n\n` +
    (closed
      ? `🔒 *This series is closed.* Next series opens soon!`
      : `👇 Tap *Order Now* to join this series!`)
  );
}

function orderKb(productId) {
  return {
    inline_keyboard: [[
      { text: '🛒 Order Now',    callback_data: `group:order:${productId}` },
      { text: '⏳ Waiting List', callback_data: `group:wait:${productId}` },
    ]],
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
