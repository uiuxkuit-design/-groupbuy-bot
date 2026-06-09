-- ================================================================
--  GROUP-BUY BOT — Full Supabase Schema v2
--  Run this entire file in Supabase SQL Editor
-- ================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Enum types ───────────────────────────────────────────────────
CREATE TYPE admin_role            AS ENUM ('super_admin', 'admin', 'moderator');
CREATE TYPE series_status         AS ENUM ('active', 'closed', 'cancelled');
CREATE TYPE payment_status        AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE order_payment_status  AS ENUM ('unpaid', 'pending_review', 'paid', 'refunded');

-- ── users ────────────────────────────────────────────────────────
CREATE TABLE users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT      NOT NULL UNIQUE,
  fullname    TEXT,
  phone       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── admins ───────────────────────────────────────────────────────
CREATE TABLE admins (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT      NOT NULL UNIQUE,
  role        admin_role  NOT NULL DEFAULT 'admin',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── products ─────────────────────────────────────────────────────
CREATE TABLE products (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code TEXT          NOT NULL UNIQUE,
  name         TEXT          NOT NULL,
  image        TEXT,
  price        NUMERIC(12,2) NOT NULL CHECK (price > 0),
  target_count INT           NOT NULL CHECK (target_count > 0),
  deadline     TIMESTAMPTZ,
  is_active    BOOLEAN       NOT NULL DEFAULT TRUE,
  sizes        TEXT[]        NOT NULL DEFAULT '{}',
  colors       TEXT[]        NOT NULL DEFAULT '{}',
  created_by   UUID          NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── series ───────────────────────────────────────────────────────
CREATE TABLE series (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  series_number INT           NOT NULL CHECK (series_number > 0),
  target_count  INT           NOT NULL CHECK (target_count > 0),
  current_count INT           NOT NULL DEFAULT 0,
  status        series_status NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  closed_at     TIMESTAMPTZ,
  CONSTRAINT series_unique UNIQUE (product_id, series_number),
  CONSTRAINT count_le_target CHECK (current_count <= target_count)
);

-- ── orders ───────────────────────────────────────────────────────
CREATE TABLE orders (
  id             UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID                 NOT NULL REFERENCES users(id)    ON DELETE RESTRICT,
  product_id     UUID                 NOT NULL REFERENCES products(id)  ON DELETE RESTRICT,
  series_id      UUID                 NOT NULL REFERENCES series(id)    ON DELETE RESTRICT,
  size           TEXT,
  color          TEXT,
  quantity       INT                  NOT NULL DEFAULT 1 CHECK (quantity > 0),
  payment_status order_payment_status NOT NULL DEFAULT 'unpaid',
  created_at     TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  CONSTRAINT orders_user_series_unique UNIQUE (user_id, series_id)
);

-- ── payments ─────────────────────────────────────────────────────
CREATE TABLE payments (
  id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID           NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  check_image TEXT           NOT NULL,
  status      payment_status NOT NULL DEFAULT 'pending',
  approved_by UUID           REFERENCES admins(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  note        TEXT,
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  CONSTRAINT payments_order_unique UNIQUE (order_id)
);

-- ── waiting_list ─────────────────────────────────────────────────
CREATE TABLE waiting_list (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id        UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  queue_position INT         NOT NULL CHECK (queue_position > 0),
  joined_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wl_product_user_unique UNIQUE (product_id, user_id),
  CONSTRAINT wl_product_pos_unique  UNIQUE (product_id, queue_position)
);

-- ── Indexes ──────────────────────────────────────────────────────
CREATE INDEX idx_users_telegram      ON users(telegram_id);
CREATE INDEX idx_admins_telegram     ON admins(telegram_id);
CREATE INDEX idx_products_code       ON products(product_code);
CREATE INDEX idx_products_active     ON products(is_active);
CREATE INDEX idx_series_product      ON series(product_id);
CREATE INDEX idx_series_status       ON series(status);
CREATE INDEX idx_series_prod_status  ON series(product_id, status);
CREATE INDEX idx_orders_user         ON orders(user_id);
CREATE INDEX idx_orders_product      ON orders(product_id);
CREATE INDEX idx_orders_series       ON orders(series_id);
CREATE INDEX idx_orders_pay_status   ON orders(payment_status);
CREATE INDEX idx_orders_series_pay   ON orders(series_id, payment_status);
CREATE INDEX idx_payments_order      ON payments(order_id);
CREATE INDEX idx_payments_status     ON payments(status);
CREATE INDEX idx_wl_product          ON waiting_list(product_id);
CREATE INDEX idx_wl_user             ON waiting_list(user_id);
CREATE INDEX idx_wl_pos              ON waiting_list(product_id, queue_position);

-- ── updated_at trigger ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_users_upd    BEFORE UPDATE ON users    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_products_upd BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_orders_upd   BEFORE UPDATE ON orders   FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Auto-close series when current_count hits target ─────────────
CREATE OR REPLACE FUNCTION auto_close_series()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.current_count >= NEW.target_count AND NEW.status = 'active' THEN
    NEW.status    = 'closed';
    NEW.closed_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_series_auto_close
  BEFORE UPDATE OF current_count ON series
  FOR EACH ROW EXECUTE FUNCTION auto_close_series();

-- ── Auto queue_position on waiting_list insert ───────────────────
CREATE OR REPLACE FUNCTION assign_queue_position()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE next_pos INT;
BEGIN
  SELECT COALESCE(MAX(queue_position), 0) + 1 INTO next_pos
    FROM waiting_list WHERE product_id = NEW.product_id;
  NEW.queue_position = next_pos;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_wl_queue_pos
  BEFORE INSERT ON waiting_list
  FOR EACH ROW
  WHEN (NEW.queue_position IS NULL OR NEW.queue_position = 0)
  EXECUTE FUNCTION assign_queue_position();

-- ── Views ────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_active_series AS
SELECT
  s.id AS series_id, s.series_number, s.current_count, s.target_count,
  ROUND(s.current_count::NUMERIC / s.target_count * 100, 1) AS pct_filled,
  s.created_at AS series_opened_at,
  p.id AS product_id, p.product_code, p.name AS product_name,
  p.price, p.deadline, p.image, p.sizes, p.colors
FROM series s JOIN products p ON p.id = s.product_id
WHERE s.status = 'active' AND p.is_active = TRUE;

CREATE OR REPLACE VIEW v_pending_payments AS
SELECT
  pay.id AS payment_id, pay.check_image, pay.created_at AS submitted_at,
  o.id AS order_id, o.quantity, o.size, o.color,
  u.telegram_id AS user_telegram_id, u.fullname, u.phone,
  p.name AS product_name, p.product_code, p.price,
  s.series_number
FROM payments pay
JOIN orders o   ON o.id = pay.order_id
JOIN users u    ON u.id = o.user_id
JOIN products p ON p.id = o.product_id
JOIN series s   ON s.id = o.series_id
WHERE pay.status = 'pending'
ORDER BY pay.created_at ASC;

-- ── Row Level Security ───────────────────────────────────────────
ALTER TABLE users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins       ENABLE ROW LEVEL SECURITY;
ALTER TABLE products     ENABLE ROW LEVEL SECURITY;
ALTER TABLE series       ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE waiting_list ENABLE ROW LEVEL SECURITY;

-- ── Seed first admin (replace with your Telegram ID) ─────────────
-- INSERT INTO admins (telegram_id, role) VALUES (123456789, 'super_admin');
