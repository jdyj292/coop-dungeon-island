// 처음 하는 사람 안내 표시 (hud.md 8장): 이 브라우저에서 한 번 한 일을 기억 (localStorage, 못 쓰면 늘 처음처럼)
// helpSeen = 설정 도움말 탭을 열어 봄 → 왼쪽 위 "Esc · 도움말" 안내 끔
export type FirstVisitKey = 'helpSeen';

const PREFIX = 'coop.firstVisit.';

export function done(key: FirstVisitKey): boolean {
  try {
    return localStorage.getItem(PREFIX + key) === '1';
  } catch {
    return false;
  }
}

export function markDone(key: FirstVisitKey): void {
  try {
    localStorage.setItem(PREFIX + key, '1');
  } catch {
    // 저장이 막힌 브라우저: 다음에도 안내가 보일 뿐
  }
}
