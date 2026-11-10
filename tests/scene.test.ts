import { expect, test } from 'bun:test';
import { computeLayout, hitTest, layoutActivityBubbles, nextAvailableZapActor, toScreen, toWorld, type SceneRect } from '../src/office/scene.ts';

const viewport = { width: 1920, height: 360 };
const contentFor = (projects: number, roomWidth = 210) => Math.max(1000, roomWidth + 50 + projects * 155 + 200);
const occupancy = [[1, 210], [7, 254], [20, 298]] as const;
test('1, 7 and 20 projects scale the whole room uniformly and keep the boss visible', () => {
  let previous = Infinity;
  for (const [projects, roomWidth] of occupancy) {
    const contentWidth = contentFor(projects, roomWidth);
    const layout = computeLayout(contentWidth, viewport, undefined, roomWidth);
    const visible = viewport.width / layout.unit;
    expect(layout.scale).toBeCloseTo(Math.min(1, visible / contentWidth), 6);
    expect(layout.scale).toBeLessThanOrEqual(previous);
    previous = layout.scale;
    expect(layout.roomWidth).toBe(roomWidth);
    expect(layout.worldWidth * layout.scale).toBeCloseTo(visible, 6);
    const lastProject = roomWidth + 50 + (projects - 1) * 155;
    expect(toScreen(layout, { x: lastProject, y: 99 }).x).toBeLessThan(toScreen(layout, { x: layout.bossX - 60, y: 99 }).x);
    const roomStep = toScreen(layout, { x: 100, y: 180 }).x - toScreen(layout, { x: 90, y: 180 }).x;
    const workStep = toScreen(layout, { x: roomWidth + 100, y: 180 }).x - toScreen(layout, { x: roomWidth + 90, y: 180 }).x;
    expect(roomStep).toBeCloseTo(workStep, 6);
    expect(roomStep).toBeCloseTo(10 * layout.unit * layout.scale, 6);
    expect(toScreen(layout, { x: 400, y: 180 }).y).toBeCloseTo(viewport.height, 6);
  }
  expect(computeLayout(contentFor(20), viewport).scale).toBeLessThan(1);
});
test('fullscreen and narrow viewports fit the whole office even during a scale transition', () => {
  for (const size of [{ width: 1920, height: 1080 }, { width: 320, height: 800 }, { width: 3840, height: 1080 }]) {
    const layout = computeLayout(1000, size, 1);
    const left = toScreen(layout, { x: 0, y: 0 });
    const right = toScreen(layout, { x: 1000, y: 180 });
    expect(left.x).toBe(0);
    expect(left.y).toBeGreaterThanOrEqual(0);
    expect(right.x).toBeLessThanOrEqual(size.width + 0.000001);
    expect(right.y).toBeCloseTo(size.height, 6);
    expect(toScreen(layout, { x: 10, y: 180 }).x).toBeCloseTo(
      size.height - toScreen(layout, { x: 0, y: 170 }).y, 6);
  }
});
test('actor clicks remain accurate at different display widths', () => {
  const actors = [{ id: 'a', x: 400, y: 101 }, { id: 'b', x: 430, y: 119 }];
  for (const size of [viewport, { width: 1280, height: 360 }]) {
    const layout = computeLayout(contentFor(12), size);
    const screen = (x: number, y: number) => toScreen(layout, { x, y });
    expect(toWorld(layout, screen(430, 125)).x).toBeCloseTo(430, 6);
    expect(toWorld(layout, screen(430, 125)).y).toBeCloseTo(125, 6);
    expect(hitTest(layout, screen(400, 108), actors)).toBe('a');
    expect(hitTest(layout, screen(430, 128), actors)).toBe('b');
    expect(hitTest(layout, screen(700, 108), actors)).toBeNull();
  }
});
test('the desk zap button has hit-test priority without stealing nearby boss clicks', () => {
  for (const size of [viewport, { width: 1280, height: 360 }]) {
    const layout = computeLayout(contentFor(12), size);
    const screen = (x: number, y: number) => toScreen(layout, { x, y });
    const button = { x: layout.bossX - 22, y: 64 };
    expect(hitTest(layout, screen(button.x, button.y), [], [], button)).toBe('zap');
    expect(hitTest(layout, screen(layout.bossX - 14, 68), [], [], button)).toBe('boss');
    expect(hitTest(layout, screen(layout.bossX, 99), [], [], button)).toBe('boss');
  }
});
test('manual zap selection rotates over present actors and skips departing actors', () => {
  const actors = [
    { id: 'first', departing: false },
    { id: 'leaving', departing: true },
    { id: 'second', departing: false },
  ];
  expect(nextAvailableZapActor(actors, null)).toBe('first');
  expect(nextAvailableZapActor(actors, 'first')).toBe('second');
  expect(nextAvailableZapActor(actors, 'second')).toBe('first');
  expect(nextAvailableZapActor([{ id: 'leaving', departing: true }], null)).toBeNull();
});
test('project desks resolve at any scale without stealing clicks from characters or absent desks', () => {
  const projects = [{ id: 'project', x: 400, installed: true }, { id: 'delivery', x: 600, installed: false }];
  for (const size of [viewport, { width: 1280, height: 360 }]) {
    const layout = computeLayout(contentFor(20), size);
    const screen = (x: number, y: number) => toScreen(layout, { x, y });
    expect(hitTest(layout, screen(420, 65), [], projects)).toEqual({ project: 'project' });
    expect(hitTest(layout, screen(400, 50), [{ id: 'cat', x: 400, y: 50 }], projects)).toBe('cat');
    expect(hitTest(layout, screen(400, 75), [{ id: 'seated-cat', x: 400, y: 101 }], projects)).toBe('seated-cat');
    expect(hitTest(layout, screen(600, 65), [], projects)).toBeNull();
    expect(hitTest(layout, screen(440, 65), [], projects)).toBeNull();
  }
});
test('occupancy growth scales the break room and work area together without moving the floor', () => {
  const layouts = occupancy.map(([projects, roomWidth]) =>
    computeLayout(contentFor(projects, roomWidth), viewport, undefined, roomWidth));
  for (let i = 1; i < layouts.length; i++) {
    expect(layouts[i]!.roomWidth).toBeGreaterThan(layouts[i - 1]!.roomWidth);
    expect(layouts[i]!.scale).toBeLessThan(layouts[i - 1]!.scale);
  }
  for (const layout of layouts) {
    expect(toScreen(layout, { x: 150, y: 180 }).x).toBeCloseTo(150 * layout.unit * layout.scale, 6);
    expect(toScreen(layout, { x: layout.roomWidth + 150, y: 180 }).x).toBeCloseTo((layout.roomWidth + 150) * layout.unit * layout.scale, 6);
    expect(toScreen(layout, { x: 150, y: 180 }).y).toBeCloseTo(viewport.height, 6);
    expect(toWorld(layout, toScreen(layout, { x: 150, y: 108 })).x).toBeCloseTo(150, 6);
    expect(toWorld(layout, toScreen(layout, { x: 150, y: 108 })).y).toBeCloseTo(108, 6);
  }
});
test('walking across the room doorway stays continuous and selectable', () => {
  const layout = computeLayout(contentFor(20), viewport);
  let previous = toScreen(layout, { x: 180, y: 120 });
  for (let x = 181; x <= 270; x++) {
    const point = toScreen(layout, { x, y: 120 });
    expect(Math.hypot(point.x - previous.x, point.y - previous.y)).toBeLessThan(4);
    expect(toWorld(layout, point).x).toBeCloseTo(x, 6);
    expect(toWorld(layout, point).y).toBeCloseTo(120, 6);
    expect(hitTest(layout, point, [{ id: 'walking', x, y: 120 }])).toBe('walking');
    previous = point;
  }
  expect(hitTest(layout, toScreen(layout, { x: layout.bossX, y: 99 }), [])).toBe('boss');
});
test('activity bubbles avoid labels, badges, existing bubbles and scene edges', () => {
  const bounds: SceneRect = { x: 0, y: 0, width: 180, height: 130 };
  const reserved: SceneRect[] = [
    { x: 33, y: 34, width: 20, height: 20 }, // model badge
    { x: 29, y: 82, width: 42, height: 10 }, // name label
    { x: 61, y: 44, width: 15, height: 15 }, // attention bubble
  ];
  const placements = layoutActivityBubbles([
    { id: 'agent', x: 54, y: 58, width: 58, height: 22 },
    { id: 'subagent', x: 82, y: 63, width: 64, height: 22 },
  ], reserved, bounds);
  expect(placements).toHaveLength(2);
  for (const placement of placements) {
    expect(placement.x).toBeGreaterThanOrEqual(bounds.x);
    expect(placement.y).toBeGreaterThanOrEqual(bounds.y);
    expect(placement.x + placement.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    expect(placement.y + placement.height).toBeLessThanOrEqual(bounds.y + bounds.height);
    for (const area of reserved) {
      expect(placement.x + placement.width + 2 <= area.x || area.x + area.width + 2 <= placement.x ||
        placement.y + placement.height + 2 <= area.y || area.y + area.height + 2 <= placement.y).toBe(true);
    }
  }
  expect(placements[0]!.x + placements[0]!.width + 2 <= placements[1]!.x ||
    placements[1]!.x + placements[1]!.width + 2 <= placements[0]!.x ||
    placements[0]!.y + placements[0]!.height + 2 <= placements[1]!.y ||
    placements[1]!.y + placements[1]!.height + 2 <= placements[0]!.y).toBe(true);
});
