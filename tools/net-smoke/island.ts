// 실행: 서버를 띄운 뒤 pnpm island-bot --invite <초대 코드> [--sec 30] [--name 봇이름]
// 봇 주민 하나가 가입(초대 코드로 그 섬에 합류)·입장해 우물 앞을 왔다 갔다 한다. 브라우저 한 개로 2인 섬 화면을 볼 때 (roadmap 4-5)
// 이미 가입한 봇 이름이면 같은 비밀번호로 로그인. 세션 쿠키를 WebSocket 입장에 실어야 해서 ws로 연결한다
import { parseArgs } from 'node:util';
import WS from 'ws';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:2567' }, invite: { type: 'string' },
    sec: { type: 'string', default: '30' }, name: { type: 'string', default: '봇주민' },
  },
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** 개발 서버 전용 봇 비밀번호 (실제 계정에 쓰지 않음) */
const BOT_PASSWORD = 'island-bot-pass';

async function auth(): Promise<{ cookie: string; islandId: number }> {
  const post = (path: string, body: object) => fetch(`${values.url}/api${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  let res = await post('/login', { nickname: values.name, password: BOT_PASSWORD });
  if (!res.ok) {
    if (!values.invite) throw new Error('처음이면 --invite <초대 코드>가 필요합니다');
    res = await post('/signup', { nickname: values.name, password: BOT_PASSWORD, invite: values.invite });
  }
  if (!res.ok) throw new Error(`로그인·가입 실패 ${res.status} ${await res.text()}`);
  const cookie = res.headers.get('set-cookie')!.split(';')[0]!;
  const { me } = (await res.json()) as { me: { island: { id: number; name: string } } };
  console.log(`${values.name}: ${me.island.name} (섬 ${me.island.id})`);
  return { cookie, islandId: me.island.id };
}

async function main(): Promise<void> {
  const { cookie, islandId } = await auth();
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
