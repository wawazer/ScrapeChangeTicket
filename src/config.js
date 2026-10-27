import 'dotenv/config';
import path from 'node:path';

const asBool = (value, fallback) => value === undefined ? fallback : value === 'true';
const asInt = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export const config = {
  baseUrl: process.env.SN_BASE_URL || 'https://pelindo.service-now.com',
  loginUrl: `${process.env.SN_BASE_URL || 'https://pelindo.service-now.com'}/portalpelindo?id=landing`,
  username: process.env.SN_USERNAME || '',
  password: process.env.SN_PASSWORD || '',
  headless: asBool(process.env.HEADLESS, false),
  port: asInt(process.env.PORT, 3000),
  maxRetries: asInt(process.env.SN_MAX_RETRIES, 2),
  pageSize: asInt(process.env.SN_PAGE_SIZE, 100),
  checkpointEvery: asInt(process.env.SN_CHECKPOINT_EVERY, 5),
  concurrency: Math.max(1, asInt(process.env.SN_CONCURRENCY, 1)),
  outputDir: path.resolve(process.env.OUTPUT_DIR || 'output'),
  logoPath: path.resolve(process.env.PELINDO_LOGO_PATH || 'assets/pelindo-logo.png')
};
