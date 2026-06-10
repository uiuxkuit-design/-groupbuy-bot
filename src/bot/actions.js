/**
 * BOT ACTIONS — All inline keyboard callback_data handlers
 */
import { config } from '../config/env.js';
import { registerProductSceneCallbacks } from '../scenes/admin/createProductScene.js';

import {
  handleAdminProductsList,
  handleAdminProductView,
  handleAdminProductStats,
  handleAdminPublish,
  handleAdminDeactivate,
} from '../handlers/admin/productHandler.js';
import {
  handlePendingPayments,
  handleViewPayment,
  handleApprovePayment,
  handleRejectPayment,
} from '../handlers/admin/paymentHandler.js';
import {
  handleDashboard,
  handleBestSellers,
  handleSeriesStats,
  handleOrderHistory,
  handleStaleOrders,
  handleCancelStale,
  handleRunJob,
  handleForceCancelOrder,
} from '../handlers/admin/dashboardHandler.js';
import {
  handleGroupOrder,
  handleSizeSelected,
  handleColorSelected,
  handleQuantitySelected,
  handleUploadPaymentTrigger,
  handleJoinWaitingList,
  handleLeaveWaitingList,
  handleMyOrders,
  handleViewOrder,
} from '../handlers/user/orderFlowHandler.js';

import { cancelService } from '../services/cancelService.js';
import { adminMainMenu } from '../keyboards/index.js';
import logger from '../utils/logger.js';

const isAdmin = (userId) => config.bot.adminIds.includes(userId);
const adminOnly = (handler) => async (ctx) => {
  if (!isAdmin(ctx.from?.id)) {
    await ctx.answerCbQuery('⛔ Admin only.', { show_alert: true }).catch(() => {});
    return;
  }
  return handler(ctx);
};

export function registerActions(bot) {
  registerProductSceneCallbacks(bot);

  bot.action('admin:main', adminOnly(async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.editMessageText('🔐 *Admin Panel*', { parse_mode: 'Markdown', ...adminMainMenu() });
  }));

  bot.action('admin:product:new', adminOnly(async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.scene.enter('admin:create-product');
  }));

  bot.action('admin:products:list',       adminOnly(handleAdminProductsList));
  bot.action('admin:payments:pending',    adminOnly(handlePendingPayments));
  bot.action('admin:dashboard',           adminOnly(handleDashboard));
  bot.action('admin:stats:bestsellers',   adminOnly(handleBestSellers));
  bot.action('admin:stats:series',        adminOnly(handleSeriesStats));
  bot.action('admin:orders:stale',        adminOnly(handleStaleOrders));
  bot.action('admin:orders:stale:cancel', adminOnly(handleCancelStale));

  bot.action(/^admin:product:view:(.+)$/,       adminOnly(async (ctx) => handleAdminProductView(ctx, ctx.match[1])));
  bot.action(/^admin:product:stats:(.+)$/,      adminOnly(async (ctx) => handleAdminProductStats(ctx, ctx.match[1])));
  bot.action(/^admin:product:publish:(.+)$/,    adminOnly(async (ctx) => handleAdminPublish(ctx, ctx.match[1])));
  bot.action(/^admin:product:deactivate:(.+)$/, adminOnly(async (ctx) => handleAdminDeactivate(ctx, ctx.match[1])));

  bot.action(/^admin:payment:view:(.+)$/,    adminOnly(async (ctx) => handleViewPayment(ctx, ctx.match[1])));
  bot.action(/^admin:payment:approve:(.+)$/, adminOnly(async (ctx) => handleApprovePayment(ctx, ctx.match[1])));
  bot.action(/^admin:payment:reject:(.+)$/,  adminOnly(async (ctx) => handleRejectPayment(ctx, ctx.match[1])));

  bot.action(/^admin:orders:history:(\d+)$/, adminOnly(async (ctx) => {
    await handleOrderHistory(ctx, parseInt(ctx.match[1], 10));
  }));
  bot.action(/^admin:order:force-cancel:(.+)$/, adminOnly(async (ctx) => {
    await handleForceCancelOrder(ctx, ctx.match[1]);
  }));
  bot.action(/^admin:jobs:run:(.+)$/, adminOnly(async (ctx) => {
    await handleRunJob(ctx, ctx.match[1]);
  }));

  bot.action(/^group:order:(.+)$/, async (ctx) => {
    await handleGroupOrder(ctx, ctx.match[1]);
  });
  bot.action(/^group:wait:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await handleJoinWaitingList(ctx, ctx.match[1]);
  });

  bot.action(/^user:size:([^:]+):(.+)$/, async (ctx) => {
    const [, productId, size] = ctx.match;
    await handleSizeSelected(ctx, productId, size);
  });
  bot.action(/^user:color:([^:]+):([^:]+):(.+)$/, async (ctx) => {
    const [, productId, size, color] = ctx.match;
    await handleColorSelected(ctx, productId, size, color);
  });
  bot.action(/^user:qty:([^:]+):([^:]+):([^:]+):(\d+)$/, async (ctx) => {
    const [, productId, size, color, qty] = ctx.match;
    await handleQuantitySelected(ctx, productId, size, color, qty);
  });

  bot.action(/^user:payment:upload:(.+)$/, async (ctx) => {
    await handleUploadPaymentTrigger(ctx, ctx.match[1]);
  });

  bot.action(/^user:order:cancel:(?!confirm:|abort:)(.+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const orderId = ctx.match[1];
    await ctx.editMessageText(
      '⚠️ *Buyurtmani bekor qilish*\n\nRostan ham bekor qilmoqchimisiz?',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Ha, bekor qilish', callback_data: `user:order:cancel:confirm:${orderId}` },
            { text: '❌ Yo\'q',            callback_data: `user:order:cancel:abort:${orderId}` },
          ]],
        },
      }
    );
  });

  bot.action(/^user:order:cancel:confirm:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('Bekor qilinmoqda…').catch(() => {});
    const orderId = ctx.match[1];
    try {
      const { order, promoted } = await cancelService.cancel(orderId, 'user', 'Cancelled by user');
      const promotedCount = promoted?.promoted?.length ?? 0;
      const slotMsg = promotedCount > 0 ? `\n🔔 ${promotedCount} ta kutayotgan user xabardor qilindi.` : '';
      await ctx.editMessageText(
        `✅ *Buyurtma bekor qilindi.*\n\n📦 ${order.products?.name}\n📊 Seriya #${order.series?.series_number}${slotMsg}`,
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '📋 Buyurtmalarim', callback_data: 'user:myorders' }]] } }
      );
    } catch (err) {
      logger.error('user:order:cancel:confirm:', err);
      await ctx.editMessageText(`❌ ${err.message}`);
    }
  });

  bot.action(/^user:order:cancel:abort:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('Saqlab qolindi ✓').catch(() => {});
    await handleViewOrder(ctx, ctx.match[1]);
  });

  bot.action(/^user:wait:join:(.+)$/,  async (ctx) => handleJoinWaitingList(ctx, ctx.match[1]));
  bot.action(/^user:wait:leave:(.+)$/, async (ctx) => handleLeaveWaitingList(ctx, ctx.match[1]));

  bot.action('user:main', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.editMessageText('🏠 *Bosh menyu*\n\n/myorders — Buyurtmalarim\n/help — Yordam', { parse_mode: 'Markdown' });
  });
  bot.action('user:cancel', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.editMessageText('❌ Bekor qilindi.');
  });
  bot.action('user:myorders', handleMyOrders);
  bot.action(/^user:order:view:(.+)$/, async (ctx) => handleViewOrder(ctx, ctx.match[1]));

  logger.info('Actions registered');
}