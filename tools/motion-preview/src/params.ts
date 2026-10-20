// 조정할 값 목록: 게임이 읽는 JSON 객체를 메모리에서만 바꾼다 (파일은 그대로). 바꾼 값만 JSON으로 뽑는다
import fx from '../../../client/data/fx.json';
import combat from '../../../shared/data/combat.json';
import skills from '../../../shared/data/skills.json';
import weapons from '../../../shared/data/weapons.json';

const FILES: Record<string, unknown> = {
  'shared/data/weapons.json': weapons,
  'shared/data/skills.json': skills,
  'shared/data/combat.json': combat,
  'client/data/fx.json': fx,
};
const ORIGINAL = structuredClone(FILES);

export interface Param {
  group: string;
  label: string;
  file: string;
  /** 점으로 구분한 키 경로 (배열 칸은 숫자) */
  path: string;
  range: [min: number, max: number, step: number];
}

type Obj = Record<string, unknown>;
const walk = (root: unknown, keys: string[]) => keys.reduce<unknown>((o, k) => (o as Obj)[k], root);

export function getValue(p: Param, from: Record<string, unknown> = FILES): number {
  return walk(from[p.file], p.path.split('.')) as number;
}

export function setValue(p: Param, v: number): void {
  const keys = p.path.split('.');
  (walk(FILES[p.file], keys.slice(0, -1)) as Obj)[keys.at(-1)!] = v;
}

export const isChanged = (p: Param) => getValue(p) !== getValue(p, ORIGINAL);

const W = 'shared/data/weapons.json', S = 'shared/data/skills.json', C = 'shared/data/combat.json', F = 'client/data/fx.json';
const SEC: Param['range'] = [0, 0.6, 0.01];
const phases = (group: string, file: string, base: string): Param[] =>
  (['windup', 'active', 'recovery'] as const).map((ph) => ({ group, label: ph, file, path: `${base}.phases.${ph}`, range: SEC }));

export const PARAMS: Param[] = [
  ...phases('평타 1타', W, 'greatsword.basic.0'),
  ...phases('평타 2타', W, 'greatsword.basic.1'),
  ...phases('평타 3타', W, 'greatsword.basic.2'),
  { group: '평타 3타', label: 'comboWindow', file: W, path: 'greatsword.comboWindow', range: SEC },
  ...phases('올려베기', S, 'gs_launch'),
  { group: '올려베기', label: 'launchVz', file: S, path: 'gs_launch.launchVz', range: [80, 320, 10] },
  { group: '올려베기', label: 'gravity', file: C, path: 'gravity', range: [300, 900, 10] },
  { group: '올려베기', label: 'bounceVz', file: C, path: 'bounceVz', range: [0, 200, 5] },
  ...(['light', 'medium', 'heavy'] as const).flatMap((g): Param[] => [
    { group: '히트스톱·흔들림', label: `${g} 정지`, file: C, path: `grades.${g}.hitstop`, range: [0, 0.3, 0.01] },
    { group: '히트스톱·흔들림', label: `${g} 흔들림px`, file: C, path: `grades.${g}.shake`, range: [0, 4, 1] },
  ]),
  { group: '히트스톱·흔들림', label: '흔들림 추가', file: C, path: 'shakeAfterHitstop', range: [0, 0.4, 0.01] },
  ...(['light', 'medium', 'heavy'] as const).map((g): Param => (
    { group: '번쩍임 (프레임)', label: g, file: F, path: `flashFrames.${g}`, range: [0, 10, 1] })),
  { group: '리듬 (px)', label: '준비 뒤로', file: F, path: 'rhythm.back', range: [0, 4, 1] },
  ...(['light', 'medium', 'heavy'] as const).map((g): Param => (
    { group: '리듬 (px)', label: `${g} 앞으로`, file: F, path: `rhythm.forward.${g}`, range: [0, 6, 1] })),
  { group: '리듬 (px)', label: '복귀 초', file: F, path: 'rhythm.returnSec', range: [0.02, 0.4, 0.01] },
  { group: '스미어', label: '유지 초', file: F, path: 'smear.sec', range: [0.02, 0.2, 0.01] },
  ...(['light', 'medium', 'heavy'] as const).map((g): Param => (
    { group: '스미어', label: `${g} 크기+`, file: F, path: `smear.grow.${g}`, range: [0, 5, 1] })),
];

/** 승인 데모의 타이밍 (motion.md 1장 기준 예) */
export const DEMO_TIMING: [path: string, value: number][] = [
  ['greatsword.basic.0.phases.windup', 0.12],
  ['greatsword.basic.1.phases.windup', 0.12],
  ['greatsword.basic.2.phases.windup', 0.24],
];

export function applyPreset(values: [string, number][], file = W): void {
  for (const [path, v] of values) {
    const p = PARAMS.find((q) => q.file === file && q.path === path);
    if (p) setValue(p, v);
  }
}

export function resetAll(): void {
  for (const p of PARAMS) setValue(p, getValue(p, ORIGINAL));
}

/** 바꾼 값만: { 파일: { 키 경로: 값 } } */
export function changedJson(): string {
  const out: Record<string, Record<string, number>> = {};
  for (const p of PARAMS.filter(isChanged)) (out[p.file] ??= {})[p.path] = getValue(p);
  return JSON.stringify(out, null, 2);
}
