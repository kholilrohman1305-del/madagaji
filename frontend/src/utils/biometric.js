// Login biometrik (WebAuthn) MadaFlow — helper frontend.
import api from '../api';

const STORAGE_KEY = 'madaflow_biometric';

function b64urlToBuffer(b64url) {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

function bufferToB64url(buf) {
  const bytes = new Uint8Array(buf);
  let str = '';
  for (let i = 0; i < bytes.length; i += 1) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function getStoredBiometric() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : null;
    if (data && Array.isArray(data.credentials)) return data;
  } catch (_) { /* abaikan */ }
  return { credentials: [], label: '' };
}

function saveStored(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function clearStoredBiometric() {
  localStorage.removeItem(STORAGE_KEY);
}

export function biometricSupported() {
  return Boolean(window.PublicKeyCredential && navigator.credentials);
}

export async function biometricPlatformAvailable() {
  if (!biometricSupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (_) {
    return false;
  }
}

export function biometricRegistered() {
  return getStoredBiometric().credentials.length > 0;
}

// Aktivasi untuk user yang sedang login.
export async function registerBiometric(label = '') {
  const optRes = await api.post('/auth/biometric/register-options', {}, { skipToast: true });
  const { options, challengeKey } = optRes.data;

  const publicKey = {
    ...options,
    challenge: b64urlToBuffer(options.challenge),
    user: { ...options.user, id: new TextEncoder().encode(options.user.id) },
    excludeCredentials: (options.excludeCredentials || []).map((c) => ({
      ...c,
      id: b64urlToBuffer(c.id)
    }))
  };
  const cred = await navigator.credentials.create({ publicKey });
  if (!cred) throw new Error('Aktivasi dibatalkan.');

  const attestation = {
    id: cred.id,
    rawId: bufferToB64url(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: bufferToB64url(cred.response.clientDataJSON),
      attestationObject: bufferToB64url(cred.response.attestationObject),
      transports: (cred.response.getTransports && cred.response.getTransports()) || []
    },
    clientExtensionResults: cred.getClientExtensionResults ? cred.getClientExtensionResults() : {}
  };
  const verifyRes = await api.post('/auth/biometric/register-verify', {
    challengeKey,
    attestation,
    device_name: navigator.userAgent.slice(0, 100)
  }, { skipToast: true });

  const stored = getStoredBiometric();
  const credentialId = verifyRes.data?.credential_id;
  if (credentialId && !stored.credentials.includes(credentialId)) stored.credentials.push(credentialId);
  stored.label = label || stored.label || '';
  saveStored(stored);
  return verifyRes.data;
}

// Login biometrik dari halaman login. Return { token, user }.
export async function loginBiometric() {
  const stored = getStoredBiometric();
  const optRes = await api.post('/auth/biometric/login-options', {
    credential_ids: stored.credentials
  }, { skipToast: true });
  const { options, challengeKey } = optRes.data;

  const publicKey = {
    ...options,
    challenge: b64urlToBuffer(options.challenge),
    allowCredentials: (options.allowCredentials || []).map((c) => ({
      ...c,
      id: b64urlToBuffer(c.id)
    }))
  };
  const cred = await navigator.credentials.get({ publicKey });
  if (!cred) throw new Error('Login dibatalkan.');

  const assertion = {
    id: cred.id,
    rawId: bufferToB64url(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: bufferToB64url(cred.response.clientDataJSON),
      authenticatorData: bufferToB64url(cred.response.authenticatorData),
      signature: bufferToB64url(cred.response.signature),
      userHandle: cred.response.userHandle ? bufferToB64url(cred.response.userHandle) : null
    },
    clientExtensionResults: cred.getClientExtensionResults ? cred.getClientExtensionResults() : {}
  };
  const res = await api.post('/auth/biometric/login-verify', { challengeKey, assertion }, { skipToast: true });
  return res.data;
}

export async function disableBiometric() {
  await api.post('/auth/biometric/disable', {}, { skipToast: true });
  clearStoredBiometric();
}
