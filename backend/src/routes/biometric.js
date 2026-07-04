// Login biometrik (WebAuthn/passkey) untuk MadaFlow.
// register-* butuh login (authRequired); login-* publik.
const express = require('express');
const crypto = require('crypto');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = require('@simplewebauthn/server');
const pool = require('../db');
const { authRequired } = require('../middleware/auth');
const { TOKEN_COOKIE, buildCookieOptions, loginByUserId } = require('../services/authService');

const router = express.Router();

const RP_NAME = 'MadaFlow';
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const challengeStore = new Map();

function putChallenge(challenge) {
  const key = crypto.randomBytes(16).toString('hex');
  challengeStore.set(key, { challenge, expires: Date.now() + CHALLENGE_TTL_MS });
  for (const [k, v] of challengeStore) {
    if (v.expires < Date.now()) challengeStore.delete(k);
  }
  return key;
}

function takeChallenge(key) {
  const entry = challengeStore.get(String(key || ''));
  challengeStore.delete(String(key || ''));
  if (!entry || entry.expires < Date.now()) return null;
  return entry.challenge;
}

function getRp(req) {
  const origin = String(req.headers.origin || '');
  let hostname = req.hostname || 'localhost';
  if (origin) {
    try { hostname = new URL(origin).hostname; } catch (_) {}
  }
  const expectedOrigin = origin || `${req.protocol}://${req.get('host')}`;
  return { rpID: hostname, expectedOrigin };
}

let tableEnsured = false;
async function ensureCredentialTable() {
  if (tableEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS webauthn_credentials (
      id INT NOT NULL AUTO_INCREMENT,
      user_id INT NOT NULL,
      credential_id VARCHAR(255) NOT NULL,
      public_key TEXT NOT NULL,
      counter BIGINT NOT NULL DEFAULT 0,
      transports VARCHAR(120) DEFAULT NULL,
      device_name VARCHAR(120) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_used_at TIMESTAMP NULL DEFAULT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_webauthn_credential (credential_id),
      KEY idx_webauthn_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  tableEnsured = true;
}

router.post('/register-options', authRequired, async (req, res, next) => {
  try {
    await ensureCredentialTable();
    const { rpID } = getRp(req);
    const userId = Number(req.user.id);
    const displayName = req.user.display_name || req.user.username || 'Pengguna MadaFlow';

    const [existing] = await pool.query(
      'SELECT credential_id FROM webauthn_credentials WHERE user_id = ?',
      [userId]
    );
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userID: String(userId),
      userName: req.user.username || displayName,
      userDisplayName: displayName,
      attestationType: 'none',
      excludeCredentials: existing.map((c) => ({
        id: Buffer.from(c.credential_id, 'base64url'),
        type: 'public-key'
      })),
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred'
      }
    });
    const challengeKey = putChallenge(options.challenge);
    res.json({ success: true, options, challengeKey });
  } catch (e) {
    next(e);
  }
});

router.post('/register-verify', authRequired, async (req, res, next) => {
  try {
    await ensureCredentialTable();
    const { rpID, expectedOrigin } = getRp(req);
    const expectedChallenge = takeChallenge(req.body?.challengeKey);
    if (!expectedChallenge) return res.status(400).json({ success: false, message: 'Challenge kedaluwarsa. Ulangi aktivasi.' });

    const verification = await verifyRegistrationResponse({
      response: req.body?.attestation,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: false
    });
    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ success: false, message: 'Verifikasi biometrik gagal.' });
    }
    const info = verification.registrationInfo;
    const credentialId = Buffer.from(info.credentialID).toString('base64url');
    const publicKey = Buffer.from(info.credentialPublicKey).toString('base64url');
    const transports = Array.isArray(req.body?.attestation?.response?.transports)
      ? req.body.attestation.response.transports.join(',')
      : null;

    await pool.query(
      `INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter, transports, device_name)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE public_key = VALUES(public_key), counter = VALUES(counter)`,
      [Number(req.user.id), credentialId, publicKey, Number(info.counter || 0), transports, String(req.body?.device_name || '').slice(0, 120) || null]
    );
    res.json({ success: true, credential_id: credentialId, message: 'Login biometrik berhasil diaktifkan.' });
  } catch (e) {
    next(e);
  }
});

router.post('/login-options', async (req, res, next) => {
  try {
    await ensureCredentialTable();
    const { rpID } = getRp(req);
    const ids = Array.isArray(req.body?.credential_ids) ? req.body.credential_ids.filter(Boolean).slice(0, 10) : [];
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'required',
      allowCredentials: ids.map((id) => ({
        id: Buffer.from(String(id), 'base64url'),
        type: 'public-key'
      }))
    });
    const challengeKey = putChallenge(options.challenge);
    res.json({ success: true, options, challengeKey });
  } catch (e) {
    next(e);
  }
});

router.post('/login-verify', async (req, res, next) => {
  try {
    await ensureCredentialTable();
    const { rpID, expectedOrigin } = getRp(req);
    const expectedChallenge = takeChallenge(req.body?.challengeKey);
    if (!expectedChallenge) return res.status(400).json({ success: false, message: 'Challenge kedaluwarsa. Coba lagi.' });

    const assertion = req.body?.assertion;
    const credentialId = String(assertion?.id || '');
    const [rows] = await pool.query(
      'SELECT * FROM webauthn_credentials WHERE credential_id = ? LIMIT 1',
      [credentialId]
    );
    const cred = rows[0];
    if (!cred) return res.status(404).json({ success: false, message: 'Perangkat belum terdaftar. Login dengan password lalu aktifkan biometrik.' });

    const verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: false,
      authenticator: {
        credentialID: Buffer.from(cred.credential_id, 'base64url'),
        credentialPublicKey: Buffer.from(cred.public_key, 'base64url'),
        counter: Number(cred.counter || 0)
      }
    });
    if (!verification.verified) {
      return res.status(401).json({ success: false, message: 'Verifikasi biometrik gagal.' });
    }
    await pool.query(
      'UPDATE webauthn_credentials SET counter = ?, last_used_at = NOW() WHERE id = ?',
      [Number(verification.authenticationInfo?.newCounter || 0), cred.id]
    );

    const result = await loginByUserId(Number(cred.user_id));
    if (!result) return res.status(404).json({ success: false, message: 'Akun tidak ditemukan.' });
    res.cookie(TOKEN_COOKIE, result.token, buildCookieOptions());
    res.json({ success: true, message: 'Login berhasil.', token: result.token, user: result.user });
  } catch (e) {
    next(e);
  }
});

router.post('/disable', authRequired, async (req, res, next) => {
  try {
    await ensureCredentialTable();
    await pool.query('DELETE FROM webauthn_credentials WHERE user_id = ?', [Number(req.user.id)]);
    res.json({ success: true, message: 'Login biometrik dinonaktifkan.' });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
