import { expect, test } from 'bun:test';
import { createPendingQuestion, raceAsk } from '../src/bridge/questions.ts';
import type { PendingQuestion } from '../src/bridge/protocol.ts';

const questions: PendingQuestion['questions'] = [
  { id: 'mode', question: 'Which mode?', options: [{ label: 'Fast' }, { label: 'Safe' }] },
  { id: 'detail', question: 'Include details?', options: [{ label: 'Yes' }, { label: 'No' }] },
];

test('accepts only the matching ordered answer set once', async () => {
  const pending = createPendingQuestion('request-1', questions);
  const answers = [
    { id: 'mode', selectedOptions: ['Safe'] },
    { id: 'detail', selectedOptions: ['Yes'] },
  ];

  expect(pending.submit('old-request', answers)).toMatchObject({ ok: false, code: 'stale' });
  expect(pending.submit('request-1', [answers[0]!])).toMatchObject({ ok: false, code: 'invalid' });
  expect(pending.submit('request-1', answers)).toEqual({ ok: true });
  expect(await pending.response).toEqual(answers);
  expect(pending.submit('request-1', answers)).toMatchObject({ ok: false, code: 'stale' });
});

test('rejects reordered questions, unknown labels, duplicate choices, and multiple single-select choices', () => {
  expect(createPendingQuestion('r', questions).submit('r', [
    { id: 'detail', selectedOptions: ['Yes'] }, { id: 'mode', selectedOptions: ['Fast'] },
  ])).toMatchObject({ ok: false, code: 'invalid' });
  expect(createPendingQuestion('r', [questions[0]!]).submit('r', [
    { id: 'mode', selectedOptions: ['Unknown'] },
  ])).toMatchObject({ ok: false, code: 'invalid' });
  expect(createPendingQuestion('r', [questions[0]!]).submit('r', [
    { id: 'mode', selectedOptions: ['Fast', 'Fast'] },
  ])).toMatchObject({ ok: false, code: 'invalid' });
  expect(createPendingQuestion('r', [questions[0]!]).submit('r', [
    { id: 'mode', selectedOptions: ['Fast', 'Safe'] },
  ])).toMatchObject({ ok: false, code: 'invalid' });
});

test('accepts multiple distinct labels for a multi-select question', async () => {
  const multi = createPendingQuestion('multi', [
    { id: 'mode', question: 'Which modes?', multi: true, options: [{ label: 'Fast' }, { label: 'Safe' }] },
  ]);
  const answers = [{ id: 'mode', selectedOptions: ['Fast', 'Safe'] }];
  expect(multi.submit('multi', answers)).toEqual({ ok: true });
  expect(await multi.response).toEqual(answers);
});

test('supports single-question free text but directs batch messages to structured answers', async () => {
  const single = createPendingQuestion('single', [questions[0]!]);
  expect(single.submitMessage('single', 'Make it quieter')).toEqual({ ok: true });
  expect(await single.response).toEqual([{ id: 'mode', selectedOptions: [], customInput: 'Make it quieter' }]);

  expect(createPendingQuestion('batch', questions).submitMessage('batch', 'reply')).toEqual({
    ok: false, code: 'invalid', message: 'Usa el formulario de preguntas para responder varias preguntas',
  });
});

test('aborts only the local native dialog when the office answer wins', async () => {
  const pending = createPendingQuestion('race', [questions[0]!]);
  const native = Promise.withResolvers<string>();
  let aborted = false;
  const result = raceAsk(native.promise, pending.response, () => { aborted = true; });
  pending.submit('race', [{ id: 'mode', selectedOptions: ['Fast'] }]);

  expect(await result).toEqual({ kind: 'office', answers: [{ id: 'mode', selectedOptions: ['Fast'] }] });
  expect(aborted).toBe(true);
});

test('keeps the console result when the native dialog wins', async () => {
  const pending = createPendingQuestion('race', [questions[0]!]);
  const native = Promise.withResolvers<string>();
  let aborted = false;
  const result = raceAsk(native.promise, pending.response, () => { aborted = true; });
  native.resolve('console answer');

  expect(await result).toEqual({ kind: 'native', result: 'console answer' });
  expect(aborted).toBe(false);
  pending.cancel();
  expect(pending.submit('race', [{ id: 'mode', selectedOptions: ['Fast'] }])).toMatchObject({ ok: false, code: 'stale' });
});
