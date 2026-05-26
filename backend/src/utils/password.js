const crypto = require('crypto');

const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

function hashPassword(password, salt = crypto.randomBytes(16)) {
  const derived = crypto.scryptSync(String(password), salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return {
    hash: derived.toString('base64'),
    salt: Buffer.isBuffer(salt) ? salt.toString('base64') : String(salt)
  };
}

function verifyPassword(password, hash, salt) {
  if (!password || !hash || !salt) return false;
  let derived;
  let stored;
  try {
    derived = crypto.scryptSync(
      String(password),
      Buffer.from(String(salt), 'base64'),
      KEY_LENGTH,
      SCRYPT_OPTIONS
    );
    stored = Buffer.from(String(hash), 'base64');
  } catch {
    return false;
  }
  if (!stored || stored.length !== derived.length) return false;
  return crypto.timingSafeEqual(derived, stored);
}

module.exports = { hashPassword, verifyPassword };
