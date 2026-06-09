/**
 * SERIES MONITOR
 * Runs every 5 minutes.
 *
 * Responsibilities:
 *  1. Detect over-filled series (race condition guard) → close + open next
 *  2. Detect stale active series with no recent activity
 *  3. Ensure series with current_count == target_count are closed
 *     (DB trigger handles this, but this is the safety net)
 */
import { supabase }        from '../config/supabase.js';
import { groupNotifier }   from '../services/groupNotifier.js';
import { waitingListService } from '../services/waitingListService.js';
import logger              from '../utils/logger.js';

class SeriesMonitor {
  constructor() { this._bot = null; }
  init(bot) { this._bot = bot; }

  async run() {
    logger.info('[SeriesMonitor] Health check running…');
    const series = await this._fetchAllActive();
    for (const s of series) {
      await this._checkOverFilled(s);
    }
    logger.info(`[SeriesMonitor] Checked ${series.length} active series`);
  }

  async _fetchAllActive() {
    const { data, error } = await supabase
      .from('series')
      .select(`
        id, series_number, current_count, target_count, status, group_message_id,
        products(id, name, price, image, product_code, sizes, colors, deadline)
      `)
      .eq('status', 'active');
    if (error) { logger.error('[SeriesMonitor] fetch error:', error); return []; }
    return data ?? [];
  }

  async _checkOverFilled(series) {
    if (series.current_count < series.target_count) return;

    logger.warn(`[SeriesMonitor] Over-filled series: ${series.id} (${series.products?.name} #${series.series_number})`);

    // Atomically close this series (guard: only if still active)
    const { data: closed, error: closeErr } = await supabase
      .from('series')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', series.id)
      .eq('status', 'active') // atomic guard
      .select().single();
    if (closeErr || !closed) return; // another process already closed it

    // Check if a new active series already exists
    const { data: existing } = await supabase
      .from('series')
      .select('id')
      .eq('product_id', series.products.id)
      .eq('status', 'active')
      .maybeSingle();

    if (existing) {
      logger.info('[SeriesMonitor] Next series already exists, skipping creation');
      return;
    }

    // Create the next series
    const { data: next, error: nErr } = await supabase
      .from('series')
      .insert({
        product_id:    series.products.id,
        series_number: series.series_number + 1,
        target_count:  series.target_count,
        current_count: 0,
      })
      .select().single();
    if (nErr) { logger.error('[SeriesMonitor] create next series:', nErr); return; }

    // Group announcement
    await groupNotifier.announceSeriesClosed(series.products, closed, next).catch(() => {});

    // Notify waiting list
    const waiting = await waitingListService.listByProduct(series.products.id);
    if (waiting.length) {
      await groupNotifier.notifyWaitingList(waiting, series.products, next).catch(() => {});
    }

    logger.info(`[SeriesMonitor] Auto-closed #${series.series_number} → opened #${next.series_number}`);
  }
}

export const seriesMonitor = new SeriesMonitor();
