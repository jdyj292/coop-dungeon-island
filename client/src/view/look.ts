// 외형 번호 → 스프라이트 (art.md 3장 머리 모양, palette global.hairColors). 서버는 번호만 안다 (shared LOOK, users.hair_style·hair_color)
// 순서는 서버에 저장된 번호와 맞아야 한다: 바꾸지 말고 뒤에만 붙인다
export const HAIR_STYLES = ['short', 'ponytail', 'spiky'] as const;
export const HAIR_NAMES = ['짧은 머리', '묶은 머리', '삐죽머리'] as const;

export interface Hair {
  style: number;
  color: number;
}
export const DEFAULT_HAIR: Hair = { style: 0, color: 0 };

/** 스프라이트 머리 모양 이름 */
export const hairName = (h: Hair): string => HAIR_STYLES[h.style] ?? HAIR_STYLES[0];
/** palette 머리색 경로 */
export const hairColorPath = (h: Hair): string => `global.hairColors.${h.color}`;

/** 던전 look 문자열 "의상:머리:머리색:플레이어 색" (server dungeonGame.join) → 머리 */
export function hairOfLook(look: string | undefined): Hair {
  const [, s, c] = (look ?? '').split(':').map(Number);
  return { style: Number.isInteger(s) ? s! : 0, color: Number.isInteger(c) ? c! : 0 };
}
