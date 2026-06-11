import argon2 from 'argon2';

export const DUMMY_ARGON2ID_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$iiKfMAfR8Ie4EXjM8dJtTg$nEswA7cBzVsZvDenYmEckyNgIHLSjK6wVFo/wZI6zQM';

const argon2Options = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 4,
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, argon2Options);
}

export async function verifyPasswordHash(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export async function verifyPasswordOrDummy(
  hash: string | undefined,
  password: string,
): Promise<boolean> {
  return verifyPasswordHash(hash ?? DUMMY_ARGON2ID_HASH, password);
}
