import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const temporary = await mkdtemp(join(tmpdir(), 'day-canvas-tests-'));
try {
	const outfile = join(temporary, 'tests.cjs');
	await build({ entryPoints: ['tests/core.test.ts'], outfile, bundle: true, platform: 'node', format: 'cjs', alias: { obsidian: resolve('tests/obsidian.ts') } });
	const result = spawnSync(process.execPath, [outfile], { stdio: 'inherit' });
	if (result.error) throw result.error;
	process.exitCode = result.status ?? 1;
} finally { await rm(temporary, { recursive: true, force: true }); }
