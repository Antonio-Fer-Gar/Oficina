import { afterEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyBridgeInstall, planBridgeInstall } from '../src/install.ts';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function setup() {
  const home = mkdtempSync(join(tmpdir(), 'nter-install-')); dirs.push(home);
  const agent = join(home, '.omp', 'agent');
  mkdirSync(join(agent, 'extensions', 'mine'), { recursive: true });
  writeFileSync(join(agent, 'extensions', 'mine', 'index.ts'), 'user extension');
  writeFileSync(join(agent, 'config.yml'), 'theme: dark\n');
  const source = join(home, 'extension.js'); writeFileSync(source, 'bridge v1');
  return { home, agent, source };
}
test('installing twice is idempotent and leaves the profile configuration and other extensions untouched', () => {
  const { home, agent, source } = setup();
  const first = planBridgeInstall({ source, profile: 'default', home });
  expect(first.action).toBe('install');
  applyBridgeInstall(first);
  expect(planBridgeInstall({ source, profile: 'default', home }).action).toBe('unchanged');
  expect(readFileSync(join(agent, 'config.yml'), 'utf8')).toBe('theme: dark\n');
  expect(readFileSync(join(agent, 'extensions', 'mine', 'index.ts'), 'utf8')).toBe('user extension');
  expect(readFileSync(join(agent, 'extensions', 'nter-office', 'index.js'), 'utf8')).toBe('bridge v1');
  expect(readdirSync(agent).sort()).toEqual(['config.yml', 'extensions']);
  writeFileSync(source, 'bridge v2');
  const update = planBridgeInstall({ source, profile: 'default', home });
  expect(update.action).toBe('update');
  applyBridgeInstall(update);
  expect(readFileSync(join(agent, 'extensions', 'nter-office', 'index.js'), 'utf8')).toBe('bridge v2');
});
test('a user-modified or foreign folder is never overwritten or removed', () => {
  const { home, agent, source } = setup();
  applyBridgeInstall(planBridgeInstall({ source, profile: 'default', home }));
  writeFileSync(join(agent, 'extensions', 'nter-office', 'index.js'), 'edited by the user');
  expect(planBridgeInstall({ source, profile: 'default', home }).action).toBe('refuse');
  expect(planBridgeInstall({ source, profile: 'default', home, remove: true }).action).toBe('refuse');
  expect(() => applyBridgeInstall(planBridgeInstall({ source, profile: 'default', home, remove: true }))).toThrow();
  expect(readFileSync(join(agent, 'extensions', 'nter-office', 'index.js'), 'utf8')).toBe('edited by the user');
  const other = setup();
  mkdirSync(join(other.agent, 'extensions', 'nter-office'));
  writeFileSync(join(other.agent, 'extensions', 'nter-office', 'index.js'), 'someone else');
  expect(planBridgeInstall({ source: other.source, profile: 'default', home: other.home }).action).toBe('refuse');
});
test('removal deletes only the bridge and another profile is not touched', () => {
  const { home, agent, source } = setup();
  const work = join(home, '.omp', 'profiles', 'work', 'agent');
  applyBridgeInstall(planBridgeInstall({ source, profile: 'default', home }));
  expect(existsSync(work)).toBe(false);
  applyBridgeInstall(planBridgeInstall({ source, profile: 'work', home }));
  applyBridgeInstall(planBridgeInstall({ source, profile: 'default', home, remove: true }));
  expect(existsSync(join(agent, 'extensions', 'nter-office'))).toBe(false);
  expect(existsSync(join(agent, 'extensions', 'mine', 'index.ts'))).toBe(true);
  expect(readFileSync(join(work, 'extensions', 'nter-office', 'index.js'), 'utf8')).toBe('bridge v1');
  expect(() => planBridgeInstall({ source, profile: '../escape', home })).toThrow();
});
