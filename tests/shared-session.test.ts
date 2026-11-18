import { expect, test } from 'bun:test';
import { controlLink } from '../src/shared-session.ts';

const url = 'https://relay.example/#room.token';
const reply = { version: 1, access: 'control', generation: 1, url };

test('copies only a browser control link for the first room of the new process', () => {
  expect(controlLink(JSON.stringify(reply))).toBe(url);
  for (const invalid of [{ access: 'view' }, { generation: 2 }, { url: 'javascript:alert(1)' }, { url: 'https://relay.example/' }]) {
    expect(controlLink(JSON.stringify({ ...reply, ...invalid }))).toBeNull();
  }
  expect(controlLink('not JSON')).toBeNull();
});
