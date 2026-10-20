// 전투 이벤트 → 효과음 이름 (docs/audio.md 3장 연결표). 행동 소리는 데이터의 sfx 필드, 나머지는 여기서 정한다
import type { SimEvent } from '@game/shared';

export function soundsFor(e: SimEvent): string[] {
  const pick = (...names: (string | undefined)[]) => names.filter((n): n is string => !!n);
  switch (e.type) {
    case 'fighter':
      if (e.e.type === 'start') return pick(e.e.run.def.sfx?.windup);
      if (e.e.type === 'active') return pick(e.e.run.def.sfx?.active);
      return [];
    case 'hit':
      return pick(e.def.sfx?.hit);
    case 'backstep':
      return ['backstep'];
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
