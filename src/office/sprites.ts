// Pixel art ported from the approved mockup (office-project-arrivals-v13.html); scene units, no smoothing.
export type Pose = 'stand' | 'sit' | 'coffee' | 'sofa';
/** Optional scene-supplied gait/action phase. */
export interface CharacterMotion {
  walking?: boolean; frame?: 0 | 1; activity?: ActivityKind; dragging?: boolean; focus?: number;
  zap?: 'windup' | 'crack' | 'recoil'; zapSide?: -1 | 1;
}
export interface ActivityBubbleLayout { lines: string[]; width: number; height: number }
import { DEFAULT_HUMAN, DEFAULT_ROBOT_COLORS, type Breed, type HumanGender, type HumanHairColor, type HumanHairStyle, type HumanSkin, type Outfit, type RobotColor } from './appearance.ts';
import type { ModelRef } from '../bridge/protocol.ts';
import type { ActivityKind } from '../activity.ts';
type ModelBadge = { kind: 'octopus' | 'sun' | 'moon' | 'earth' | 'grok' | 'text'; label: string };
const UNKNOWN_MODEL_BADGE: ModelBadge = { kind: 'text', label: 'N/D' };
// Grok's mark, kept as a vector so it remains recognizable at scene scale.
const GROK_MARK = 'm231.8 382.3 199.4-147.5c9.8-7.2 23.8-4.4 28.4 6.8A164 164 0 0 1 424.4 421c-48.8 48.8-116.7 59.5-178.7 35.1l-67.8 31.4c97.2 66.6 215.3 50.1 289-23.8a223 223 0 0 0 59.7-210.5l.2.2c-24.6-105.8 6-148.1 68.7-234.6l4.5-6.2-82.5 82.6V95L231.7 382.3m-41.1 35.8c-69.8-66.8-57.8-170 1.8-229.6a166 166 0 0 1 179.1-35.7l67.6-31.2a195 195 0 0 0-45.7-25 224 224 0 0 0-243.8 49.2 226 226 0 0 0-49 244C126 452 84.2 496 42 540.5c-15 15.7-30 31.4-42 48z';
function modelBadgeFor(model: ModelRef): ModelBadge {
  // Gateways such as GitHub Copilot keep the underlying model identity in id or name.
  for (const identity of [model.id, model.name]) {
    if (/(^|[^a-z])grok([^a-z]|$)/i.test(identity)) {
      const versionPattern = /grok(?:[-_ ./]+[a-z]+)*[-_ ./]+(\d+)(?:[._-](\d{1,2})(?=$|[-_ ./]))?/i;
      const version = model.id.match(versionPattern) ?? model.name.match(versionPattern);
      return { kind: 'grok', label: version ? version[1] + (version[2] ? '.' + version[2] : '') : '' };
    }
    if (/(^|[^a-z])opus([^a-z]|$)/i.test(identity)) return { kind: 'octopus', label: '' };
    if (/(^|[^a-z])sol([^a-z]|$)/i.test(identity)) return { kind: 'sun', label: '' };
    if (/(^|[^a-z])luna([^a-z]|$)/i.test(identity)) return { kind: 'moon', label: '' };
    if (/(^|[^a-z])terra([^a-z]|$)/i.test(identity)) return { kind: 'earth', label: '' };
  }
  return { kind: 'text', label: (model.name || model.id).slice(0, 6) };
}
// Terra's globe: ocean disc, the Americas and Europe/Africa, polar ice and a night-side shade; the corners stay transparent.
const EARTH: ReadonlyArray<readonly [number, number, number, number, string]> = [
  [-2, -7, 5, 15, '#3f86cf'], [-4, -6, 9, 13, '#3f86cf'], [-5, -5, 11, 11, '#3f86cf'], [-6, -4, 13, 9, '#3f86cf'], [-7, -2, 15, 5, '#3f86cf'],
  [7, 0, 1, 3, '#2d68ad'], [6, 3, 1, 2, '#2d68ad'], [5, 5, 1, 1, '#2d68ad'], [3, 6, 2, 1, '#2d68ad'],
  [-5, -5, 3, 1, '#5fa85a'], [-6, -4, 5, 2, '#5fa85a'], [-5, -2, 3, 1, '#5fa85a'], [-4, -1, 2, 1, '#5fa85a'],
  [-3, 0, 3, 2, '#5fa85a'], [-2, 2, 2, 2, '#5fa85a'], [-2, 4, 1, 1, '#5fa85a'],
  [1, -5, 3, 1, '#5fa85a'], [2, -4, 3, 1, '#5fa85a'], [1, -3, 5, 2, '#5fa85a'], [2, -1, 4, 2, '#5fa85a'], [3, 1, 2, 2, '#5fa85a'], [3, 3, 1, 1, '#5fa85a'],
  [-2, -7, 5, 1, '#eef6f7'], [-3, -6, 7, 1, '#eef6f7'], [-1, 6, 3, 1, '#eef6f7'], [-2, 7, 5, 1, '#eef6f7'],
];
type RobotPalette = { shell: string; light: string; shade: string };
const ROBOT_PALETTES: Record<RobotColor, RobotPalette> = {
  blue: { shell: '#4c9fc2', light: '#a6e1eb', shade: '#31738e' },
  orange: { shell: '#e89b54', light: '#f6ca84', shade: '#b86a37' },
  mint: { shell: '#65b99c', light: '#b4e3ce', shade: '#438a75' },
  pink: { shell: '#d77f9d', light: '#f2bfd0', shade: '#a95173' },
  purple: { shell: '#9d83cb', light: '#d1c0ed', shade: '#71569f' },
  cream: { shell: '#d8c28b', light: '#f5e4b2', shade: '#aa8e57' },
};
const HUMAN_SKIN_PALETTES: Record<HumanSkin, { base: string; shade: string; highlight: string }> = {
  light: { base: '#f0c9a9', shade: '#c98f6d', highlight: '#ffdfc3' },
  medium: { base: '#d3a17c', shade: '#a96f50', highlight: '#e8b590' },
  dark: { base: '#8d583b', shade: '#603b2b', highlight: '#aa7150' },
};
const HUMAN_HAIR_PALETTES: Record<HumanHairColor, string> = {
  brown: '#4a3830', black: '#292b30', blond: '#d2ad62', gray: '#92949a',
};
const ROBOT_BILL = '#f3a044', ROBOT_BILL_LIGHT = '#ffd16d', ROBOT_BILL_SHADE = '#ca7133';
const ROBOT_EYE = '#30404a', ROBOT_EYE_HIGHLIGHT = '#fffdf5';
const HUMAN_SUIT = '#3e4652';
const HUMAN_SUIT_DARK = '#303944';
const HUMAN_SUIT_SEAM = '#363e49';
const HUMAN_SUIT_BLACK = '#26313a';
const HUMAN_SLEEVE = '#59636b';
const HUMAN_COLLAR = '#f4f1e8';
const HUMAN_STRESS = '#55b878';
export const HUMAN_ZAP_HAND_OFFSET = { x: -35, y: -18 } as const;
export class Painter {
  private readonly modelBadges = new WeakMap<ModelRef, ModelBadge>();
  private readonly activityBubbleLayouts = new Map<string, ActivityBubbleLayout>();
  private grokMark: Path2D | null = null;
  /** Fur of the latest `character`, so `activityProp` closes a paw of the same colour over the held tool. */
  private lastFur = '#aba5ae';
  private lastRobot = false;
  constructor(readonly c: CanvasRenderingContext2D, readonly logo: HTMLImageElement) {}
  rect(x: number, y: number, w: number, h: number, color: string) { this.c.fillStyle = color; this.c.fillRect(x, y, w, h); }
  text(value: string, x: number, y: number, color = '#555b53') {
    this.c.fillStyle = color; this.c.font = '7px monospace'; this.c.fillText(value, x, y);
  }
  activityBubbleLayout(description: string): ActivityBubbleLayout {
    const cached = this.activityBubbleLayouts.get(description);
    if (cached) return cached;
    const c = this.c, maxWidth = 116, lines: string[] = [];
    c.save(); c.font = '7px monospace';
    let line = '';
    for (const word of description.trim().split(/\s+/).filter(Boolean)) {
      if (line && c.measureText(line + ' ' + word).width > maxWidth) { lines.push(line); line = ''; }
      if (line) line += ' ';
      for (const character of Array.from(word)) {
        if (line && c.measureText(line + character).width > maxWidth) { lines.push(line); line = ''; }
        line += character;
      }
    }
    if (line) lines.push(line);
    const textWidth = Math.ceil(Math.max(0, ...lines.map(text => c.measureText(text).width)));
    c.restore();
    const layout = { lines, width: textWidth + 8, height: lines.length * 8 + 9 };
    if (this.activityBubbleLayouts.size >= 64) this.activityBubbleLayouts.clear();
    this.activityBubbleLayouts.set(description, layout);
    return layout;
  }
  activityBubble(x: number, y: number, layout: ActivityBubbleLayout) {
    const c = this.c, bodyHeight = layout.height - 3;
    this.rect(x, y, layout.width, bodyHeight, '#445047');
    this.rect(x + 1, y + 1, layout.width - 2, bodyHeight - 2, '#fffdf5');
    this.rect(x + 5, y + bodyHeight - 1, 3, 2, '#445047');
    this.rect(x + 6, y + bodyHeight + 1, 1, 1, '#445047');
    c.font = '7px monospace'; c.fillStyle = '#354139';
    for (let i = 0; i < layout.lines.length; i++) c.fillText(layout.lines[i]!, x + 4, y + 9 + i * 8);
  }
  electricZap(fromX: number, fromY: number, toX: number, toY: number, phase: number, scale: number, reducedMotion: boolean) {
    const c = this.c, dx = toX - fromX, dy = toY - fromY, length = Math.hypot(dx, dy) || 1;
    const pulse = Math.floor(phase * 4), flicker = reducedMotion || pulse % 2 === 0 ? 1 : 0.85;
    const normalX = -dy / length, normalY = dx / length, segments = 12, cycles = 4;
    const amplitude = (4 + Math.sin(phase * Math.PI * 2)) * scale;
    c.save(); c.globalAlpha = flicker; c.lineCap = 'square'; c.lineJoin = 'miter'; c.beginPath(); c.moveTo(Math.round(fromX), Math.round(fromY));
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const offset = i === segments ? 0 : Math.sin(t * Math.PI * 2 * cycles + phase * Math.PI * 2) * amplitude;
      c.lineTo(Math.round(fromX + dx * t + normalX * offset), Math.round(fromY + dy * t + normalY * offset));
    }
    c.strokeStyle = '#0755b8'; c.lineWidth = 5 * scale; c.stroke();
    c.strokeStyle = '#1498ff'; c.lineWidth = 3 * scale; c.stroke();
    c.strokeStyle = '#dcf7ff'; c.lineWidth = Math.max(1, scale); c.stroke();
    const x = Math.round(toX), y = Math.round(toY), s = scale;
    this.rect(Math.round(x - 1.5 * s), Math.round(y - 1.5 * s), Math.round(3 * s), Math.round(3 * s), '#f3fbff');
    this.rect(Math.round(x - 5 * s), Math.round(y - s), Math.round(3 * s), Math.round(2 * s), '#32b4ff');
    this.rect(Math.round(x + 2 * s), Math.round(y - s), Math.round(3 * s), Math.round(2 * s), '#32b4ff');
    this.rect(Math.round(x - s), Math.round(y - 5 * s), Math.round(2 * s), Math.round(3 * s), '#32b4ff');
    this.rect(Math.round(x - s), Math.round(y + 2 * s), Math.round(2 * s), Math.round(3 * s), '#32b4ff');
    c.restore();
  }
  plant(x: number, y: number) {
    const R = this.rect.bind(this);
    R(x - 6, y, 12, 12, '#ad7960'); R(x - 5, y, 10, 3, '#c29375'); R(x - 1, y - 17, 3, 19, '#687f55');
    R(x - 10, y - 13, 10, 7, '#82965c'); R(x + 2, y - 19, 10, 8, '#95a970'); R(x - 7, y - 22, 6, 9, '#718b55');
  }
  desk(x: number, y: number) {
    const R = this.rect.bind(this);
    R(x - 26, y + 8, 4, 23, '#b7b8b5'); R(x + 22, y + 8, 4, 23, '#b7b8b5'); R(x - 31, y - 7, 62, 21, '#cbccc9');
    R(x - 31, y - 9, 62, 17, '#f4f4ed'); R(x - 29, y - 7, 58, 2, '#ffffff'); R(x - 13, y - 26, 27, 22, '#4d5d59');
    R(x - 11, y - 24, 23, 17, '#a5c1af'); R(x - 8, y - 20, 12, 2, '#dce9c4'); R(x - 8, y - 15, 17, 2, '#819d8b');
    R(x - 1, y - 4, 4, 4, '#4d5d59'); R(x - 13, y + 3, 23, 4, '#ede7d4'); R(x + 21, y - 2, 7, 7, '#fff2d6'); R(x + 23, y - 4, 3, 2, '#887461');
  }
  manualZapButton(x: number, y: number) {
    const R = this.rect.bind(this);
    R(x - 6, y - 5, 12, 10, '#5a4a3d'); R(x - 5, y - 4, 10, 8, '#982c2a');
    R(x - 4, y - 4, 8, 7, '#df443d'); R(x - 3, y - 3, 6, 5, '#ff7563');
    R(x - 1, y - 2, 2, 3, '#fff1dc');
  }
  chair(x: number, y: number) {
    const R = this.rect.bind(this);
    R(x - 15, y - 3, 30, 19, '#747a7d'); R(x - 12, y - 1, 24, 12, '#a6aaab'); R(x - 13, y + 17, 27, 6, '#8c9293');
    R(x - 2, y + 22, 4, 10, '#777e80'); R(x - 12, y + 30, 25, 3, '#777e80');
  }
  breakRoom(width = 210) {
    const R = this.rect.bind(this);
    R(15, 62, width - 30, 95, '#ded4b8'); R(21, 68, width - 42, 83, '#e7dfc9'); R(24, 105, 59, 14, '#7d936b'); R(27, 86, 53, 23, '#9eae87');
    R(22, 102, 7, 23, '#7d936b'); R(78, 102, 7, 23, '#7d936b');
    for (let n = 0; n < 4; n++) {
      R(104 - n * 2, 81 - n * 9, 43, 7, '#c4c8c3'); R(101 - n * 2, 78 - n * 9, 49, 5, '#f5f4ed');
      R(105 - n * 2, 84 - n * 9, 3, 6, '#aab1a8'); R(143 - n * 2, 84 - n * 9, 3, 6, '#aab1a8');
    }
    this.plant(177, 57);
  }
  floor(width: number) {
    const R = this.rect.bind(this);
    R(0, 0, width, 180, '#b9bbb3');
    for (let r = 0; r < 12; r++) {
      R(0, r * 15, width, 14, ['#b6b8b1', '#c0c1b9', '#adafa9'][r % 3]!);
      for (let x = (r % 3) * 39 - 90; x < width; x += 119) { R(x, r * 15, 1, 14, '#969d93'); R(x + 10, r * 15 + 5, 65, 1, '#a2a89e'); }
    }
    R(0, 0, width, 20, '#dedfce'); R(0, 19, width, 4, '#8b9980');
  }
  /** `who` selects an animal, a role-coloured robot, or the seated human lead. */
  character(x: number, y: number, who: { kind: 'cat'; coat: string } | { kind: 'mole' } | { kind: 'mouse' } | { kind: 'dog'; breed: Breed; stress?: number } | { kind: 'robot'; role: 'agent' | 'subagent'; color?: RobotColor } | { kind: 'human'; stress?: number; skin?: HumanSkin; hair?: HumanHairColor; style?: HumanHairStyle; gender?: HumanGender }, outfit: Outfit, pose: Pose, motion?: CharacterMotion) {
    const c = this.c, R = this.rect.bind(this);
    c.save(); c.translate(Math.round(x), Math.round(y));
    this.lastRobot = who.kind === 'robot';
    if (pose !== 'sofa') R(-12, 31, 30, 3, '#8e8d8270');
    if (who.kind === 'robot') {
      this.lastFur = ROBOT_PALETTES[who.color ?? DEFAULT_ROBOT_COLORS[who.role]].light;
      this.robotCharacter(who.role, pose, motion, who.color); c.restore(); return;
    }
    if (who.kind === 'human') {
      this.lastFur = HUMAN_SKIN_PALETTES[who.skin ?? DEFAULT_HUMAN.skin].base;
      this.humanCharacter(pose, who.stress, motion, who.skin, who.hair, who.style, who.gender); c.restore(); return;
    }
    const dog = who.kind === 'dog' ? stressedDogStyle(who.breed, who.stress) : null;
    const baseDog = who.kind === 'dog' ? DOGS[who.breed] : null;
    const fur = who.kind === 'cat' ? who.coat : who.kind === 'mole' ? '#74636a' : baseDog ? baseDog.fur : '#aba5ae';
    const face = who.kind === 'cat' ? who.coat : who.kind === 'mole' ? '#a98f8b' : baseDog ? baseDog.face : '#c9c1c5';
    const frame = motion?.frame ?? 0;
    const activeTool = motion?.activity !== undefined && motion.activity !== 'none' && motion.activity !== 'thinking';
    const armShift = frame === 1 ? 2 : 0;
    this.lastFur = fur;
    if (pose === 'sit') {
      // Back view: lean toward the monitor; the chair back hides the lower torso.
      c.translate(0, -10);
      const legs = outfit === 'suit' ? '#3e4652' : '#576b73';
      R(-10, 22, 8, 5, legs); R(4, 22, 8, 5, legs);
      R(-12, 26, 9, 4, '#535352'); R(5, 26, 9, 4, '#535352');
      this.outfit(outfit, true);
      const sleeve = OUTFIT_COLORS[outfit];
      if (activeTool) {
        R(-10, 6, 4, 4, sleeve); R(-13, 1 + armShift, 5, 5, sleeve); R(-17, -4 + armShift, 5, 5, fur);
      } else {
        R(-14, -2, 5, 14, fur); R(-13, -5, 5, 5, fur);
      }
      R(11, -2, 5, 14, fur); R(10, -5, 5, 5, fur);
      if (who.kind === 'cat') {
        R(-13, -17, 8, 13, fur); R(6, -17, 8, 13, fur);
      } else if (who.kind === 'mouse') {
        R(-15, -17, 11, 11, fur); R(6, -17, 11, 11, fur);
        R(-14, -4, 4, 2, '#303844'); R(12, -4, 4, 2, '#303844');
      } else if (dog) {
        if (dog.ears === 'pointed' || dog.ears === 'bat') {
          R(-13, -21, 8, 15, dog.ear); R(7, -21, 8, 15, dog.ear);
        } else {
          R(-15, -10, 8, dog.longEars ? 25 : 21, dog.ear); R(10, -10, 8, dog.longEars ? 25 : 21, dog.ear);
        }
      }
      if (who.kind === 'mole') { R(-8, -13, 18, 5, fur); R(-5, -15, 12, 3, fur); }
      R(-11, -9, 24, 14, dog?.fur ?? fur);
      if (dog?.saddle) R(-10, -7, 22, 11, dog.saddle);
      R(-15, 12, 30, 14, '#747a7d'); R(-12, 14, 24, 9, '#a6aaab');
      if (who.kind === 'mouse') {
        R(14, 24, 6, 3, '#c89193'); R(18, 18, 3, 8, '#c89193'); R(15, 17, 5, 3, '#c89193');
      }
      c.restore(); return;
    }
    if (pose === 'sofa') c.translate(0, 3);
    if (who.kind === 'mouse') { R(13, 16, 3, 3, '#c89193'); R(15, 18, 8, 3, '#c89193'); R(21, 12, 3, 8, '#c89193'); R(18, 10, 6, 3, '#c89193'); }
    const legs = outfit === 'suit' ? '#3e4652' : '#576b73';
    if (pose === 'sofa') {
      // Thighs rest on the cushion; lower legs hang in front of the sofa.
      R(-13, 21, 12, 7, legs); R(4, 21, 12, 7, legs);
      R(-12, 27, 6, 5, legs); R(10, 27, 6, 5, legs);
      R(-14, 32, 9, 4, '#535352'); R(9, 32, 9, 4, '#535352');
    } else {
      const walking = who.kind !== 'dog' && motion?.walking === true;
      const leftLift = walking && frame === 0 ? 3 : 0, rightLift = walking && frame === 1 ? 3 : 0;
      R(-7 - leftLift, 20, 6, 11 - leftLift, legs); R(3 + rightLift, 20, 6, 11 - rightLift, legs);
      R(-9 - leftLift, 29 - leftLift, 8, 4, '#535352'); R(2 + rightLift, 29 - rightLift, 8, 4, '#535352');
    }
    this.outfit(outfit, false, motion?.walking === true && !motion.dragging);
    const sleeve = OUTFIT_COLORS[outfit];
    if (pose === 'sofa') {
      R(-13, 16, 5, 6, sleeve); R(-12, 20, 5, 4, fur);
      R(11, 16, 5, 6, sleeve); R(11, 20, 5, 4, fur);
    } else if (motion?.dragging) {
      R(-10, 7, 5, 5, sleeve); R(-14, 0, 6, 5, sleeve); R(-18, -7, 6, 5, sleeve); R(-21, -14, 5, 5, fur);
      R(5, 8, 5, 5, sleeve); R(-9, 4, 6, 5, sleeve); R(-15, -2, 6, 5, sleeve); R(-20, -9, 5, 5, fur);
    } else if (activeTool) {
      R(-13, 17, 5, 5, fur);
      R(7, 8, 5, 5, sleeve); R(9, 12 + armShift, 5, 4, sleeve); R(11, 14 + armShift, 5, 5, fur);
    } else if (motion?.walking && who.kind !== 'dog') {
      const swing = frame === 1 ? 4 : -4;
      const leftArmY = 8 + (frame === 1 ? 4 : 0), rightArmY = 8 + (frame === 0 ? 4 : 0);
      R(-13, 7, 5, 4, sleeve); R(11, 7, 5, 4, sleeve);
      R(-13 + swing, leftArmY, 5, 8, sleeve); R(-13 + swing, leftArmY + 6, 5, 5, fur);
      R(11 - swing, rightArmY, 5, 8, sleeve); R(11 - swing, rightArmY + 6, 5, 5, fur);
    } else {
      R(-13, 17, 5, 5, fur); R(11, 17, 5, 5, fur);
    }
    if (dog) this.dogHead(dog);
    else if (who.kind === 'mole') {
      R(-10, -13, 22, 3, fur); R(-13, -10, 28, 11, fur); R(-10, 1, 22, 5, fur);
      R(-6, -6, 2, 2, '#292a30'); R(6, -6, 2, 2, '#292a30');
      R(-5, -2, 12, 6, face); R(-3, -3, 8, 4, '#d59d9b'); R(-1, -4, 4, 3, '#e1aaa6');
      R(-14, 0, 6, 1, '#b8a2a1'); R(10, 0, 6, 1, '#b8a2a1');
    } else {
      if (who.kind === 'cat') { R(-13, -17, 8, 13, fur); R(6, -17, 8, 13, fur); R(-11, -14, 4, 6, '#d68d84'); R(8, -14, 4, 6, '#d68d84'); }
      else { R(-15, -17, 11, 11, fur); R(6, -17, 11, 11, fur); R(-12, -15, 6, 7, '#d8a4a8'); R(8, -15, 6, 7, '#d8a4a8'); }
      R(-11, -9, 24, 14, fur); R(-8, -7, 18, 13, face); R(-5, -3, 2, 3, '#41464b'); R(6, -3, 2, 3, '#41464b'); R(0, 2, 3, 2, '#cb9292');
      R(-14, 2, 8, 1, '#77727b'); R(8, 2, 8, 1, '#77727b');
      if (who.kind === 'mouse') {
        for (const left of [-8, 3]) {
          R(left, -5, 8, 1, '#303844'); R(left, 1, 8, 1, '#303844');
          R(left, -4, 1, 5, '#303844'); R(left + 7, -4, 1, 5, '#303844');
        }
        R(0, -3, 3, 1, '#303844'); R(-11, -4, 3, 1, '#303844'); R(11, -4, 3, 1, '#303844');
      }
    }
    if (pose === 'coffee') { R(11, 15, 7, 7, '#f5efda'); R(12, 14, 5, 2, '#7f6754'); }
    c.restore();
  }
  private outfit(outfit: Outfit, back = false, moving = false) {
    const R = this.rect.bind(this), base = OUTFIT_COLORS[outfit];
    R(-9, 5, 20, 17, base); if (!moving) { R(-13, 7, 5, 11, base); R(11, 7, 5, 11, base); } R(-9, 20, 20, 2, '#c6c2af');
    if (back && outfit !== 'stripes') {
      if (outfit === 'hoodie') { R(-8, 3, 18, 7, '#a85a47'); R(-5, 5, 12, 3, '#b8624f'); }
      return;
    }
    if (outfit === 'suit') { R(-2, 5, 6, 10, '#f4f4ed'); R(0, 6, 2, 10, '#b5523b'); R(-1, 5, 4, 2, '#8f3b2b'); return; }
    if (outfit === 'stripes') { for (let row = 7; row < 20; row += 4) { R(-9, row, 20, 2, '#f4f4ed'); if (!moving) { R(-13, row, 5, 2, '#f4f4ed'); R(11, row, 5, 2, '#f4f4ed'); } } return; }
    if (outfit === 'labcoat') { R(-9, 20, 20, 3, base); R(0, 5, 1, 17, '#cfd3d0'); R(-2, 5, 2, 5, '#cfd3d0'); R(1, 5, 2, 5, '#cfd3d0'); R(-7, 14, 5, 4, '#e4e6e2'); R(-6, 13, 1, 3, '#5b7a96'); return; }
    if (outfit === 'hoodie') { R(-8, 3, 18, 4, '#a85a47'); R(-5, 15, 12, 5, '#b8624f'); R(-2, 7, 1, 5, '#f4f4ed'); R(3, 7, 1, 5, '#f4f4ed'); }
    if (this.logo.complete && this.logo.naturalWidth) this.c.drawImage(this.logo, -4, 8, 10, 10);
  }
  private dogHead(dog: DogStyle) {
    const R = this.rect.bind(this);
    if (dog.ears === 'pointed') { R(-12, -21, 4, 3, dog.ear); R(-13, -18, 7, 10, dog.ear); R(9, -21, 4, 3, dog.ear); R(7, -18, 7, 10, dog.ear); R(-11, -16, 3, 6, dog.inner); R(9, -16, 3, 6, dog.inner); }
    if (dog.ears === 'bat') { R(-16, -20, 9, 13, dog.ear); R(8, -20, 9, 13, dog.ear); R(-14, -17, 5, 8, dog.inner); R(10, -17, 5, 8, dog.inner); }
    R(-11, -9, 24, 14, dog.fur); R(-8, -7, 18, 13, dog.face);
    if (dog.ears === 'floppy') { R(-15, -10, 8, dog.longEars ? 25 : 21, dog.ear); R(10, -10, 8, dog.longEars ? 25 : 21, dog.ear); }
    if (dog.saddle) R(-11, -9, 24, 3, dog.saddle);
    if (dog.blaze) R(-1, -9, 4, 10, dog.blaze);
    for (const [sx, sy] of dog.spots ?? []) R(sx, sy, 3, 2, '#2b2b2b');
    R(-5, -3, 2, 3, dog.eyes); R(6, -3, 2, 3, dog.eyes);
    if (dog.longMuzzle) { R(-8, 0, 20, 9, dog.muzzle); R(-2, 2, 6, 3, dog.nose); R(0, 7, 3, 2, '#c96a6a'); }
    else { R(-6, 0, 15, 8, dog.muzzle); R(-1, 1, 5, 3, dog.nose); R(1, 5, 2, 2, '#c96a6a'); }
  }
  private robotCharacter(role: 'agent' | 'subagent', pose: Pose, motion?: CharacterMotion, color?: RobotColor) {
    const R = this.rect.bind(this), c = this.c;
    const { shell, light, shade } = ROBOT_PALETTES[color ?? DEFAULT_ROBOT_COLORS[role]];
    const dark = '#3b4a51';
    const frame = motion?.frame ?? 0;
    const walking = motion?.walking === true, working = motion?.activity !== undefined && motion.activity !== 'none';
    const activeTool = working && motion?.activity !== 'thinking';
    if (pose === 'sit') c.translate(0, -10);
    else if (pose === 'sofa') c.translate(0, 3);

    // Short, rounded legs and orange webbed feet keep the duck silhouette soft.
    if (pose === 'sit') {
      R(-7, 20, 5, 6, shade); R(2, 20, 5, 6, shade);
      R(-7, 25, 5, 4, shell); R(2, 25, 5, 4, shell);
      R(-9, 28, 8, 4, ROBOT_BILL); R(1, 28, 8, 4, ROBOT_BILL);
    } else if (pose === 'sofa') {
      R(-12, 20, 10, 7, shade); R(2, 20, 10, 7, shade);
      R(-9, 26, 5, 6, shell); R(9, 26, 5, 6, shell);
      R(-11, 31, 8, 3, ROBOT_BILL); R(8, 31, 8, 3, ROBOT_BILL);
    } else {
      const leftStep = walking && frame === 0 ? -3 : 0;
      const rightStep = walking && frame === 1 ? 3 : 0;
      const leftLift = walking && frame === 0 ? 2 : 0, rightLift = walking && frame === 1 ? 2 : 0;
      R(-6 + leftStep, 20 - leftLift, 5, 6, shade); R(-5 + leftStep, 25 - leftLift, 3, 5, shell);
      R(-9 + leftStep, 29 - leftLift, 8, 3, ROBOT_BILL);
      R(1 + rightStep, 20 - rightLift, 5, 6, shade); R(2 + rightStep, 25 - rightLift, 3, 5, shell);
      R(0 + rightStep, 29 - rightLift, 8, 3, ROBOT_BILL);
    }

    // Exposed dark neck and a compact colored hip shell, like the Microduck mechanism.
    R(-5, -14, 10, 17, dark); R(-3, -12, 6, 13, '#20292e');
    R(-2, -10, 4, 2, '#88979b'); R(-2, -5, 4, 2, '#88979b');
    R(-12, 3, 24, 14, dark); R(-11, 4, 22, 11, shell);
    R(-9, 5, 18, 2, light); R(-8, 14, 16, 3, shade);
    R(-8, 9, 16, 4, shade); R(-6, 10, 12, 2, '#586569');
    R(-5, 10, 2, 2, '#d5d6c9'); R(3, 10, 2, 2, '#d5d6c9');

    if (pose === 'sit') {
      if (motion?.zap) {
        const jolt = frame === 1 ? 2 : 0;
        if (motion.zap === 'windup') {
          R(-12, 1, 5, 5, shell); R(-15, -5, 5, 7, shade); R(-18, -15, 5, 8, light);
          R(7, 1, 5, 5, shell); R(10, -5, 5, 7, shade); R(13, -15, 5, 8, light);
        } else if (motion.zap === 'crack') {
          R(-12, 1, 5, 5, shell); R(-18, -4, 6, 5, shade); R(-24, -9 + jolt, 7, 5, light);
          R(7, 1, 5, 5, shell); R(13, -4, 6, 5, shade); R(19, -9 - jolt, 7, 5, light);
        } else {
          R(-12, 1, 5, 5, shell); R(-17, -5, 5, 6, shade); R(-20, -13, 5, 7, light);
          R(7, 1, 5, 5, shell); R(12, -5, 5, 6, shade); R(15, -13, 5, 7, light);
        }
      } else if (motion?.dragging) {
        const reach = frame === 1 ? 2 : 0;
        R(-12, 1, 5, 5, shell); R(-16, -2, 5, 5, shade); R(-21, -7 + reach, 6, 5, light);
        R(7, 1, 5, 5, shell); R(11, -2, 5, 5, shade); R(15, -7 + reach, 6, 5, light);
      } else if (working) {
        const tap = frame === 1 ? 2 : 0;
        R(-11, 1, 4, 5, shell); R(-14, -4, 4, 6, shade); R(-16, -10 + tap, 5, 6, light);
        R(7, 1, 4, 5, shell); R(10, -4, 4, 6, shade); R(11, -10 - tap, 5, 6, light);
      } else {
        R(-12, 1, 4, 6, shell); R(-14, -4, 4, 5, shade); R(-14, -7, 5, 4, light);
        R(8, 1, 4, 6, shell); R(10, -4, 4, 5, shade); R(9, -7, 5, 4, light);
      }
    } else if (motion?.zap) {
      const jolt = frame === 1 ? 2 : 0;
      if (motion.zap === 'windup') {
        R(-12, 2, 5, 5, shell); R(-15, -5, 5, 8, shade); R(-18, -20, 5, 14, light);
        R(7, 2, 5, 5, shell); R(10, -5, 5, 8, shade); R(13, -20, 5, 14, light);
      } else if (motion.zap === 'crack') {
        R(-12, 2, 5, 5, shell); R(-18, -4, 6, 5, shade); R(-25, -12 + jolt, 7, 5, light);
        R(7, 2, 5, 5, shell); R(13, -4, 6, 5, shade); R(20, -12 - jolt, 7, 5, light);
      } else {
        R(-12, 2, 5, 5, shell); R(-17, -5, 5, 6, shade); R(-20, -18, 5, 12, light);
        R(7, 2, 5, 5, shell); R(12, -5, 5, 6, shade); R(15, -18, 5, 12, light);
      }
    } else if (pose === 'sofa') {
      R(-13, 3, 5, 6, shell); R(-14, 9, 5, 7, shade); R(-12, 15, 5, 4, light);
      R(8, 3, 5, 6, shell); R(10, 9, 5, 7, shade); R(10, 15, 5, 4, light);
    } else if (motion?.dragging) {
      // Both arms reach toward the table; the phase lifts their hands as the feet alternate.
      const reach = frame === 1 ? 2 : 0;
      R(-12, 2, 5, 5, shell); R(-16, -1, 5, 5, shade); R(-21, -7 + reach, 6, 5, light);
      R(7, 2, 5, 5, shell); R(11, -1, 5, 5, shade); R(16, -7 + reach, 6, 5, light);
    } else if (activeTool) {
      R(-13, 3, 4, 6, shell); R(-15, 9, 4, 6, shade); R(-15, 15, 4, 4, light);
      R(9, 2, 5, 5, shell); R(12, 7, 4, 5, shade); R(12, 12, 4, 4, shell); R(12, 15, 4, 4, light);
    } else if (pose === 'coffee') {
      R(-13, 3, 4, 6, shell); R(-15, 9, 4, 6, shade); R(-15, 15, 4, 4, light);
      R(9, 2, 5, 5, shell); R(12, 7, 4, 4, shade); R(14, 3, 4, 5, shell);
      R(13, -3, 7, 7, '#f5efda'); R(14, -5, 5, 2, '#7f6754'); R(19, -1, 3, 4, shade);
      R(13, 3, 4, 4, light);
    } else if (walking) {
      const swing = frame === 1 ? 4 : -4;
      R(-12, 2, 5, 5, shell); R(-13 + swing, 7, 5, 7, shade); R(-14 + swing, 14, 5, 5, light);
      R(7, 2, 5, 5, shell); R(10 - swing, 7, 5, 7, shade); R(10 - swing, 14, 5, 5, light);
    } else {
      R(-13, 3, 4, 7, shell); R(-14, 10, 4, 6, shade); R(-14, 16, 4, 4, light);
      R(9, 3, 4, 7, shell); R(10, 10, 4, 6, shade); R(10, 16, 4, 4, light);
    }

    // Rounded colored helmet around a neutral visor, one large camera eye and a flat bill.
    const hy = pose === 'sit' ? 8 : 0;
    R(-8, -35 + hy, 16, 2, shade); R(-12, -33 + hy, 24, 3, shade);
    R(-15, -30 + hy, 30, 13, shade); R(-12, -17 + hy, 24, 5, shade);
    R(-8, -34 + hy, 16, 2, light); R(-12, -31 + hy, 24, 3, shell);
    R(-14, -28 + hy, 28, 10, shell); R(-11, -18 + hy, 22, 4, shell);
    if (pose === 'sit') {
      // Back of the shell, facing the monitor.
      R(-8, -27 + hy, 16, 9, shade); R(-6, -25 + hy, 12, 5, shell);
      R(-2, -23 + hy, 4, 2, light); R(-12, -24 + hy, 2, 2, light); R(10, -24 + hy, 2, 2, light);
      R(-4, -15 + hy, 8, 1, dark);
    } else {
      R(-10, -29, 20, 2, '#e1e1d6'); R(-12, -27, 24, 8, '#c2c5c1');
      R(-10, -19, 20, 2, '#9a9f9d');
      R(-4, -28, 8, 1, ROBOT_BILL_SHADE); R(-5, -27, 10, 1, ROBOT_BILL);
      R(-6, -26, 12, 5, ROBOT_BILL); R(-5, -21, 10, 1, ROBOT_BILL);
      R(-4, -20, 8, 1, ROBOT_BILL_SHADE);
      const focus = motion?.focus === undefined ? 0 : Math.round(1 + Math.sin(motion.focus * Math.PI * 1.4));
      const eyeWidth = 6 + focus * 2, eyeHeight = 3 + focus;
      R(-eyeWidth / 2 - 1, -26, eyeWidth + 2, eyeHeight + 2, '#304750');
      R(-eyeWidth / 2, -25, eyeWidth, eyeHeight, ROBOT_EYE);
      R(-eyeWidth / 2 + 1, -24, 2, 2, ROBOT_EYE_HIGHLIGHT);
      R(8, -24, 2, 2, '#3b4a51');
      R(-13, -17, 26, 2, ROBOT_BILL_LIGHT); R(-14, -15, 28, 3, ROBOT_BILL);
      R(-12, -12, 24, 2, ROBOT_BILL_SHADE);
    }

    if (pose === 'sit') {
      // Back of the chair sits in front of the lower torso, as it does for animal agents.
      R(-15, 12, 30, 14, '#747a7d'); R(-12, 14, 24, 9, '#a6aaab');
    }
  }
  private humanCharacter(pose: Pose, stress = 0, motion?: CharacterMotion, skin: HumanSkin = DEFAULT_HUMAN.skin, hair: HumanHairColor = DEFAULT_HUMAN.hair, style: HumanHairStyle = DEFAULT_HUMAN.style, gender: HumanGender = DEFAULT_HUMAN.gender) {
    const R = this.rect.bind(this), c = this.c;
    const amount = Number.isFinite(stress) ? Math.max(0, Math.min(stress, 1)) : 0;
    const moving = motion?.walking === true, frame = motion?.frame ?? 0;
    const skinColors = HUMAN_SKIN_PALETTES[skin], hairColor = HUMAN_HAIR_PALETTES[hair];
    if (pose === 'sit') c.translate(0, -10);
    else if (pose === 'sofa') c.translate(0, 3);

    if (pose === 'sofa') {
      R(-10, 20, 8, 7, HUMAN_SUIT); R(3, 20, 8, 7, HUMAN_SUIT);
      R(-8, 26, 5, 7, HUMAN_SUIT); R(8, 26, 5, 7, HUMAN_SUIT);
      R(-10, 31, 8, 3, '#30343b'); R(7, 31, 8, 3, '#30343b');
    } else {
      const step = moving ? (frame === 0 ? 3 : -3) : 0;
      R(-7 + step, 20, 5, 8, HUMAN_SUIT); R(2 - step, 20, 5, 8, HUMAN_SUIT);
      R(-10 + step, 28, 8, 4, '#30343b'); R(0 - step, 28, 8, 4, '#30343b');
    }

    // The female suit tapers distinctly at the shoulders and waist; the existing male silhouette stays unchanged.
    if (gender === 'woman') {
      R(-11, 0, 22, 7, HUMAN_SUIT_DARK); R(-9, 7, 18, 13, HUMAN_SUIT_DARK);
      R(-9, 1, 18, 5, HUMAN_SUIT); R(-8, 7, 16, 10, HUMAN_SUIT);
      R(-13, 1, 4, 8, HUMAN_SUIT); R(9, 1, 4, 8, HUMAN_SUIT);
    } else {
      R(-13, 0, 26, 20, HUMAN_SUIT_DARK); R(-11, 1, 22, 18, HUMAN_SUIT);
      R(-15, 1, 6, 8, HUMAN_SUIT); R(9, 1, 6, 8, HUMAN_SUIT);
    }
    R(-4, -3, Math.max(1, Math.round(amount * 8)), 1, stressColor(HUMAN_STRESS, amount));

    if (pose === 'sit') {
      if (motion?.zap) {
        c.save();
        if (motion.zapSide === 1) c.scale(-1, 1);
        R(9, 1, 4, 6, HUMAN_SUIT); R(11, -4, 4, 5, HUMAN_SLEEVE); R(10, -7, 5, 4, skinColors.base);
        R(-13, 1, 4, 6, HUMAN_SUIT);
        if (motion.zap === 'windup') {
          R(-15, -4, 4, 5, HUMAN_SLEEVE); R(-17, -14, 4, 10, HUMAN_SLEEVE);
          R(-19, -30, 6, 15, '#493127'); R(-18, -29, 4, 13, '#915b35');
          R(-18, -27, 4, 1, '#c39868'); R(-18, -24, 4, 1, '#c39868');
          R(-18, -19, 5, 4, skinColors.base);
        } else if (motion.zap === 'crack') {
          R(-16, -3, 4, 5, HUMAN_SLEEVE); R(-21, -7, 5, 5, HUMAN_SLEEVE); R(-26, -9, 6, 4, skinColors.base);
          R(-36, -11, 14, 6, '#493127'); R(-35, -10, 12, 4, '#915b35');
          R(-33, -10, 1, 4, '#c39868'); R(-30, -10, 1, 4, '#c39868');
          R(-26, -9, 6, 4, skinColors.base);
        } else {
          R(-15, -4, 4, 5, HUMAN_SLEEVE); R(-19, -9, 4, 5, HUMAN_SLEEVE); R(-20, -13, 5, 4, skinColors.base);
          R(-21, -23, 6, 14, '#493127'); R(-20, -22, 4, 12, '#915b35');
          R(-20, -20, 4, 1, '#c39868'); R(-20, -17, 4, 1, '#c39868');
          R(-20, -13, 5, 4, skinColors.base);
        }
        c.restore();
      } else if (motion?.dragging) {
        R(-13, 1, 4, 5, HUMAN_SUIT); R(-17, -2, 4, 5, HUMAN_SLEEVE); R(-21, -7, 5, 4, skinColors.base);
        R(9, 1, 4, 5, HUMAN_SUIT); R(13, -2, 4, 5, HUMAN_SLEEVE); R(17, -7, 5, 4, skinColors.base);
      } else {
        R(-13, 1, 4, 6, HUMAN_SUIT); R(-15, -4, 4, 5, HUMAN_SLEEVE); R(-15, -7, 5, 4, skinColors.base);
        R(9, 1, 4, 6, HUMAN_SUIT); R(11, -4, 4, 5, HUMAN_SLEEVE); R(10, -7, 5, 4, skinColors.base);
      }
    } else if (moving) {
      const swing = frame === 1 ? 4 : -4;
      R(-13, 2, 4, 6, HUMAN_SUIT); R(-13 + swing, 8, 4, 7, HUMAN_SLEEVE); R(-13 + swing, 15, 4, 4, skinColors.base);
      R(9, 2, 4, 6, HUMAN_SUIT); R(9 - swing, 8, 4, 7, HUMAN_SLEEVE); R(9 - swing, 15, 4, 4, skinColors.base);
    } else {
      R(-13, 2, 4, 8, HUMAN_SUIT); R(-14, 10, 4, 6, HUMAN_SLEEVE); R(-14, 16, 4, 4, skinColors.base);
      R(9, 2, 4, 8, HUMAN_SUIT); R(10, 10, 4, 6, HUMAN_SLEEVE); R(10, 16, 4, 4, skinColors.base);
    }

    // Rear view at the desk; the appearance previews show the face.
    R(-7, -22, 14, 2, skinColors.shade); R(-10, -20, 20, 4, skinColors.shade);
    R(-11, -16, 22, 10, skinColors.shade); R(-9, -18, 18, 9, skinColors.base);
    R(-12, -14, 3, 5, skinColors.shade); R(9, -14, 3, 5, skinColors.shade);
    if (style !== 'bald') {
      R(-7, -22, 14, 2, hairColor); R(-10, -20, 20, 4, hairColor); R(-11, -16, 22, 3, hairColor);
      if (style === 'long') {
        R(-12, -13, 3, 13, hairColor); R(9, -13, 3, 13, hairColor);
        R(-10, -8, 2, 6, hairColor); R(8, -8, 2, 6, hairColor);
      } else {
        R(-9, -13, 18, 2, hairColor); R(-11, -15, 2, 5, hairColor); R(9, -15, 2, 5, hairColor);
      }
    } else {
      R(-6, -19, 12, 1, skinColors.highlight);
    }
    if (pose !== 'sit') {
      R(-7, -13, 4, 1, hairColor); R(3, -13, 4, 1, hairColor);
      R(-6, -11, 2, 2, '#30343b'); R(4, -11, 2, 2, '#30343b');
      R(-1, -10, 2, 2, skinColors.highlight);
      if (gender === 'man') {
        R(-9, -10, 2, 4, hairColor); R(7, -10, 2, 4, hairColor);
        R(-7, -8, 14, 2, hairColor); R(-5, -6, 10, 2, hairColor);
        R(-3, -9, 6, 1, hairColor); R(-2, -7, 4, 1, skinColors.shade);
      } else {
        R(-2, -7, 4, 1, skinColors.shade);
      }
    } else if (gender === 'man') {
      // Sideburns follow the hair even when the crown is bald.
      R(-11, -12, 2, 5, hairColor); R(9, -12, 2, 5, hairColor);
    }

    if (pose === 'sit') {
      R(-15, 12, 30, 14, '#747a7d'); R(-12, 14, 24, 9, '#a6aaab');
    }
  }
  /**
   * Tool for the current activity over the character painted just before, at the same origin (`time` in seconds).
   * Standing characters hold it in their right paw; seated ones raise it beside the left ear toward the desk, clear
   * of the model icon and status bubbles. `none` draws nothing and reduced motion freezes the frame.
   */
  activityProp(x: number, y: number, kind: ActivityKind, seated: boolean, time: number, reducedMotion: boolean): void {
    if (kind === 'none') return;
    const c = this.c, t = reducedMotion ? 0 : time, beat = Math.floor(t * 2);
    c.save(); c.translate(Math.round(x), Math.round(y));
    if (kind === 'thinking') {
      // Three dots between the ears and the model icon; one hops at a time.
      const top = this.lastRobot ? (seated ? -32 : -40) : seated ? -24 : -25, hop = Math.floor(t * 3) % 4;
      for (let i = 0; i < 3; i++) this.rect(-3 + i * 3, hop === i + 1 ? top - 1 : top, 2, 2, '#58635c');
    } else {
      // Grip space: (0, 0) is the holding paw and dx grows away from the body, so the seated left paw mirrors it.
      const gx = seated ? -14 : 12, gy = (seated ? -11 : 18) + (Math.floor(t * 6) % 2) * 2;
      const P = (dx: number, dy: number, w: number, h: number, color: string) => this.rect(seated ? gx - dx - w : gx + dx, gy + dy, w, h, color);
      if (kind === 'reading') {
        P(1, -8, 11, 7, '#7b4c37'); P(2, -9, 4, 6, '#fff8e6'); P(7, -9, 4, 6, '#fff8e6'); P(6, -8, 1, 6, '#56331f');
        for (let dy = -7; dy <= -5; dy += 2) { P(3, dy, 2, 1, '#a3aaa1'); P(8, dy, 2, 1, '#a3aaa1'); }
        if (beat % 4 === 3) { P(5, -12, 3, 8, '#fffdf7'); P(7, -11, 1, 6, '#d8ccb0'); } // a page mid-turn
      } else if (kind === 'searching') {
        P(5, -11, 5, 5, '#c3e5ec'); P(6, -10, 2, 1, '#ffffff'); P(6, -9, 1, 1, '#ffffff');
        P(5, -12, 5, 1, '#3c4a51'); P(5, -6, 5, 1, '#3c4a51'); P(4, -11, 1, 5, '#3c4a51'); P(10, -11, 1, 5, '#3c4a51');
        P(4, -6, 1, 1, '#7a5236'); P(3, -5, 2, 2, '#7a5236'); P(2, -4, 2, 2, '#7a5236'); P(1, -3, 2, 2, '#7a5236'); P(0, -2, 2, 2, '#7a5236');
      } else if (kind === 'writing') {
        const tip = 5 + Math.floor(t * 4) % 2;
        P(2, -12, 8, 9, '#fffaf0'); P(2, -12, 8, 2, '#c65b4b'); P(3, -9, 6, 1, '#a8b0a6'); P(3, -7, 5, 1, '#a8b0a6');
        P(3, -5, tip - 3, 1, '#47515a'); P(tip, -5, 1, 1, '#3b3a3a'); P(tip - 1, -4, 2, 1, '#f1d39d');
        for (let i = 2; i <= 4; i++) P(tip - i, i - 5, 2, 1, '#e8b84a');
        P(tip - 5, 0, 2, 1, '#e48c8c');
      } else if (kind === 'executing') {
        P(1, -11, 10, 9, '#3a4548'); P(2, -10, 8, 7, '#182628'); P(3, -9, 5, 1, '#6fc383'); P(3, -7, 3, 1, '#6fc383');
        P(3, -5, 1, 1, '#a6e8b4'); if (beat % 2 === 0) P(5, -6, 2, 2, '#e9ffe9');
        P(0, -2, 12, 2, '#98a1a3'); P(2, -2, 8, 1, '#7e888b');
      } else {
        const ticks = 1 + Math.floor(t) % 3;
        P(1, -13, 9, 12, '#9b6a43'); P(2, -11, 7, 8, '#fff8e4'); P(3, -14, 5, 2, '#b6bbb7');
        for (let i = 0; i < 3; i++) { P(3, -10 + i * 2, 2, 1, i < ticks ? '#4f9a62' : '#c9cec7'); P(6, -10 + i * 2, 2, 1, '#a8b0a6'); }
      }
      P(0, -3, 3, 4, this.lastFur); // the paw closes over the tool
    }
    c.restore();
  }
  modelBadge(x: number, y: number, model: ModelRef | null) {
    let badge = model ? this.modelBadges.get(model) : UNKNOWN_MODEL_BADGE;
    if (!badge) {
      badge = modelBadgeFor(model!);
      this.modelBadges.set(model!, badge);
    }
    const c = this.c;
    c.save(); c.translate(Math.round(x), Math.round(y - (this.lastRobot ? 5 : 0)));
    // Float only the model artwork above the ears, without a frame or background.
    if (badge.kind === 'octopus') {
      this.rect(-6, -7, 12, 10, '#9462a8'); this.rect(-4, -9, 8, 3, '#9462a8');
      for (const dx of [-9, -4, 1, 6]) { this.rect(dx, 2, 3, 5, '#9462a8'); this.rect(dx - 1, 6, 4, 2, '#b17ec4'); }
      this.rect(-3, -4, 2, 3, '#fffdf5'); this.rect(2, -4, 2, 3, '#fffdf5');
    } else if (badge.kind === 'sun') {
      this.rect(-5, -5, 10, 10, '#e8b743');
      for (const [dx, dy, w, h] of [[-1, -11, 2, 4], [-1, 7, 2, 4], [-11, -1, 4, 2], [7, -1, 4, 2], [-8, -8, 3, 3], [5, -8, 3, 3], [-8, 5, 3, 3], [5, 5, 3, 3]]) this.rect(dx!, dy!, w!, h!, '#d39a2d');
      this.rect(-3, -3, 6, 6, '#ffdc74');
    } else if (badge.kind === 'moon') {
      this.rect(-4, -9, 7, 3, '#d3ac4c'); this.rect(-7, -6, 5, 3, '#e8c971');
      this.rect(-8, -3, 4, 6, '#e8c971'); this.rect(-7, 3, 6, 3, '#e8c971');
      this.rect(-4, 6, 8, 3, '#d3ac4c'); this.rect(1, 4, 3, 3, '#e8c971');
    } else if (badge.kind === 'earth') {
      for (const [dx, dy, w, h, color] of EARTH) this.rect(dx, dy, w, h, color);
    } else if (badge.kind === 'grok') {
      c.font = 'bold 6px monospace';
      const width = badge.label ? c.measureText(badge.label).width + 2 : 0;
      c.fillStyle = '#34434a';
      c.save(); c.translate(-width / 2, 0); c.scale(0.025, 0.025); c.translate(-300, -300);
      c.fill(this.grokMark ??= new Path2D(GROK_MARK)); c.restore();
      if (badge.label) c.fillText(badge.label, 9 - width / 2, 2);
    } else {
      c.font = '5px monospace';
      const width = c.measureText(badge.label).width;
      c.fillStyle = '#465346'; c.fillText(badge.label, -width / 2, 3);
    }
    c.restore();
  }
  bubble(x: number, y: number, glyph: string, color: string) {
    const R = this.rect.bind(this);
    R(x - 7, y - 9, 15, 12, '#fffdf5'); R(x - 1, y + 3, 3, 3, '#fffdf5'); R(x - 7, y - 9, 15, 1, color);
    this.c.fillStyle = color; this.c.font = 'bold 9px monospace'; this.c.fillText(glyph, x - 3, y + 1);
  }
}
export const COATS = ['#d5a376', '#67616d', '#e5e0d5', '#9c9a9e', '#b58b73'];
const OUTFIT_COLORS: Record<Outfit, string> = {
  shirt: '#8fb5ca', polo: '#f0ede3', jacket: '#8d9b80', suit: '#3e4652', hoodie: '#c9705a', stripes: '#3f5a7a', labcoat: '#f6f6f2',
};
interface DogStyle {
  fur: string; face: string; ear: string; inner: string; ears: 'pointed' | 'floppy' | 'bat'; longEars?: boolean; longMuzzle?: boolean;
  muzzle: string; nose: string; eyes: string; saddle?: string; blaze?: string; spots?: [number, number][];
}
const DOGS: Record<Breed, DogStyle> = {
  shepherd: { fur: '#c78f52', face: '#e3b67e', ear: '#3b3431', inner: '#d9a46a', ears: 'pointed', muzzle: '#3b3431', nose: '#1f1b1a', eyes: '#41464b', saddle: '#3b3431' },
  golden: { fur: '#d6a05b', face: '#ebc18b', ear: '#b77c42', inner: '#b77c42', ears: 'floppy', muzzle: '#f0cf9e', nose: '#594b3d', eyes: '#41464b' },
  labrador: { fur: '#7a4f32', face: '#8f6141', ear: '#5f3c25', inner: '#5f3c25', ears: 'floppy', muzzle: '#9c6d4b', nose: '#2e211b', eyes: '#2b2622' },
  husky: { fur: '#7d858c', face: '#f1f1ef', ear: '#5f666c', inner: '#f1f1ef', ears: 'pointed', muzzle: '#f1f1ef', nose: '#2b2b2b', eyes: '#4f8fc9', saddle: '#5f666c' },
  beagle: { fur: '#b9773b', face: '#c98a4c', ear: '#6b4425', inner: '#6b4425', ears: 'floppy', longEars: true, muzzle: '#f3efe6', nose: '#2b2b2b', eyes: '#41464b', blaze: '#f3efe6' },
  frenchie: { fur: '#d9c3a0', face: '#e6d4b6', ear: '#d9c3a0', inner: '#d8a4a8', ears: 'bat', muzzle: '#4b3f37', nose: '#1f1b1a', eyes: '#2b2622' },
  dachshund: { fur: '#a85e35', face: '#c78050', ear: '#683b29', inner: '#683b29', ears: 'floppy', longEars: true, longMuzzle: true, muzzle: '#bd7649', nose: '#2e211b', eyes: '#2b2622' },
  dalmatian: { fur: '#f4f2ec', face: '#fbfaf6', ear: '#2b2b2b', inner: '#2b2b2b', ears: 'floppy', muzzle: '#fbfaf6', nose: '#2b2b2b', eyes: '#41464b', spots: [[-9, -8], [6, -7], [-6, 2], [9, 1], [2, -9]] },
};
const DOG_STRESS_LEVELS = 8;
const DOG_STRESS_CACHE = new Map<Breed, Array<DogStyle | undefined>>();
function stressedDogStyle(breed: Breed, stress = 0): DogStyle {
  const base = DOGS[breed];
  const level = Math.round((Number.isFinite(stress) ? Math.max(0, Math.min(stress, 1)) : 0) * DOG_STRESS_LEVELS);
  if (!level) return base;
  let levels = DOG_STRESS_CACHE.get(breed);
  if (!levels) DOG_STRESS_CACHE.set(breed, levels = []);
  const cached = levels[level];
  if (cached) return cached;
  const amount = level / DOG_STRESS_LEVELS * 0.68;
  const tinted: DogStyle = {
    ...base,
    fur: stressColor(base.fur, amount),
    face: stressColor(base.face, amount),
    ear: stressColor(base.ear, amount),
    inner: stressColor(base.inner, amount),
    muzzle: stressColor(base.muzzle, amount),
  };
  levels[level] = tinted;
  return tinted;
}
function stressColor(color: string, amount: number): string {
  const rgb = Number.parseInt(color.slice(1), 16);
  const channel = (shift: number, target: number) => Math.round(((rgb >> shift) & 0xff) * (1 - amount) + target * amount);
  return `#${channel(16, 255).toString(16).padStart(2, '0')}${channel(8, 32).toString(16).padStart(2, '0')}${channel(0, 32).toString(16).padStart(2, '0')}`;
}
// Automatic names in arrival order; reuse freed names before assigning new ones.
const CAT_NAMES = ['Oscar', 'Nono', 'Pablo', 'Antonio', 'Javi', 'Álvaro', 'Alex', 'Mihai',
  'Lucía', 'Sergio', 'Carmen', 'Diego', 'Marta', 'Raúl', 'Elena', 'Iván', 'Nuria', 'Hugo', 'Paula', 'Jorge', 'Irene', 'Laura'];
export function catName(order: number): string {
  return CAT_NAMES[order % CAT_NAMES.length]! + (order >= CAT_NAMES.length ? ' ' + (Math.floor(order / CAT_NAMES.length) + 1) : '');
}
