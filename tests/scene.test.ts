import { expect, test } from 'bun:test';
import { computeLayout, hitTest, toScreen, toWorld } from '../src/office/scene.ts';

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
test('actor and messenger clicks remain accurate at different display widths', () => {
  const actors = [{ id: 'a', x: 400, y: 101 }, { id: 'b', x: 430, y: 119 }];
  for (const size of [viewport, { width: 1280, height: 360 }]) {
    const layout = computeLayout(contentFor(12), size);
    const screen = (x: number, y: number) => toScreen(layout, { x, y });
    expect(toWorld(layout, screen(430, 125)).x).toBeCloseTo(430, 6);
    expect(toWorld(layout, screen(430, 125)).y).toBeCloseTo(125, 6);
    expect(hitTest(layout, screen(400, 108), actors, null)).toBe('a');
    expect(hitTest(layout, screen(430, 128), actors, null)).toBe('b');
    expect(hitTest(layout, screen(700, 108), actors, null)).toBeNull();
    expect(hitTest(layout, screen(400, 108), actors, { x: 400, y: 112 })).toBe('briefing');
  }
});
test('project desks resolve at any scale without stealing clicks from characters or absent desks', () => {
  const projects = [{ id: 'project', x: 400, installed: true }, { id: 'delivery', x: 600, installed: false }];
  for (const size of [viewport, { width: 1280, height: 360 }]) {
    const layout = computeLayout(contentFor(20), size);
    const screen = (x: number, y: number) => toScreen(layout, { x, y });
    expect(hitTest(layout, screen(420, 65), [], null, projects)).toEqual({ project: 'project' });
    expect(hitTest(layout, screen(400, 50), [{ id: 'cat', x: 400, y: 50 }], null, projects)).toBe('cat');
    expect(hitTest(layout, screen(400, 75), [{ id: 'seated-cat', x: 400, y: 101 }], null, projects)).toBe('seated-cat');
    expect(hitTest(layout, screen(600, 65), [], null, projects)).toBeNull();
    expect(hitTest(layout, screen(440, 65), [], null, projects)).toBeNull();
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
    expect(hitTest(layout, point, [{ id: 'walking', x, y: 120 }], null)).toBe('walking');
    previous = point;
  }
  expect(hitTest(layout, toScreen(layout, { x: layout.bossX, y: 99 }), [], null)).toBe('boss');
});
