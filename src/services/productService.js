import { supabase } from '../config/supabase.js';
import logger from '../utils/logger.js';

export const productService = {
  async create({ name, productCode, image, price, targetCount, deadline, sizes, colors, adminId }) {
    const { data: admin } = await supabase
      .from('admins').select('id').eq('telegram_id', adminId).single();
    if (!admin) throw new Error('Admin not found. Run /setup first.');

    const { data: product, error: pErr } = await supabase
      .from('products')
      .insert({
        name,
        product_code:  productCode,
        image:         image || null,
        price,
        target_count:  targetCount,
        deadline:      deadline || null,
        sizes:         sizes  || [],
        colors:        colors || [],
        created_by:    admin.id,
      })
      .select().single();
    if (pErr) throw pErr;

    // Auto-create Series #1
    const { data: series, error: sErr } = await supabase
      .from('series')
      .insert({
        product_id:    product.id,
        series_number: 1,
        target_count:  targetCount,
        current_count: 0,
      })
      .select().single();
    if (sErr) throw sErr;

    logger.info(`Product created: "${name}" (${product.id}), Series #1 opened`);
    return { product, series };
  },

  async listActive() {
    const { data, error } = await supabase
      .from('products')
      .select('*, series(id, series_number, target_count, current_count, status)')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async getById(productId) {
    const { data, error } = await supabase
      .from('products')
      .select('*, series(id, series_number, target_count, current_count, status, created_at, closed_at, orders(id, payment_status))')
      .eq('id', productId)
      .single();
    if (error) throw error;
    return data;
  },

  async deactivate(productId) {
    const { error } = await supabase
      .from('products').update({ is_active: false }).eq('id', productId);
    if (error) throw error;
    logger.info(`Product deactivated: ${productId}`);
  },
};
