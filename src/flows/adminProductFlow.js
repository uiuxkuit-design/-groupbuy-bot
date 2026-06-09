/**
 * ADMIN FLOW: Add Product
 * Steps: name → product_code → price → target_count → deadline
 *        → sizes → colors → image → confirm → publish
 *
 * Uses Telegraf WizardScene so every step is isolated.
 */
import { Scenes, Markup } from 'telegraf';
import { supabase }       from '../config/supabase.js';
import { groupPublisher } from '../handlers/group/groupPublisher.js';
import { adminGuard }     from '../middleware/adminGuard.js';
import logger             from '../utils/logger.js';
import { formatPrice }    from '../utils/helpers.js';

// ─── helper keyboards ────────────────────────────────────────────────────────

const deadlineKb = Markup.inlineKeyboard([
  [Markup.button.callback('3 days',  'dl:3'),  Markup.button.callback('7 days',  'dl:7')],
  [Markup.button.callback('14 days', 'dl:14'), Markup.button.callback('30 days', 'dl:30')],
  [Markup.button.callback('No deadline', 'dl:0')],
]);

const PRESET_SIZES  = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Free Size'];
const PRESET_COLORS = ['Black', 'White', 'Red', 'Blue', 'Green', 'Yellow', 'Pink', 'Grey'];

function sizesKb(selected = []) {
  const rows = [];
  for (let i = 0; i < PRESET_SIZES.length; i += 3) {
    rows.push(
      PRESET_SIZES.slice(i, i + 3).map(s =>
        Markup.button.callback(
          (selected.includes(s) ? '✅ ' : '') + s,
          `sz:${s}`
        )
      )
    );
  }
  rows.push([
    Markup.button.callback('Custom size…', 'sz:custom'),
    Markup.button.callback('➡ Done', 'sz:done'),
  ]);
  return Markup.inlineKeyboard(rows);
}

function colorsKb(selected = []) {
  const rows = [];
  for (let i = 0; i < PRESET_COLORS.length; i += 3) {
    rows.push(
      PRESET_COLORS.slice(i, i + 3).map(c =>
        Markup.button.callback(
          (selected.includes(c) ? '✅ ' : '') + c,
          `cl:${c}`
        )
      )
    );
  }
  rows.push([
    Markup.button.callback('Custom color…', 'cl:custom'),
    Markup.button.callback('➡ Done', 'cl:done'),
  ]);
  return Markup.inlineKeyboard(rows);
}

// ─── scene ───────────────────────────────────────────────────────────────────

