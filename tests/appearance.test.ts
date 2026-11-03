import { expect, test } from 'bun:test';
import { AppearanceSchema, DEFAULT_APPEARANCE } from '../src/office/appearance.ts';

test('la temática predeterminada es robots y se conserva la opción explícita de animales', () => {
  const old = { breed: 'dachshund', outfits: DEFAULT_APPEARANCE.outfits };
  const parsed = AppearanceSchema.parse({ ...old, theme: 'robots' });
  expect(parsed.theme).toBe('robots');
  expect(parsed.breed).toBe('dachshund');
  expect(parsed.outfits).toEqual(old.outfits);
  expect(AppearanceSchema.parse(old).theme).toBe('robots');
  expect(AppearanceSchema.parse({ ...old, theme: 'animals' }).theme).toBe('animals');
  expect(AppearanceSchema.safeParse({ ...old, theme: 'incorrecto' }).success).toBe(false);
});

test('legacy appearances are normalized with robot and human defaults', () => {
  const legacy = { breed: 'dachshund' as const, outfits: DEFAULT_APPEARANCE.outfits };
  expect(AppearanceSchema.parse(legacy)).toEqual({
    ...legacy,
    theme: 'robots',
    robotColors: { agent: 'blue', subagent: 'orange' },
    human: { skin: 'medium', hair: 'brown', style: 'short', gender: 'man' },
  });
});

test('robot and human appearance choices are validated and retained', () => {
  const appearance = {
    ...DEFAULT_APPEARANCE,
    theme: 'robots',
    robotColors: { agent: 'mint', subagent: 'purple' },
    human: { skin: 'dark', hair: 'blond', style: 'long', gender: 'woman' },
  } as const;
  expect(AppearanceSchema.parse(appearance)).toEqual(appearance);
  expect(AppearanceSchema.safeParse({ ...appearance, robotColors: { ...appearance.robotColors, agent: 'lime' } }).success).toBe(false);
  expect(AppearanceSchema.safeParse({ ...appearance, human: { ...appearance.human, style: 'mohawk' } }).success).toBe(false);
  expect(AppearanceSchema.safeParse({ ...appearance, human: { ...appearance.human, gender: 'unknown' } }).success).toBe(false);
});

test('saved human appearance without gender retains skin and hair preferences', () => {
  const legacy = { ...DEFAULT_APPEARANCE, human: { skin: 'dark', hair: 'gray', style: 'long' } } as const;
  expect(AppearanceSchema.parse(legacy).human).toEqual({ ...legacy.human, gender: 'man' });
});
