// 바닥 예고·투사체·장판 그리기 (art.md 7장 "적 공격 예고": 위험색 타원 테두리 + 안쪽이 체크무늬로 차오름)
// 상태는 RoomSim이 갖고, 여기서는 매 프레임 다시 그린다
import type Phaser from 'phaser';
import { areaCenter, attackOrigin, attackPhase, DEPTH_RATIO, type RoomSim } from '@game/shared';
import fx from '../../data/fx.json';
import { colorInt } from '../palette';
import { project } from '../view/layout';
import { dot } from './layer';
import { px } from './spellDraw';

type G = Phaser.GameObjects.Graphics;

/** 바닥 타원 (반지름 r → 화면 rx = r, ry = r × 깊이 압축) 안의 점마다 */
export function ellipse(cx: number, cy: number, r: number, each: (x: number, y: number, edge: boolean) => void): void {
  const rx = r, ry = Math.max(1, Math.round(r * DEPTH_RATIO));
  for (let y = -ry; y <= ry; y++) {
    const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y / ry) ** 2)));
    for (let x = -hw; x <= hw; x++) each(cx + x, cy + y, x === -hw || x === hw || Math.abs(y) === ry);
  }
}

export class HazardLayer {
  private ground: G;
  private air: G;

  constructor(scene: Phaser.Scene) {
    this.ground = scene.add.graphics().setDepth(-450);
    this.air = scene.add.graphics().setDepth(4000);
  }

