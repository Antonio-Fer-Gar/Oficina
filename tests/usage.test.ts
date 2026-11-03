import { expect, test } from 'bun:test';
import { cleanUsageOutput } from '../src/usage.ts';

test('formats quota text without terminal decoration or controls', () => {
  const output = '\u001b[2KOpenai Codex — 1 account\r\n  ● 7 days  ███░░  78.0% used · resets in 20h\n';
  expect(cleanUsageOutput(output)).toBe('Openai Codex — 1 cuenta\n7 días 78.0% usado | se reinicia en 20h');
});
