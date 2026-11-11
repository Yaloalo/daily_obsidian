import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const manifest = read('manifest.json');
const pkg = read('package.json');
const versions = read('versions.json');
assert.equal(manifest.id, 'weekly-routine-board', 'Keep the existing community plugin identity');
assert.equal(manifest.version, pkg.version, 'Package and manifest versions must match');
assert.equal(versions[manifest.version], manifest.minAppVersion, 'Compatibility entry must match');
if (process.env.GITHUB_REF_TYPE === 'tag') {
  assert.equal(process.env.GITHUB_REF_NAME, manifest.version, 'Obsidian release tag must exactly match the manifest version');
}
console.log(`Release ${manifest.version} metadata verified.`);
