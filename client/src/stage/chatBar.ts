// 채팅 묶음 (hud.md 4장): Enter로 입력창(DOM) → chat 메시지, 받은 글은 대화 기록(섬 5줄 / 던전 3줄 반투명)
// 섬·던전 씬이 같이 쓴다. 입력창이 열려 있는 동안 open = true (씬은 캐릭터 조작을 멈춤)
import type Phaser from 'phaser';
import { NET, type S2C } from '@game/shared';
import type { Connection } from '../net/connection';
import type { OnlineStage } from './onlineStage';
import { ChatLog, type ChatLine } from '../ui/chat';
import { LineInput } from '../ui/dom/lineInput';
import { HUD_HEIGHT } from '../view/layout';

/** 입력창이 열려 있을 때 대화 기록을 그 위로 */
const INPUT_H = 18;

export class ChatBar {
  open = false;
  private log: ChatLog;

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
  }

  destroy(): void {
    this.log.destroy();
  }

  /** 던전 온라인: 서버 채팅 → 기록 (이름·파티 색), Enter → 입력창 (blocked면 열지 않음: 정산 화면) */
  static forDungeon(scene: Phaser.Scene, depth: number, online: OnlineStage, conn: Connection, blocked: () => boolean): ChatBar {
    const bar = new ChatBar(scene, depth, true);
    online.onChat = (m: S2C['chat']) => bar.push({
      name: conn.players.latest?.items.get(m.player)?.name || '?', color: online.colorOf(m.player), text: m.text,
    }, scene.time.now / 1000);
    const open = () => { if (!blocked()) bar.chat((text) => conn.send('chat', { text })); };
    scene.input.keyboard!.on('keydown-ENTER', open);
    scene.events.once('shutdown', () => { bar.destroy(); scene.input.keyboard!.off('keydown-ENTER', open); });
    return bar;
  }
}
