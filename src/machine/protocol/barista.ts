// Nescafé Gold Blend Barista wire formats, all BLE generations.
// Builders return PLAINTEXT; the transport AES-encrypts the ones marked "enc" with the session key (pairing N3).
// Pure TS, randomness injected, no value imports (Node test loads it directly).
import type { BaristaDrink, BaristaDrinkId } from '../../data/baristaMenu';
import type { BaristaModel, BaristaOptions, HotWaterCalibration, MachineStatus, RinseStopMethod } from '../types';

const BARISTA_MAX_WATER_ML = 1000;

type Char = { service: string; characteristic: string };
const c = (service: string, characteristic: string): Char => ({ service, characteristic });

// ---- GATT tables ---------------------------------------------------------------------------------------------
// Legacy (i / 50 / 50-5 / Simple).
const L = (n: string) => `6fd400${n}-4a62-11e5-885d-feff819cdc9f`;
// Barista W.
const W = (n: string) => `6fd401${n}-4a62-11e5-885d-feff819cdc9f`;
// Barista Slim.
const S = (n: string) => `c08b01${n}-6407-4a30-8aab-ccbbae8b7a4a`;
// Barista Duo.
const D = (n: string) => `4897${n}-f755-4b76-b122-e1773e59c88e`;

export interface BaristaGatt {
  service: string; // advertised primary service, used for scan matching
  status: Char; // read (+notify), plain
  protectedRead: Char | null; // counters: must fail while unpaired (light pairing)
  serial: Char | null; // light-pairing channel (16-byte frames)
  hmi: Char | null; // button request / command
  customRecipe: Char | null; // 5-byte recipe, plain
  time: Char | null;
  coffeeLevel: Char | null;
  recipeStatus: Char | null;
}

export const BARISTA_GATT: Record<'legacy' | 'w' | 'slim' | 'duo', BaristaGatt> = {
  legacy: {
    service: L('00'),
    status: c(L('00'), L('04')),
    protectedRead: c(L('00'), L('05')),
    serial: c(L('00'), L('08')),
    hmi: c(L('00'), L('07')), // enc, AES/ECB/PKCS5 of 6 bytes -> 16
    customRecipe: c(L('02'), L('0f')),
    time: c(L('01'), L('0a')), // enc, PKCS5 of 8 bytes -> 16
    coffeeLevel: null,
    recipeStatus: null,
  },
  w: {
    service: W('00'),
    status: c(W('00'), W('04')),
    protectedRead: c(W('00'), W('05')),
    serial: c(W('00'), W('08')),
    hmi: c(W('00'), W('07')), // enc, 16 bytes
    customRecipe: c(W('02'), W('0f')),
    time: c(W('01'), W('0a')), // enc, 16 bytes
    coffeeLevel: c(W('02'), W('13')),
    recipeStatus: null,
  },
  slim: {
    service: S('00'),
    status: c(S('00'), S('04')),
    protectedRead: null, // OS bonding, no light pairing
    serial: null,
    hmi: c(S('00'), S('07')), // plain 2 bytes
    customRecipe: c(S('02'), S('0f')),
    time: c(S('01'), S('0a')), // plain 4 bytes BE
    coffeeLevel: c(S('02'), S('13')),
    recipeStatus: null,
  },
  duo: {
    service: D('d4b0'),
    status: c(D('d4b0'), D('d4b1')), // general status, 21 bytes
    protectedRead: c(D('d4b0'), D('d4b3')), // counters
    serial: c(D('d4a0'), D('d4a1')), // HMI serial number
    hmi: c(D('d4b0'), D('d4b7')), // Command, enc 16 bytes
    customRecipe: null, // control-point upload not implemented
    time: c(D('d4b0'), D('d4b5')), // enc 16 bytes
    coffeeLevel: null,
    recipeStatus: c(D('d4b0'), D('d4b2')),
  },
};

// Slim counters (notify+read). Read during pairing to provoke OS bonding.
export const SLIM_COUNTERS = c(S('00'), S('05'));

export const BARISTA_BST_SERVICE = '0e4eb570-f786-11e6-bc64-92361f002671'; // present on Simple and Duo
export const DEVICE_INFO_SERVICE = '0000180a-0000-1000-8000-00805f9b34fb';
export const FW_REVISION_CHAR = '00002a26-0000-1000-8000-00805f9b34fb';

