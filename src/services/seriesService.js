/**
 * SERIES SERVICE
 * Manages series lifecycle:
 *   - Get active series for a product
 *   - Increment count after payment approval
 *   - Auto-close + open next series when target reached
 *   - Post live group progress updates
 */
import { supabase }      from '../config/supabase.js';
import { groupNotifier } from './groupNotifier.js';
import logger            from '../utils/logger.js';

export const seriesService = {

  async getActive(productId) {
    const { data, error } = await supabase
      .from('series')
      .select('*')
      .eq('product_id', productId)
      .eq('status', 'active')
      .order('series_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async getById(seriesId) {
    const { data, error } = await supabase
      .from('series').select('*').eq('id', seriesId).single();
    if (error) throw error;
    return data;
  },

  /**
   * Increment series count after payment approval.
   * Closes series + opens next one if target reached.
   * Posts live group progress update.
   *
   * @returns {{ series, closed, nextSeries }}
   */
  async incrementAndCheck(seriesId, quantity = 1) {
    const { data: series, error: fErr } = await supabase
      .from('series').select('*, products(*)').eq('id', seriesId).single();
    if (fErr) throw fErr;

    const newCount  = series.current_count + quantity;
    const willClose = newCount >= series.target_count;

    const { data: updated, error: uErr } = await supabase
      .from('series')
      .update({
        current_count: Math.min(newCount, series.target_count),
        ...(willClose ? { status: 'closed', closed_at: new Date().toISOString() } : {}),
      })
      .eq('id', seriesId)
      .select().single();
    if (uErr) throw uErr;

    let nextSeries = null;

    if (willClose) {
      // ── Auto-open next series ───────────────────────────────
      const { data: next, error: nErr } = await supabase
        .from('series')
        .insert({
          product_id:    series.product_id,
          series_number: series.series_number + 1,
          target_count:  series.target_count,
          current_count: 0,
        })
        .select().single();
      if (nErr) throw nErr;
      nextSeries = next;

      // ── Group announcements ─────────────────────────────────
      const product = series.products;
      await groupNotifier.announceSeriesClosed(product, updated, next).catch(() => {});

      logger.info(`Series #${series.series_number} CLOSED → Series #${next.series_number} OPENED (${product?.name})`);
    } else {
      // ── Live progress update ────────────────────────────────
      const product = series.products;
      await groupNotifier.postProgressUpdate(product, updated).catch(() => {});
    }

    return { series: updated, closed: willClose, nextSeries };
  },

  /**
   * Decrement count when a paid order is cancelled.
   * Re-opens a closed series if count drops below target.
   */
  async decrementCount(seriesId, quantity = 1) {
    const { data: series, error: fErr } = await supabase
      .from('series').select('*').eq('id', seriesId).single();
    if (fErr) throw fErr;

    const newCount          = Math.max(0, series.current_count - quantity);
    const wasClosedNowOpen  = series.status === 'closed' && newCount < series.target_count;

    const { data: updated, error: uErr } = await supabase
      .from('series')
      .update({
        current_count: newCount,
        ...(wasClosedNowOpen ? { status: 'active', closed_at: null } : {}),
      })
      .eq('id', seriesId)
      .select().single();
    if (uErr) throw uErr;

    logger.info(`Series ${seriesId} decremented: ${series.current_count} → ${newCount}${wasClosedNowOpen ? ' (REOPENED)' : ''}`);
    return { series: updated, reopened: wasClosedNowOpen };
  },

  async listByProduct(productId) {
    const { data, error } = await supabase
      .from('series')
      .select('*, orders(id, payment_status)')
      .eq('product_id', productId)
      .order('series_number', { ascending: true });
    if (error) throw error;
    return data;
  },
};
