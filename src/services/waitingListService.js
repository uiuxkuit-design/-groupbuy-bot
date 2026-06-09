import { supabase } from '../config/supabase.js';
import logger from '../utils/logger.js';

export const waitingListService = {
  async join(userId, productId) {
    // Check if already on list
    const { data: existing } = await supabase
      .from('waiting_list')
      .select('id, queue_position')
      .eq('user_id', userId)
      .eq('product_id', productId)
      .maybeSingle();
    if (existing) return { ...existing, alreadyJoined: true };

    // Get next position
    const { count } = await supabase
      .from('waiting_list')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', productId);

    const { data, error } = await supabase
      .from('waiting_list')
      .insert({ user_id: userId, product_id: productId, queue_position: (count ?? 0) + 1 })
      .select().single();
    if (error) throw error;
    logger.info(`User ${userId} joined waiting list for product ${productId} at position ${data.queue_position}`);
    return data;
  },

  async leave(userId, productId) {
    const { error } = await supabase
      .from('waiting_list')
      .delete()
      .eq('user_id', userId)
      .eq('product_id', productId);
    if (error) throw error;
  },

  async listByProduct(productId) {
    const { data, error } = await supabase
      .from('waiting_list')
      .select('*, users(telegram_id, fullname)')
      .eq('product_id', productId)
      .order('queue_position', { ascending: true });
    if (error) throw error;
    return data;
  },

  async getPosition(userId, productId) {
    const { data } = await supabase
      .from('waiting_list')
      .select('queue_position')
      .eq('user_id', userId)
      .eq('product_id', productId)
      .maybeSingle();
    return data?.queue_position ?? null;
  },

  async isOnList(userId, productId) {
    const { data } = await supabase
      .from('waiting_list')
      .select('id')
      .eq('user_id', userId)
      .eq('product_id', productId)
      .maybeSingle();
    return !!data;
  },
};
