import { supabase } from '../config/supabase.js';
import logger from '../utils/logger.js';

export const userService = {
  async upsert({ telegramId, fullname, phone }) {
    const { data, error } = await supabase
      .from('users')
      .upsert({ telegram_id: telegramId, fullname, phone }, { onConflict: 'telegram_id' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getByTelegramId(telegramId) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async getById(id) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },
};
