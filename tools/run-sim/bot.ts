// run-sim 봇: 서버 DungeonGame에 메시지를 보내는 단순한 플레이어 (사람보다 덜 피하고 덜 똑똑함 → 시간은 참고값)
// 가까운 몬스터 옆으로 가서 평타, 쿨이 되면 스킬, 예고를 보면 백스텝, HP 40% 아래면 물약, 쓰러진 동료 부활, 클리어 뒤 상자·출구
import { attackPhase, mapOf, skillDef, skillReady, weaponDef, type Monster, type RoomDef } from '../../shared/src';
import type { DungeonGame } from '../../server/src/systems/dungeonGame';

/** 행동 메시지 간격 (서버 제한 초당 10회 안) */
const ACTION_GAP_MS = 120;
const REVIVE_GAP_MS = 150;
/** 이만큼 넘게 떨어져 있으면 달린다 */
const RUN_PX = 60;
/** 이 안에서 몬스터가 공격 준비 중이면 백스텝 */
const DODGE_PX = 40;
const POTION_HP = 0.4;
/** 투사체가 이 시간 안에 닿으면 줄을 비킴, 줄 판정 여유 */
const EVADE_SEC = 0.35;
const LANE_MARGIN = 6;
/** 몬스터와 깊이를 이만큼 비껴 선다 */
const OFFSET_Y = 8;
/** 가려는데 이만큼 안 움직이면 막힌 것 → 깊이 방향으로 비켜 감 (장애물 돌아가기) */
const STUCK_MS = 400;
const SIDESTEP_MS = 500;

export class Bot {
  private seq = 0;
  private last = { mx: 0, my: 0, run: false };
  private nextAction = 0;
  private skills = weaponDef('greatsword').baseSkills;
  private lastPos = { x: 0, y: 0, at: 0 };
  private sidestep: { dir: number; until: number } | null = null;

  constructor(private g: DungeonGame, readonly pid: string) {}

  private send(type: 'input' | 'action' | 'item' | 'interact', msg: object): void {
    this.g.onMessage(this.pid, type, msg);
  }

  private move(mx: number, my: number, run: boolean): void {
    const v = { mx: Math.sign(mx), my: Math.sign(my), run };
    if (v.mx === this.last.mx && v.my === this.last.my && v.run === this.last.run) return;
    this.last = v;
    this.send('input', { seq: ++this.seq, t: this.g.now, ...v });
  }

  /** (x, y)로 걷기 (가까우면 멈춤). 도착했으면 true. 막히면 잠깐 깊이 방향으로 비켜 감 */
  private goto(x: number, y: number, tol = 3): boolean {
    const g = this.g, p = this.me.pos, dx = x - p.x, dy = y - p.y;
    const arrived = Math.abs(dx) <= tol && Math.abs(dy) <= tol;
    if (arrived) {
      this.move(0, 0, false);
      return true;
    }
    if (Math.hypot(p.x - this.lastPos.x, p.y - this.lastPos.y) > 1) this.lastPos = { x: p.x, y: p.y, at: g.now };
    else if (!this.sidestep && !this.me.fighter.run && g.now - this.lastPos.at > STUCK_MS) {
      const mid = (g.sim.bounds.minY + g.sim.bounds.maxY) / 2;
      this.sidestep = { dir: p.y < mid ? 1 : -1, until: g.now + SIDESTEP_MS };
    }
    if (this.sidestep && g.now < this.sidestep.until) {
      this.move(0, this.sidestep.dir, false);
      return false;
    }
    this.sidestep = null;
    this.move(Math.abs(dx) > tol ? dx : 0, Math.abs(dy) > tol ? dy : 0, Math.hypot(dx, dy) > RUN_PX);
    return false;
  }

  private get me() {
    return this.g.sim.players.get(this.pid)!.state;
  }

  private act(kind: 'basic' | 'skill' | 'backstep', skillId?: string): void {
    if (this.g.now < this.nextAction) return;
    this.nextAction = this.g.now + ACTION_GAP_MS;
    const p = this.me;
    this.send('action', { seq: ++this.seq, t: this.g.now, kind, ...(skillId ? { skillId } : {}), x: p.pos.x, y: p.pos.y, facing: p.facing < 0 ? -1 : 1 });
  }

