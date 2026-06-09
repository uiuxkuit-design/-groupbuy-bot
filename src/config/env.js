import 'dotenv/config';

const required = (key) => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env variable: ${key}`);
  return val;
};

export const config = {
  bot: {
    token:       required('BOT_TOKEN'),
    adminIds:    required('ADMIN_IDS').split(',').map(id => parseInt(id.trim(), 10)),
    groupChatId: required('GROUP_CHAT_ID'),
    webhookUrl:  process.env.WEBHOOK_URL || null,
    webhookPort: parseInt(process.env.PORT || '3000', 10),
  },
  supabase: {
    url:        required('SUPABASE_URL'),
    serviceKey: required('SUPABASE_SERVICE_KEY'),
  },
  app: {
    env:      process.env.NODE_ENV ?? 'development',
    logLevel: process.env.LOG_LEVEL ?? 'info',
    lang:     process.env.DEFAULT_LANG ?? 'uz',
  },
};
