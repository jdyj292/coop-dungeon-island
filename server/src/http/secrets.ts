// 비밀 값 만들기·해시 (docs/security.md 1·2·3장)
// 비밀번호·복구 코드 = Argon2id, 세션 토큰 = SHA-256 (토큰은 32바이트 난수라 느린 해시가 필요 없음)
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { AUTH } from '@game/shared';

/** OWASP 권장 Argon2id 최소값 (19MiB, 2회) */
const ARGON = { algorithm: 2 /* Argon2id */, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashSecret = (plain: string): Promise<string> => hash(plain, ARGON);
export const verifySecret = (stored: string, plain: string): Promise<boolean> => verify(stored, plain).catch(() => false);

/** 없는 닉네임에도 같은 시간을 쓰려고 대신 검사하는 해시 (닉네임 존재 여부가 응답 시간으로 새지 않게) */
let dummy: Promise<string> | null = null;
export const burnVerify = async (plain: string): Promise<void> => {
  dummy ??= hashSecret('dummy-password-for-timing');
  await verifySecret(await dummy, plain);
};

export const newToken = (): string => randomBytes(32).toString('base64url');
export const tokenHash = (token: string): string => createHash('sha256').update(token).digest('hex');

/** 헷갈리는 글자를 뺀 알파벳에서 암호학적 난수로 n자 */
export function randomCode(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += AUTH.codeAlphabet[randomInt(AUTH.codeAlphabet.length)];
  return s;
}

/** 복구 코드 (보여줄 때는 XXXX-XXXX-XXXX-XXXX, 저장·비교는 하이픈 없이) */
export function newRecoveryCode(): { shown: string; plain: string } {
  const plain = randomCode(AUTH.recoveryGroups * AUTH.recoveryGroupLen);
  const shown = plain.match(new RegExp(`.{${AUTH.recoveryGroupLen}}`, 'g'))!.join('-');
  return { shown, plain };
}
