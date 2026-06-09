import { createClient } from '@supabase/supabase-js';
import { config } from './env.js';
import logger from '../utils/logger.js';

export const supabase = createClient(config.supabase.url, config.supabase.serviceKey, {
  auth: { persistSession: false },
});

logger.info('Supabase client initialized');
