#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

export async function scanFiles(dir, pattern = /\.(js|tsx?)$/) {
  const files = [];
  async function walk(d, prefix = '') {
    const entries = await readdir(d, { withFileTypes: true });
    for (const e of entries) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory() && e.name !== 'node_modules' && e.name !== '.git') {
        await walk(join(d, e.name), rel);
      } else if (e.isFile() && pattern.test(e.name)) {
        files.push(rel);
      }
    }
  }
  await walk(dir);
  return files;
}

export function findMissing(relativePaths, agentsContent) {
  return relativePaths.filter(p => !agentsContent.includes(p));
}

async function main() {
  const [srcFiles, viewFiles] = await Promise.all([
    scanFiles(join(ROOT, 'src')),
    scanFiles(join(ROOT, 'frontend', 'src', 'views'), /\.tsx$/)
  ]);

  const agentsContent = await readFile(join(ROOT, 'AGENTS.md'), 'utf-8');
  const all = [
    ...srcFiles.map(s => `src/${s}`),
    ...viewFiles.map(v => `frontend/src/views/${v}`)
  ];
  const missing = findMissing(all, agentsContent);

  if (missing.length) {
    console.log('⚠️  Files not registered in AGENTS.md:\n');
    missing.forEach(f => console.log(`   ${f}`));
    console.log(`\n${missing.length} file(s) missing from memory.`);
    process.exit(1);
  }
  console.log('✅ All core files registered in AGENTS.md');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