  /** 한 틱 (서버 틱 전에) */
  step(room: RoomDef): void {
    const g = this.g, p = this.me, st = g.state;
    if (st.phase === 'result' || p.downed || !g.sim.players.get(this.pid)) return;
    // 물약
    if (p.hp < p.maxHp * POTION_HP && p.potions.hp > 0 && p.potionCd.hp <= 0) this.send('item', { seq: ++this.seq, t: g.now, slot: 'hp' });
    // 쓰러진 동료
    const ally = [...g.sim.players.values()].find((sp) => sp.pid !== this.pid && sp.state.downed && !sp.away);
    if (ally) {
      if (this.goto(ally.state.pos.x, ally.state.pos.y, 6) && g.now >= this.nextAction) {
        this.nextAction = g.now + REVIVE_GAP_MS;
        this.send('interact', { targetId: `revive:${ally.pid}` });
      }
      return;
    }
    const map = mapOf(room);
    if (st.doorOpen) {
      // 보물상자 먼저, 그다음 출구 (보스 방은 결과를 기다림)
      if (map.chest && !st.chestOpen) {
        if (this.goto(map.chest.x, map.chest.y + 4)) this.send('interact', { targetId: 'chest' });
        return;
      }
      if (map.doorOut) this.goto(map.doorOut.x, map.doorOut.y + 6);
      else this.move(0, 0, false);
      return;
    }
    if (this.evade()) return;
    const target = this.nearest();
    if (!target) return this.move(0, 0, false);
    this.fight(target);
  }

  /**
   * 줄 피하기: 날아오는 투사체, 돌진 준비 중인 몬스터(예고 line)와 같은 깊이 줄이면 깊이 방향으로 비켜 섬. 비켜 섰으면 true
   */
  private evade(): boolean {
    const g = this.g, p = this.me.pos;
    if (this.me.fighter.run) return false;
    for (const pr of g.sim.projectiles) {
      const toward = Math.sign(p.x - pr.x) === pr.dir, near = Math.abs(p.x - pr.x) / (pr.def.projectile?.speed ?? 1) < EVADE_SEC;
      if (toward && near && Math.abs(p.y - pr.y) < (pr.def.projectile?.radius ?? 3) + LANE_MARGIN) return this.dodgeLane(pr.y);
    }
    for (const m of g.sim.alive) {
      const tel = m.attack?.def.telegraph?.type;
      if (attackPhase(m) === 'windup' && (tel === 'line' || tel === 'shake+line') && Math.abs(p.y - m.body.y) < (m.attack!.def.hitbox?.depth ?? 8) / 2 + LANE_MARGIN) {
        return this.dodgeLane(m.body.y);
      }
    }
    return false;
  }

  /** y줄에서 벗어나는 쪽으로 (방 가운데 쪽) */
  private dodgeLane(y: number): boolean {
    const b = this.g.sim.bounds, p = this.me.pos;
    const up = p.y > y || (p.y === y && p.y > (b.minY + b.maxY) / 2);
    this.move(0, up ? 1 : -1, true);
    return true;
  }

  private nearest(): Monster | undefined {
    const p = this.me.pos;
    return this.g.sim.alive.filter((m) => !m.body.ko)
      .sort((a, b) => Math.hypot(a.body.x - p.x, a.body.y - p.y) - Math.hypot(b.body.x - p.x, b.body.y - p.y))[0];
  }

  private fight(m: Monster): void {
    const p = this.me, b = m.body;
    const reach = 10 + m.def.hurtbox.width / 2;
    const side = p.pos.x < b.x ? -1 : 1, tx = b.x + side * reach;
    // 깊이를 살짝 비껴서 친다: 평타 판정(깊이 13 + 몬스터 깊이)의 안쪽, 돌진 정렬(멧돼지 6px)의 바깥
    const reachY = Math.max(0, (13 + m.def.hurtbox.depth) / 2 - 3), ty = b.y + (p.pos.y < b.y ? -1 : 1) * Math.min(OFFSET_Y, reachY);
    const dist = Math.hypot(b.x - p.pos.x, b.y - p.pos.y);
    // 예고를 보면 물러남
    if (attackPhase(m) === 'windup' && dist < DODGE_PX + m.def.hurtbox.width / 2 && p.backstepCd <= 0 && !p.fighter.run) {
      if ((b.x > p.pos.x) === (p.facing > 0)) this.act('backstep');
      else this.move(b.x > p.pos.x ? 1 : -1, 0, false);
      return;
    }
    const inLine = Math.abs(ty - p.pos.y) <= 2, inRange = Math.abs(p.pos.x - tx) <= 5;
    if (!inLine || !inRange) {
      this.goto(tx, ty, 2);
      return;
    }
    // 몬스터를 보도록 한 칸 누르고, 공격
    const want = b.x > p.pos.x ? 1 : -1;
    if (p.facing !== want && !p.fighter.run) return this.move(want, 0, false);
    this.move(0, 0, false);
    // 스킬은 쿨·MP가 되면 (행동 중이 아닐 때만: 연타를 끊지 않게)
    const skill = this.skills.find((id) => skillReady(p, skillDef(id)));
    if (skill && !p.fighter.run) this.act('skill', skill);
    else this.act('basic');
  }
}
