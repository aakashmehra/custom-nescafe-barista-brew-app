// Figaro (Dolce Gusto Esperta) wire format.
// Builders return PLAINTEXT; the transport AES-encrypts the ones marked "encrypted" with the session key.
import type { FigaroRecipeType, MachineStatus } from '../types';

const uuid = (n: string) => `6fd4${n}-4a62-11e5-885d-feff819cdc9f`;
const S1 = uuid('0000'); // primary service (also the advertised scan-filter UUID)
const S2 = uuid('0001');
const S4 = uuid('0003');

export const FIGARO = {
  service: S1,
  status: { service: S1, characteristic: uuid('0004') }, // read/notify, 11 bytes, plain
  protectedCounter: { service: S1, characteristic: uuid('0005') }, // read must FAIL while unpaired
  hmiButton: { service: S1, characteristic: uuid('0007') }, // write, encrypted (power toggle)
  serial: { service: S1, characteristic: uuid('0008') }, // read/notify/write, pairing channel
  time: { service: S2, characteristic: uuid('000a') }, // write, encrypted
  beveragePreparation: { service: S4, characteristic: uuid('0013') }, // write, encrypted
  preparationStatus: { service: S4, characteristic: uuid('0014') }, // notify, 3 bytes, plain
  preparationControl: { service: S4, characteristic: uuid('0015') }, // write, 1 byte, plain
} as const;

// Recipe type byte (DESCALING = 10 omitted on purpose).
export const FIGARO_RECIPE_TYPE: Record<FigaroRecipeType, number> = {
  cold: 0,
  hot: 1,
  espressoBoost: 2,
  coldBrew: 3,
  delicateBrew: 4,
};

export interface FigaroRecipe {
  level: number; // 0 = LEVEL0, 1..7, 8 = XL
  recipeType: FigaroRecipeType;
  temperature: number; // °C, 20..96
  intensity: number; // prewet time / intensity byte (0 by default)
}

// [level][type][00 00 00 00][intensity][temp][rnd x4][04 04 04 04]
export function beveragePreparation(r: FigaroRecipe, random4: Uint8Array): Uint8Array {
  if (!Number.isInteger(r.temperature) || r.temperature < 20 || r.temperature > 96)
    throw new RangeError('Temperature out of range. The valid range is between 20 and 96 °C');
  if (!Number.isInteger(r.level) || r.level < 0 || r.level > 8) throw new RangeError('Figaro level must be 0..8');
  const b = new Uint8Array(16);
  b[0] = r.level;
  b[1] = FIGARO_RECIPE_TYPE[r.recipeType];
  b[6] = r.intensity & 0xff;
  b[7] = r.temperature;
  b.set(random4.subarray(0, 4), 8);
  b.set([4, 4, 4, 4], 12);
  return b;
}

// Little-endian short 1, rnd x4, 0x0A x10. Encrypted, to hmiButton.
export function hmiButtonPress(random4: Uint8Array): Uint8Array {
  const b = new Uint8Array(16).fill(10);
  b[0] = 1;
  b[1] = 0;
  b.set(random4.subarray(0, 4), 2);
  return b;
}

// LE int32 epoch seconds, rnd x4, 0x08 x8. Encrypted.
export function machineTime(epochSeconds: number, random4: Uint8Array): Uint8Array {
  const b = new Uint8Array(16).fill(8);
  new DataView(b.buffer).setInt32(0, epochSeconds | 0, true);
  b.set(random4.subarray(0, 4), 4);
  return b;
}

// RESUME = 1, ABORT = 2. Written as-is (NOT encrypted).
export const preparationControl = (cmd: 'resume' | 'abort') => Uint8Array.of(cmd === 'resume' ? 1 : 2);

// State byte -> state name (0xFF = UNKNOWN).
const STATES = ['INITIALIZATION', 'SLEEP', 'PRE_HEAT', 'READY', 'EXTRACT', 'EXCEPTION', 'ERROR', 'SERVICE'];
export const figaroState = (byte: number) => STATES[byte] ?? 'UNKNOWN';

const bit = (v: number, mask: number) => (v & mask) !== 0;

export interface FigaroMachineStatus {
  state: string;
  errors: {
    ntcConnectionBreak: boolean;
    valveError: boolean;
    ntcShortCircuit: boolean;
    heaterOverTemperature: boolean;
    pumpOverheated: boolean;
    configDataError: boolean;
    zeroCrossDetection: boolean;
    communicationError: boolean;
    heatUpTimeout: boolean;
  };
  waterTankEmpty: boolean;
  peripherals: {
    valveMotorOn: boolean;
    thermoBlockOn: boolean;
    pumpOn: boolean;
    officeMode: boolean;
    normalEcoMode: boolean;
    paired: boolean;
    capsuleHolderInserted: boolean;
    clampHandleClosed: boolean;
    valvePositionBit1: boolean;
    valvePositionBit2: boolean;
    specialMode: boolean;
    descalingRequired: boolean;
  };
  ledsOn: number;
  ledsBlink: number;
}

