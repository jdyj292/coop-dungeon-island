// 채팅 묶음 (hud.md 4장): Enter로 입력창(DOM) → chat 메시지, 받은 글은 대화 기록(섬 5줄 / 던전 3줄 반투명)
// 던전은 머리 위 말풍선도 여기서 (섬 말풍선은 islandStage가 이름표와 함께 그림)
// 섬·던전 씬이 같이 쓴다. 입력창이 열려 있는 동안 open = true (씬은 캐릭터 조작을 멈춤)
import type Phaser from 'phaser';
import { NET } from '@game/shared';
import type { Connection } from '../net/connection';
import type { OnlineStage } from './onlineStage';
import { ChatLog, SpeechBubbles, type ChatLine } from '../ui/chat';
import { LineInput } from '../ui/dom/lineInput';
import { HUD_HEIGHT } from '../view/layout';

/** 입력창이 열려 있을 때 대화 기록을 그 위로 */
const INPUT_H = 18;
/** 던전 말풍선 기준: 발에서 머리 위까지 (던전에는 이름표가 없어 섬보다 낮게) */
const HEAD_ABOVE = 20;

export class ChatBar {
  open = false;
  private log: ChatLog;
  /** 던전 말풍선 + 말한 사람 발 위치 (월드 화면 좌표) */
  private bubbles: { b: SpeechBubbles; feet: () => Map<string, { sx: number; sy: number }> } | null = null;

  constructor(private scene: Phaser.Scene, depth: number, dungeon: boolean) {
    this.log = dungeon ? new ChatLog(scene, depth, 3, true) : new ChatLog(scene, depth, 5);
  }

  push(l: ChatLine, nowSec: number): void {
    this.log.push(l, nowSec);
  }

  /** 한 줄 입력창 열기. send = 보낼 곳 (채팅·메모) */
  input(placeholder: string, maxLength: number, send: (text: string) => void): void {
    if (this.open) return;
    this.open = true;
    new LineInput(this.scene.game.canvas.parentElement!, {
      placeholder, maxLength, scale: this.scene.scale.zoom, bandHeight: HUD_HEIGHT,
      onSubmit: send, onClose: () => { this.open = false; },
    });
  }

  /** 채팅 입력창 */
  chat(send: (text: string) => void): void {
    this.input('말하기 (Enter 보내기 · Esc 취소)', NET.chatMaxLen, send);
  }

  draw(nowSec: number): void {
    const bandTop = this.scene.scale.gameSize.height - HUD_HEIGHT;
    this.log.draw(nowSec, bandTop - 2 - (this.open ? INPUT_H : 0), this.open);
    if (!this.bubbles) return;
    const feet = this.bubbles.feet();
    this.bubbles.b.prune((who) => feet.has(who));
    for (const [who, f] of feet) this.bubbles.b.draw(who, f.sx, f.sy - HEAD_ABOVE, nowSec);
  }

  destroy(): void {
    this.log.destroy();
    this.bubbles?.b.destroy();
  }

  /** 던전 온라인: 서버 채팅 → 기록 (이름·파티 색) + 머리 위 말풍선, 이모트 → 말풍선, Enter → 입력창, 1~4 → 이모트 (blocked면 안 함: 정산 화면·설정) */
  static forDungeon(scene: Phaser.Scene, depth: number, online: OnlineStage, conn: Connection, blocked: () => boolean): ChatBar {
    const bar = new ChatBar(scene, depth, true);
    // 말풍선은 캐릭터 위, 효과 아래 (onlineStage FX_DEPTH 5000)
    bar.bubbles = { b: new SpeechBubbles(scene, 4600), feet: () => online.feet() };
    online.onTalk = ({ type, msg }) => {
      const now = scene.time.now / 1000, b = bar.bubbles!.b;
      if (type === 'emote') return b.emote(msg.player, msg.id, now);
      bar.push({ name: conn.players.latest?.items.get(msg.player)?.name || '?', color: online.colorOf(msg.player), text: msg.text }, now);
      b.say(msg.player, msg.text, now);
    };
    const open = () => { if (!blocked()) bar.chat((text) => conn.send('chat', { text })); };
    // 이모트 1~4 (combat.md 1장)
    const emote = (e: KeyboardEvent) => { if (/^Digit[1-4]$/.test(e.code) && !e.repeat && !blocked()) conn.send('emote', { id: Number(e.code.slice(5)) }); };
    scene.input.keyboard!.on('keydown-ENTER', open);
    scene.input.keyboard!.on('keydown', emote);
    scene.events.once('shutdown', () => {
      bar.destroy();
      scene.input.keyboard!.off('keydown-ENTER', open);
      scene.input.keyboard!.off('keydown', emote);
    });
    return bar;
  }
}
