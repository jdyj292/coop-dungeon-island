// 원격 투사체 (상태에 넣지 않고 이벤트로만 옴, network.md 5·6장): 몬스터 투사체(projSpawn·projEnd)와 플레이어 마법탄(bolt·boltEnd)
// 생긴 시각부터 직선으로 날리고, 사라진 시각(그리는 시점이 닿을 때)에 지운다. 마법탄은 사라질 때 적중 섬광 또는 흩어짐
import { MONSTERS, WEAPONS, type ActionDef, type MonsterAttack, type Projectile, type S2C } from '@game/shared';
import type { FxLayer } from '../fx/layer';
import { boltFizzle, boltHit } from '../fx/spell';
import { project } from '../view/layout';
import fx from '../../data/fx.json';

export const ATTACKS = new Map<string, MonsterAttack>(Object.values(MONSTERS).flatMap((m) => m.attacks.map((a) => [a.id, a] as const)));
/** 투사체 플레이어 행동 (스태프 평타) */
const BOLT_DEFS = new Map<string, ActionDef>(Object.values(WEAPONS).flatMap((w) => [...w.basic, w.dash]
  .filter((a) => a.projectile).map((a) => [a.id, a as ActionDef] as const)));

interface Flying {
  speed: number;
  x0: number;
  y: number;
  dir: number;
  t0: number;
  endAt: number;
}

export class RemoteShots {
  private monster = new Map<number, Flying & { p: Projectile }>();
  private bolts = new Map<number, Flying & { end?: S2C['boltEnd'] }>();

  /** 처리했으면 true */
  on(type: string, msg: unknown, now: number): boolean {
    if (type === 'projSpawn') {
      const m = msg as S2C['projSpawn'], def = ATTACKS.get(m.kind);
      if (def) this.monster.set(m.id, { p: { id: m.id, ownerId: m.owner, def, x: m.x, y: m.y, dir: m.dir, traveled: 0, done: false, hitPids: [] }, speed: def.projectile!.speed, x0: m.x, y: m.y, dir: m.dir, t0: m.t0, endAt: Infinity });
    } else if (type === 'projEnd') {
      const pr = this.monster.get((msg as S2C['projEnd']).id);
      if (pr) pr.endAt = now;
    } else if (type === 'bolt') {
      const m = msg as S2C['bolt'], def = BOLT_DEFS.get(m.kind);
      if (def) this.bolts.set(m.id, { speed: def.projectile!.speed, x0: m.x, y: m.y, dir: m.dir, t0: m.t0, endAt: Infinity });
    } else if (type === 'boltEnd') {
      const m = msg as S2C['boltEnd'], b = this.bolts.get(m.id);
      if (b) Object.assign(b, { endAt: now, end: m });
    } else return false;
    return true;
  }

  /** 시각 t: 몬스터 투사체 (위험 그리기용)와 날고 있는 마법탄 위치. 끝난 마법탄은 적중·흩어짐 연출을 layer에 */
  at(t: number, layer: FxLayer): { projectiles: Projectile[]; bolts: { x: number; y: number; dir: number }[] } {
    const x = (f: Flying) => f.x0 + f.dir * f.speed * Math.max(0, (t - f.t0) / 1000);
    for (const [id, pr] of this.monster) {
      if (t >= pr.endAt) this.monster.delete(id);
      else pr.p.x = x(pr);
    }
    const bolts: { x: number; y: number; dir: number }[] = [];
    for (const [id, b] of this.bolts) {
      if (t < b.endAt) {
        bolts.push({ x: x(b), y: b.y, dir: b.dir });
        continue;
      }
      this.bolts.delete(id);
      if (!b.end) continue;
      const { sx, sy } = project(b.end.x, b.end.y, fx.spell.bolt.height);
      if (b.end.reason === 'hit') layer.add(boltHit(sx, sy));
      else boltFizzle(sx, sy).forEach((e) => layer.add(e));
    }
    return { projectiles: [...this.monster.values()].map((p) => p.p), bolts };
  }
}
