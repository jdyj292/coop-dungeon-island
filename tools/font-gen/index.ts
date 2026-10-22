// 실행: pnpm font-gen <갈무리 dist 폴더> — Galmuri9.bdf·Galmuri7.bdf → client/public/fonts/*.bin (docs/hud.md 7장)
// BDF는 갈무리 배포본(npm `galmuri` 패키지의 dist/)에 있다. 저장소에는 변환 결과만 넣는다
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeGlyphFont, parseBdf } from './bdf';

const dir = process.argv[2];
if (!dir) {
  console.error('사용법: pnpm font-gen <갈무리 dist 폴더>');
  process.exit(1);
}
for (const name of ['Galmuri9', 'Galmuri7']) {
  const bdf = parseBdf(readFileSync(join(dir, `${name}.bdf`), 'utf8'));
  const out = join('client/public/fonts', `${name}.bin`);
  const bin = encodeGlyphFont(bdf);
  writeFileSync(out, bin);
  const n = new DataView(bin.buffer).getUint32(8, true);
  console.log(`${name}: ascent ${bdf.ascent} descent ${bdf.descent}, 글자 ${n}/${bdf.glyphs.length}개 → ${out} (${Math.round(statSync(out).size / 1024)}KB)`);
}
