// 바닥 예고·투사체·장판 그리기 (art.md 7장 "적 공격 예고": 위험색 타원 테두리 + 안쪽이 체크무늬로 차오름)
// 상태는 RoomSim이 갖고, 여기서는 매 프레임 다시 그린다
import type Phaser from 'phaser';
import { areaCenter, attackPhase, DEPTH_RATIO, type RoomSim } from '@game/shared';
import fx from '../../data/fx.json';
import { colorInt } from '../palette';
import { project } from '../view/layout';
import { dot } from './layer';

type G = Phaser.GameObjects.Graphics;

/** 바닥 타원 (반지름 r → 화면 rx = r, ry = r × 깊이 압축) 안의 점마다 */
function ellipse(cx: number, cy: number, r: number, each: (x: number, y: number, edge: boolean) => void): void {
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

  draw(sim: RoomSim): void {
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
      const origin = { x: m.body.x, y: m.body.y, facing: atk.dir };
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
