import { Scenes, Markup } from 'telegraf';
import { productService } from '../../services/productService.js';
import { groupNotifier }  from '../../services/groupNotifier.js';
import { adminMainMenu }  from '../../keyboards/index.js';
import { formatPrice }    from '../../utils/helpers.js';
import logger             from '../../utils/logger.js';

// ─── Helper to build step header ────────────────────────────
const step = (n, total, title) =>
  `━━━━━━━━━━━━━━━━━━\n🔧 *Create Product* — Step ${n}/${total}\n━━━━━━━━━━━━━━━━━━\n\n*${title}*`;

export const createProductScene = new Scenes.WizardScene('admin:create-product',
 // Allow /cancel in any step
  async (ctx) => {
    ctx.wizard.state.data = {};
    await ctx.reply(step(1, 7, 'Product Name') + '\n\nEnter the product name:', {
      parse_mode: 'Markdown',
    });
    return ctx.wizard.next();
  },

  // ── Step 2: Product code ──────────────────────────────────
  async (ctx) => {
    if (!ctx.message?.text) return ctx.reply('⚠️ Please send a text message.');
    ctx.wizard.state.data.name = ctx.message.text.trim();
    await ctx.reply(step(2, 7, 'Product Code') + '\n\nEnter a unique SKU (e.g. `NK-HOODIE-001`):', {
      parse_mode: 'Markdown',
    });
    return ctx.wizard.next();
  },

  // ── Step 3: Price ─────────────────────────────────────────
  async (ctx) => {
    if (!ctx.message?.text) return ctx.reply('⚠️ Please send a text message.');
    ctx.wizard.state.data.productCode = ctx.message.text.trim().toUpperCase();
    await ctx.reply(step(3, 7, 'Price') + '\n\nEnter the price (e.g. `49.99`):', {
      parse_mode: 'Markdown',
    });
    return ctx.wizard.next();
  },

  // ── Step 4: Target count ──────────────────────────────────
  async (ctx) => {
    if (!ctx.message?.text) return ctx.reply('⚠️ Please send a text message.');
    const price = parseFloat(ctx.message.text.replace(',', '.'));
    if (isNaN(price) || price <= 0) return ctx.reply('❌ Invalid price. Enter a positive number:');
    ctx.wizard.state.data.price = price;
    await ctx.reply(
      step(4, 7, 'Series Target') + '\n\nHow many orders close one series? (e.g. `10`):',
      { parse_mode: 'Markdown' }
    );
    return ctx.wizard.next();
  },

  // ── Step 5: Deadline ──────────────────────────────────────
  async (ctx) => {
    if (!ctx.message?.text) return ctx.reply('⚠️ Please send a text message.');
    const target = parseInt(ctx.message.text, 10);
    if (isNaN(target) || target < 1) return ctx.reply('❌ Must be a positive integer. Try again:');
    ctx.wizard.state.data.targetCount = target;
    await ctx.reply(
      step(5, 7, 'Deadline') + '\n\nEnter deadline as `YYYY-MM-DD` (or type `skip` for none):',
      { parse_mode: 'Markdown' }
    );
    return ctx.wizard.next();
  },

  // ── Step 6: Image upload ──────────────────────────────────
  async (ctx) => {
    if (!ctx.message?.text && !ctx.message?.photo) {
      return ctx.reply('⚠️ Please send text or a photo.');
    }
    if (ctx.message.text?.toLowerCase() !== 'skip') {
      const text = ctx.message.text?.trim();
      if (text && text.toLowerCase() !== 'skip') {
        const d = new Date(text);
        if (isNaN(d.getTime())) return ctx.reply('❌ Invalid date format. Use `YYYY-MM-DD` or `skip`:',
          { parse_mode: 'Markdown' });
        ctx.wizard.state.data.deadline = d.toISOString();
      }
    }
    await ctx.reply(
      step(6, 7, 'Product Image') +
      '\n\nSend the *product photo* (or type `skip`):',
      { parse_mode: 'Markdown' }
    );
    return ctx.wizard.next();
  },

  // ── Step 7: Sizes & colors (inline selection) then confirm ──
  async (ctx) => {
    if (!ctx.message?.text && !ctx.message?.photo) {
      return ctx.reply('⚠️ Please send a photo or type `skip`.', { parse_mode: 'Markdown' });
    }
    if (ctx.message.photo) {
      ctx.wizard.state.data.image = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    }

    ctx.wizard.state.data.sizes  = [];
    ctx.wizard.state.data.colors = [];

    const commonSizes  = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'Free Size'];
    const commonColors = ['Black', 'White', 'Red', 'Blue', 'Green', 'Gray', 'Navy', 'Beige'];

    ctx.wizard.state.selectingPhase = 'sizes';

    await ctx.reply(
      step(7, 7, 'Sizes') + '\n\nSelect available sizes (tap to toggle, then tap *Done*):',
      {
        parse_mode: 'Markdown',
        reply_markup: buildToggleKeyboard(commonSizes, [], 'admin:pick:size').reply_markup,
      }
    );
    return ctx.wizard.next();
  },

  // ── Final step: collect toggles from callbackQuery ───────
  // (This step isn't reached via text — it's driven by action handlers in the scene)
  async (ctx) => {
    // Fallback: finalize with whatever was collected
    await finalizeProduct(ctx);
  },
);

