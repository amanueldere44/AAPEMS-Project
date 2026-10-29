import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendDirectory = path.resolve(scriptDirectory, '..');
const sourceDirectory = path.join(backendDirectory, 'src');

async function collectJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectJavaScriptFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

async function main() {
  const files = await collectJavaScriptFiles(sourceDirectory);

  if (files.length === 0) {
    console.error('No JavaScript source files found.');
    process.exitCode = 1;
    return;
  }

  let failures = 0;

  for (const file of files) {
    const result = spawnSync(
      process.execPath,
      ['--check', file],
      { encoding: 'utf8' },
    );

    if (result.status === 0) {
      console.log(`PASS ${path.relative(backendDirectory, file)}`);
      continue;
    }

    failures += 1;
    console.error(`FAIL ${path.relative(backendDirectory, file)}`);

    if (result.stderr) {
      console.error(result.stderr.trim());
    }

    if (result.error) {
      console.error(result.error.message);
    }
  }

  console.log(
    `\nChecked ${files.length} file(s); ${failures} failure(s).`,
  );

  if (failures > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Source checks could not complete:', error.message);
  process.exitCode = 1;
});