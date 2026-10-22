// DOM 폼(로그인·채팅·메모 입력)의 도트 스타일. 색은 palette.json global.ui, 크기는 게임 정수 배율(--s)의 배수
// 한 번만 <style>을 넣고, 화면 위 겹침 요소(.ui-layer)에 --s를 맞춘다
import { color } from '../../palette';
import { FONTS } from '../fonts';

let injected = false;

export function injectDomStyle(): void {
  if (injected) return;
  injected = true;
  const c = (p: string) => color(`global.ui.${p}`);
  const px = (n: number) => `calc(${n}px * var(--s))`;
  const css = `
.ui-layer { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none;
  font-family: ${FONTS.ko.family}, monospace; font-size: ${px(FONTS.ko.px)}; line-height: ${px(14)}; color: ${c('steelLight')};
  -webkit-font-smoothing: none; font-smooth: never; word-break: keep-all; }
.ui-panel { pointer-events: auto; box-sizing: border-box; width: ${px(176)}; padding: ${px(8)} ${px(10)};
  background: ${c('panel')}; border: ${px(1)} solid ${c('panelBorder')}; box-shadow: inset 0 0 0 ${px(1)} ${c('panelInner')}, 0 0 0 ${px(1)} ${c('cover')}; }
.ui-title { text-align: center; font-size: ${px(FONTS.ko.px * 2)}; line-height: ${px(28)}; margin-bottom: ${px(6)}; color: ${c('coin')}; }
.ui-tabs { display: flex; gap: ${px(2)}; margin-bottom: ${px(6)}; }
.ui-tab { flex: 1; text-align: center; cursor: pointer; padding: ${px(1)} 0; color: ${c('keyLabel')}; background: ${c('panelInner')};
  border: ${px(1)} solid ${c('panelInner')}; font: inherit; }
.ui-tab[aria-selected="true"] { color: ${c('steelLight')}; border-color: ${c('panelBorder')}; }
.ui-label { display: block; color: ${c('textDim')}; margin-top: ${px(4)}; }
.ui-hint { color: ${c('keyLabel')}; }
.ui-input { box-sizing: border-box; width: 100%; margin-top: ${px(1)}; padding: ${px(2)} ${px(3)}; font: inherit; color: ${c('steelLight')};
  background: ${c('barTrack')}; border: ${px(1)} solid ${c('panelBorder')}; border-radius: 0; outline: none; caret-color: ${c('coin')}; }
.ui-input:focus { border-color: ${c('keyLabel')}; }
.ui-input[aria-invalid="true"] { border-color: ${c('bossHp')}; }
.ui-btn { display: block; width: 100%; margin-top: ${px(8)}; padding: ${px(2)} 0; font: inherit; cursor: pointer; color: ${c('panel')};
  background: ${c('coin')}; border: ${px(1)} solid ${c('bossHpDark')}; box-shadow: inset 0 ${px(-1)} 0 ${c('bossHpDark')}; }
.ui-btn:disabled { cursor: wait; background: ${c('panelBorder')}; border-color: ${c('panelBorder')}; color: ${c('textDim')}; box-shadow: none; }
.ui-btn.ui-sub { color: ${c('steelLight')}; background: ${c('panelInner')}; border-color: ${c('panelBorder')}; box-shadow: none; }
.ui-link { display: block; margin: ${px(6)} auto 0; font: inherit; cursor: pointer; color: ${c('keyLabel')}; background: none; border: 0; text-decoration: underline; }
.ui-error { min-height: ${px(14)}; margin-top: ${px(4)}; color: ${c('bossHp')}; }
.ui-code { margin: ${px(6)} 0; padding: ${px(4)} 0; text-align: center; color: ${c('coin')}; background: ${c('barTrack')};
  border: ${px(1)} solid ${c('panelBorder')}; user-select: all; }
.ui-p { margin: ${px(2)} 0; color: ${c('textDim')}; }
`;
  const el = document.createElement('style');
  el.textContent = css;
  document.head.appendChild(el);
}

/**
 * 패널이 화면에 다 들어가는 가장 큰 정수 배율로 (게임 배율 이하). 작은 창에서 가입 폼처럼 칸이 많을 때 한 단계씩 줄임
 */
export function fitLayer(layer: HTMLElement, maxScale: number): void {
  let s = Math.max(1, maxScale);
  layer.style.setProperty('--s', String(s));
  while (s > 1 && layer.scrollHeight > layer.clientHeight) layer.style.setProperty('--s', String(--s));
}

/** 게임 위에 겹치는 DOM 층 (#game 안). scale = 현재 정수 배율 */
export function createLayer(parent: HTMLElement, scale: number): HTMLDivElement {
  injectDomStyle();
  const layer = document.createElement('div');
  layer.className = 'ui-layer';
  layer.style.setProperty('--s', String(scale));
  if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
  parent.appendChild(layer);
  return layer;
}
