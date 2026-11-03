import { expect, test } from 'bun:test';
import { checkAppUpdate } from '../src/app-update.ts';

function response(version: unknown, status = 200) {
  return async () => new Response(JSON.stringify({ version }), { status });
}

test('detects newer stable semantic versions by numeric components', async () => {
  expect(await checkAppUpdate('0.9.0', response('0.10.0'))).toEqual({ version: '0.10.0', currentVersion: '0.9.0' });
  expect(await checkAppUpdate('0.99.99', response('1.0.0'))).toEqual({ version: '1.0.0', currentVersion: '0.99.99' });
  expect(await checkAppUpdate('1.0.0', response('1.0.0'))).toBeNull();
  expect(await checkAppUpdate('1.0.1', response('1.0.0'))).toBeNull();
});

test('does not report malformed versions or unsuccessful responses', async () => {
  expect(await checkAppUpdate('01.0.0', response('2.0.0'))).toBeNull();
  expect(await checkAppUpdate('1.0.0', response('2.0', 200))).toBeNull();
  expect(await checkAppUpdate('1.0.0', response('2.0.0', 503))).toBeNull();
  expect(await checkAppUpdate('1.0.0', async () => new Response('invalid json'))).toBeNull();
});

test('treats network failures as no available update', async () => {
  expect(await checkAppUpdate('1.0.0', async () => { throw new Error('offline'); })).toBeNull();
});
