// Shared helpers for the BLE transport (React Native only).
import { BleError, BleErrorCode } from 'react-native-ble-plx';
import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { fromBase64, toBase64, type PairingCredentials } from '../protocol/crypto';

export type Char = { service: string; characteristic: string };

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const rnd4 = () => getRandomBytes(4);

// Single-consumer FIFO for serial-characteristic notifications (pairing handshake).
export function queue() {
  let items: Uint8Array[] = [];
  let waiter: ((b: Uint8Array) => void) | null = null;
  return {
    push(b: Uint8Array) {
      if (waiter) {
        const w = waiter;
        waiter = null;
        w(b);
      } else items.push(b);
    },
    clear() {
      items = [];
    },
    next(ms: number, timeoutMessage: string): Promise<Uint8Array> {
      const b = items.shift();
      if (b) return Promise.resolve(b);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => {
          waiter = null;
          reject(new Error(timeoutMessage));
        }, ms);
        waiter = (v) => {
          clearTimeout(t);
          resolve(v);
        };
      });
    },
  };
}

// SecureStore keys may only contain [A-Za-z0-9._-]; Android ids are MAC addresses.
const credKey = (id: string) => `brew.pair.${id.replace(/[^A-Za-z0-9._-]/g, '_')}`;

export async function loadCreds(id: string): Promise<PairingCredentials | null> {
  const raw = await SecureStore.getItemAsync(credKey(id));
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as { machinePassword: string; key: string };
    return { machinePassword: fromBase64(j.machinePassword), key: fromBase64(j.key) };
  } catch {
    return null;
  }
}

export const saveCreds = (id: string, c: PairingCredentials) =>
  SecureStore.setItemAsync(credKey(id), JSON.stringify({ machinePassword: toBase64(c.machinePassword), key: toBase64(c.key) }));

export const deleteCreds = (id: string) => SecureStore.deleteItemAsync(credKey(id));

export function friendly(e: unknown): Error {
  if (e instanceof BleError) {
    if (e.errorCode === BleErrorCode.BluetoothPoweredOff) return new Error('Bluetooth is powered off. Turn it on and try again.');
    if (e.errorCode === BleErrorCode.BluetoothUnauthorized)
      return new Error('Bluetooth permission denied. Allow Bluetooth access in Settings.');
    if (e.errorCode === BleErrorCode.DeviceDisconnected) return new Error('Machine disconnected (connection lost).');
    return new Error(e.reason ? `${e.message} (${e.reason})` : e.message);
  }
  return e instanceof Error ? e : new Error(String(e));
}

