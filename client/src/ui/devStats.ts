// 개발 모드 전용 수치 표시 (HP·MP·물약·깃털·스킬 쿨). 캔버스 밖 DOM, 글자는 textContent로만. HUD(M1 1-7)가 생기면 지운다
import type { PlayerState } from '@game/shared';

let box: HTMLDivElement | null = null;

export function showDevStats(p: PlayerState, extra = ''): void {
  if (!import.meta.env.DEV) return;
  if (!box) {
    box = document.createElement('div');
    Object.assign(box.style, {
      position: 'fixed', left: '4px', top: '4px', zIndex: '10', padding: '2px 6px', whiteSpace: 'pre',
      font: '11px ui-monospace, monospace', color: '#fff', background: 'rgba(0,0,0,.55)', pointerEvents: 'none',
    });
    document.body.append(box);
  }
  const cds = Object.entries(p.cooldowns).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' ');
  const state = p.downed ? '전멸' : p.hurt ? p.hurt.kind : p.invuln > 0 ? '무적' : '';
  box.textContent = `HP ${p.hp}/${p.maxHp}  MP ${Math.floor(p.mp)}  Z${p.potions.hp} X${p.potions.mp}  깃털 ${p.feathers}  ${state}\n${cds}${extra ? `\n${extra}` : ''}`;
}
