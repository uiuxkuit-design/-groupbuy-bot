// EXCEL EXPORT — buyurtmalarni xlsx formatida chiqarish
import { supabase }    from '../config/supabase.js';
import { formatPrice } from '../utils/helpers.js';
import logger          from '../utils/logger.js';

export const exportService = {
  async ordersToCSV(filter = {}) {
    let query = supabase
      .from('orders')
      .select(`
        id, payment_status, quantity, size, color, created_at, cancel_reason,
        products(name, price, product_code),
        series(series_number),
        users(telegram_id, fullname, phone)
      `)
      .order('created_at', { ascending: false });

    if (filter.status)    query = query.eq('payment_status', filter.status);
    if (filter.productId) query = query.eq('product_id', filter.productId);

    const { data, error } = await query;
    if (error) throw error;

    const rows = [
      ['ID', 'Mahsulot', 'SKU', 'Seriya', 'Foydalanuvchi', 'Telegram ID', 'Tel', 'O\'lcham', 'Rang', 'Miqdor', 'Narx', 'Jami', 'Holat', 'Sana'].join(','),
      ...(data ?? []).map(o => [
        o.id.slice(0, 8),
        `"${o.products?.name ?? ''}"`,
        o.products?.product_code ?? '',
        `#${o.series?.series_number ?? ''}`,
        `"${o.users?.fullname ?? ''}"`,
        o.users?.telegram_id ?? '',
        o.users?.phone ?? '',
        o.size ?? '',
        o.color ?? '',
        o.quantity,
        o.products?.price ?? '',
        ((o.products?.price ?? 0) * o.quantity).toFixed(2),
        o.payment_status,
        new Date(o.created_at).toLocaleDateString('uz'),
      ].join(',')),
    ];

    logger.info(`Export: ${(data ?? []).length} orders`);
    return { csv: rows.join('\n'), count: (data ?? []).length };
  },

  async summaryStats() {
    const { data } = await supabase
      .from('orders')
      .select('payment_status, quantity, products(price)');

    const all = data ?? [];
    const paid = all.filter(o => o.payment_status === 'paid');

    return {
      total:    all.length,
      paid:     paid.length,
      pending:  all.filter(o => o.payment_status === 'pending_review').length,
      unpaid:   all.filter(o => o.payment_status === 'unpaid').length,
      revenue:  paid.reduce((s, o) => s + (o.products?.price ?? 0) * (o.quantity ?? 1), 0),
    };
  },
};
