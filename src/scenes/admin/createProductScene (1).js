import { Scenes, Markup } from 'telegraf';
import { productService } from '../../services/productService.js';
import { groupNotifier } from '../../services/groupNotifier.js';
import { formatPrice } from '../../utils/helpers.js';
import logger from '../../utils/logger.js';

const step = (n, total, title) =>
  `——————————————\n✏️ *Create Product* — Step ${n}/${total}\n——————————————\n\n*${title}*`;

const PRESET_SIZES  = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Free Size'];
const PRESET_COLORS = ['Black', 'White', 'Red', 'Blue', 'Green', 'Yellow', 'Pink', 'Grey'];

function sizesKb(selected = []) {
  const rows = [];
  for (let i = 0; i < PRESET_SIZES.length; i += 3) {
    rows.push(PRESET_SIZES.slice(i, i + 3).map(s =>
      Markup.button.callback((selected.includes(s) ? '✅ ' : '') + s, `sz:${s}`)
    ));
  }
  rows.push([Markup.button.callback('➡️ Done', 'sz:done')]);
  return Markup.inlineKeyboard(rows);
}

function colorsKb(selected = []) {
  const rows = [];
  for (let i = 0; i < PRESET_COLORS.length; i += 3) {
    rows.push(PRESET_COLORS.slice(i, i + 3).map(c =>
      Markup.button.callback((selected.includes(c) ? '✅ ' : '') + c, `cl:${c}`)
    ));
  }
  rows.push([Markup.button.callback('➡️ Done', 'cl:done')]);
  return Markup.inlineKeyboard(rows);
}

