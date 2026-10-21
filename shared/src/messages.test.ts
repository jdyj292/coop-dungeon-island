import { describe, expect, it } from 'vitest';
import { parseC2S } from './messages';

describe('클라이언트 → 서버 메시지 검사 (network.md 4장)', () => {
  it('맞는 형식은 통과', () => {
    expect(parseC2S('input', { seq: 3, t: 1200, mx: 1, my: -1, run: true })).not.toBeNull();
    expect(parseC2S('action', { seq: 4, t: 1210, kind: 'skill', skillId: 'gs_launch', x: 100, y: 56, facing: -1 })).not.toBeNull();
  });
  it('범위 밖·모르는 키·잘못된 종류는 null', () => {
    expect(parseC2S('input', { seq: 3, t: 0, mx: 2, my: 0, run: false })).toBeNull();
    expect(parseC2S('input', { seq: 3, t: 0, mx: 0, my: 0, run: false, hp: 9999 })).toBeNull();
    expect(parseC2S('action', { seq: 1, t: 0, kind: 'nuke', x: 0, y: 0, facing: 1 })).toBeNull();
    expect(parseC2S('emote', { id: 5 })).toBeNull();
  });
  it('채팅은 앞뒤 공백을 빼고 1~60자', () => {
    expect(parseC2S('chat', { text: '  안녕  ' })?.text).toBe('안녕');
    expect(parseC2S('chat', { text: '   ' })).toBeNull();
    expect(parseC2S('chat', { text: 'a'.repeat(61) })).toBeNull();
  });
});
