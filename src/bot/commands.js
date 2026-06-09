import { adminMainMenu, backToMain } from '../keyboards/index.js';
import { handleDashboard }           from '../handlers/admin/dashboardHandler.js';
import { scheduler }                 from '../automation/scheduler.js';
import { exportService }             from '../services/exportService.js';
import { broadcastService }          from '../services/broadcastService.js';
import { t, getLang, setLang, LANGS } from '../i18n/index.js';
import { config }                    from '../config/env.js';
import logger                        from '../utils/logger.js';

const isAdmin = (id) => config.bot.adminIds.includes(id);

export function registerCommands(bot) {

  // /start
  bot.start(async (ctx) => {
    const id   = ctx.from.id;
    const lang = getLang(id);
    const name = ctx.from.first_name ?? 'User';
    await ctx.reply(t(lang, 'welcome', name), {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: LANGS.uz, callback_data: 'lang:uz' },
          { text: LANGS.ru, callback_data: 'lang:ru' },
        ]],
      },
    });
  });

  // /help
  bot.help(async (ctx) => {
    const lang = getLang(ctx.from.id);
    await ctx.reply(t(lang, 'help'), { parse_mode: 'Markdown' });
  });

  // /lang — til tanlash
  bot.command('lang', async (ctx) => {
    const lang = getLang(ctx.from.id);
    await ctx.reply(t(lang, 'chooseLang'), {
      reply_markup: {
        inline_keyboard: [[
          { text: LANGS.uz, callback_data: 'lang:uz' },
          { text: LANGS.ru, callback_data: 'lang:ru' },
        ]],
      },
    });
  });

  // /myorders
  bot.command('myorders',    async (ctx) => ctx.scene?.enter?.('user:my-orders') ?? ctx.reply('..'));
  bot.command('buyurtmalarim', async (ctx) => ctx.scene?.enter?.('user:my-orders') ?? ctx.reply('..'));

  // /admin
  bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('⛔');
    await ctx.reply('🔐 *Admin Panel*', { parse_mode: 'Markdown', ...adminMainMenu() });
  });

  // /newproduct
  bot.command('newproduct', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('⛔');
    await ctx.scene.enter('admin:create-product');
  });

  // /export — CSV yuklash
  bot.command('export', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('⛔');
    await ctx.reply('⏳ CSV tayyorlanmoqda…');
    try {
      const { csv, count } = await exportService.ordersToCSV();
      const buf = Buffer.from('\uFEFF' + csv, 'utf8'); // BOM for Excel
      await ctx.replyWithDocument(
        { source: buf, filename: `orders-${Date.now()}.csv` },
        { caption: `✅ ${count} ta buyurtma eksport qilindi.` }
      );
    } catch (err) {
      logger.error('export:', err);
      await ctx.reply(`❌ ${err.message}`);
    }
  });

  // /broadcast — barcha userlarga xabar
  bot.command('broadcast', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('⛔');
    const text = ctx.message.text.replace('/broadcast', '').trim();
    if (!text) return ctx.reply('Ishlatish: /broadcast <xabar matni>');
    const msg = await ctx.reply('⏳ Yuborilmoqda…');
    try {
      const { sent, failed, total } = await broadcastService.send({ message: text });
      await ctx.telegram.editMessageText(
        ctx.chat.id, msg.message_id, undefined,
        `✅ Yuborildi: ${sent}/${total}\n❌ Xato: ${failed}`
      );
    } catch (err) {
      await ctx.reply(`❌ ${err.message}`);
    }
  });

  // /runreminders
  bot.command('runreminders', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('⛔');
    await ctx.reply('⏳…');
    await scheduler.runNow('paymentReminders').catch(() => {});
    await ctx.reply('✅ Eslatmalar yuborildi.');
  });

  // /cancel
  bot.command('cancel', async (ctx) => {
    await ctx.scene?.leave?.().catch(() => {});
    await ctx.reply('❌ Bekor.', backToMain());
  });

  logger.info('Commands registered');
}
