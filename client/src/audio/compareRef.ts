// 승인 원본(tools/sfx-preview/reference-*.html)과 우리 엔진이 같은 소리 그래프를 만드는지 비교 (테스트·sfx-preview)
// 원본 스크립트를 가짜 AudioContext로 돌려 소리마다 노드·값·연결 기록을 얻고, 같은 이름의 sfx.json 레시피 기록과 맞춘다
import { SfxPlayer } from './player';
import { FakeAudioContext, type FakeNode, type RecEntry } from './recorder';

/** 원본 데모의 버튼 이름 → sfx.json 이름 (원본에만 있고 승인되지 않은 소리는 뺌) */
export const REFERENCE_NAMES: Record<'action' | 'clear', Record<string, string>> = {
  action: {
    swing: 'swing', swingHeavy: 'swingHeavy', hitLight: 'hitLight', hitHeavy: 'hitHeavy', launch: 'launch',
    bounce: 'bounce', down: 'down', backstep: 'backstep', dash: 'dash', guard: 'guard',
    slashSkill: 'skill_slash', fireburst: 'skill_fireburst', iceField: 'skill_icefield',
    mushWindup: 'mon_mushroom_windup', boarCharge: 'mon_boar_charge', spore: 'mon_spore_shot', bossRoar: 'mon_bear_roar',
  },
  clear: { coin: 'coin', potion: 'potion', levelup: 'levelup', clear: 'roomClear', click: 'click', place: 'place', yawn: 'bearYawn' },
};

interface RefInstance {
  S: Record<string, (at: number) => void>;
  ctx: () => FakeAudioContext;
  bus: () => { M: FakeNode; RV: FakeNode; DS: FakeNode | null };
}

/** 원본 HTML의 마지막 스크립트를 가짜 window·document로 실행 (화면 부분은 아무 일도 안 하는 대역) */
export function loadReference(html: string, audio: FakeAudioContext): RefInstance {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const code = scripts.at(-1)![1]!;
  const stub: unknown = new Proxy(function () {}, {
    get: (_t, k) => (k === 'style' ? {} : stub),
    set: () => true,
    apply: () => stub,
  });
  const win = { AudioContext: function () { return audio; } };
  const run = new Function('window', 'document', `${code}
    return { S, ctx, bus: () => ({ M, RV, DS: typeof DS === 'undefined' ? null : DS }) };`);
  return run(win, stub) as RefInstance;
}

export interface CompareResult {
  bus: 'action' | 'clear';
  reference: string;
  name: string;
  same: boolean;
  /** 처음 다른 줄 (같으면 빈 문자열) */
  diff: string;
}

const show = (e: RecEntry | undefined) => (e ? e.join(' ') : '(없음)');

function firstDiff(a: RecEntry[], b: RecEntry[]): string {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (show(a[i]) !== show(b[i])) return `${i}번째: 원본 "${show(a[i])}" / 엔진 "${show(b[i])}"`;
  }
  return '';
}

/** 한 버스의 원본 데모와 비교 */
export function compareBus(bus: 'action' | 'clear', html: string): CompareResult[] {
  const out: CompareResult[] = [];
  for (const [refName, name] of Object.entries(REFERENCE_NAMES[bus])) {
    const refAudio = new FakeAudioContext();
    const ref = loadReference(html, refAudio);
    ref.ctx();
    const rb = ref.bus();
    rb.M.label = 'M';
    rb.RV.label = 'RV';
    if (rb.DS) rb.DS.label = 'DS';
    refAudio.rec.mark();
    ref.S[refName]!(0);

    const ourAudio = new FakeAudioContext();
    const player = new SfxPlayer(() => ourAudio as unknown as BaseAudioContext);
    player.jitter = false;
    player.start();
    const b = player.bus(bus)!;
    (b.input as unknown as FakeNode).label = 'M';
    (b.reverb as unknown as FakeNode).label = 'RV';
    if (b.dist) (b.dist as unknown as FakeNode).label = 'DS';
    ourAudio.rec.mark();
    player.play(name);

    const diff = firstDiff(refAudio.rec.log, ourAudio.rec.log);
    out.push({ bus, reference: refName, name, same: !diff, diff });
  }
  return out;
}
