/**
 * STATS REPORTER
 * Posts a daily summary to all admins.
 * Also provides on-demand analytics data for the dashboard.
 */
import { supabase }        from '../config/supabase.js';
import { formatPrice, progressBar } from '../utils/helpers.js';
import { config }          from '../config/env.js';
import logger              from '../utils/logger.js';

class StatsReporter {
  constructor() { this._bot = null; }
  init(bot) { this._bot = bot; }

  /** Called by the scheduler every day at 09:00 */
  async runDaily() {
    logger.info('[StatsReporter] Generating daily report…');
    const report = await this.generateReport();
    const text   = this._formatReport(report);

    for (const adminId of config.bot.adminIds) {
      try {
        await this._bot.telegram.sendMessage(adminId, text, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[
            { text: '📊 Full Dashboard', callback_data: 'admin:dashboard' },
            { text: '💳 Pending Payments', callback_data: 'admin:payments:pending' },
          ]]},
        });
      } catch { /* admin blocked */ }
      await sleep(100);
    }
    logger.info('[StatsReporter] Daily report sent');
  }

  /** Build full statistics object */
  async generateReport() {
    const [orders, products, payments, series] = await Promise.all([
      this._getOrderStats(),
      this._getProductStats(),
      this._getPaymentStats(),
      this._getSeriesStats(),
    ]);
    return { orders, products, payments, series, generatedAt: new Date().toISOString() };
  }

  async _getOrderStats() {
    const { data } = await supabase
      .from('orders')
      .select('payment_status, quantity, created_at');
    const all      = data ?? [];
    const today    = new Date(); today.setHours(0,0,0,0);
    const todayOrders = all.filter(o => new Date(o.created_at) >= today);

    return {
      total:          all.length,
      paid:           all.filter(o => o.payment_status === 'paid').length,
      pending:        all.filter(o => o.payment_status === 'pending_review').length,
      unpaid:         all.filter(o => o.payment_status === 'unpaid').length,
      todayCount:     todayOrders.length,
      totalQuantity:  all.reduce((s, o) => s + (o.quantity ?? 1), 0),
    };
  }

  async _getProductStats() {
    const { data } = await supabase
      .from('products')
      .select(`
        id, name, price, target_count,
        orders(id, payment_status, quantity)
      `)
      .eq('is_active', true);
    const all = data ?? [];

    return all.map(p => {
      const paid  = p.orders?.filter(o => o.payment_status === 'paid') ?? [];
      const total = paid.reduce((s, o) => s + (o.quantity ?? 1), 0);
      return {
        id:       p.id,
        name:     p.name,
        price:    p.price,
        revenue:  total * p.price,
        paidOrders: paid.length,
        totalQuantity: total,
      };
    }).sort((a, b) => b.revenue - a.revenue);
  }

  async _getPaymentStats() {
    const { data } = await supabase
      .from('payments')
      .select('status, created_at');
    const all = data ?? [];
    return {
      pending:  all.filter(p => p.status === 'pending').length,
      approved: all.filter(p => p.status === 'approved').length,
      rejected: all.filter(p => p.status === 'rejected').length,
    };
  }

  async _getSeriesStats() {
    const { data } = await supabase
      .from('series')
      .select('id, series_number, status, current_count, target_count, product_id');
    const all = data ?? [];
    return {
      active: all.filter(s => s.status === 'active').length,
      closed: all.filter(s => s.status === 'closed').length,
      total:  all.length,
    };
  }

  _formatReport({ orders, products, payments, series }) {
    const date = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const topProducts = products.slice(0, 5).map((p, i) => {
      const medal = ['🥇','🥈','🥉'][i] ?? `${i+1}.`;
      return `${medal} *${p.name}* — ${formatPrice(p.revenue)} (${p.paidOrders} orders)`;
    }).join('\n');

    const totalRevenue = products.reduce((s, p) => s + p.revenue, 0);

    return (
      `📊 *Daily Report — ${date}*\n` +
      `━━━━━━━━━━━━━━\n\n` +

      `📦 *Orders*\n` +
      `• Total: ${orders.total} | Today: ${orders.todayCount}\n` +
      `• ✅ Paid: ${orders.paid} | 🔍 Review: ${orders.pending} | ⏳ Unpaid: ${orders.unpaid}\n\n` +

      `💳 *Payments*\n` +
      `• ✅ Approved: ${payments.approved} | ❌ Rejected: ${payments.rejected}\n` +
      `• 🔍 Pending review: ${payments.pending}\n\n` +

      `📈 *Series*\n` +
      `• 🟢 Active: ${series.active} | 🔒 Closed: ${series.closed}\n\n` +

      `💰 *Revenue*\n` +
      `• Total (paid orders): ${formatPrice(totalRevenue)}\n\n` +

      `🏆 *Top Products*\n${topProducts || '—'}`
    );
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
export const statsReporter = new StatsReporter();
