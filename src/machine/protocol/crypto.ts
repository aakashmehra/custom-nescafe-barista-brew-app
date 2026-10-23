// AES + pairing math for the Dolce Gusto machines.
// Pure TS (no React Native) so scripts/test-protocol.ts can run it in Node.
import aesjs from 'aes-js';

// AES-ECB with no padding when the input is exactly 16 bytes,
// otherwise PKCS7 padding (PKCS5 on a 16-byte block cipher == PKCS7).
export function aesEcbEncrypt(data: Uint8Array, key: Uint8Array): Uint8Array {
  const input = data.length === 16 ? data : aesjs.padding.pkcs7.pad(data);
  return new aesjs.ModeOfOperation.ecb(key).encrypt(input);
}

export function aesEcbDecrypt(data: Uint8Array, key: Uint8Array): Uint8Array {
  const out = new aesjs.ModeOfOperation.ecb(key).decrypt(data);
  return data.length === 16 ? out : aesjs.padding.pkcs7.strip(out);
}

// Pairing key = decrypt(a,k) XOR decrypt(b,k), first 16 bytes.
export function createPairingKey(a: Uint8Array, b: Uint8Array, key: Uint8Array): Uint8Array {
  const da = aesEcbDecrypt(a, key);
  const db = aesEcbDecrypt(b, key);
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = da[i] ^ db[i];
  return out;
}

// Pairing start command (US-ASCII, 16 bytes).
export const START_PAIRING = Uint8Array.from('WE START PAIRING', (c) => c.charCodeAt(0));

// What has to be persisted per machine to reconnect without re-pairing:
//   machinePassword = N2, key = N3. The AES session key is always `key`.
export interface PairingCredentials {
  machinePassword: Uint8Array;
  key: Uint8Array;
}

// First-time (light) pairing; argument order matters:
// N1 = 1st serial notification, N2 = 2nd, N3 = 3rd (after the user presses the brew button).
export function lightPairingResponse(n1: Uint8Array, n2: Uint8Array, n3: Uint8Array) {
  return {
    response: aesEcbEncrypt(createPairingKey(n2, n1, n3), n3),
    credentials: { machinePassword: n2, key: n3 } as PairingCredentials,
  };
}

// Reconnect with stored credentials; token = challenge notification.
export function repairResponse(token: Uint8Array, c: PairingCredentials): Uint8Array {
  return aesEcbEncrypt(createPairingKey(c.machinePassword, token, c.key), c.key);
}

// ble-plx moves values as base64. atob/btoa exist in Hermes and Node.
export const toBase64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
export const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
