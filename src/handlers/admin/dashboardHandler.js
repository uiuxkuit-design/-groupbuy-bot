/**
 * ADMIN DASHBOARD HANDLER
 * Comprehensive admin dashboard with:
 *   - Live stats overview
 *   - Series progress per product
 *   - Best-selling products
 *   - Pending payments count
 *   - Quick-action buttons
 */
import { statsReporter }   from '../../automation/statsReporter.js';
import { cancelService }   from '../../services/cancelService.js';
import { supabase }        from '../../config/supabase.js';
import { formatPrice, progressBar } from '../../utils/helpers.js';
import logger              from '../../utils/logger.js';

// ── Main dashboard ────────────────────────────────────────────────────────────
export async function handleDashboard(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  try {
    const report = await statsReporter.generateReport();
    const text   = buildDashboardText(report);

    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 Refresh',          callback_data: 'admin:dashboard' },
            { text: '🏆 Best Sellers',     callback_data: 'admin:stats:bestsellers' },
          ],
          [
            { text: '💳 Pending Payments', callback_data: 'admin:payments:pending' },
            { text: '📋 Order History',    callback_data: 'admin:orders:history:0' },
          ],
          [
            { text: '📊 Series Stats',     callback_data: 'admin:stats:series' },
            { text: '🗑 Stale Orders',     callback_data: 'admin:orders:stale' },
          ],
          [
            { text: '▶️ Run Reminders',   callback_data: 'admin:jobs:run:paymentReminders' },
            { text: '📈 Daily Report',    callback_data: 'admin:jobs:run:dailyStats' },
          ],
          [{ text: '◀️ Main Menu',        callback_data: 'admin:main' }],
        ],
      },
    });
  } catch (err) {
    logger.error('handleDashboard:', err);
    await ctx.editMessageText(`❌ Dashboard error: ${err.message}`);
  }
}

// ── Best sellers ──────────────────────────────────────────────────────────────
export async function handleBestSellers(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  try {
    const report   = await statsReporter.generateReport();
    const products = report.products;

    const lines = products.slice(0, 10).map((p, i) => {
      const medal = ['🥇','🥈','🥉'][i] ?? `${i+1}.`;
      return (
        `${medal} *${p.name}*\n` +
        `   💰 Revenue: ${formatPrice(p.revenue)}\n` +
        `   📦 Paid orders: ${p.paidOrders}  |  Total units: ${p.totalQuantity}`
      );
    }).join('\n\n');

    const total = products.reduce((s, p) => s + p.revenue, 0);

    await ctx.editMessageText(
      `🏆 *Best Selling Products*\n\n${lines || '—'}\n\n` +
      `━━━━━━━━━━━━━━\n` +
      `💰 *Total Revenue: ${formatPrice(total)}*`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '◀️ Dashboard', callback_data: 'admin:dashboard' }]],
        },
      }
    );
  } catch (err) {
    logger.error('handleBestSellers:', err);
    await ctx.editMessageText(`❌ ${err.message}`);
  }
}

// ── Series stats overview ─────────────────────────────────────────────────────
export async function handleSeriesStats(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  try {
    const { data, error } = await supabase
      .from('series')
      .select(`
        id, series_number, current_count, target_count, status, created_at, closed_at,
        products(name)
      `)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;

    const lines = (data ?? []).map(s => {
      const icon    = s.status === 'active' ? '🟢' : '🔒';
      const bar     = progressBar(s.current_count, s.target_count);
      const durMs   = s.closed_at
        ? new Date(s.closed_at) - new Date(s.created_at)
        : Date.now() - new Date(s.created_at);
      const durH    = Math.round(durMs / 3600000);
      return `${icon} *${s.products?.name}* #${s.series_number}\n   ${bar}\n   ⏱ ${durH}h`;
    }).join('\n\n');

    await ctx.editMessageText(
      `📊 *Series Statistics* (last 20)\n\n${lines || '—'}`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '◀️ Dashboard', callback_data: 'admin:dashboard' }]],
        },
      }
    );
  } catch (err) {
    logger.error('handleSeriesStats:', err);
    await ctx.editMessageText(`❌ ${err.message}`);
  }
}

// ── Order history (paginated) ─────────────────────────────────────────────────
export async function handleOrderHistory(ctx, page = 0) {
  await ctx.answerCbQuery().catch(() => {});
  const limit  = 10;
  const offset = page * limit;

  try {
    const { data, error, count } = await supabase
      .from('orders')
      .select(`
        id, payment_status, quantity, created_at,
        products(name, price),
        users(fullname, telegram_id),
        series(series_number)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    const statusIcon = { unpaid:'⏳', pending_review:'🔍', paid:'✅', cancelled:'❌', refunded:'↩️' };

    const lines = (data ?? []).map(o => {
      const icon = statusIcon[o.payment_status] ?? '❓';
      const user = o.users?.fullname ?? o.users?.telegram_id ?? '—';
      const date = new Date(o.created_at).toLocaleDateString();
      return `${icon} *${o.products?.name}* #${o.series?.series_number}\n   👤 ${user}  |  ${date}`;
    }).join('\n\n');

    const totalPages = Math.ceil((count ?? 0) / limit);
    const nav        = [];
    if (page > 0)              nav.push({ text: '◀️ Prev', callback_data: `admin:orders:history:${page - 1}` });
    if (page < totalPages - 1) nav.push({ text: 'Next ▶️', callback_data: `admin:orders:history:${page + 1}` });

    await ctx.editMessageText(
      `📋 *Order History* (${count ?? 0} total) — Page ${page + 1}/${totalPages || 1}\n\n${lines || '—'}`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            nav.length ? nav : [],
            [{ text: '◀️ Dashboard', callback_data: 'admin:dashboard' }],
          ].filter(r => r.length),
        },
      }
    );
  } catch (err) {
    logger.error('handleOrderHistory:', err);
    await ctx.editMessageText(`❌ ${err.message}`);
  }
}

