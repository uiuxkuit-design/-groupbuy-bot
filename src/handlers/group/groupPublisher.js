/**
 * GROUP PUBLISHER
 * Posts product cards to the Telegram group.
 * Called when admin publishes a product.
 */
import { config }                                from '../../config/env.js';
import { formatPrice, progressBar, deadlineLabel } from '../../utils/helpers.js';
import logger                                     from '../../utils/logger.js';

export const groupPublisher = {
  /**
   * Post a product card to the group.
   * Returns the sent message (for message_id tracking).
   */
  async publishProductCard(ctx, { product, series }) {
    const caption = buildCaption(product, series);
    const kb      = buildOrderKeyboard(product.id);

    try {
      let msg;
      if (product.image) {
        msg = await ctx.telegram.sendPhoto(config.bot.groupChatId, product.image, {
          caption,
          parse_mode: 'Markdown',
          reply_markup: kb,
        });
      } else {
        msg = await ctx.telegram.sendMessage(config.bot.groupChatId, caption, {
          parse_mode: 'Markdown',
          reply_markup: kb,
        });
      }
      logger.info(`Product card posted to group: ${product.name}`);
      return msg;
    } catch (err) {
      logger.error('Failed to post product card:', err);
      throw err;
    }
  },
};

function buildCaption(product, series) {
  const bar     = progressBar(series.current_count, series.target_count);
  const sizes   = product.sizes?.length  ? `👕 *Sizes:*  ${product.sizes.join('  |  ')}\n`  : '';
  const colors  = product.colors?.length ? `🎨 *Colors:* ${product.colors.join('  |  ')}\n` : '';
  const dl      = deadlineLabel(product.deadline);

  return (
    `📦 *${product.name}*\n` +
    `🔖 Code: \`${product.product_code}\`\n\n` +
    `💰 Price: *${formatPrice(product.price)}*\n` +
    `${sizes}` +
    `${colors}\n` +
    `📊 *Series #${series.series_number}*\n` +
    `${bar}\n` +
    `${dl}\n\n` +
    `👇 Tap *Order Now* to join this series!`
  );
}

function buildOrderKeyboard(productId) {
  return {
    inline_keyboard: [[
      { text: '🛒 Order Now',       callback_data: `group:order:${productId}` },
      { text: '⏳ Waiting List',    callback_data: `group:wait:${productId}` },
    ]],
  };
}
