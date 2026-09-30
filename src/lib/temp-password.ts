import { randomInt } from 'crypto';

/**
 * Letters and digits that cannot be mistaken for one another when a password
 * is read off a screen or a phone message: no 0/O, 1/l/I.
 */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * A one-time password for a new or reset staff login, such as "Hylink@k7Qm2x9p".
 * The holder must change it at first sign-in (mustChangePassword), so it only
 * has to survive the trip to them. Drawn from a cryptographic source.
 */
export function generateTempPassword(prefix = 'Hylink@', length = 8): string {
  let body = '';
  for (let i = 0; i < length; i++) body += ALPHABET[randomInt(ALPHABET.length)];
  return prefix + body;
}
