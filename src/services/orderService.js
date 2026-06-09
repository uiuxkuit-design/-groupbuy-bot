import { supabase } from '../config/supabase.js';
import logger from '../utils/logger.js';

export const orderService = {
  async place({ userId, productId, seriesId, size, color, quantity }) {
    // Duplicate check — one active order per user per series
    const { data: existing } = await supabase
      .from('orders')
      .select('id, payment_status')
      .eq('user_id', userId)
      .eq('series_id', seriesId)
      .in('payment_status', ['unpaid', 'pending_review', 'paid'])
      .maybeSingle();
    if (existing) throw new Error('You already have an active order in this series.');

    const { data, error } = await supabase
      .from('orders')
      .insert({ user_id: userId, product_id: productId, series_id: seriesId, size, color, quantity })
      .select().single();
    if (error) throw error;
    logger.info(`Order placed: user=${userId} series=${seriesId}`);
    return data;
  },

  async getById(orderId) {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        products(id, name, price, image, product_code, sizes, colors),
        series(id, series_number, target_count, current_count, status),
        users(id, telegram_id, fullname, phone)
      `)
      .eq('id', orderId)
      .single();
    if (error) throw error;
    return data;
  },

  async listByUser(userId) {
    const { data, error } = await supabase
      .from('orders')
      .select('*, products(name, price, product_code), series(series_number, status)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async listPendingPayment() {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        products(name, price),
        series(series_number),
        users(telegram_id, fullname, phone)
      `)
      .eq('payment_status', 'pending_review')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data;
  },

  async updateStatus(orderId, status) {
    const { data, error } = await supabase
      .from('orders')
      .update({ payment_status: status })
      .eq('id', orderId)
      .select().single();
    if (error) throw error;
    return data;
  },
};