export const adminProductScene = new Scenes.WizardScene(
  'admin:add-product',

  // ── Step 0: Product name ──────────────────────────────────────
  async (ctx) => {
    ctx.wizard.state.data = {};
    await ctx.reply(
      '📦 *New Product — Step 1/8*\n\nEnter the *product name*:',
      { parse_mode: 'Markdown' }
    );
    return ctx.wizard.next();
  },

  // ── Step 1: Product code / SKU ────────────────────────────────
  async (ctx) => {
    if (!ctx.message?.text?.trim()) return ctx.reply('Please send a text name.');
    ctx.wizard.state.data.name = ctx.message.text.trim();
    await ctx.reply(
      `📦 *Step 2/8 — Product Code (SKU)*\n\n` +
      `Enter a short unique code, e.g. \`NK-HOODIE-001\`:`,
      { parse_mode: 'Markdown' }
    );
    return ctx.wizard.next();
  },

  // ── Step 2: Price ─────────────────────────────────────────────
  async (ctx) => {
    if (!ctx.message?.text?.trim()) return ctx.reply('Please send a text SKU.');
    const code = ctx.message.text.trim().toUpperCase().replace(/\s+/g, '-');
    ctx.wizard.state.data.product_code = code;
    await ctx.reply(
      `📦 *Step 3/8 — Price*\n\nEnter price in USD (e.g. \`29.99\`):`,
      { parse_mode: 'Markdown' }
    );
    return ctx.wizard.next();
  },

  // ── Step 3: Target count ──────────────────────────────────────
  async (ctx) => {
    if (!ctx.message?.text) return ctx.reply('Please send a number.');
    const price = parseFloat(ctx.message.text.replace(',', '.'));
    if (isNaN(price) || price <= 0)
      return ctx.reply('❌ Invalid price. Enter a positive number like `29.99`:',
        { parse_mode: 'Markdown' });
    ctx.wizard.state.data.price = price;
    await ctx.reply(
      `📦 *Step 4/8 — Target Count*\n\nHow many orders needed to close one series?`,
      { parse_mode: 'Markdown' }
    );
    return ctx.wizard.next();
  },

  // ── Step 4: Deadline ──────────────────────────────────────────
  async (ctx) => {
    if (!ctx.message?.text) return ctx.reply('Please send a number.');
    const target = parseInt(ctx.message.text, 10);
    if (isNaN(target) || target < 1)
      return ctx.reply('❌ Enter a positive integer, e.g. `10`:',
        { parse_mode: 'Markdown' });
    ctx.wizard.state.data.target_count = target;
    ctx.wizard.state.awaitingDeadline = true;
    await ctx.reply(
      `📦 *Step 5/8 — Deadline*\n\nChoose the order deadline:`,
      { parse_mode: 'Markdown', ...deadlineKb }
    );
    // deadline is chosen via callback, handled inside this same step listener
    return ctx.wizard.next();
  },

  // ── Step 5: Sizes (callback-driven) ──────────────────────────
  async (ctx) => {
    // This step is entered after deadline callback sets data.deadline
    ctx.wizard.state.data.sizes = [];
    const { data } = ctx.wizard.state;
    await ctx.reply(
      `📦 *Step 6/8 — Sizes*\n\n` +
      `Tap to toggle sizes (multiple allowed), then press *Done*:`,
      { parse_mode: 'Markdown', ...sizesKb([]) }
    );
    return ctx.wizard.next();
  },

  // ── Step 6: Colors (callback-driven) ─────────────────────────
  async (ctx) => {
    ctx.wizard.state.data.colors = [];
    await ctx.reply(
      `📦 *Step 7/8 — Colors*\n\n` +
      `Tap to toggle colors (multiple allowed), then press *Done*:`,
      { parse_mode: 'Markdown', ...colorsKb([]) }
    );
    return ctx.wizard.next();
  },

  // ── Step 7: Image upload ──────────────────────────────────────
  async (ctx) => {
    await ctx.reply(
      `📦 *Step 8/8 — Product Image*\n\n` +
      `Send the product photo now:`,
      { parse_mode: 'Markdown' }
    );
    return ctx.wizard.next();
  },

  // ── Step 8: Confirm & save ────────────────────────────────────
  async (ctx) => {
    const photo = ctx.message?.photo;
    if (!photo?.length) return ctx.reply('Please send a photo.');

    const fileId = photo[photo.length - 1].file_id;
    const { data } = ctx.wizard.state;
    data.image = fileId;

    // Build preview text
    const deadlineLabel = data.deadline
      ? `📅 Deadline: ${new Date(data.deadline).toLocaleDateString()}`
      : `📅 No deadline`;

    const previewText =
      `✅ *Review before publishing:*\n\n` +
      `📦 *${data.name}*\n` +
      `🔖 SKU: \`${data.product_code}\`\n` +
      `💰 Price: ${formatPrice(data.price)}\n` +
      `🎯 Target: ${data.target_count} orders\n` +
      `${deadlineLabel}\n` +
      `👕 Sizes: ${data.sizes.length ? data.sizes.join(', ') : '—'}\n` +
      `🎨 Colors: ${data.colors.length ? data.colors.join(', ') : '—'}`;

    await ctx.replyWithPhoto(fileId, {
      caption: previewText,
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Publish to Group', 'prod:publish'),
          Markup.button.callback('❌ Cancel', 'prod:cancel'),
        ],
      ]).reply_markup,
    });

    return ctx.wizard.next();
  },

  // ── Step 9: Handle publish/cancel ────────────────────────────
  async (ctx) => {
    // answered via callback — scene stays here waiting
  }
);

// ─── Callback handlers (registered on the bot, not inside the scene) ─────────

/**
 * Register all admin-product-flow callbacks.
 * Call this once from bot/actions.js.
 */
