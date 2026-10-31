// SK-4 2차 상태 표시 (art.md 7장): 검흔 표식(몬스터 머리 위 칼자국 두 줄), 가속(발 양옆 위로 흐르는 속도선),
// 역장 보호막(몸을 감싼 점선 타원 + 도는 반짝임). 매 프레임 다시 그린다. 온라인은 서버 상태의 표시용 값(scarred·hasted·shielded)
import type Phaser from 'phaser';
import type { Monster } from '@game/shared';
import fx from '../../data/fx.json';
import { colorInt } from '../palette';
import { project } from '../view/layout';
import { dot } from './layer';
import { col, px } from './spellDraw';

/** 캐릭터 위 (BoltLayer 4100 아래) */
const DEPTH = 4050;
const T = fx.tier2;

/** 그릴 플레이어 상태 (논리 좌표) */
export interface StatusView {
  x: number;
  y: number;
  haste: boolean;
  shield: boolean;
}

export class StatusLayer {
  private g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(DEPTH);
  }

  draw(monsters: Monster[], players: StatusView[]): void {
    const g = this.g, now = performance.now() / 1000, { sky, white, gold, deep } = col(), edge = colorInt('global.fx.smearEdge');
    g.clear();
    // 검흔: 비스듬한 칼자국 두 줄 (pulseSec마다 밝은 줄이 바뀜)
    const M = T.mark, lit = Math.floor(now / M.pulseSec) % 2;
    for (const m of monsters) {
      if (!m.scar || m.body.ko) continue;
      const { sx, sy } = project(m.body.x, m.body.y, m.body.z);
      for (let n = 0; n < 2; n++) {
        const ox = n * 3 - 2, c = n === lit ? white : gold;
        for (let d = 0; d < M.len; d++) px(g, sx + ox + d, sy + M.y - d, d === 0 || d === M.len - 1 ? edge : c);
      }
    }
    for (const p of players) {
      const { sx, sy } = project(p.x, p.y);
      if (p.haste) {
        const H = T.haste;
        for (let i = 0; i < H.lines; i++) {
          const t = (now / H.riseSec + i / H.lines) % 1, side = i % 2 ? 1 : -1;
          const x = sx + side * (H.spread + (i >> 1)), y = sy - Math.round(t * H.rise);
          for (let d = 0; d < H.len; d++) px(g, x, y + d, d === 0 ? white : gold, 1 - t);
        }
      }
      if (p.shield) {
        const S = T.shield, cy = sy + S.y, n = Math.round(Math.PI * (S.rx + S.ry));
        for (let i = 0; i < n; i += S.every) {
          const q = (i / n) * Math.PI * 2;
          px(g, sx + Math.cos(q) * S.rx, cy + Math.sin(q) * S.ry, q > Math.PI ? sky : deep, 0.8);
        }
        const q = now * S.spin, gx = sx + Math.round(Math.cos(q) * S.rx), gy = cy + Math.round(Math.sin(q) * S.ry);
        dot(g, gx, gy, white);
        dot(g, gx - 1, gy, sky); dot(g, gx + 1, gy, sky);
      }
    }
  }

  destroy(): void {
    this.g.destroy();
  }
}
