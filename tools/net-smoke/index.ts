// 실행: 서버를 띄운 뒤 pnpm net-smoke [--url ws://localhost:2567] [--room 1]
// 봇 2개가 던전 방에 접속해 이동·공격을 보내고, 받은 상태·이벤트를 요약한다 (docs/network.md, roadmap 2-2)
import { parseArgs } from 'node:util';
import { Client, type Room } from 'colyseus.js';

const { values } = parseArgs({ options: { url: { type: 'string', default: 'ws://localhost:2567' }, room: { type: 'string', default: '1' } } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 받은 이벤트 수 세기 */
function count(room: Room, tally: Map<string, number>): void {
  for (const type of ['hit', 'playerHit', 'combo', 'rejected', 'pong', 'projSpawn', 'projEnd', 'roomClear', 'chat']) {
    room.onMessage(type, () => tally.set(type, (tally.get(type) ?? 0) + 1));
  }
}

async function main(): Promise<void> {
  const client = new Client(values.url);
  const a = await client.create('dungeon', { room: Number(values.room), partySize: 2, name: '봇A' });
  const b = await client.joinById(a.roomId, { name: '봇B' });
  const ta = new Map<string, number>(), tb = new Map<string, number>();
  count(a, ta);
  count(b, tb);
  console.log(`방 ${a.roomId} 접속: A=${a.sessionId} B=${b.sessionId}`);
  await sleep(300);

  // A: 가장 가까운 몬스터 왼쪽 14px로 다가가 평타, B: 제자리 핑·채팅·장착 안 한 스킬(거절 확인)
  let seq = 1;
  const sa = a.state as unknown as { players: Map<string, any>; monsters: Map<string, any> };
  for (let i = 0; i < 100; i++) {
    const me = sa.players.get(a.sessionId)!;
    const near = [...sa.monsters.values()].sort((p, q) => Math.abs(p.x - me.x) - Math.abs(q.x - me.x))[0];
    const dx = near ? near.x - 14 - me.x : 0, dy = near ? near.y - me.y : 0;
    const sign = (n: number) => (Math.abs(n) <= 2 ? 0 : Math.sign(n));
    a.send('input', { seq: seq++, t: i * 50, mx: sign(dx), my: sign(dy), run: false });
    if (near && Math.abs(dx) < 8 && Math.abs(dy) < 4 && i % 4 === 0) a.send('action', { seq: seq++, t: i * 50, kind: 'basic', x: me.x, y: me.y, facing: 1 });
    if ((ta.get('hit') ?? 0) >= 3) break;
    await sleep(50);
  }
  a.send('input', { seq: seq++, t: 2000, mx: 0, my: 0, run: false });
  b.send('ping', { t: 1 });
  b.send('chat', { text: '  안녕  ' });
  b.send('action', { seq: 1, t: 0, kind: 'skill', skillId: 'st_fireburst', x: 0, y: 0, facing: 1 });
  await sleep(500);

  const st = a.state as unknown as { players: Map<string, any>; monsters: Map<string, any>; wave: number };
  for (const [id, p] of st.players) {
    const mine = id === a.sessionId;
    console.log(`플레이어 ${p.name} (${mine ? 'A가 본 자신' : 'A가 본 B'}): x=${p.x} y=${p.y} state=${p.state} hp=${p.hp} lastInputSeq=${p.lastInputSeq} 본인전용=${p.priv ? `mp ${p.priv.mp}` : '없음'}`);
  }
  console.log(`몬스터 ${st.monsters.size}마리: ${[...st.monsters.values()].map((m) => `${m.type}(${m.x},${m.y},${m.state},hp${m.hpRatio})`).join(' ')}`);
  console.log('A가 받은 이벤트:', Object.fromEntries(ta));
  console.log('B가 받은 이벤트:', Object.fromEntries(tb));
  const privOk = !!st.players.get(a.sessionId)?.priv && !st.players.get(b.sessionId)?.priv;
  const ok = (ta.get('hit') ?? 0) > 0 && (tb.get('rejected') ?? 0) === 1 && (tb.get('pong') ?? 0) === 1 && privOk && (st.players.get(a.sessionId)?.lastInputSeq ?? 0) > 0;
  console.log(ok ? '\n확인 통과: 적중·거절·pong·본인 전용 필터·lastInputSeq' : '\n확인 실패 (위 값 확인)');
  await a.leave();
  await b.leave();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('접속 실패:', e?.message ?? e);
  process.exit(1);
});
