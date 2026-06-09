import { Markup } from 'telegraf';
import { chunk } from '../utils/helpers.js';

// ── Admin keyboards ──────────────────────────────────────────
export const adminMainMenu = () => Markup.inlineKeyboard([
  [Markup.button.callback('➕ New Product',       'admin:product:new')],
  [Markup.button.callback('📦 My Products',       'admin:products:list')],
  [Markup.button.callback('💳 Pending Payments',  'admin:payments:pending')],
  [Markup.button.callback('📊 Dashboard',         'admin:dashboard')],
]);

export const adminProductActions = (productId) => Markup.inlineKeyboard([
  [Markup.button.callback('📢 Publish to Group',  `admin:product:publish:${productId}`)],
  [Markup.button.callback('📊 Stats',             `admin:product:stats:${productId}`)],
  [Markup.button.callback('🔴 Deactivate',        `admin:product:deactivate:${productId}`)],
  [Markup.button.callback('◀️ Back',              'admin:products:list')],
]);

export const adminPaymentActions = (paymentId) => Markup.inlineKeyboard([
  [
    Markup.button.callback('✅ Approve', `admin:payment:approve:${paymentId}`),
    Markup.button.callback('❌ Reject',  `admin:payment:reject:${paymentId}`),
  ],
  [Markup.button.callback('◀️ Pending List', 'admin:payments:pending')],
]);

export const adminSizeColors = (options, selectedKey, callbackPrefix) => {
  const buttons = options.map(o =>
    Markup.button.callback(
      selectedKey?.includes(o) ? `✓ ${o}` : o,
      `${callbackPrefix}:${o}`
    )
  );
  const rows = chunk(buttons, 3);
  rows.push([Markup.button.callback('✅ Done', `${callbackPrefix}:__done__`)]);
  return Markup.inlineKeyboard(rows);
};

export const adminConfirmPublish = (productId) => Markup.inlineKeyboard([
  [
    Markup.button.callback('📢 Yes, Publish', `admin:product:publish:confirm:${productId}`),
    Markup.button.callback('Cancel',          `admin:product:stats:${productId}`),
  ],
]);

// ── User / Order keyboards ───────────────────────────────────
export const sizeKeyboard = (sizes, productId) => {
  const buttons = sizes.map(s =>
    Markup.button.callback(s, `user:size:${productId}:${s}`)
  );
  return Markup.inlineKeyboard([...chunk(buttons, 3), [Markup.button.callback('◀️ Cancel', 'user:cancel')]]);
};

export const colorKeyboard = (colors, productId, size) => {
  const buttons = colors.map(c =>
    Markup.button.callback(c, `user:color:${productId}:${size}:${c}`)
  );
  return Markup.inlineKeyboard([...chunk(buttons, 3), [Markup.button.callback('◀️ Back', `group:order:${productId}`)]]);
};

export const quantityKeyboard = (productId, size, color) => Markup.inlineKeyboard([
  [1, 2, 3].map(q => Markup.button.callback(`${q}`, `user:qty:${productId}:${size}:${color}:${q}`)),
  [4, 5].map(q  => Markup.button.callback(`${q}`, `user:qty:${productId}:${size}:${color}:${q}`)),
  [Markup.button.callback('◀️ Back', `user:size:back:${productId}`)],
]);

export const paymentConfirm = (orderId) => Markup.inlineKeyboard([
  [Markup.button.callback('📎 Upload Payment Proof', `user:payment:upload:${orderId}`)],
  [Markup.button.callback('❌ Cancel Order',         `user:order:cancel:${orderId}`)],
]);

export const myOrdersList = (orders) => {
  const statusIcon = { unpaid: '⏳', pending_review: '🔍', paid: '✅', refunded: '↩️' };
  const buttons = orders.map(o => [
    Markup.button.callback(
      `${statusIcon[o.payment_status] ?? '❓'} ${o.products?.name ?? 'Order'} #${o.series?.series_number}`,
      `user:order:view:${o.id}`
    )
  ]);
  buttons.push([Markup.button.callback('🏠 Main Menu', 'user:main')]);
  return Markup.inlineKeyboard(buttons);
};

export const waitingListKeyboard = (productId, isOnList) => Markup.inlineKeyboard([
  isOnList
    ? [Markup.button.callback('❌ Leave Waiting List', `user:wait:leave:${productId}`)]
    : [Markup.button.callback('⏳ Join Waiting List',  `user:wait:join:${productId}`)],
  [Markup.button.callback('◀️ Back', 'user:main')],
]);

export const backToMain = () => Markup.inlineKeyboard([[Markup.button.callback('🏠 Main Menu', 'user:main')]]);
export const backToAdmin = () => Markup.inlineKeyboard([[Markup.button.callback('◀️ Admin Panel', 'admin:main')]]);