  draw(sim: Pick<RoomSim, 'zones' | 'alive' | 'projectiles'>): void {
    const g = this.ground, a = this.air;
    g.clear();
    a.clear();
    const danger = colorInt('global.semantic.danger');
    const hz = fx.hazard as {
      projectile: Record<string, { fill: string; edge: string; height: number }>;
      zone: Record<string, { fill: string; alpha: number }>;
      telegraphDash: number;
    };

    // 장판: 체크무늬 반투명, 끝나갈수록 옅게
    for (const z of sim.zones) {
      const style = hz.zone[z.attackId];
      if (!style) continue;
      const { sx, sy } = project(z.x, z.y);
      const alpha = style.alpha * Math.min(1, z.left / 0.5);
      ellipse(sx, sy, z.def.radius ?? 16, (x, y) => { if ((x + y) % 2 === 0) dot(g, x, y, colorInt(style.fill), 1, 1, alpha); });
    }

    // 예고: 공격 준비(windup) 동안 차오름
    for (const m of sim.alive) {
      const atk = m.attack, tel = atk?.def.telegraph;
      if (!atk || !tel || attackPhase(m) !== 'windup') continue;
      const k = Math.min(1, atk.t / atk.def.phases.windup);
      // 대각선 조준이면 예고도 조준 깊이로 (서버 판정과 같은 기준점)
      const origin = attackOrigin(m);
      if (tel.type === 'area' && atk.def.area) {
        const c = areaCenter(origin, atk.def.area.at), { sx, sy } = project(c.x, c.y);
        const r = atk.def.area.radius ?? atk.def.area.width! / 2;
        ellipse(sx, sy, r, (x, y, edge) => {
          const inner = Math.hypot((x - sx) / r, (y - sy) / (r * DEPTH_RATIO)) <= k;
          if (edge || (inner && (x + y) % 2 === 0)) dot(g, x, y, danger);
        });
      }
      if ((tel.type === 'line' || tel.type === 'shake+line') && tel.length) {
        // 돌진 방향 줄: 판정 깊이의 위아래 경계를 점선으로, 앞으로 차오름
        const half = (atk.def.hitbox?.depth ?? 8) / 2, dash = hz.telegraphDash;
        for (const edgeY of [-half, half]) {
          for (let d = 0; d <= tel.length * k; d++) {
            if (Math.floor(d / dash) % 2) continue;
            const { sx, sy } = project(m.body.x + d * atk.dir, m.body.y + edgeY);
            dot(g, sx, sy, danger);
          }
        }
      }
    }

    // 빙결: 머리 위 얼음 조각 (외곽선 하늘색은 monsterTexture)
    const ice = colorInt('global.allyFx.sky'), glint = colorInt('global.allyFx.white');
    for (const m of sim.alive) {
      if (!(m.frozen > 0)) continue;
      const { sx, sy } = project(m.body.x, m.body.y, m.body.z);
      for (const [dx, dy] of fx.spell.frozen.shards as [number, number][]) {
        dot(a, sx + dx, sy + dy, ice, 1, 2);
        dot(a, sx + dx, sy + dy - 1, glint);
      }
    }

    // 감속(동토): 발밑 눈송이, 하나씩 차례로 반짝임 (몸에 가리지 않게 위 층)
    const flakes = fx.spell.slowed.flakes as [number, number][];
    const lit = Math.floor(performance.now() / 1000 / fx.spell.slowed.twinkleSec);
    for (const m of sim.alive) {
      if (!(m.slow.left > 0) || m.frozen > 0) continue;
      const { sx, sy } = project(m.body.x, m.body.y);
      flakes.forEach(([dx, dy], i) => {
        const on = (lit + i * 2) % (flakes.length * 2) === 0;
        dot(a, sx + dx, sy + dy, on ? glint : ice);
        dot(a, sx + dx - 1, sy + dy, ice, 1, 1, on ? 1 : 0.5);
        dot(a, sx + dx + 1, sy + dy, ice, 1, 1, on ? 1 : 0.5);
        if (on) { dot(a, sx + dx, sy + dy - 1, ice); dot(a, sx + dx, sy + dy + 1, ice); }
      });
    }

    // 연소: 몸 좌우에서 불씨가 시차를 두고 떠오르며 흰 → 금 → 주황빛 금, 위에서 바둑판으로 사라짐
    const bn = fx.spell.burning, now = performance.now() / 1000;
    const fire = [glint, colorInt('global.allyFx.gold'), colorInt('global.fx.fireDeep')];
    for (const m of sim.alive) {
      if (!(m.burn.left > 0)) continue;
      const { sx, sy } = project(m.body.x, m.body.y, m.body.z);
      // 머리 위 작은 불꽃 (W 흰·G 금·O 주황빛 금), flickerSec마다 끝이 좌우로 일렁임
      const sway = Math.floor(now / bn.flickerSec + m.id) % 2;
      (bn.flame as string[]).forEach((row, ry, rows) => {
        const shift = ry === 0 ? sway : 0;
        [...row].forEach((ch, rx) => {
          const c = ch === 'W' ? glint : ch === 'G' ? fire[1]! : ch === 'O' ? fire[2]! : -1;
          if (c >= 0) dot(a, sx + rx - (row.length >> 1) + shift, sy + bn.flameY - (rows.length - 1 - ry), c);
        });
      });
      (bn.embers as [number, number][]).forEach(([dx, dy], i, all) => {
        const t = (now / bn.riseSec + i / all.length) % 1;
        const x = sx + dx + Math.round(Math.sin((t + i) * Math.PI * 2) * bn.sway), y = sy + dy - Math.round(t * bn.rise);
        // 갓 피어난 불씨는 2×2 (위 왼쪽이 밝음), 반쯤 오르면 1px, 끝 fadeFrom부터 바둑판으로 사라짐
        const c = fire[Math.min(2, Math.floor(t * 3))]!, fade = Math.min(1, (1 - t) / (1 - bn.fadeFrom));
        px(a, x, y, t < bn.bigUntil ? glint : c, fade);
        if (t < bn.bigUntil) { px(a, x + 1, y, c, fade); px(a, x, y + 1, c, fade); px(a, x + 1, y + 1, fire[2]!, fade); }
      });
    }

    // 중압: 감속 동안 하늘색 반짝이가 몸 둘레 납작한 궤도를 돈다 (그림은 옛 무중력 fx.spell.weightless 그대로). 뒤쪽 반은 진한 1px, 몸 폭 body 안은 가려짐
    const wl = fx.spell.weightless, deep = colorInt('global.fx.spellDeep');
    for (const m of sim.alive) {
      if (!(m.pressed > 0) || m.slow.left <= 0) continue;
      const { sx, sy } = project(m.body.x, m.body.y, m.body.z);
      for (let i = 0; i < wl.sparks; i++) {
        const ang = now * wl.spin + (i / wl.sparks) * Math.PI * 2;
        const x = sx + Math.round(Math.cos(ang) * wl.rx), y = sy + wl.y + Math.round(Math.sin(ang) * wl.ry);
        if (Math.sin(ang) < 0) {
          if (Math.abs(x - sx) > wl.body) dot(a, x, y, deep);
          continue;
        }
        dot(a, x, y, glint);
        dot(a, x - 1, y, ice); dot(a, x + 1, y, ice); dot(a, x, y - 1, ice); dot(a, x, y + 1, ice);
      }
    }

    // 투사체: 공중에 뜬 구슬 (그림자 없이 높이만)
    for (const p of sim.projectiles) {
      const style = hz.projectile[p.def.id];
      if (!style) continue;
      const { sx, sy } = project(p.x, p.y), r = p.def.projectile!.radius, cy = sy - style.height;
      for (let y = -r; y <= r; y++) {
        for (let x = -r; x <= r; x++) {
          const d = Math.hypot(x, y);
          if (d <= r) dot(a, sx + x, cy + y, colorInt(d > r - 1 ? style.edge : style.fill));
        }
      }
    }
  }
}
