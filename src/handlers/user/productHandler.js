import { productService } from '../../services/productService.js';
import { seriesService }  from '../../services/seriesService.js';
import { orderService }   from '../../services/orderService.js';
import { productList, productActions, backToMain } from '../../keyboards/index.js';
import { formatPrice, progressBar } from '../../utils/helpers.js';
import logger from '../../utils/logger.js';

export async function handleUserProducts(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  try {
    const products = await productService.listActive();
    if (!products.length) {
      const msg = '📭 No products available right now.\n\nCheck back soon!';
      return ctx.callbackQuery
        ? ctx.editMessageText(msg)
        : ctx.reply(msg);
    }

    const text = '🛍 *Available Products*\n\nSelect a product to view details:';
    const kb   = productList(products);

    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { parse_mode: 'Markdown', ...kb });
    } else {
      await ctx.reply(text, { parse_mode: 'Markdown', ...kb });
    }
  } catch (err) {
    logger.error('handleUserProducts:', err);
    const msg = '❌ Error loading products. Please try again.';
    ctx.callbackQuery ? ctx.editMessageText(msg) : ctx.reply(msg);
  }
}

export async function handleUserViewProduct(ctx, productId) {
  await ctx.answerCbQuery();
  try {
    const product      = await productService.getById(productId);
    const activeSeries = await seriesService.getActive(productId);
    const confirmed    = activeSeries
      ? await seriesService.confirmedCount(activeSeries.id)
      : 0;

    // Check if user already has an order
    let hasOrder = false;
    if (activeSeries) {
      const userOrders = await orderService.listByUser(ctx.from.id);
      hasOrder = userOrders.some(
        o => o.series?.product_id === productId &&
             ['pending', 'confirmed'].includes(o.status)
      );
    }

    const seriesLine = activeSeries
      ? `📊 Series #${activeSeries.series_number} — ${progressBar(confirmed, activeSeries.target)}`
      : '⏸ No active series';

    const text =
      `📦 *${product.name}*\n\n` +
      `${product.description ? product.description + '\n\n' : ''}` +
      `💰 *Price:* ${formatPrice(product.price)}\n` +
      `${seriesLine}\n` +
      (hasOrder ? '\n✅ You already have an order in this series.' : '');

    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...productActions(productId, hasOrder || !activeSeries),
    });
  } catch (err) {
    logger.error('handleUserViewProduct:', err);
    await ctx.editMessageText('❌ Error loading product. Please try again.');
  }
}
