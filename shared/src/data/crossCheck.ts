// 파일 사이 교차 참조 검사 (docs/data.md 5장). 순수 함수: 게임 로더·tools/data-validate·테스트가 같이 쓴다
import * as S from './schema';

export interface Issue {
  level: 'error' | 'warn';
  where: string;
  message: string;
}

/** client 쪽 그림 데이터에서 뽑은 이름 목록 */
export interface CrossRefs {
  /** poses.json 세트 → 포즈 이름 */
  poseSets: Record<string, string[]>;
  /** weapons_visual.json 프로필 id */
  visuals: string[];
  /** client/data/sprites/monsters.json 몬스터 id */
  sprites: string[];
}

/** tools/data-validate/rules.json (balance.md 4장과 같은 값) */
export interface Rules {
  /** 무기 → 평타 초당 계수 목표 (%) */
  basicDps: Record<string, number>;
  /** 허용 오차 (0.15 = ±15%) */
  tolerance: number;
}

export interface GameData {
  weapons: Record<string, S.Weapon>;
  skills: Record<string, S.Skill>;
  monsters: Record<string, S.MonsterDef>;
  rooms: S.Rooms;
}

const VARIANT_ONLY = Object.keys(S.variantExtra.shape).filter((k) => k !== 'name');

/** 변형 적용: null이면 필드 제거, 객체끼리는 얕게 합치고, 나머지는 덮어쓴다 (data.md 3장) */
export function applyVariant(base: Record<string, unknown>, variant: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  delete out.variants;
  for (const [k, v] of Object.entries(variant)) {
    if (VARIANT_ONLY.includes(k)) continue;
    const b = out[k];
    if (v === null) delete out[k];
    else if (typeof v === 'object' && !Array.isArray(v) && typeof b === 'object' && b && !Array.isArray(b)) out[k] = { ...b, ...v };
    else out[k] = v;
  }
  return out;
}

/** 평타 한 바퀴의 초당 계수 (%) = 계수 합 ÷ 구간 길이 합 */
export function basicDps(w: S.Weapon): number {
  const coef = w.basic.reduce((s, a) => s + a.coef, 0);
  const time = w.basic.reduce((s, a) => s + a.phases.windup + a.phases.active + a.phases.recovery, 0);
  return coef / time;
}

export function crossCheck(d: GameData, refs: CrossRefs, rules: Rules): Issue[] {
  const out: Issue[] = [];
  const err = (where: string, message: string) => out.push({ level: 'error', where, message });
  const warn = (where: string, message: string) => out.push({ level: 'warn', where, message });
  const ids = new Map<string, string>();
  const uniqueId = (id: string, where: string) => {
    if (ids.has(id)) err(where, `행동 id '${id}'가 ${ids.get(id)}에도 있음 (전체에서 고유해야 함)`);
    else ids.set(id, where);
  };
  const checkPoses = (where: string, poses: Record<string, string | undefined>, set: string) => {
    const names = refs.poseSets[set];
    if (!names) return;
    for (const [ph, pose] of Object.entries(poses)) {
      if (pose && !names.includes(pose)) err(`${where}.poses.${ph}`, `포즈 '${pose}'가 poses.json '${set}' 세트에 없음`);
    }
  };

  for (const [id, w] of Object.entries(d.weapons)) {
    const at = `weapons.${id}`;
    if (!refs.visuals.includes(w.visual)) err(`${at}.visual`, `'${w.visual}'가 weapons_visual.json에 없음`);
    if (!refs.poseSets[w.poseSet]) err(`${at}.poseSet`, `'${w.poseSet}'가 poses.json에 없음`);
    [...w.basic, w.dash].forEach((a, i) => {
      const where = i < w.basic.length ? `${at}.basic.${i}` : `${at}.dash`;
      uniqueId(a.id, where);
      checkPoses(where, a.poses, w.poseSet);
    });
    for (const s of w.baseSkills) if (!d.skills[s]) warn(`${at}.baseSkills`, `스킬 '${s}'가 skills.json에 아직 없음`);
    const target = rules.basicDps[id];
    if (target) {
      const dps = basicDps(w);
      if (Math.abs(dps / target - 1) > rules.tolerance) {
        warn(`${at}.basic`, `평타 초당 계수 ${Math.round(dps)}% — 목표 ${target}% ±${rules.tolerance * 100}% 밖 (balance.md 4장)`);
      }
    }
  }

  for (const [id, s] of Object.entries(d.skills)) {
    const at = `skills.${id}`;
    if (s.id !== id) err(`${at}.id`, `키와 id('${s.id}')가 다름`);
    uniqueId(s.id, at);
    const w = d.weapons[s.weapon];
    if (!w) err(`${at}.weapon`, `무기 '${s.weapon}' 없음`);
    else checkPoses(at, s.poses, w.poseSet);
    if (s.mp !== Math.round(s.cooldown * 2)) err(`${at}.mp`, `mp ${s.mp} ≠ 기준 쿨 ${s.cooldown} × 2`);
    for (const [vid, v] of Object.entries(s.variants ?? {})) {
      const vat = `${at}.variants.${vid}`;
      const extra = S.variantExtra.safeParse(v);
      if (!extra.success) err(vat, extra.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', '));
      const merged = S.skill.safeParse(applyVariant(s as unknown as Record<string, unknown>, v));
      if (!merged.success) err(vat, `적용 결과가 스킬 형식이 아님: ${merged.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`);
    }
  }

  for (const [id, m] of Object.entries(d.monsters)) {
    const at = `monsters.${id}`;
    if (!refs.sprites.includes(m.sprite)) err(`${at}.sprite`, `'${m.sprite}'가 client/data/sprites/monsters.json에 없음`);
    const attacks = new Set(m.attacks.map((a) => a.id));
    m.attacks.forEach((a, i) => uniqueId(a.id, `${at}.attacks.${i}`));
    const used = m.pattern.type === 'choose' ? m.pattern.rules.map((r) => r.attack) : m.pattern.phases.flatMap((p) => p.sequence);
    for (const a of new Set(used)) if (!attacks.has(a)) err(`${at}.pattern`, `공격 '${a}'가 attacks에 없음`);
    if (m.rank === 'boss' && !m.groggy) err(at, '보스에는 groggy 필요');
  }

  for (const [floor, f] of Object.entries(d.rooms)) {
    f.rooms.forEach((r, i) => {
      const at = `rooms.${floor}.rooms.${i}`;
      r.waves.forEach((w, j) => {
        for (const mid of Object.keys(w.monsters)) if (!d.monsters[mid]) err(`${at}.waves.${j}`, `몬스터 '${mid}' 없음`);
      });
      if (r.boss && d.monsters[r.boss]?.rank !== 'boss') err(`${at}.boss`, `'${r.boss}'가 보스 몬스터가 아님`);
    });
    if (f.returnAfterRoom > f.rooms.length) err(`rooms.${floor}.returnAfterRoom`, '방 수보다 큼');
  }
  return out;
}