export const createProductScene = new Scenes.WizardScene('admin:create-product',

  async (ctx) => {
    ctx.wizard.state.data = { sizes: [], colors: [] };
    await ctx.reply(step(1, 7, 'Product Name') + '\n\nEnter the product name:', { parse_mode: 'Markdown' });
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (!ctx.message?.text) return ctx.reply('Please send a text message.');
    ctx.wizard.state.data.name = ctx.message.text.trim();
    await ctx.reply(step(2, 7, 'Product Code (SKU)') + '\n\nEnter a unique code (e.g. NK-HOODIE-001):', { parse_mode: 'Markdown' });
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (!ctx.message?.text) return ctx.reply('Please send a text message.');
    ctx.wizard.state.data.productCode = ctx.message.text.trim().toUpperCase();
    await ctx.reply(step(3, 7, 'Price') + '\n\nEnter price in USD (e.g. 29.99):', { parse_mode: 'Markdown' });
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (!ctx.message?.text) return ctx.reply('Please send a number.');
    const price = parseFloat(ctx.message.text.replace(',', '.'));
    if (isNaN(price) || price <= 0) return ctx.reply('Invalid price. Enter a positive number:');
    ctx.wizard.state.data.price = price;
    await ctx.reply(step(4, 7, 'Target Count') + '\n\nHow many orders to close one series? (e.g. 10):', { parse_mode: 'Markdown' });
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (!ctx.message?.text) return ctx.reply('Please send a number.');
    const target = parseInt(ctx.message.text, 10);
    if (isNaN(target) || target < 1) return ctx.reply('Invalid number. Enter a positive integer:');
    ctx.wizard.state.data.targetCount = target;
    await ctx.reply(step(5, 7, 'Deadline') + '\n\nChoose order deadline:', {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('3 days', 'dl:3'), Markup.button.callback('7 days', 'dl:7')],
        [Markup.button.callback('14 days', 'dl:14'), Markup.button.callback('30 days', 'dl:30')],
        [Markup.button.callback('No deadline', 'dl:0')],
      ]),
    });
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (ctx.callbackQuery) {
      const days = parseInt(ctx.callbackQuery.data.split(':')[1], 10);
      ctx.wizard.state.data.deadline = days === 0 ? null
        : new Date(Date.now() + days * 86400000).toISOString();
      await ctx.answerCbQuery();
      await ctx.reply(step(6, 7, 'Sizes') + '\n\nSelect sizes (tap to toggle), then press Done:', {
        parse_mode: 'Markdown',
        ...sizesKb([]),
      });
      return ctx.wizard.next();
    }
    await ctx.reply('Please tap a button above.');
  },

  async (ctx) => {
    if (ctx.callbackQuery) {
      const val = ctx.callbackQuery.data.split(':')[1];
      if (val === 'done') {
        await ctx.answerCbQuery();
        await ctx.reply(step(7, 7, 'Colors') + '\n\nSelect colors (tap to toggle), then press Done:', {
          parse_mode: 'Markdown',
          ...colorsKb([]),
        });
        return ctx.wizard.next();
      }
      const sizes = ctx.wizard.state.data.sizes;
      const idx = sizes.indexOf(val);
      if (idx === -1) sizes.push(val); else sizes.splice(idx, 1);
      await ctx.answerCbQuery();
      await ctx.editMessageReplyMarkup(sizesKb(sizes).reply_markup);
      return;
    }
    await ctx.reply('Please tap a button above.');
  },

  async (ctx) => {
    if (ctx.callbackQuery) {
      const val = ctx.callbackQuery.data.split(':')[1];
      if (val === 'done') {
        await ctx.answerCbQuery();
        await ctx.reply(step(8, 7, 'Product Image') + '\n\nSend the product photo now:', { parse_mode: 'Markdown' });
        return ctx.wizard.next();
      }
      const colors = ctx.wizard.state.data.colors;
      const idx = colors.indexOf(val);
      if (idx === -1) colors.push(val); else colors.splice(idx, 1);
      await ctx.answerCbQuery();
      await ctx.editMessageReplyMarkup(colorsKb(colors).reply_markup);
      return;
    }
    await ctx.reply('Please tap a button above.');
  },

  async (ctx) => {
    const photo = ctx.message?.photo;
    if (!photo?.length) return ctx.reply('Please send a photo.');
    const fileId = photo[photo.length - 1].file_id;
    const d = ctx.wizard.state.data;
    d.image = fileId;
    await ctx.replyWithPhoto(fileId, {
      caption:
        `✅ *Review before publishing:*\n\n` +
        `📦 *${d.name}*\n` +
        `🔖 SKU: ${d.productCode}\n` +
        `💰 Price: ${formatPrice(d.price)}\n` +
        `🎯 Target: ${d.targetCount} orders\n` +
        `📅 Deadline: ${d.deadline ? new Date(d.deadline).toLocaleDateString() : 'None'}\n` +
        `👕 Sizes: ${d.sizes.length ? d.sizes.join(', ') : '—'}\n` +
        `🎨 Colors: ${d.colors.length ? d.colors.join(', ') : '—'}`,
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🚀 Publish to Group', 'prod:publish')],
        [Markup.button.callback('❌ Cancel', 'prod:cancel')],
      ]).reply_markup,
    });
    return ctx.wizard.next();
  },

  async (ctx) => {}
);

export function registerProductSceneCallbacks(bot) {
  bot.action('prod:publish', async (ctx) => {
    await ctx.answerCbQuery('Publishing...');
    const d = ctx.wizard?.state?.data;
    if (!d) return ctx.reply('Session expired. Please start again with /newproduct');
    try {
      const { product, series } = await productService.create({
        name:        d.name,
        productCode: d.productCode,
        image:       d.image,
        price:       d.price,
        targetCount: d.targetCount,
        deadline:    d.deadline,
        sizes:       d.sizes,
        colors:      d.colors,
        adminId:     ctx.from.id,
      });
      await groupNotifier.postProductCard(product, series);
      await ctx.editMessageCaption(
        `🎉 *Published!*\n\n*${product.name}* is now live.\nSeries #1 is open!`,
        { parse_mode: 'Markdown' }
      );
      logger.info(`Product published: ${product.name}`);
    } catch (err) {
      logger.error('prod:publish error:', err);
      await ctx.reply(`❌ Error: ${err.message}`);
    }
    return ctx.scene.leave();
  });

  bot.action('prod:cancel', async (ctx) => {
    await ctx.answerCbQuery('Cancelled');
    await ctx.editMessageCaption('❌ Product creation cancelled.');
    return ctx.scene.leave();
  });
}