export function registerAdminProductCallbacks(bot) {

  // Deadline selection (step 4 → 5)
  bot.action(/^dl:(\d+)$/, adminGuard, async (ctx) => {
    await ctx.answerCbQuery();
    const days = parseInt(ctx.match[1], 10);
    const deadline = days === 0 ? null
      : new Date(Date.now() + days * 86_400_000).toISOString();
    ctx.wizard.state.data.deadline = deadline;
    const label = days === 0 ? 'No deadline' : `${days} days`;
    await ctx.editMessageText(`✅ Deadline set: *${label}*`, { parse_mode: 'Markdown' });
    return ctx.wizard.next();
  });

  // Size toggle (step 5)
  bot.action(/^sz:(.+)$/, adminGuard, async (ctx) => {
    await ctx.answerCbQuery();
    const val = ctx.match[1];
    const sizes = ctx.wizard.state.data.sizes ?? [];

    if (val === 'done') {
      await ctx.editMessageText(
        `✅ Sizes: *${sizes.length ? sizes.join(', ') : 'None'}*`,
        { parse_mode: 'Markdown' }
      );
      return ctx.wizard.next();
    }

    if (val === 'custom') {
      ctx.wizard.state.awaitingCustomSize = true;
      await ctx.reply('Type custom size (e.g. `US 9`, `EU 42`):',
        { parse_mode: 'Markdown' });
      return;
    }

    const idx = sizes.indexOf(val);
    if (idx === -1) sizes.push(val); else sizes.splice(idx, 1);
    ctx.wizard.state.data.sizes = sizes;
    await ctx.editMessageReplyMarkup(sizesKb(sizes).reply_markup);
  });

  // Color toggle (step 6)
  bot.action(/^cl:(.+)$/, adminGuard, async (ctx) => {
    await ctx.answerCbQuery();
    const val = ctx.match[1];
    const colors = ctx.wizard.state.data.colors ?? [];

    if (val === 'done') {
      await ctx.editMessageText(
        `✅ Colors: *${colors.length ? colors.join(', ') : 'None'}*`,
        { parse_mode: 'Markdown' }
      );
      return ctx.wizard.next();
    }

    if (val === 'custom') {
      ctx.wizard.state.awaitingCustomColor = true;
      await ctx.reply('Type custom color:');
      return;
    }

    const idx = colors.indexOf(val);
    if (idx === -1) colors.push(val); else colors.splice(idx, 1);
    ctx.wizard.state.data.colors = colors;
    await ctx.editMessageReplyMarkup(colorsKb(colors).reply_markup);
  });

  // Publish confirmation
  bot.action('prod:publish', adminGuard, async (ctx) => {
    await ctx.answerCbQuery('Publishing…');
    const { data } = ctx.wizard.state;

    try {
      // 1. Find admin record
      const { data: admin } = await supabase
        .from('admins')
        .select('id')
        .eq('telegram_id', ctx.from.id)
        .single();

      // 2. Insert product
      const { data: product, error: pErr } = await supabase
        .from('products')
        .insert({
          name:         data.name,
          product_code: data.product_code,
          price:        data.price,
          image:        data.image,
          target_count: data.target_count,
          deadline:     data.deadline,
          created_by:   admin.id,
        })
        .select()
        .single();

      if (pErr) throw pErr;

      // 3. Create Series #1
      const { data: series, error: sErr } = await supabase
        .from('series')
        .insert({
          product_id:    product.id,
          series_number: 1,
          target_count:  product.target_count,
          current_count: 0,
          status:        'active',
        })
        .select()
        .single();

      if (sErr) throw sErr;

      // 4. Publish product card to group
      await groupPublisher.publishProductCard(ctx, { product, series });

      await ctx.editMessageCaption(
        `🎉 *Published!*\n\n*${product.name}* is now live.\nSeries #1 is open.`,
        { parse_mode: 'Markdown' }
      );

      logger.info(`Product published: ${product.id} "${product.name}"`);
    } catch (err) {
      logger.error('prod:publish error:', err);
      await ctx.reply(`❌ Failed to publish: ${err.message}`);
    }

    return ctx.scene.leave();
  });

  // Cancel
  bot.action('prod:cancel', adminGuard, async (ctx) => {
    await ctx.answerCbQuery('Cancelled');
    await ctx.editMessageCaption('❌ Product creation cancelled.');
    return ctx.scene.leave();
  });
}
