export const formatPrice = (price) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price);

export const progressBar = (current, target, len = 10) => {
  const filled = Math.min(Math.round((current / target) * len), len);
  const pct    = Math.round((current / target) * 100);
  return `[${'▓'.repeat(filled)}${'░'.repeat(len - filled)}] ${current}/${target} (${pct}%)`;
};

export const escapeMarkdown = (text) =>
  String(text ?? '').replace(/[_*[\]()~`>#+=|{}.!\-]/g, '\\$&');

export const safeInt = (val) => {
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
};

export const chunk = (arr, size) =>
  arr.reduce((acc, _, i) => (i % size === 0 ? [...acc, arr.slice(i, i + size)] : acc), []);

export const nowLabel = () =>
  new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

export const deadlineLabel = (deadline) => {
  if (!deadline) return '∞ No deadline';
  const d = new Date(deadline);
  const now = new Date();
  const diff = Math.ceil((d - now) / 86400000);
  if (diff < 0)  return '⚠️ Expired';
  if (diff === 0) return '⏰ Today';
  if (diff === 1) return '⏰ Tomorrow';
  return `📅 ${diff} days left`;
};
