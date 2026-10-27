import { describe, expect, it } from 'vitest';
import { weaponDef } from '../actions';
import { TICK } from '../constants';
import { MONSTERS, ROOMS } from '../data/load';
import { spawnProjectile, stepProjectile } from '../monster/hazards';
import type { PlayerInput } from '../player';
import { RoomSim } from '../sim/room';
import { floorRoom, mapSpawns, roomBounds } from '../sim/roomSetup';
import { checkMaps } from './check';
import { hitsBlock, moveBox } from './collision';
import { roomMap } from './maps';

const rock = { x0: 100, y0: 40, x1: 116, y1: 56, kind: 'rock' };
const b = { minX: 8, maxX: 300, minY: 0, maxY: 112, blocks: [rock] };
const half = { x: 5, y: 4 };

describe('장애물 충돌', () => {
  it('막힌 축만 멈추고 다른 축은 미끄러짐, 방 경계로 자름', () => {
    expect(moveBox({ x: 90, y: 48 }, { x: 97, y: 50 }, half, b)).toEqual({ x: 90, y: 50 });
    expect(moveBox({ x: 90, y: 30 }, { x: 92, y: 33 }, half, b)).toEqual({ x: 92, y: 33 });
    expect(moveBox({ x: 10, y: 5 }, { x: 0, y: -3 }, half, b)).toEqual({ x: 8, y: 0 });
    expect(hitsBlock({ x: 96, y: 48 }, half, b)).toBe(true);
    // 이미 박혀 있으면 빠져나가는 이동은 막지 않음 (멈춘 채 갇히지 않게)
    expect(moveBox({ x: 108, y: 48 }, { x: 120, y: 48 }, half, b)).toEqual({ x: 120, y: 48 });
  });
  it('투사체는 장애물에 닿으면 사라짐', () => {
    const def = MONSTERS.sporeflower!.attacks.find((a) => a.projectile)!;
    const p = spawnProjectile(1, 1, def, 160, 48, -1);
    for (let i = 0; i < 120 && !p.done; i++) stepProjectile(p, TICK, b, []);
    expect(p.done).toBe(true);
    expect(p.x).toBeGreaterThan(rock.x0);
  });
});

describe('Tiled 맵 (dungeon.md 10장)', () => {
  it('2번 방: 크기, 그루터기 2칸, 시작 4곳(가운데 먼저), 출구', () => {
    const m = roomMap('floor1/room2');
    expect([m.width, m.depth]).toEqual([22 * 16, 8 * 16]);
    expect(m.blocks.map((k) => k.kind)).toEqual(['stump', 'stump']);
    expect(m.starts).toHaveLength(4);
    expect(m.starts[0]!.y).toBe(64);
    expect(m.doorOut).not.toBeNull();
    expect(roomBounds(floorRoom('floor1', 2)).bounds.blocks).toHaveLength(2);
  });
  it('출현: 포자꽃은 back 지점, 보스는 boss 지점', () => {
    const m3 = roomMap('floor1/room3');
    const s = mapSpawns(m3, 1, { sporeflower: 3, mushroom: 7, boar: 3 });
    const backs = m3.spawns.filter((p) => p.wave === 1 && p.role === 'back');
    expect(s.filter((x) => x.kind === 'sporeflower').map((x) => [x.x, x.y])).toEqual(backs.map((p) => [p.x, p.y]));
    const boss = mapSpawns(roomMap('floor1/boss'), 1, { mossbear: 1 })[0]!;
    expect(roomMap('floor1/boss').spawns.find((p) => p.role === 'boss')).toMatchObject({ x: boss.x, y: boss.y });
  });
  it('맵 검사: 지금 맵은 오류 0, 출구·출현 지점이 빠지면 오류', () => {
    expect(checkMaps(ROOMS, MONSTERS, roomMap).filter((i) => i.level === 'error')).toEqual([]);
    const broken = (name: string) => {
      const m = roomMap(name);
      return name === 'floor1/room1' ? { ...m, doorOut: null, spawns: m.spawns.slice(1) } : m;
    };
    const msgs = checkMaps(ROOMS, MONSTERS, broken).map((i) => i.message);
    expect(msgs).toContain('door_out 없음 (보스 방 말고는 필요)');
    expect(msgs.some((t) => t.startsWith('웨이브 1 출현 지점 9개'))).toBe(true);
  });
});

describe('2번 방 그루터기 (dungeon.md 5장)', () => {
  it('돌진이 그루터기에 막히면 벽 충돌처럼 어지러움', () => {
    const room = floorRoom('floor1', 2), { bounds } = roomBounds(room);
    const stump = bounds.blocks![0]!;
    const cy = (stump.y0 + stump.y1) / 2;
    // 멧돼지는 그루터기 오른쪽, 플레이어는 왼쪽 같은 깊이 (감지 거리 96px 안)
    const sim = new RoomSim(weaponDef('greatsword'), bounds, { x: stump.x0 - 30, y: cy }, { rng: () => 0 });
    const [boar] = sim.spawn([{ kind: 'boar', x: stump.x1 + 40, y: cy }]);
    const none: PlayerInput = { x: 0, y: 0, attack: false, skill: null, backstep: false };
    let wall = false;
    for (let i = 0; i < 600 && !wall; i++) wall = sim.tick(TICK, none).events.some((e) => e.type === 'monster' && e.e.type === 'wallHit');
    expect(wall).toBe(true);
    expect(boar!.mode).toBe('selfStun');
    expect(boar!.body.x).toBeGreaterThanOrEqual(stump.x1);
  });
});
