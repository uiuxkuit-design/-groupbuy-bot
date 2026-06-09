// BROADCAST — admin barcha userlarga xabar yuboradi
import { supabase }  from '../config/supabase.js';
import logger        from '../utils/logger.js';

let _bot = null;
export const broadcastService = {
  init(bot) { _bot = bot; },

  async send({ message, target = 'all', productId = null }) {
    let users = [];

    if (target === 'all') {
      const { data } = await supabase.from('users').select('telegram_id');
      users = data ?? [];
    } else if (target === 'waiting') {
      const q = supabase.from('waiting_list').select('users(telegram_id)');
      if (productId) q.eq('product_id', productId);
      const { data } = await q;
      users = (data ?? []).map(r => r.users).filter(Boolean);
    } else if (target === 'paid') {
      const { data } = await supabase
        .from('orders')
        .select('users(telegram_id)')
        .eq('payment_status', 'paid');
      const seen = new Set();
      users = (data ?? [])
        .map(r => r.users)
        .filter(u => u && !seen.has(u.telegram_id) && seen.add(u.telegram_id));
    }

    let sent = 0, failed = 0;
    for (const u of users) {
      try {
        await _bot.telegram.sendMessage(u.telegram_id, message, { parse_mode: 'Markdown' });
        sent++;
      } catch { failed++; }
      await new Promise(r => setTimeout(r, 50));
    }

    logger.info(`Broadcast: ${sent} sent, ${failed} failed`);
    return { sent, failed, total: users.length };
  },
};
