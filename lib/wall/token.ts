import crypto from "node:crypto";

// The /wall dashboard and /wall.png are private but have no sign-in (they run
// as a desktop / lock-screen wallpaper), so access is a long random token in
// the URL, checked against WALL_TOKEN. Hashing both sides first gives equal
// lengths for timingSafeEqual and doesn't leak the token's length. Never log
// the token.

const digest = (value: string) => crypto.createHash("sha256").update(value, "utf8").digest();

export function isValidWallToken(
  token: string | null | undefined,
  expected: string | undefined = process.env.WALL_TOKEN
): boolean {
  if (!expected || !token) return false;
  return crypto.timingSafeEqual(digest(token), digest(expected));
}
