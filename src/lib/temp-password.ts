import { createHmac, randomInt } from 'crypto';

/**
 * Temporary staff passwords.
 *
 * A temporary password is sent to a staff member, who must replace it at
 * first sign-in. Until they do, a user administrator can look it up again in
 * the login directory (every lookup is audited). The moment the staff member
 * sets their own password it can no longer be looked up — erased by design.
 *
 * Nothing readable is stored. The password is derived from the app's secret,
 * the staff member's id and the moment it was issued; that moment is kept in
 * Staff.passwordChangedAt, which is otherwise written only when someone sets
 * their own password. A lookup derives it again and confirms it against the
 * stored bcrypt hash. Setting one's own password overwrites passwordChangedAt
 * and clears mustChangePassword, so nothing is left to derive.
 *
 * Anyone holding AUTH_SECRET can already mint a session for any account, so
 * deriving from it exposes nothing further to them.
 */

/**
 * Capital letters and digits that cannot be mistaken for one another when a
 * password is read off a screen or a phone message: no 0/O, 1/I. Six of them,
 * such as "K7QM2X": short to type, and replaced at first sign-in.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LENGTH = 6;

/** The longer format issued before, "Hylink@k7Qm2x9p", still recognised on lookup. */
const LEGACY = { alphabet: 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', prefix: 'Hylink@', length: 8 };

function secret(): string | null {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || null;
}

function hmac(key: string, message: string): Buffer {
  return createHmac('sha256', `hylink-temp-password:v1:${key}`).update(message).digest();
}

/**
 * The millisecond part of an issue time carries a check value, so a
 * passwordChangedAt written by anything else (a staff member setting their
 * own password) is recognised as not a temporary-password issue time.
 */
function marker(key: string, staffId: string, seconds: number): number {
  return hmac(key, `m:${staffId}:${seconds}`).readUInt16BE(0) % 1000;
}

function derive(key: string, staffId: string, issuedAtMs: number, format = { alphabet: ALPHABET, prefix: '', length: LENGTH }): string {
  const bytes = hmac(key, `p:${staffId}:${issuedAtMs}`);
  let body = '';
  for (let i = 0; i < format.length; i++) body += format.alphabet[bytes[i] % format.alphabet.length];
  return format.prefix + body;
}

/**
 * A one-time password that cannot be looked up again, such as "K7QM2X".
 * Used when no app secret is configured, and for customer portal logins.
 */
export function generateTempPassword(length = LENGTH): string {
  let body = '';
  for (let i = 0; i < length; i++) body += ALPHABET[randomInt(ALPHABET.length)];
  return body;
}

/**
 * Issue a temporary password for a staff member. Store `issuedAt` in
 * passwordChangedAt, with mustChangePassword set, alongside the hash.
 */
export function issueTempPassword(staffId: string, now = new Date()): { password: string; issuedAt: Date } {
  const key = secret();
  if (!key) return { password: generateTempPassword(), issuedAt: now };

  const seconds = Math.floor(now.getTime() / 1000);
  const issuedAtMs = seconds * 1000 + marker(key, staffId, seconds);
  return { password: derive(key, staffId, issuedAtMs), issuedAt: new Date(issuedAtMs) };
}

/**
 * The temporary passwords that may have been issued at `issuedAt`: the short
 * format, then the longer one issued before. Empty when that time was not
 * written by issueTempPassword (or the app secret has changed since). The
 * caller must confirm a candidate against the stored hash before showing it.
 */
export function recoverTempPasswords(staffId: string, issuedAt: Date | null | undefined): string[] {
  const key = secret();
  if (!key || !issuedAt) return [];

  const ms = issuedAt.getTime();
  const seconds = Math.floor(ms / 1000);
  if (ms - seconds * 1000 !== marker(key, staffId, seconds)) return [];
  return [derive(key, staffId, ms), derive(key, staffId, ms, LEGACY)];
}
