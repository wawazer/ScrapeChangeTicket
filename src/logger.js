const secretWords = /password|cookie|token|authorization|secret/i;

export function log(level, message, context = {}) {
  const safe = Object.fromEntries(Object.entries(context).filter(([key]) => !secretWords.test(key)));
  const suffix = Object.keys(safe).length ? ` ${JSON.stringify(safe)}` : '';
  console[level](`[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}${suffix}`);
}

export const info = (message, context) => log('info', message, context);
export const warn = (message, context) => log('warn', message, context);
export const error = (message, context) => log('error', message, context);
