// palette.json 색 규칙 검사 (docs/art.md 8장). 기준은 rules.json
import { hexToHsl, isHex, leaves, matchPath, resolvePath } from '../../shared/src/index';

type Range = { s: [number, number]; l: [number, number]; brighterThanBg?: number };
type Role = 'islandBg' | 'dungeonBg' | 'main' | 'effect';

export interface Rules {
  ranges: Record<Role, Range>;
  roles: Record<Role, string[]>;
  warnOnly: string[];
  nonColor: string[];
}

export interface Issue {
  level: 'error' | 'warn';
  path: string;
  message: string;
}

const fmt = (n: number) => n.toFixed(1);

export function checkPalette(palette: unknown, rules: Rules, materials?: unknown): Issue[] {
  const issues: Issue[] = [];
  const levelOf = (...paths: string[]): Issue['level'] =>
    paths.some((p) => rules.warnOnly.some((w) => p === w || p.startsWith(`${w}.`))) ? 'warn' : 'error';
  const all = [...leaves(palette)];

  // 1. 형식
  for (const [path, value] of all) {
    if (rules.nonColor.some((pattern) => matchPath(pattern, path))) continue;
    if (!isHex(value)) issues.push({ level: 'error', path, message: `hex 색이 아님: ${String(value)}` });
  }

  // 층별 배경 최고 명도 (주색 대비 검사용)
  const floors = Object.keys((palette as { floors?: object }).floors ?? {});
  const bgMaxL = new Map<string, number>();
  for (const floor of floors) {
    const ls = all
      .filter(([p, v]) => matchPath(`floors.${floor}.bg.*`, p) && isHex(v))
      .map(([, v]) => hexToHsl(v as string).l);
    if (ls.length) bgMaxL.set(floor, Math.max(...ls));
  }

  // 2. 역할별 범위
  for (const role of Object.keys(rules.roles) as Role[]) {
    const range = rules.ranges[role];
    for (const pattern of rules.roles[role]) {
      const matched = all.filter(([p]) => matchPath(pattern, p));
      if (!matched.length) issues.push({ level: 'error', path: pattern, message: `rules.json 경로가 팔레트에 없음 (${role})` });
      for (const [path, value] of matched) {
        if (!isHex(value)) continue;
        const { s, l } = hexToHsl(value);
        const level = levelOf(path);
        if (s < range.s[0] || s > range.s[1])
          issues.push({ level, path, message: `${role} 채도 ${fmt(s)}% (허용 ${range.s[0]}~${range.s[1]})` });
        if (l < range.l[0] || l > range.l[1])
          issues.push({ level, path, message: `${role} 명도 ${fmt(l)}% (허용 ${range.l[0]}~${range.l[1]})` });
        if (range.brighterThanBg !== undefined) {
          // 층 몬스터는 그 층 배경과, 공용 색(플레이어)은 모든 층 배경과 비교
          const own = /^floors\.([^.]+)\./.exec(path)?.[1];
          for (const floor of own ? [own] : floors) {
            const bg = bgMaxL.get(floor);
            if (bg === undefined || l - bg >= range.brighterThanBg) continue;
            issues.push({
              level: levelOf(path, `floors.${floor}`),
              path,
              message: `${floor}층 배경(최고 명도 ${fmt(bg)}%)보다 ${fmt(l - bg)}%p 밝음 (최소 ${range.brighterThanBg})`,
            });
          }
        }
      }
    }
  }

  // 3. 재질이 가리키는 팔레트 경로
  if (materials) {
    for (const [key, ref] of leaves(materials)) {
      if (typeof ref !== 'string' || ref.startsWith('$')) continue;
      if (!isHex(resolvePath(palette, ref)))
        issues.push({ level: 'error', path: `materials.${key}`, message: `없는 팔레트 경로: ${ref}` });
    }
  }
  return issues;
}