// ── Stale orders (48h+ unpaid) ────────────────────────────────────────────────
export async function handleStaleOrders(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const cutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString();

  try {
    const { data, error } = await supabase
      .from('orders')
      .select('id, created_at, quantity, users(fullname), products(name)')
      .eq('payment_status', 'unpaid')
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true });
    if (error) throw error;

    if (!data?.length) {
      return ctx.editMessageText(
        '✅ No stale orders (all unpaid orders are under 48h).',
        { reply_markup: { inline_keyboard: [[{ text: '◀️ Dashboard', callback_data: 'admin:dashboard' }]] }}
      );
    }

    const lines = data.map(o => {
      const hours = Math.round((Date.now() - new Date(o.created_at)) / 3600000);
      return `⏳ *${o.products?.name}* — ${o.users?.fullname ?? '—'} (${hours}h ago)`;
    }).join('\n');

    await ctx.editMessageText(
      `🗑 *Stale Unpaid Orders* (${data.length})\n\nThese orders are 48h+ old with no payment:\n\n${lines}\n\n` +
      `Tap *Cancel All* to free these slots and notify waiting list users.`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: `❌ Cancel All ${data.length} Orders`, callback_data: 'admin:orders:stale:cancel' }],
            [{ text: '◀️ Dashboard', callback_data: 'admin:dashboard' }],
          ],
        },
      }
    );
  } catch (err) {
    logger.error('handleStaleOrders:', err);
    await ctx.editMessageText(`❌ ${err.message}`);
  }
}

export async function handleCancelStale(ctx) {
  await ctx.answerCbQuery('Cancelling stale orders…').catch(() => {});
  try {
    const { cancelled } = await cancelService.bulkCancelStale(48);
    await ctx.editMessageText(
      `✅ Cancelled ${cancelled} stale order(s).\nWaiting list users have been notified.`,
      { reply_markup: { inline_keyboard: [[{ text: '◀️ Dashboard', callback_data: 'admin:dashboard' }]] }}
    );
  } catch (err) {
    logger.error('handleCancelStale:', err);
    await ctx.editMessageText(`❌ ${err.message}`);
  }
}

// ── Manual job trigger ────────────────────────────────────────────────────────
export async function handleRunJob(ctx, jobName) {
  await ctx.answerCbQuery(`Running ${jobName}…`).catch(() => {});
  try {
    const { scheduler } = await import('../../automation/scheduler.js');
    await scheduler.runNow(jobName);
    await ctx.editMessageText(
      `✅ Job *${jobName}* completed successfully.`,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '◀️ Dashboard', callback_data: 'admin:dashboard' }]] },
      }
    );
  } catch (err) {
    logger.error(`handleRunJob ${jobName}:`, err);
    await ctx.editMessageText(`❌ Job failed: ${err.message}`);
  }
}

// ── Admin force-cancel order ──────────────────────────────────────────────────
export async function handleForceCancelOrder(ctx, orderId) {
  await ctx.answerCbQuery('Cancelling…').catch(() => {});
  try {
    const { order, promoted } = await cancelService.cancel(orderId, 'admin', 'Cancelled by admin');
    const promotedCount = promoted.promoted?.length ?? 0;

    await ctx.editMessageText(
      `✅ Order cancelled.\n` +
      `📊 ${promotedCount > 0 ? `${promotedCount} waiting list user(s) promoted.` : 'No waiting list users to promote.'}`,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '◀️ Dashboard', callback_data: 'admin:dashboard' }]] },
      }
    );
  } catch (err) {
    logger.error('handleForceCancelOrder:', err);
    await ctx.editMessageText(`❌ ${err.message}`);
  }
}

// ── Build dashboard text ──────────────────────────────────────────────────────
function buildDashboardText({ orders, products, payments, series }) {
  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0);
  const topProduct   = products[0];

  const seriesLines = products.slice(0, 5).map(p => {
    // We only have aggregated data here; full series bar shown in series stats
    return `📦 *${p.name}* — ${p.paidOrders} paid | ${formatPrice(p.revenue)}`;
  }).join('\n');

  return (
    `📊 *Admin Dashboard*\n` +
    `━━━━━━━━━━━━━━\n\n` +

    `📦 *Orders Today:* ${orders.todayCount}\n` +
    `✅ Paid: ${orders.paid}  |  🔍 Review: ${orders.pending}  |  ⏳ Unpaid: ${orders.unpaid}\n\n` +

    `📈 *Series:* 🟢 ${series.active} active  |  🔒 ${series.closed} closed\n\n` +

    `💳 *Payments:* ${payments.pending} pending review\n\n` +

    `💰 *Total Revenue:* ${formatPrice(totalRevenue)}\n` +
    `🏆 *Top Product:* ${topProduct ? topProduct.name + ' (' + formatPrice(topProduct.revenue) + ')' : '—'}\n\n` +

    `*Active Products:*\n${seriesLines || '—'}`
  );
}
