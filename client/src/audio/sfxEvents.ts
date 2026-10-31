// 전투 이벤트 → 효과음 이름 (docs/audio.md 3장 연결표). 행동 소리는 데이터의 sfx 필드, 나머지는 여기서 정한다
import type { SimEvent } from '@game/shared';

/** 전용 그림이 있는 예약 판정의 소리 (SK-4 2b, look → 효과음) */
const LOOK_SOUNDS: Record<string, string> = {
  chain: 'chain_hop', scar: 'scar_burst', blast: 'fire_blast', stick: 'throw_stick', quake: 'aftershock', orbEnd: 'orb_burst', rise: 'collapse_rise',
};

/** 변형 예약 판정 (look이 있으면 그 소리, 아니면 반복·후속 = 그 행동의 active 소리, 해제 = 적중 소리). 온라인 echo 메시지도 같은 규칙 */
export const echoSound = (kind: string, def: { sfx?: { active?: string; hit?: string } }, look?: string): string[] => {
  const n = (look && LOOK_SOUNDS[look]) || (kind === 'shatter' ? def.sfx?.hit : def.sfx?.active);
  return n ? [n] : [];
};

/** 역장 보호막이 새로 씌워진 플레이어 (shield_up 한 번). on = 지금 보호막이 있는 플레이어 id, was는 고쳐 쓴다 */
export function shieldsRaised(was: Set<string>, on: Set<string>): number {
  let n = 0;
  for (const id of on) if (!was.has(id)) n++;
  was.clear();
  on.forEach((id) => was.add(id));
  return n;
}

/** teleport = 순간이동 백스텝 무기 (스태프 backstepStyle teleport): 백스텝 소리 대신 teleport */
export function soundsFor(e: SimEvent, opts: { teleport?: boolean } = {}): string[] {
  const pick = (...names: (string | undefined)[]) => names.filter((n): n is string => !!n);
  switch (e.type) {
    case 'fighter':
      if (e.e.type === 'start') return pick(e.e.run.def.sfx?.windup);
      if (e.e.type === 'active') return pick(e.e.run.def.sfx?.active);
      return [];
    case 'hit':
      return pick(e.def.sfx?.hit);
    case 'echo':
      return echoSound(e.echo.kind, e.echo.def, e.echo.look);
    case 'backstep':
      return [opts.teleport ? 'teleport' : 'backstep'];
    case 'playerHit':
      return [e.def.strength === 'heavy' ? 'hitHeavy' : 'hitLight'];
    case 'potion':
      return ['potion'];
    case 'monster': {
      const ev = e.e;
      if (ev.type === 'attackStart') return pick(ev.def.sfx?.windup);
      if (ev.type === 'active') return pick(ev.def.sfx?.active);
      if (ev.type === 'wallHit' && ev.groggy) return ['mon_bear_roar'];
      if (ev.type === 'body' && ev.e === 'bounce') return ['bounce'];
      if (ev.type === 'body' && ev.e === 'down') return ['down'];
      return [];
    }
    default:
      return [];
  }
}
