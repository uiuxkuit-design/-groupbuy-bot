import { productService } from '../../services/productService.js';
import { seriesService }  from '../../services/seriesService.js';
import { groupNotifier }  from '../../services/groupNotifier.js';
import { adminMainMenu, adminProductActions } from '../../keyboards/index.js';
import { formatPrice, progressBar, deadlineLabel } from '../../utils/helpers.js';
import logger from '../../utils/logger.js';

export async function handleAdminProductsList(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  try {
    const products = await productService.listActive();

    if (!products.length) {
      return ctx.editMessageText(
        '📭 No active products yet.\n\nCreate your first product!',
        adminMainMenu()
      );
    }

    const buttons = products.map(p => {
      const active    = p.series?.find(s => s.status === 'active');
      const icon      = active ? '🟢' : '🔴';
      return [{ text: `${icon} ${p.name} (${p.product_code})`, callback_data: `admin:product:view:${p.id}` }];
    });
    buttons.push([{ text: '➕ New Product', callback_data: 'admin:product:new' }]);
    buttons.push([{ text: '◀️ Menu',        callback_data: 'admin:main' }]);

    await ctx.editMessageText(
      `📦 *Products* (${products.length})`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } }
    );
  } catch (err) {
    logger.error('handleAdminProductsList:', err);
    await ctx.editMessageText('❌ Error loading products.');
  }
}

export async function handleAdminProductView(ctx, productId) {
  await ctx.answerCbQuery().catch(() => {});
  try {
    const product = await productService.getById(productId);
    const active  = product.series?.find(s => s.status === 'active');
    const bar     = active ? progressBar(active.current_count, active.target_count) : '—';

    const text =
      `📦 *${product.name}*\n` +
      `🔖 Code: \`${product.product_code}\`\n` +
      `💰 Price: ${formatPrice(product.price)}\n` +
      `📅 Deadline: ${deadlineLabel(product.deadline)}\n` +
      `👕 Sizes: ${product.sizes?.join(', ') || '—'}\n` +
      `🎨 Colors: ${product.colors?.join(', ') || '—'}\n\n` +
      `📊 *Active Series:* ${active ? `#${active.series_number}` : 'None'}\n` +
      `${bar}`;

    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...adminProductActions(productId),
    });
  } catch (err) {
    logger.error('handleAdminProductView:', err);
    await ctx.editMessageText('❌ Error loading product.');
  }
}

export async function handleAdminProductStats(ctx, productId) {
  await ctx.answerCbQuery().catch(() => {});
  try {
    const product   = await productService.getById(productId);
    const allSeries = await seriesService.listByProduct(productId);

    const lines = allSeries.map(s => {
      const icon = s.status === 'closed' ? '🔒' : s.status === 'active' ? '🟢' : '⏸';
      const bar  = progressBar(s.current_count, s.target_count);
      const paidCount = s.orders?.filter(o => o.payment_status === 'paid').length ?? 0;
      return `${icon} Series #${s.series_number}\n   ${bar}\n   ✅ Paid: ${paidCount}`;
    }).join('\n\n');

    await ctx.editMessageText(
      `📊 *${product.name} — Stats*\n\n${lines || '—'}`,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '◀️ Back', callback_data: `admin:product:view:${productId}` }]] },
      }
    );
  } catch (err) {
    logger.error('handleAdminProductStats:', err);
    await ctx.editMessageText('❌ Error loading stats.');
  }
}

export async function handleAdminPublish(ctx, productId) {
  await ctx.answerCbQuery().catch(() => {});
  try {
    const product = await productService.getById(productId);
    const series  = product.series?.find(s => s.status === 'active');
    if (!series) return ctx.editMessageText('❌ No active series to publish.');

    await groupNotifier.postProductCard(product, series);

    await ctx.editMessageText(
      `✅ *Published to group!*\n\n📦 ${product.name} is now live.`,
      { parse_mode: 'Markdown', ...adminMainMenu() }
    );
  } catch (err) {
    logger.error('handleAdminPublish:', err);
    await ctx.editMessageText(`❌ ${err.message}`);
  }
}

export async function handleAdminDeactivate(ctx, productId) {
  await ctx.answerCbQuery().catch(() => {});
  try {
    await productService.deactivate(productId);
    await ctx.editMessageText('✅ Product deactivated.', adminMainMenu());
  } catch (err) {
    logger.error('handleAdminDeactivate:', err);
    await ctx.editMessageText(`❌ ${err.message}`);
  }
}
