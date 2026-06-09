/**
 * PAYMENT SERVICE
 * Handles payment submission, approval, and rejection.
 * On approval: increments series count, triggers auto-close if needed.
 */
import { supabase }       from '../config/supabase.js';
import { orderService }   from './orderService.js';
import { seriesService }  from './seriesService.js';
import { waitingListService } from './waitingListService.js';
import { groupNotifier }  from './groupNotifier.js';
import logger             from '../utils/logger.js';

export const paymentService = {

  /** Submit payment proof. Upserts so user can resubmit. */
  async submit({ orderId, checkImage }) {
    const { data, error } = await supabase
      .from('payments')
      .upsert(
        { order_id: orderId, check_image: checkImage, status: 'pending' },
        { onConflict: 'order_id' }
      )
      .select().single();
    if (error) throw error;

    await orderService.updateStatus(orderId, 'pending_review');
    logger.info(`Payment submitted: order=${orderId}`);
    return data;
  },

  async getByOrder(orderId) {
    const { data, error } = await supabase
      .from('payments').select('*').eq('order_id', orderId).maybeSingle();
    if (error) throw error;
    return data;
  },

  /**
   * Approve a payment.
   * Returns { payment, order, series, closed, nextSeries }
   */
  async approve({ paymentId, adminTelegramId }) {
    // Resolve admin UUID
    const { data: admin } = await supabase
      .from('admins').select('id').eq('telegram_id', adminTelegramId).single();

    const { data: payment, error: pErr } = await supabase
      .from('payments')
      .update({
        status:      'approved',
        approved_by: admin?.id ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', paymentId)
      .select().single();
    if (pErr) throw pErr;

    // Update order status → paid
    const order = await orderService.updateStatus(payment.order_id, 'paid');

    // Increment series + auto-close if target reached + post progress update
    const seriesResult = await seriesService.incrementAndCheck(
      order.series_id,
      order.quantity
    );

    // If a new series opened, notify waiting list users
    if (seriesResult.closed && seriesResult.nextSeries) {
      const waiting = await waitingListService.listByProduct(
        seriesResult.series.product_id
      );
      if (waiting.length) {
        // Get product for the notification
        const { supabase: sb } = await import('../config/supabase.js');
        const { data: product } = await sb
          .from('products').select('*').eq('id', seriesResult.series.product_id).single();

        await groupNotifier.notifyWaitingList(waiting, product, seriesResult.nextSeries);
        logger.info(`Notified ${waiting.length} waiting list users for ${product?.name}`);
      }
    }

    logger.info(`Payment ${paymentId} APPROVED | series closed: ${seriesResult.closed}`);
    return { payment, order, ...seriesResult };
  },

  /**
   * Reject a payment.
   */
  async reject({ paymentId, adminTelegramId, note }) {
    const { data: admin } = await supabase
      .from('admins').select('id').eq('telegram_id', adminTelegramId).single();

    const { data: payment, error } = await supabase
      .from('payments')
      .update({
        status:      'rejected',
        approved_by: admin?.id ?? null,
        reviewed_at: new Date().toISOString(),
        note,
      })
      .eq('id', paymentId)
      .select().single();
    if (error) throw error;

    await orderService.updateStatus(payment.order_id, 'unpaid');
    logger.info(`Payment ${paymentId} REJECTED`);
    return payment;
  },

  /** All payments awaiting review, with full order/user/product context */
  async listPending() {
    const { data, error } = await supabase
      .from('payments')
      .select(`
        *,
        orders(
          id, quantity, size, color, payment_status,
          products(id, name, price, product_code),
          series(series_number, target_count, current_count),
          users(telegram_id, fullname, phone)
        )
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },
};