export const baristaGen = (m: BaristaModel): keyof typeof BARISTA_GATT =>
  m === 'w' || m === 'slim' || m === 'duo' ? m : 'legacy';

// ---- Identification -------------------------------------------------------------------------------------------
// Default advertised name prefixes.
export function baristaModelFromName(name: string | null | undefined): BaristaModel | null {
  if (!name) return null;
  if (name.startsWith('NESCAFE Duo')) return 'duo';
  if (name.startsWith('NESCAFE MAYA')) return 'w';
  if (name.startsWith('NESCAFE MINI')) return 'slim';
  if (name.startsWith('NESCAFE S 5')) return 'fifty5';
  if (name.startsWith('NESCAFE S')) return 'fifty';
  if (name.startsWith('NESCAFE D')) return 'simple';
  if (name.startsWith('NESCAFE i') || name.startsWith('Tama2')) return 'i';
  return null;
}

// W / Slim / Duo are identified by their advertised primary service UUID; legacy models advertise
// service 6FD40000. Users can rename machines, so UUIDs win over names; legacy sub-model falls back to
// the name, then the Simple-only BST service.
export function baristaModelFromServices(uuids: string[], name: string | null | undefined): BaristaModel | null {
  const u = uuids.map((x) => x.toLowerCase());
  if (u.includes(BARISTA_GATT.w.service)) return 'w';
  if (u.includes(BARISTA_GATT.slim.service)) return 'slim';
  if (u.includes(BARISTA_GATT.duo.service)) return 'duo';
  if (u.includes(BARISTA_GATT.legacy.service)) {
    const byName = baristaModelFromName(name);
    if (byName && baristaGen(byName) === 'legacy') return byName;
    return u.includes(BARISTA_BST_SERVICE) ? 'simple' : 'i';
  }
  return null;
}

// Firmware revisions containing these use OS bonding instead of light pairing.
export const isLegacyOldFirmware = (fw: string) => ['SP01', 'T301', 'SP02', 'SP03', 'SP04', 'SP05'].some((x) => fw.includes(x));

// ---- Builders -------------------------------------------------------------------------------------------------
const u16le = (v: number) => [v & 0xff, (v >> 8) & 0xff];
const u16be = (v: number) => [(v >> 8) & 0xff, v & 0xff];

// HMI button ids, legacy models.
export const LEGACY_BUTTON = { power: 1, custom: 2, espresso: 4, lungo: 8, xlungo: 16, cappuccino: 32, latte: 64, hotWater: 128, rinse: 256, naraCustom: 4 } as const;

// [id BE16][rnd4], encrypted AES/ECB/PKCS5 (=> 16 bytes).
export const legacyHmi = (id: number, random4: Uint8Array) => Uint8Array.of(...u16be(id), ...random4.subarray(0, 4));

// [epoch u32 BE][rnd4], encrypted AES/ECB/PKCS5.
export const legacyTime = (epoch: number, random4: Uint8Array) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setUint32(0, epoch >>> 0);
  b.set(random4.subarray(0, 4), 4);
  return b;
};

// [(led<<4)+turns][water u16 LE][jet u16 LE], plain.
export const legacyCustomRecipe = (led: number, turns: number, waterMl: number, jetMl: number) =>
  Uint8Array.of(((led << 4) + turns) & 0xff, ...u16le(waterMl), ...u16le(jetMl));

// Barista W HMI byte 1: bit0 on/off, 1 custom, 2 rinse, 3 espresso, 4 lungo,
// 5 xlungo, 6 cappuccino, 7 latte. Byte 0 = 0.
export const W_BUTTON = { power: 0x01, custom: 0x02, rinse: 0x04, espresso: 0x08, lungo: 0x10, xlungo: 0x20, cappuccino: 0x40, latte: 0x80 } as const;

// [0][bits][rnd x4 (0..254)][0x0A x10], enc (NoPadding).
export function wHmi(bits: number, random4: Uint8Array): Uint8Array {
  const b = new Uint8Array(16).fill(10);
  b[0] = 0;
  b[1] = bits;
  for (let i = 0; i < 4; i++) b[2 + i] = random4[i] % 255;
  return b;
}

