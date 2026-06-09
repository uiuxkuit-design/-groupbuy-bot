-- ================================================================
--  SCHEMA ADDITIONS for Automation Features
--  Run these ALTER statements after the base schema.
-- ================================================================

-- ── Add reminder_count to orders ─────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS reminder_count  INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancel_reason   TEXT;

-- ── Add deadline_alerts_sent + group_message_id to series ────────
ALTER TABLE series
  ADD COLUMN IF NOT EXISTS deadline_alerts_sent  JSONB,
  ADD COLUMN IF NOT EXISTS group_message_id      BIGINT;    -- Telegram message ID of pinned group card

-- ── RPC: safely increment reminder_count ─────────────────────────
CREATE OR REPLACE FUNCTION increment_reminder_count(order_id UUID)
RETURNS VOID LANGUAGE sql AS $$
  UPDATE orders
  SET reminder_count = COALESCE(reminder_count, 0) + 1
  WHERE id = order_id;
$$;

-- ── Index for stale order queries ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_unpaid_created
  ON orders(created_at)
  WHERE payment_status = 'unpaid';

-- ── Index for deadline watcher ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_series_active_deadline
  ON series(status)
  WHERE status = 'active';

-- ================================================================
--  UPDATED VIEW: v_active_series (includes new columns)
-- ================================================================
CREATE OR REPLACE VIEW v_active_series AS
SELECT
  s.id                                                              AS series_id,
  s.series_number,
  s.current_count,
  s.target_count,
  ROUND(s.current_count::NUMERIC / s.target_count * 100, 1)        AS pct_filled,
  s.group_message_id,
  s.created_at                                                      AS series_opened_at,
  p.id                                                              AS product_id,
  p.product_code,
  p.name                                                            AS product_name,
  p.price,
  p.deadline,
  p.image,
  p.sizes,
  p.colors
FROM series  s
JOIN products p ON p.id = s.product_id
WHERE s.status = 'active'
  AND p.is_active = TRUE;

-- ================================================================
--  UPDATED VIEW: v_order_stats (admin dashboard helper)
-- ================================================================
CREATE OR REPLACE VIEW v_order_stats AS
SELECT
  DATE(o.created_at)                              AS order_date,
  COUNT(*)                                        AS total_orders,
  COUNT(*) FILTER (WHERE o.payment_status = 'paid')           AS paid,
  COUNT(*) FILTER (WHERE o.payment_status = 'pending_review') AS pending_review,
  COUNT(*) FILTER (WHERE o.payment_status = 'unpaid')         AS unpaid,
  COUNT(*) FILTER (WHERE o.payment_status = 'cancelled')      AS cancelled,
  SUM(o.quantity * p.price) FILTER (WHERE o.payment_status = 'paid') AS revenue
FROM orders o
JOIN products p ON p.id = o.product_id
GROUP BY DATE(o.created_at)
ORDER BY order_date DESC;

-- ================================================================
--  UPDATED VIEW: v_best_sellers
-- ================================================================
CREATE OR REPLACE VIEW v_best_sellers AS
SELECT
  p.id,
  p.name,
  p.product_code,
  p.price,
  COUNT(o.id) FILTER (WHERE o.payment_status = 'paid')            AS paid_orders,
  SUM(o.quantity) FILTER (WHERE o.payment_status = 'paid')        AS total_units,
  SUM(o.quantity * p.price) FILTER (WHERE o.payment_status = 'paid') AS total_revenue,
  COUNT(DISTINCT s.id)                                             AS series_count
FROM products p
LEFT JOIN orders  o ON o.product_id = p.id
LEFT JOIN series  s ON s.product_id = p.id
WHERE p.is_active = TRUE
GROUP BY p.id, p.name, p.product_code, p.price
ORDER BY total_revenue DESC NULLS LAST;
