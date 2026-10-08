// palette.json 경로("floors.1.monster.boar", "global.playerColors.0") 해석

export function resolvePath(root: unknown, path: string): unknown {
  let node: unknown = root;
  for (const key of path.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

/** 문자열 잎 노드를 모두 나열 ("_"로 시작하는 키는 건너뜀) */
export function* leaves(node: unknown, prefix = ''): Generator<[string, unknown]> {
  if (node === null || typeof node !== 'object') {
    yield [prefix, node];
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('_')) continue;
    yield* leaves(value, prefix ? `${prefix}.${key}` : key);
  }
}

/** "*"는 경로 한 칸과 맞음 */
export function matchPath(pattern: string, path: string): boolean {
  const p = pattern.split('.');
  const s = path.split('.');
  return p.length === s.length && p.every((part, i) => part === '*' || part === s[i]);
}
