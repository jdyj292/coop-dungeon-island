// 실행: 서버를 띄운 뒤 pnpm island-bot --island <섬 번호> [--sec 30] [--name 봇이름] [--well [--depart]] [--url http://localhost:8080]
// 봇 주민 하나가 가입·그 섬에 입장 신청 → 섬 주인이 게시판 주민 탭에서 허용하면 입장해 우물 앞을 왔다 갔다 한다 (island.md 7장).
// --island가 없으면 봇 자기 섬을 만든다. 브라우저 한 개로 2인 섬 화면을 볼 때 (roadmap 4-5)
// --well: 우물 앞으로 걸어가 출발 대기에 합류 → 출발하면 던전 방에 들어가 --sec 동안 서 있다가 나감 (2인 출발 확인, roadmap 4-8)
// 이미 가입한 봇 이름이면 같은 비밀번호로 로그인. 세션 쿠키를 WebSocket 입장에 실어야 해서 ws로 연결한다
import { parseArgs } from 'node:util';
import WS from 'ws';
import { ISLAND, nearFacility, TILE } from '../../shared/src';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:2567' }, island: { type: 'string' },
    sec: { type: 'string', default: '30' }, name: { type: 'string', default: '봇주민' }, well: { type: 'boolean', default: false }, depart: { type: 'boolean', default: false },
  },
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** 개발 서버 전용 봇 비밀번호 (실제 계정에 쓰지 않음) */
const BOT_PASSWORD = 'island-bot-pass';

interface Me { id: number; island: { id: number; name: string } | null; request: { islandName: string; rejected: boolean } | null }

async function auth(): Promise<{ cookie: string; islandId: number; userId: string }> {
  const post = (path: string, body?: object, cookie = '') => fetch(`${values.url}/api${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined,
  });
  let res = await post('/login', { nickname: values.name, password: BOT_PASSWORD });
  if (!res.ok) res = await post('/signup', { nickname: values.name, password: BOT_PASSWORD });
  if (!res.ok) throw new Error(`로그인·가입 실패 ${res.status} ${await res.text()}`);
  const cookie = res.headers.get('set-cookie')!.split(';')[0]!;
  let { me } = (await res.json()) as { me: Me };
  if (!me.island) {
    // 섬 번호가 없으면 봇 자기 섬, 있으면 입장 신청 후 허용될 때까지 기다림
    const r = values.island ? await post('/island/request', { islandId: Number(values.island) }, cookie) : await post('/island/create', undefined, cookie);
    if (!r.ok) throw new Error(`섬 ${values.island ? '신청' : '만들기'} 실패 ${r.status} ${await r.text()}`);
    ({ me } = (await r.json()) as { me: Me });
    if (!me.island) console.log(`${values.name}: ${me.request?.islandName}에 입장 신청 — 섬 주인이 게시판 주민 탭에서 허용해 주세요`);
    while (!me.island) {
      await sleep(2000);
      ({ me } = (await (await fetch(`${values.url}/api/me`, { headers: { cookie } })).json()) as { me: Me });
      if (me.request?.rejected) throw new Error('입장 신청이 거절됨');
    }
  }
  console.log(`${values.name}: ${me.island.name} (섬 ${me.island.id})`);
  return { cookie, islandId: me.island.id, userId: String(me.id) };
}

async function main(): Promise<void> {
  const { cookie, islandId, userId } = await auth();
  // colyseus.js가 쓰는 WebSocket에 쿠키 헤더를 붙인다
  // (Node에서는 둘째 인자로 옵션 객체가 올 수 있어 그 headers에도 합친다)
  (globalThis as { WebSocket?: unknown }).WebSocket = class extends WS {
    constructor(url: string, second?: string | string[] | WS.ClientOptions) {
      if (second && typeof second === 'object' && !Array.isArray(second)) super(url, { ...second, headers: { ...second.headers, cookie } });
      else super(url, second, { headers: { cookie } });
    }
  };
  // colyseus.js는 불러올 때 WebSocket을 정하므로 바꾼 뒤에 불러온다
  const { Client } = await import('colyseus.js');
  const room = await new Client(values.url.replace(/^http/, 'ws')).joinOrCreate('island', { islandId });
  console.log(`섬 방 ${room.roomId} 입장`);
  let seq = 0;
  if (values.well) {
    // 우물 앞 (게시판을 피해 왼쪽으로 돌아서): 목표 x = 우물 왼쪽 칸, y = 우물 앞 줄
    const well = ISLAND.facilities.find((f) => f.id === 'well')!, goal = { x: (well.x + 0.5) * TILE, y: (well.y + well.h + 0.5) * TILE };
    const me = () => (room.state as unknown as { residents?: Map<string, { x: number; y: number }> }).residents?.get(userId) ?? { x: 0, y: 0 };
    while (!me().x) await sleep(50);
    for (let i = 0; i < 400 && nearFacility(me()) !== 'well'; i++) {
      const p = me(), mx = Math.abs(p.x - goal.x) > 2 ? Math.sign(goal.x - p.x) : 0, my = mx ? 0 : Math.sign(goal.y - p.y);
      room.send('input', { seq: ++seq, t: i * 50, mx, my, run: false });
      await sleep(50);
    }
    room.send('input', { seq: ++seq, t: 0, mx: 0, my: 0, run: false });
    const departed = new Promise<{ roomId: string }>((res) => room.onMessage('depart', res));
    room.onMessage('wellFail', (m: unknown) => console.log('우물 실패', m));
    room.send('well', { op: 'join' });
    console.log('우물 대기 합류, 출발 기다림');
    // --depart: 내가 대기 시작자면 바로 출발 (혼자면 즉시, 여럿이면 카운트다운)
    if (values.depart) setTimeout(() => room.send('well', { op: 'depart' }), 500);
    const { roomId } = await departed;
    await room.leave();
    const dungeon = await new Client(values.url.replace(/^http/, 'ws')).joinById(roomId);
    console.log(`던전 ${roomId} 입장: ${[...(dungeon.state as unknown as { players: Map<string, { name: string }> }).players.values()].map((p) => p.name).join(', ')}`);
    await sleep(Number(values.sec) * 1000);
    await dungeon.leave();
    process.exit(0);
  }
  const end = Date.now() + Number(values.sec) * 1000;
  for (let i = 0; Date.now() < end; i++) {
    // 2초마다 오른쪽 ↔ 왼쪽, 가끔 아래로
    const mx = Math.floor(i / 40) % 2 ? -1 : 1, my = i % 120 < 20 ? 1 : 0;
    room.send('input', { seq: ++seq, t: i * 50, mx, my, run: false });
    await sleep(50);
  }
  room.send('input', { seq: ++seq, t: 0, mx: 0, my: 0, run: false });
  const r = (room.state as unknown as { residents: Map<string, { name: string; x: number; y: number; online: boolean }> }).residents;
  console.log('주민:', [...r.values()].map((x) => `${x.name}(${x.online ? `${x.x},${x.y}` : '오프라인'})`).join(' '));
  await room.leave();
  process.exit(0);
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