// [epoch u32 BE][rnd int LE x4][0x08 x8], enc.
export function wTime(epoch: number, random4: Uint8Array): Uint8Array {
  const b = new Uint8Array(16).fill(8);
  new DataView(b.buffer).setUint32(0, epoch >>> 0);
  b.set(random4.subarray(0, 4), 4);
  return b;
}

// W / Slim custom recipe: [(led<<4)+(dose&15)][mixing ml u16 BE][jet ml u16 BE], plain.
export const dsuCustomRecipe = (led: number, dose: number, waterMl: number, jetMl: number) =>
  Uint8Array.of(((dose & 15) + ((led << 4) & 0xff)) & 0xff, ...u16be(waterMl), ...u16be(Math.max(0, jetMl)));

// Barista Slim HMI: u16 written [lo][hi], plain.
export const SLIM_BUTTON = { hotWater: 0x0001, eco: 0x0002, power: 0x0100, custom: 0x0200, rinse: 0x0400, espresso: 0x0800, lungo: 0x1000, xlungo: 0x2000, cappuccino: 0x4000, latte: 0x8000 } as const;
export const slimHmi = (v: number) => Uint8Array.of(...u16le(v));

// Slim time: plain u32 BE.
export const slimTime = (epoch: number) => Uint8Array.of((epoch >>> 24) & 0xff, (epoch >>> 16) & 0xff, (epoch >>> 8) & 0xff, epoch & 0xff);

// Barista Duo commands.
export const DUO_COMMAND = { power: 1, espresso: 2, lungo: 3, xlungo: 4, cappuccino: 5, latte: 6, custom: 7, stop: 8 } as const;

// [cmd][rnd int LE x4][0x0B x11], enc.
export function duoCommand(cmd: number, random4: Uint8Array): Uint8Array {
  const b = new Uint8Array(16).fill(11);
  b[0] = cmd;
  b.set(random4.subarray(0, 4), 1);
  return b;
}

// [epoch int32 LE][rnd int LE x4][0x08 x8], enc.
export function duoTime(epoch: number, random4: Uint8Array): Uint8Array {
  const b = new Uint8Array(16).fill(8);
  new DataView(b.buffer).setUint32(0, epoch >>> 0, true);
  b.set(random4.subarray(0, 4), 4);
  return b;
}

// ---- Status ---------------------------------------------------------------------------------------------------
export interface BaristaSnapshot {
  state: string;
  paired: boolean;
  status: MachineStatus;
}

const bit = (v: number, n: number) => ((v >>> n) & 1) === 1;

// Legacy state byte -> state name.
const LEGACY_STATES: Record<number, string> = {
  0: 'DISCONNECTED', 1: 'SLEEP', 2: 'PRE_HEAT', 3: 'READY', 4: 'EXTRACT', 5: 'EXCEPTION', 6: 'ERROR', 7: 'SERVICE',
  25: 'DROPOUT', 26: 'PRIMING', 32: 'DESCALING', 39: 'PRODUCTION', 41: 'FOTA', 42: 'FOTA', 43: 'FOTA',
};
function naraState(raw: number): string {
  if (raw >= 4 && raw <= 24) return 'EXTRACT';
  if (raw >= 26 && raw <= 31) return 'PRIMING';
  if (raw >= 32 && raw <= 36) return 'DESCALING';
  if (raw === 37) return 'EXCEPTION';
  if (raw === 38) return 'ERROR';
  if (raw === 40) return 'SERVICE';
  return LEGACY_STATES[raw] ?? 'UNKNOWN';
}

