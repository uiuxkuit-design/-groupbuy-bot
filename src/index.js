import { createServer } from 'http';
import { createBot }    from './bot/index.js';
import { supabase }     from './config/supabase.js';
import { scheduler }    from './automation/scheduler.js';
import { config }       from './config/env.js';
import logger           from './utils/logger.js';

async function main() {
  logger.info('GROUP-BUY BOT — Starting…');

  const { error } = await supabase.from('admins').select('count').limit(1);
  if (error && error.code !== 'PGRST116') {
    logger.error('Supabase connection failed:', error.message);
    process.exit(1);
  }
  logger.info('Supabase connected ✓');

  const bot = createBot();
  scheduler.start();

  const shutdown = (sig) => {
    logger.info(`${sig} — shutting down…`);
    scheduler.stop();
    bot.stop(sig);
    process.exit(0);
  };
  process.once('SIGINT',  () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  if (config.bot.webhookUrl) {
    // ── PRODUCTION: Webhook mode ──────────────────────────────
    const path = `/webhook/${config.bot.token}`;

    await bot.telegram.setWebhook(`${config.bot.webhookUrl}${path}`);
    logger.info(`Webhook set: ${config.bot.webhookUrl}${path}`);

    const server = createServer(async (req, res) => {
      // Health check endpoint
      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
        return;
      }
      // Webhook handler
      if (req.method === 'POST' && req.url === path) {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            await bot.handleUpdate(JSON.parse(body));
          } catch { /* ignore parse errors */ }
          res.writeHead(200).end('ok');
        });
        return;
      }
      res.writeHead(404).end();
    });

    server.listen(config.bot.webhookPort, () => {
      logger.info(`Server listening on port ${config.bot.webhookPort}`);
      logger.info(`Bot @${bot.botInfo?.username ?? '?'} is live (webhook) ✓`);
    });
  } else {
    // ── DEVELOPMENT: Long polling ─────────────────────────────
    await bot.telegram.deleteWebhook();
    await bot.launch();
    logger.info(`Bot @${bot.botInfo?.username} is live (polling) ✓`);
  }
}

main().catch((err) => {
  logger.error('Fatal startup error:', err);
  process.exit(1);
});
