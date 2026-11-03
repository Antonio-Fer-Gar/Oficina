import { afterEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installTerminalCommand, removeTerminalCommand } from '../src/terminal-launcher.ts';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'nter-terminal-')); dirs.push(root);
  const bin = join(root, 'bin'), state = join(root, 'data', 'terminal-command.json');
  mkdirSync(bin);
  const executable = join(root, 'Oficina nter.exe'); writeFileSync(executable, 'test executable');
  return { root, bin, state, executable, command: join(bin, 'oficina.cmd') };
}

test('a foreign command is not overwritten or removed', () => {
  const { bin, state, executable, command } = setup();
  writeFileSync(command, 'user command');
  expect(() => installTerminalCommand(executable, bin, state)).toThrow();
  removeTerminalCommand(executable, bin, state);
  expect(readFileSync(command, 'utf8')).toBe('user command');
  expect(existsSync(state)).toBe(false);
});

test('updates are idempotent, old uninstallers cannot remove a relocated installation, and unrelated commands survive', () => {
  const { root, bin, state, executable, command } = setup();
  writeFileSync(join(bin, 'another.cmd'), 'another tool');
  installTerminalCommand(executable, bin, state);
  installTerminalCommand(executable, bin, state);
  const relocated = join(root, 'Otra ubicacion con espacio y ñ % !'); mkdirSync(relocated);
  const current = join(relocated, 'Oficina nter.exe'); writeFileSync(current, 'new executable');
  installTerminalCommand(current, bin, state);
  removeTerminalCommand(executable, bin, state);
  expect(existsSync(command)).toBe(true);
  expect(JSON.parse(readFileSync(state, 'utf8')).executable).toBe(current);
  removeTerminalCommand(current, bin, state);
  expect(existsSync(command)).toBe(false);
  expect(existsSync(state)).toBe(false);
  expect(readFileSync(join(bin, 'another.cmd'), 'utf8')).toBe('another tool');
});

test('a command modified after installation survives update and uninstall', () => {
  const { bin, state, executable, command } = setup();
  installTerminalCommand(executable, bin, state);
  writeFileSync(command, 'my customized command');
  expect(() => installTerminalCommand(executable, bin, state)).toThrow();
  expect(() => removeTerminalCommand(executable, bin, state)).toThrow();
  expect(readFileSync(command, 'utf8')).toBe('my customized command');
});