// Legacy 6FD40004 (little-endian): errors u16 @0, alarms u16 @2, state @4, peripherals u16 @5 (bit7 paired).
export function parseLegacyStatus(model: BaristaModel, b: Uint8Array): BaristaSnapshot {
  if (b.length < 7) throw new Error(`Barista status must be >= 7 bytes, got ${b.length}`);
  const errors = b[0] | (b[1] << 8);
  const alarms = b[2] | (b[3] << 8);
  const nara = model === 'simple';
  const state = nara ? naraState(b[4]) : (LEGACY_STATES[b[4]] ?? 'UNKNOWN');
  const paired = bit(b[5] | (b[6] << 8), 7);
  // Error bits 0..2; alarm bits (Simple differs on bits 1,3,5,7).
  const errs: string[] = [];
  if (bit(errors, 0)) errs.push('NTC broken');
  if (bit(errors, 1)) errs.push('Valve broken');
  if (bit(errors, 2)) errs.push('Pre-heat error');
  if (bit(alarms, 3) && !nara) errs.push('Motor blocked — clean the coffee dosing unit');
  if (bit(alarms, 6)) errs.push('Pump overheated — unplug for 20 minutes');
  if (bit(alarms, 5) && nara) errs.push('Cleaning required');
  if (bit(alarms, 0)) errs.push('Rinse requested');
  const coffee: MachineStatus['coffee'] = nara ? (bit(alarms, 7) ? 'empty' : bit(alarms, 3) ? 'low' : 'ok') : undefined;
  const status = readiness(state, {
    errors: errs,
    noWater: bit(alarms, 4),
    blocked: bit(alarms, 1) ? (nara ? 'Fit the coffee tank correctly' : 'Close the cover') : bit(alarms, 2) ? 'Close the drawer' : null,
    coffee,
  });
  return { state, paired, status };
}

