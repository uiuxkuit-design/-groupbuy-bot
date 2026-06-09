/**
 * SCHEDULER — Central cron/interval engine
 * Runs all background automation tasks.
 *
 * Jobs registered:
 *  • paymentReminders    — every 6h: nudge unpaid orders
 *  • deadlineCountdown   — every 1h: low-time alerts (48h, 24h, 6h)
 *  • seriesHealthCheck   — every 5m: detect stale or over-filled series
 *  • dailyStats          — every day at 09:00: post stats to admin(s)
 */
import { supabase }         from '../config/supabase.js';
import { paymentReminder }  from './paymentReminder.js';
import { deadlineWatcher }  from './deadlineWatcher.js';
import { seriesMonitor }    from './seriesMonitor.js';
import { statsReporter }    from './statsReporter.js';
import logger               from '../utils/logger.js';

class Scheduler {
  constructor() {
    this._jobs    = new Map();   // name → intervalId
    this._bot     = null;
    this._running = false;
  }

  init(bot) {
    this._bot = bot;
    paymentReminder.init(bot);
    deadlineWatcher.init(bot);
    seriesMonitor.init(bot);
    statsReporter.init(bot);
    logger.info('Scheduler initialized');
  }

  start() {
    if (this._running) return;
    this._running = true;

    // Every 5 minutes — series health (catch over-count, open stale series)
    this._register('seriesHealth', 5 * 60 * 1000, () => seriesMonitor.run());

    // Every 6 hours — payment reminders for unpaid orders
    this._register('paymentReminders', 6 * 60 * 60 * 1000, () => paymentReminder.run());

    // Every 1 hour — deadline countdown alerts
    this._register('deadlineCountdown', 60 * 60 * 1000, () => deadlineWatcher.run());

    // Every 24 hours — daily stats report (first tick at next 09:00)
    this._scheduleDailyAt(9, 0, () => statsReporter.runDaily());

    logger.info('Scheduler started — all jobs active');
  }

  stop() {
    for (const [name, id] of this._jobs) {
      clearInterval(id);
      clearTimeout(id);
      logger.info(`Job stopped: ${name}`);
    }
    this._jobs.clear();
    this._running = false;
  }

  /** Run a job immediately (useful for testing / manual trigger) */
  async runNow(jobName) {
    const jobs = {
      paymentReminders: () => paymentReminder.run(),
      deadlineCountdown: () => deadlineWatcher.run(),
      seriesHealth: () => seriesMonitor.run(),
      dailyStats: () => statsReporter.runDaily(),
    };
    if (!jobs[jobName]) throw new Error(`Unknown job: ${jobName}`);
    logger.info(`Manual trigger: ${jobName}`);
    return jobs[jobName]();
  }

  _register(name, intervalMs, fn) {
    const wrapped = async () => {
      try {
        await fn();
      } catch (err) {
        logger.error(`Scheduler job "${name}" failed:`, err);
      }
    };
    // First run after a short delay so the bot is fully up
    const initial = setTimeout(wrapped, 10_000);
    const id      = setInterval(wrapped, intervalMs);
    this._jobs.set(name, id);
    // Store timeout too so we can clear it
    setTimeout(() => {}, 0); // flush
    logger.info(`Job registered: ${name} every ${intervalMs / 1000}s`);
  }

  _scheduleDailyAt(hour, minute, fn) {
    const now   = new Date();
    const next  = new Date();
    next.setHours(hour, minute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const msUntil = next - now;

    const timeout = setTimeout(() => {
      fn().catch(err => logger.error('Daily stats job failed:', err));
      // After first run, repeat every 24h
      const id = setInterval(
        () => fn().catch(err => logger.error('Daily stats job failed:', err)),
        24 * 60 * 60 * 1000
      );
      this._jobs.set('dailyStats', id);
    }, msUntil);

    this._jobs.set('dailyStats_init', timeout);
    logger.info(`Daily stats scheduled at ${hour}:${String(minute).padStart(2,'0')} (in ${Math.round(msUntil/60000)}min)`);
  }
}

export const scheduler = new Scheduler();