// ─── Toggle keyboard helper ──────────────────────────────────
function buildToggleKeyboard(options, selected, prefix) {
  const buttons = options.map(o =>
    Markup.button.callback(selected.includes(o) ? `✓ ${o}` : o, `${prefix}:${o}`)
  );
  const rows = [];
  for (let i = 0; i < buttons.length; i += 3) rows.push(buttons.slice(i, i + 3));
  rows.push([Markup.button.callback('✅ Done', `${prefix}:__done__`)]);
  return Markup.inlineKeyboard(rows);
}

// ─── Finalize and create the product ────────────────────────
async function finalizeProduct(ctx) {
  const d = ctx.wizard.state.data;

  // Summary confirmation
  const preview =
    `✅ *Confirm product creation:*\n\n` +
    `📦 *Name:* ${d.name}\n` +
    `🔖 *Code:* ${d.productCode}\n` +
    `💰 *Price:* ${formatPrice(d.price)}\n` +
    `🎯 *Target:* ${d.targetCount} orders/series\n` +
    `📅 *Deadline:* ${d.deadline ? new Date(d.deadline).toDateString() : 'None'}\n` +
    `👕 *Sizes:* ${d.sizes.length ? d.sizes.join(', ') : '—'}\n` +
    `🎨 *Colors:* ${d.colors.length ? d.colors.join(', ') : '—'}\n` +
    `🖼 *Image:* ${d.image ? 'Uploaded ✅' : 'None'}\n\n` +
    `Type *CONFIRM* to create or *CANCEL* to abort.`;

  ctx.wizard.state.awaitingConfirm = true;
  await ctx.reply(preview, { parse_mode: 'Markdown' });
}

// ─── Scene-level action handlers (toggle size/color) ────────
createProductScene.action(/^admin:pick:size:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const val = ctx.match[1];
  const d   = ctx.wizard.state.data;

  if (val === '__done__') {
    // Move to color selection
    const commonColors = ['Black', 'White', 'Red', 'Blue', 'Green', 'Gray', 'Navy', 'Beige'];
    await ctx.editMessageText(
      step(7, 7, 'Colors') + '\n\nSelect available colors:',
      {
        parse_mode: 'Markdown',
        reply_markup: buildToggleKeyboard(commonColors, d.colors ?? [], 'admin:pick:color').reply_markup,
      }
    );
    return;
  }

  d.sizes = d.sizes ?? [];
  if (d.sizes.includes(val)) {
    d.sizes = d.sizes.filter(s => s !== val);
  } else {
    d.sizes.push(val);
  }

  const commonSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'Free Size'];
  await ctx.editMessageReplyMarkup(
    buildToggleKeyboard(commonSizes, d.sizes, 'admin:pick:size').reply_markup
  );
});

createProductScene.action(/^admin:pick:color:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const val = ctx.match[1];
  const d   = ctx.wizard.state.data;

  if (val === '__done__') {
    await ctx.editMessageText('✅ Options saved!', { parse_mode: 'Markdown' });
    await finalizeProduct(ctx);
    return;
  }

  d.colors = d.colors ?? [];
  if (d.colors.includes(val)) {
    d.colors = d.colors.filter(c => c !== val);
  } else {
    d.colors.push(val);
  }

  const commonColors = ['Black', 'White', 'Red', 'Blue', 'Green', 'Gray', 'Navy', 'Beige'];
  await ctx.editMessageReplyMarkup(
    buildToggleKeyboard(commonColors, d.colors, 'admin:pick:color').reply_markup
  );
});

// ─── Listen for CONFIRM / CANCEL text in the scene ──────────
createProductScene.on('text', async (ctx) => {
  if (!ctx.wizard.state.awaitingConfirm) return;
  const input = ctx.message.text.trim().toUpperCase();

  if (input === 'CANCEL') {
    await ctx.reply('❌ Cancelled.', adminMainMenu());
    return ctx.scene.leave();
  }

  if (input !== 'CONFIRM') {
    return ctx.reply('Type *CONFIRM* to create or *CANCEL* to abort.', { parse_mode: 'Markdown' });
  }

  try {
    const d = ctx.wizard.state.data;
    const { product, series } = await productService.create({
      ...d,
      adminId: ctx.from.id,
    });

    await ctx.reply(
      `🎉 *Product Created!*\n\n` +
      `📦 ${product.name}\n` +
      `💰 ${formatPrice(product.price)}\n` +
      `📊 Series #1 opened — target: ${series.target_count}\n` +
      `🆔 \`${product.id}\`\n\n` +
      `Ready to publish to the group?`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '📢 Publish Now', callback_data: `admin:product:publish:${product.id}` },
            { text: 'Later',          callback_data: 'admin:products:list' },
          ]],
        },
      }
    );
  } catch (err) {
    logger.error('createProductScene confirm:', err);
    await ctx.reply(`❌ Error: ${err.message}`);
  }

  return ctx.scene.leave();
});
