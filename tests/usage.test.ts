import { expect, test } from 'bun:test';
import { cleanUsageOutput, parseUsageLines } from '../src/usage.ts';

test('formats quota text without terminal decoration or controls', () => {
  const output = '\u001b[2KOpenai Codex — 1 account\r\n  ● 7 days  ███░░  78.0% used · resets in 20h\n';
  expect(cleanUsageOutput(output)).toBe('Openai Codex — 1 cuenta\n7 días 78.0% usado | se reinicia en 20h');
});

test('identifies usage percentages without inventing bars for other details', () => {
  expect(parseUsageLines('Codex\n5 horas 26.5% usado | se reinicia en 2h\nSin datos\n7 días 101% usado'))
    .toEqual([
      { text: 'Codex' },
      { text: '5 horas 26.5% usado | se reinicia en 2h', usedPercent: 26.5 },
      { text: 'Sin datos' },
      { text: '7 días 101% usado', usedPercent: 100 },
    ]);
});