// Barista W / Slim status, LE:
// errorCode u32 @0, state @4, peripherals u16 @5 (bit7 paired), LEDs on u16 @7, blink u16 @9.
const DSU_STATES: Record<number, string> = { 0: 'INIT', 1: 'SLEEP', 2: 'PRE_HEAT', 3: 'READY', 4: 'EXTRACT', 5: 'EXCEPTION', 6: 'FAULT' };
export function parseDsuStatus(b: Uint8Array): BaristaSnapshot {
  if (b.length < 7) throw new Error(`Barista status must be >= 7 bytes, got ${b.length}`);
  const e = (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0;
  const state = DSU_STATES[b[4]] ?? 'UNKNOWN';
  const paired = bit(b[5] | (b[6] << 8), 7);
  // Error code bit order.
  const names: Array<[number, string]> = [
    [7, 'Motor blocked'], [8, 'Coffee level sensor missing'], [10, 'Pump on-time exceeded'], [11, 'NTC broken'],
    [12, 'Overheating'], [13, 'Reset switch not connected'], [14, 'Reset switch timeout'], [15, 'Active switch timeout'],
    [16, 'Valve switch timeout'], [17, 'Motor not connected'], [18, 'Motor gearbox broken'],
    [0, 'Dosing unit dirty — rinse needed'], [1, 'Mandatory rinse'],
  ];
  const errs = names.filter(([n]) => bit(e, n)).map(([, s]) => s);
  const coffee = bit(e, 4) ? 'empty' : bit(e, 2) ? 'low' : 'ok';
  const status = readiness(state, {
    errors: errs,
    noWater: bit(e, 3),
    blocked: bit(e, 5) ? 'Fit the coffee tank correctly' : bit(e, 6) ? 'Fit the brewing-unit cover' : null,
    coffee,
  });
  return { state, paired, status };
}

// Barista Duo general status, exactly 21 bytes, LE.
const DUO_STATES: Record<number, string> = {
  0: 'UNKNOWN', 1: 'INIT', 2: 'AUTH', 3: 'IDENT', 4: 'SLEEP', 5: 'PRE_HEAT', 6: 'READY', 7: 'RECIPE_RUNNING',
  8: 'EXCEPTION', 9: 'FAILURE', 10: 'PRE_COOL', 11: 'PRE_COOL',
};
export function parseDuoStatus(b: Uint8Array): BaristaSnapshot {
  if (b.length !== 21) throw new Error(`Barista Duo status must be 21 bytes, got ${b.length}`);
  const state = DUO_STATES[b[4]] ?? 'UNKNOWN';
  const paired = bit(b[1], 0);
  const warnings = b[7] | (b[8] << 8);
  const alarms = b[9] | (b[10] << 8);
  const failures = b[11] | (b[12] << 8);
  const errs: string[] = [];
  ['NTC broken', 'Heating timeout', 'Left dosing blocked', 'Right dosing / creamer blocked', 'System error', 'Pump time exceeded'].forEach(
    (s, i) => bit(failures, i) && errs.push(s),
  );
  if (bit(alarms, 0)) errs.push('Rinse requested');
  if (bit(alarms, 7)) errs.push('Priming requested');
  if (bit(alarms, 6)) errs.push('No flow');
  const status = readiness(state === 'RECIPE_RUNNING' ? 'EXTRACT' : state, {
    errors: errs,
    noWater: bit(alarms, 3),
    blocked: bit(alarms, 1) ? 'Close the rotating door' : bit(alarms, 2) ? 'Close the top cover' : bit(alarms, 5) ? 'Refill the creamer' : null,
    coffee: bit(alarms, 4) ? 'empty' : bit(warnings, 1) ? 'low' : 'ok',
  });
  return { state, paired, status };
}

// Duo recipe status: [state][progression u16 LE][dispensed ml u16 LE][active step][flags].
const DUO_RECIPE = ['NOT_STARTED', 'IN_PROGRESS', 'STOPPED', 'FINISHED', 'ABORTED'];
export function parseDuoRecipeStatus(b: Uint8Array) {
  if (b.length < 7) throw new Error(`Barista Duo recipe status must be 7 bytes, got ${b.length}`);
  return { state: DUO_RECIPE[b[0]] ?? 'UNKNOWN', progression: b[1] | (b[2] << 8), dispensedMl: b[3] | (b[4] << 8), step: b[5] };
}

function readiness(
  state: string,
  x: { errors: string[]; noWater: boolean; blocked: string | null; coffee?: MachineStatus['coffee'] },
): MachineStatus {
  const base = { coffee: x.coffee };
  if (x.errors.length) return { ...base, readiness: 'error', detail: x.errors.join(', ') };
  if (['ERROR', 'FAULT', 'FAILURE', 'SERVICE', 'DESCALING', 'FOTA', 'PRODUCTION'].includes(state))
    return { ...base, readiness: 'error', detail: state };
  if (state === 'EXTRACT') return { ...base, readiness: 'brewing' };
  if (x.blocked) return { ...base, readiness: 'needsCapsule', detail: x.blocked };
  if (x.coffee === 'empty') return { ...base, readiness: 'needsCapsule', detail: 'Refill the coffee powder tank' };
  if (x.noWater) return { ...base, readiness: 'needsWater' };
  if (state === 'SLEEP') return { ...base, readiness: 'sleeping' };
  if (['PRE_HEAT', 'INIT', 'PRIMING', 'AUTH', 'IDENT', 'PRE_COOL', 'INITIALIZATION'].includes(state))
    return { ...base, readiness: 'heating' };
  if (state === 'READY' || state === 'EXCEPTION') return { ...base, readiness: 'ready', detail: state === 'EXCEPTION' ? state : undefined };
  return { ...base, readiness: 'unknown', detail: state };
}

export function parseBaristaStatus(model: BaristaModel, b: Uint8Array): BaristaSnapshot {
  const g = baristaGen(model);
  return g === 'legacy' ? parseLegacyStatus(model, b) : g === 'duo' ? parseDuoStatus(b) : parseDsuStatus(b);
}

// States in which a brew may start: legacy Ready/Exception, W/Slim Ready (state 3), Duo Ready (status 6).
export const baristaCanBrew = (m: BaristaModel) => (baristaGen(m) === 'legacy' ? ['READY', 'EXCEPTION'] : ['READY']);
// Brew lifecycle: started on EXTRACT / RECIPE_RUNNING; done on READY after started, or BLE drop after started.
export const BARISTA_BREW_ACTIVE = ['EXTRACT', 'RECIPE_RUNNING'];
export const BARISTA_BREW_END = ['READY', 'SLEEP', 'ERROR', 'FAULT', 'FAILURE'];

// ---- Drink planning -------------------------------------------------------------------------------------------
export type BaristaPlan =
  | { kind: 'custom'; recipe: Uint8Array; button: number; pours?: Uint8Array[] } // write recipe (plain), then press `button`
  | { kind: 'command'; command: number }; // a native machine command

// Legacy LED nibble per drink (Espresso..Latte -> 0..4, Iced -> led 0).
const LEGACY_LED: Record<'i' | 'fifty' | 'fifty5', Partial<Record<BaristaDrinkId, number>>> = {
  i: { espresso: 0, lungo: 1, xlungo: 2, cappuccino: 3, latte: 4, iced: 0 },
  fifty5: { espresso: 0, lungo: 1, xlungo: 2, cappuccino: 3, latte: 4, iced: 0 },
  fifty: { espresso: 0, lungo: 0, xlungo: 1, cappuccino: 3, latte: 4, iced: 0 },
};
// Barista Slim LED per drink.
const SLIM_LED: Record<BaristaDrinkId, number> = { espresso: 0, lungo: 1, xlungo: 2, cappuccino: 3, latte: 4, iced: 0, hotWater: 5 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

const pourCountFor = (waterMl: number) => Math.ceil(waterMl / 300);
const pourWater = (waterMl: number, index: number) => clamp(waterMl - index * 300, 40, 300);
// Keep the chosen scoop total across a large drink, instead of repeating it
// for every 300 ml machine pour.
const pourDose = (strength: number, count: number, index: number) => {
  const total = clamp(strength, 0, 5);
  return Math.floor(total / count) + (index < total % count ? 1 : 0);
};

// Resolve options against the drink's defaults (menu ranges from src/data/baristaMenu.ts).
export function resolveBaristaOptions(drink: BaristaDrink, o: BaristaOptions = {}) {
  const opt = drink.options;
  if (!opt) return { strength: 1, waterMl: drink.defaultCupMl ?? 0, milkMl: 0 };
  const strength = clamp(o.strength ?? opt.strength.default, opt.strength.min, opt.strength.max);
  const w = opt.waterMl[strength - opt.strength.min] ?? opt.waterMl[0];
  const waterMl = clamp(o.waterMl ?? w.default, w.min, BARISTA_MAX_WATER_ML);
  const milkMl = opt.milkMl ? clamp(o.milkMl ?? opt.milkMl.default, opt.milkMl.min, opt.milkMl.max) : 0;
  return { strength, waterMl, milkMl };
}

export function planBaristaBrew(model: BaristaModel, drink: BaristaDrink, o?: BaristaOptions): BaristaPlan {
  if (!drink.models.includes(model)) throw new Error(`${drink.name} is not available on this Barista model.`);
  const { strength, waterMl, milkMl } = resolveBaristaOptions(drink, o);
  const waterOnly = drink.id === 'hotWater';
  switch (model) {
    case 'duo': {
      const command = (DUO_COMMAND as Record<string, number>)[drink.id];
      if (!command || command > 6) throw new Error(`${drink.name} is not available on Barista Duo.`);
      return { kind: 'command', command };
    }
    case 'simple': {
      // Simple: turns forced to 1, black drinks use jet 0.
      if (waterOnly) {
        const pours = Array.from({ length: Math.ceil(waterMl / 300) }, (_, index) =>
          legacyCustomRecipe(0, 0, clamp(waterMl - index * 300, 40, 300), 0),
        );
        return { kind: 'custom', recipe: pours[0], pours, button: LEGACY_BUTTON.naraCustom };
      }
      const white = drink.id === 'latte';
      const pours = waterMl > 300
        ? Array.from({ length: pourCountFor(waterMl) }, (_, index) => legacyCustomRecipe(0, 1, pourWater(waterMl, index), white ? clamp(milkMl || 30, 30, 90) : 0))
        : undefined;
      return { kind: 'custom', recipe: pours?.[0] ?? legacyCustomRecipe(0, 1, clamp(waterMl, 40, 300), white ? clamp(milkMl || 30, 30, 90) : 0), pours, button: LEGACY_BUTTON.naraCustom };
    }
    case 'i':
    case 'fifty':
    case 'fifty5': {
      const led = waterOnly ? 0 : LEGACY_LED[model][drink.id];
      if (led === undefined) throw new Error(`${drink.name} is not available on this Barista model.`);
      // Valid ranges: turns 1..5, water 0..300, jet 0..200 (50-5: 0..90).
      const jet = clamp(milkMl, 0, model === 'fifty5' ? 90 : 200);
      const pours = waterOnly || waterMl > 300
        ? Array.from({ length: pourCountFor(waterMl) }, (_, index) => legacyCustomRecipe(led, waterOnly ? 0 : pourDose(strength, pourCountFor(waterMl), index), pourWater(waterMl, index), waterOnly ? 0 : jet))
        : undefined;
      return { kind: 'custom', recipe: pours?.[0] ?? legacyCustomRecipe(led, clamp(strength, 1, 5), clamp(waterMl, 0, 300), jet), pours, button: LEGACY_BUTTON.custom };
    }
    case 'w': {
      // W's custom program always advances the coffee dispenser, even for
      // dose 0. Its native rinse command uses the water path without dosing.
      if (waterOnly) return { kind: 'command', command: W_BUTTON.rinse };
      // LED index is always 0 for W custom recipes.
      const pours = waterMl > 300
        ? Array.from({ length: pourCountFor(waterMl) }, (_, index) => dsuCustomRecipe(0, pourDose(strength, pourCountFor(waterMl), index), pourWater(waterMl, index), clamp(milkMl, 0, 200)))
        : undefined;
      return { kind: 'custom', recipe: pours?.[0] ?? dsuCustomRecipe(0, clamp(strength, 1, 5), clamp(waterMl, 0, 300), clamp(milkMl, 0, 200)), pours, button: W_BUTTON.custom };
    }
    case 'slim':
      if (waterOnly || waterMl > 300) {
        const pours = Array.from({ length: Math.ceil(waterMl / 300) }, (_, index) =>
          dsuCustomRecipe(SLIM_LED[drink.id], waterOnly ? 0 : pourDose(strength, pourCountFor(waterMl), index), pourWater(waterMl, index), waterOnly ? 0 : clamp(milkMl, 0, 200)),
        );
        return { kind: 'custom', recipe: pours[0], pours, button: SLIM_BUTTON.custom };
      }
      return {
        kind: 'custom',
        recipe: dsuCustomRecipe(SLIM_LED[drink.id], waterOnly ? 0 : clamp(strength, 1, 5), clamp(waterMl, 0, 300), clamp(milkMl, 0, 200)),
        button: SLIM_BUTTON.custom,
      };
  }
}

// ---- Barista W hot water ------------------------------------------------------------------------------------
// W has no water-only recipe (custom recipe needs dose >= 1), so hot water
// is a run of rinse cycles; the last one is cut short on a timer when the machine accepts a stop press.
export const HOT_WATER_MIN_ML = 15;
// A stop press timed close to the rinse's natural end could land after it and start another rinse,
// so pours above this share of a rinse run to completion instead.
const FULL_RINSE_SHARE = 0.9;

// 'detect' = try a rinse press, then a power press, and report which one ended the rinse.
export type RinseStopPlan = RinseStopMethod | 'detect';

export interface HotWaterPour {
  ml: number;
  // ms after the machine enters EXTRACT to send the stop press; null = let the rinse finish.
  stopAfterMs: number | null;
}

export function planHotWater(targetMl: number, cal: HotWaterCalibration): { pours: HotWaterPour[]; totalMl: number } {
  const rinse = Math.max(1, Math.round(cal.rinseMl));
  const target = Math.max(HOT_WATER_MIN_ML, Math.round(targetMl));
  const canStop = cal.stop !== 'none' && cal.rinseMs > 0;
  const full = Math.floor(target / rinse);
  const rem = target - full * rinse;
  const pours: HotWaterPour[] = Array.from({ length: full }, () => ({ ml: rinse, stopAfterMs: null }));
  if (!canStop) {
    // Whole rinses only: round to the nearest count, at least one.
    if (pours.length === 0 || rem >= rinse / 2) pours.push({ ml: rinse, stopAfterMs: null });
  } else if (rem >= HOT_WATER_MIN_ML || pours.length === 0) {
    const ml = Math.max(HOT_WATER_MIN_ML, rem);
    if (ml >= rinse * FULL_RINSE_SHARE) pours.push({ ml: rinse, stopAfterMs: null });
    else pours.push({ ml, stopAfterMs: Math.round((ml / rinse) * cal.rinseMs) });
  }
  return { pours, totalMl: pours.reduce((n, p) => n + p.ml, 0) };
}
