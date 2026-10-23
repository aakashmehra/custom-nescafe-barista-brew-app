// Dolce Gusto Genio S wire format.
// Builders return PLAINTEXT; the transport AES-encrypts the ones marked "encrypted" with the session key.
import type { MachineStatus } from '../types';

const uuid = (n: string) => `82f219${n}-f300-4e71-b5f5-714578020395`;
const RECIPE = uuid('10'); // primary service (also the advertised scan-filter UUID)
const MACHINE = uuid('20');

export const GENIO = {
  service: RECIPE,
  recipeLevel: { service: RECIPE, characteristic: uuid('11') }, // write 1 byte, plain
  recipeControl: { service: RECIPE, characteristic: uuid('12') }, // write, encrypted (brew + power)
  recipeTemperature: { service: RECIPE, characteristic: uuid('13') }, // write, encrypted
  recipeType: { service: RECIPE, characteristic: uuid('14') }, // read/notify only (current extraction type)
  status: { service: MACHINE, characteristic: uuid('21') }, // read/notify, 2 bytes, plain
  errorsSensors: { service: MACHINE, characteristic: uuid('23') }, // read/notify, 1 byte
  hmiVersion: { service: MACHINE, characteristic: uuid('24') }, // also the "protected" char (read fails unpaired)
  mboVersion: { service: MACHINE, characteristic: uuid('25') },
  time: { service: MACHINE, characteristic: uuid('26') }, // write, encrypted
  serial: { service: MACHINE, characteristic: uuid('28') }, // pairing channel
} as const;

export type GenioExtraction = 'hot' | 'cold';

export interface GenioRecipe {
  level: number; // 0..8 (shared with Figaro)
  extraction: GenioExtraction; // HOT 0, COLD 1, NOT_DEFINED 0xFF
  temperature: number; // °C, 0..108
}

const PKCS11 = new Array(11).fill(11);

const block = (first: number, random4: Uint8Array) => {
  const b = new Uint8Array(16);
  b[0] = first;
  b.set(random4.subarray(0, 4), 1);
  b.set(PKCS11, 5);
  return b;
};

// [extraction][rnd x4][0x0B x11]. Encrypted, to recipeControl.
export const brewControl = (e: GenioExtraction, random4: Uint8Array) => block(e === 'cold' ? 1 : 0, random4);

// [°C][rnd x4][0x0B x11]. Encrypted, to recipeTemperature.
export function temperatureData(celsius: number, random4: Uint8Array): Uint8Array {
  if (!Number.isInteger(celsius) || celsius < 0 || celsius > 108) throw new RangeError('Genio temperature must be 0..108 °C');
  return block(celsius, random4);
}

// 1 plain byte.
export function recipeLevel(level: number): Uint8Array {
  if (!Number.isInteger(level) || level < 0 || level > 8) throw new RangeError('Genio level must be 0..8');
  return Uint8Array.of(level);
}

// TURN_ON 0x10, TURN_OFF 0x11. Encrypted, to recipeControl.
export const powerControl = (on: boolean, random4: Uint8Array) => block(on ? 0x10 : 0x11, random4);

// Big-endian u32 epoch seconds, rnd x4, 0x08 x8. Encrypted.
export function machineTime(epochSeconds: number, random4: Uint8Array): Uint8Array {
  const b = new Uint8Array(16).fill(8);
  new DataView(b.buffer).setUint32(0, epochSeconds >>> 0);
  b.set(random4.subarray(0, 4), 4);
  return b;
}

// State byte -> state name (0xFF = NOT_DEFINED).
const STATES = [
  'INIT',
  'SLEEP',
  'PRE_HEAT',
  'READY',
  'READY_OPEN',
  'RUNNING_RECIPE',
  'NO_FLOW',
  'END_EXTRACTION',
  'LONGER_EXTRACTION',
  'DESCALING',
  'DESCALING_AGENT',
  'DESCALING_REACTION_TIME',
  'DESCALING_WAIT',
  'DESCALING_RINSING',
  'ERROR',
];
export const genioState = (byte: number) => STATES[byte] ?? 'NOT_DEFINED';

// Byte 0 = state, byte 1 == 1 -> paired (this BLE session).
export function parseStatus(b: Uint8Array) {
  if (b.length < 2) throw new Error(`Genio status must be 2 bytes, got ${b.length}`);
  return { state: genioState(b[0]), paired: b[1] === 1 };
}

export interface GenioErrors {
  ntcBroken: boolean;
  motorIssue: boolean;
  heaterIssue: boolean;
  capsHolderMissing: boolean;
  headOpen: boolean;
  pumpIssue: boolean;
}

// Error/sensor bits 0..5.
export function parseErrorsSensors(byte: number): GenioErrors {
  return {
    ntcBroken: (byte & 1) !== 0,
    motorIssue: (byte & 2) !== 0,
    heaterIssue: (byte & 4) !== 0,
    capsHolderMissing: (byte & 8) !== 0,
    headOpen: (byte & 16) !== 0,
    pumpIssue: (byte & 32) !== 0,
  };
}

const s8 = (x: number) => (x << 24) >> 24; // signed byte

// Remote power-on needs HMI >= 7.3.x and MBO >= 7.2.
export function isPreheatAvailable(hmi: Uint8Array, mbo: Uint8Array): boolean {
  if (hmi.length < 3 || mbo.length < 2) return false;
  const [a, b, c] = [s8(hmi[0]), s8(hmi[1]), s8(hmi[2])];
  const [d, e] = [s8(mbo[0]), s8(mbo[1])];
  return (a > 7 || (a === 7 && b > 3) || (a === 7 && b === 3 && c >= 0)) && (d > 7 || (d === 7 && e >= 2));
}

// Brewing once RUNNING_RECIPE is seen, finished on END_EXTRACTION / READY / SLEEP / ERROR.
// END_EXTRACTION also counts as "started", since it can signal completion on its own.
export const GENIO_BREW_ACTIVE = ['RUNNING_RECIPE', 'LONGER_EXTRACTION', 'END_EXTRACTION'];
export const GENIO_BREW_END = ['END_EXTRACTION', 'READY', 'SLEEP', 'ERROR'];
// The machine accepts a brew in READY or NO_FLOW.
export const GENIO_CAN_BREW = ['READY', 'NO_FLOW'];

export function genioReadiness(state: string, errors: GenioErrors | null): MachineStatus {
  if (errors) {
    // Brewing is blocked on all six.
    const hard = (['ntcBroken', 'motorIssue', 'heaterIssue', 'pumpIssue'] as const).filter((k) => errors[k]);
    if (hard.length) return { readiness: 'error', detail: hard.join(', ') };
    if (errors.capsHolderMissing) return { readiness: 'needsCapsule', detail: 'Capsule holder missing' };
    if (errors.headOpen) return { readiness: 'needsCapsule', detail: 'Close the machine head / lever' };
  }
  switch (state) {
    case 'READY':
      return { readiness: 'ready' };
    case 'READY_OPEN':
      return { readiness: 'needsCapsule', detail: 'READY_OPEN' };
    case 'SLEEP':
      return { readiness: 'sleeping' };
    case 'INIT':
    case 'PRE_HEAT':
      return { readiness: 'heating' };
    case 'RUNNING_RECIPE':
    case 'END_EXTRACTION':
    case 'LONGER_EXTRACTION':
      return { readiness: 'brewing' };
    case 'NO_FLOW':
      return { readiness: 'needsWater', detail: 'No water flow' };
    case 'NOT_DEFINED':
      return { readiness: 'unknown' };
    default: // ERROR, DESCALING*
      return { readiness: 'error', detail: state };
  }
}