// Big-endian: u16 errors, u16 alarms, u8 state,
// u16 peripherals, u16 HMI LEDs on, u16 HMI LEDs blink (11 bytes).
export function parseMachineStatus(b: Uint8Array): FigaroMachineStatus {
  if (b.length < 11) throw new Error(`Figaro status must be 11 bytes, got ${b.length}`);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const e = v.getUint16(0);
  const a = v.getUint16(2);
  const p = v.getUint16(5);
  return {
    state: figaroState(b[4]),
    errors: {
      ntcConnectionBreak: bit(e, 0x0100),
      valveError: bit(e, 0x0200),
      ntcShortCircuit: bit(e, 0x0400),
      heaterOverTemperature: bit(e, 0x0800),
      pumpOverheated: bit(e, 0x1000),
      configDataError: bit(e, 0x2000),
      zeroCrossDetection: bit(e, 0x4000),
      communicationError: bit(e, 0x8000),
      heatUpTimeout: bit(e, 0x0080),
    },
    waterTankEmpty: bit(a, 0x1000),
    peripherals: {
      valveMotorOn: bit(p, 0x0200),
      thermoBlockOn: bit(p, 0x0400),
      pumpOn: bit(p, 0x0800),
      officeMode: bit(p, 0x2000),
      normalEcoMode: bit(p, 0x4000),
      paired: bit(p, 0x8000),
      capsuleHolderInserted: bit(p, 0x0001),
      clampHandleClosed: bit(p, 0x0002),
      valvePositionBit1: bit(p, 0x0004),
      valvePositionBit2: bit(p, 0x0008),
      specialMode: bit(p, 0x0010),
      descalingRequired: bit(p, 0x0020),
    },
    ledsOn: v.getUint16(7),
    ledsBlink: v.getUint16(9),
  };
}

// Recipe step byte -> step name (8 is unassigned).
const STEPS: Record<number, string> = {
  1: 'HEAT_UP_NORMAL',
  2: 'VALVE_OPEN_HOT',
  3: 'VALVE_OPEN_COLD',
  4: 'VALVE_CLOSE',
  5: 'VALVE_HOME',
  6: 'EXTRACT_NORMAL_HOT',
  7: 'EXTRACT_NORMAL_COLD',
  9: 'HEAT_UP_DESCALING',
  10: 'DESCALE_PUMP_AGENT_HOT_CHANEL',
  11: 'DESCALE_PUMP_AGENT_COLD_CHANEL',
  12: 'DESCALE_WAIT_REACTION_TIME',
  13: 'DESCALE_RINSE_HOT_CHANEL',
  14: 'DESCALE_RINSE_COLD_CHANEL',
  15: 'EXTRACT_POST_DELAY',
  16: 'HEAT_UP_DELICATE_BREW',
  17: 'HEAT_UP_ESPRESSO_BOOST',
  18: 'CAPSULE_FILLING_COLD_BREW',
  19: 'CAPSULE_FILLING_DELICATE_BREW',
  20: 'CAPSULE_FILLING_ESPRESSO_BOOST',
  21: 'PREWETTING_TIME_COLD_BREW',
  22: 'PREWETTING_TIME_DELICATE_BREW',
  23: 'PREWETTING_TIME_ESPRESSO_BOOST',
  24: 'EXTRACT_COLD_BREW',
  25: 'EXTRACT_DELICATE_BREW',
  26: 'EXTRACT_ESPRESSO_BOOST',
  27: 'WAIT_FOR_USER_RESPONSE',
};

export interface FigaroPreparationStatus {
  totalProgress: number;
  step: string;
  stepProgress: number;
}

// [totalProgress][step][currentStepProgress]; any other length is rejected.
export function parsePreparationStatus(b: Uint8Array): FigaroPreparationStatus {
  if (b.length !== 3) throw new Error(`Figaro preparation status must be 3 bytes, got ${b.length}`);
  return { totalProgress: b[0], step: STEPS[b[1]] ?? 'UNKNOWN', stepProgress: b[2] };
}

// Brew lifecycle: brewing once EXTRACT is seen,
// finished when the state then becomes PRE_HEAT / READY / SLEEP / ERROR.
export const FIGARO_BREW_ACTIVE = ['EXTRACT'];
export const FIGARO_BREW_END = ['PRE_HEAT', 'READY', 'SLEEP', 'ERROR'];
// The machine only accepts a brew in READY.
export const FIGARO_CAN_BREW = ['READY'];

export function figaroReadiness(s: FigaroMachineStatus): MachineStatus {
  const errs = Object.entries(s.errors)
    .filter(([, on]) => on)
    .map(([k]) => k);
  if (errs.length) return { readiness: 'error', detail: errs.join(', ') };
  if (['EXCEPTION', 'ERROR', 'SERVICE'].includes(s.state)) return { readiness: 'error', detail: s.state };
  if (s.state === 'EXTRACT') return { readiness: 'brewing' };
  // Brewing is blocked on these three.
  if (s.peripherals.descalingRequired) return { readiness: 'error', detail: 'Descaling required' };
  if (!s.peripherals.capsuleHolderInserted) return { readiness: 'needsCapsule', detail: 'Capsule holder missing' };
  if (!s.peripherals.clampHandleClosed) return { readiness: 'needsCapsule', detail: 'Close the capsule holder lever' };
  if (s.waterTankEmpty) return { readiness: 'needsWater' };
  if (s.state === 'SLEEP') return { readiness: 'sleeping' };
  if (s.state === 'PRE_HEAT' || s.state === 'INITIALIZATION') return { readiness: 'heating' };
  if (s.state === 'READY') return { readiness: 'ready' };
  return { readiness: 'unknown', detail: s.state };
}
