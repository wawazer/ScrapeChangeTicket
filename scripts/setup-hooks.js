#!/usr/bin/env node
// Installs .git/hooks/post-merge so git pull triggers the ZEVN banner.
// Safe: no-ops silently when .git/ is absent (CI, Docker, etc.).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hooksDir = path.join(root, '.git', 'hooks');
const hookFile = path.join(hooksDir, 'post-merge');

const HOOK = `#!/bin/sh
node "${path.join(root, 'scripts', 'banner.js').replace(/\\/g, '/')}"
`;

try {
  if (!fs.existsSync(hooksDir)) process.exit(0);
  fs.writeFileSync(hookFile, HOOK, { mode: 0o755 });
  process.stderr.write(`[setup-hooks] post-merge hook installed → ${hookFile}\n`);
} catch (e) {
  process.stderr.write(`[setup-hooks] warn: could not install hook — ${e.message}\n`);
}
