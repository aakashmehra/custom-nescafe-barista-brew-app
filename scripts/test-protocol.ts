/// <reference types="node" />
// Run: node --experimental-strip-types scripts/test-protocol.ts
// Byte layouts are asserted against known-good frames; AES is cross-checked with node:crypto.
import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
// @ts-ignore TS5097: Node's type stripping needs the .ts extension
import * as X from '../src/machine/protocol/crypto.ts';
// @ts-ignore TS5097
import * as F from '../src/machine/protocol/figaro.ts';
// @ts-ignore TS5097
import * as G from '../src/machine/protocol/genio.ts';
// @ts-ignore TS5097
import * as M from '../src/machine/protocol/mapping.ts';
// @ts-ignore TS5097
import * as BA from '../src/machine/protocol/barista.ts';
// @ts-ignore TS5097
import { BARISTA_MENU, getBaristaDrink } from '../src/data/baristaMenu.ts';
import type { BrewRequest } from '../src/machine/types';

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const h = (s: string) => new Uint8Array(Buffer.from(s.replace(/\s/g, ''), 'hex'));
const R4 = h('deadbeef');
let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`ok - ${name}`);
};

// Reference AES-ECB: no padding when len == 16, PKCS5/PKCS7 padding otherwise.
const refCipher = (enc: boolean, data: Uint8Array, key: Uint8Array) => {
  const c = (enc ? createCipheriv : createDecipheriv)('aes-128-ecb', key, null);
  c.setAutoPadding(data.length !== 16);
  return new Uint8Array(Buffer.concat([c.update(data), c.final()]));
};

test('AES-128 ECB FIPS-197 vector', () => {
  const key = h('000102030405060708090a0b0c0d0e0f');
  assert.equal(hex(X.aesEcbEncrypt(h('00112233445566778899aabbccddeeff'), key)), '69c4e0d86a7b0430d8cdb78070b4c55a');
  assert.equal(hex(X.aesEcbDecrypt(h('69c4e0d86a7b0430d8cdb78070b4c55a'), key)), '00112233445566778899aabbccddeeff');
});

test('AES matches NoPadding/PKCS5 selection (incl. 0, 5, 16, 20, 32 bytes)', () => {
  for (const len of [0, 5, 15, 16, 17, 20, 32]) {
    const key = new Uint8Array(randomBytes(16));
    const data = new Uint8Array(randomBytes(len));
    const ours = X.aesEcbEncrypt(data, key);
    assert.equal(hex(ours), hex(refCipher(true, data, key)), `encrypt len ${len}`);
    assert.equal(ours.length, len === 16 ? 16 : (Math.floor(len / 16) + 1) * 16);
    // Quirk kept on purpose: a 16-byte ciphertext is always decrypted with NoPadding, so 0..15-byte
    // inputs do NOT round-trip (padding bytes come back). Compare against the reference rule, not against `data`.
    assert.equal(hex(X.aesEcbDecrypt(ours, key)), hex(refCipher(false, ours, key)), `decrypt len ${len}`);
    if (ours.length !== 16) assert.equal(hex(X.aesEcbDecrypt(ours, key)), hex(data), `round-trip len ${len}`);
  }
  // 32-byte ciphertext is decrypted with PKCS5 too (only exactly-16 is NoPadding).
  const key = new Uint8Array(randomBytes(16));
  const ct = refCipher(true, new Uint8Array(20), key);
  assert.equal(hex(X.aesEcbDecrypt(ct, key)), hex(refCipher(false, ct, key)));
});

test('createPairingKey = decrypt(a,k) XOR decrypt(b,k)', () => {
  const k = h('2b7e151628aed2a6abf7158809cf4f3c');
  const p1 = h('00112233445566778899aabbccddeeff');
  const p2 = h('ffeeddccbbaa99887766554433221100');
  const key = X.createPairingKey(X.aesEcbEncrypt(p1, k), X.aesEcbEncrypt(p2, k), k);
  assert.equal(hex(key), 'ff'.repeat(16));
});

test('light pairing response uses createPairingKey(N2, N1, N3) encrypted with N3; stores (N2, N3)', () => {
  const [n1, n2, n3] = [0, 1, 2].map(() => new Uint8Array(randomBytes(16)));
  const { response, credentials } = X.lightPairingResponse(n1, n2, n3);
  const d = (b: Uint8Array) => refCipher(false, b, n3);
  const expected = d(n2).map((v, i) => v ^ d(n1)[i]);
  assert.equal(hex(refCipher(false, response, n3)), hex(expected));
  assert.equal(hex(credentials.machinePassword), hex(n2));
  assert.equal(hex(credentials.key), hex(n3));
});

test('repair response uses createPairingKey(machinePass, T, key) encrypted with key', () => {
  const c = { machinePassword: new Uint8Array(randomBytes(16)), key: new Uint8Array(randomBytes(16)) };
  const t = new Uint8Array(randomBytes(16));
  const d = (b: Uint8Array) => refCipher(false, b, c.key);
  const expected = d(c.machinePassword).map((v, i) => v ^ d(t)[i]);
  assert.equal(hex(refCipher(false, X.repairResponse(t, c), c.key)), hex(expected));
});

test('START_PAIRING is "WE START PAIRING" ASCII', () => {
  assert.equal(Buffer.from(X.START_PAIRING).toString('latin1'), 'WE START PAIRING');
  assert.equal(X.START_PAIRING.length, 16);
});

test('base64 round-trip', () => {
  const b = new Uint8Array(randomBytes(37));
  assert.equal(X.toBase64(b), Buffer.from(b).toString('base64'));
  assert.equal(hex(X.fromBase64(X.toBase64(b))), hex(b));
});

test('UUIDs', () => {
  assert.equal(F.FIGARO.service, '6fd40000-4a62-11e5-885d-feff819cdc9f');
  assert.equal(F.FIGARO.beveragePreparation.service, '6fd40003-4a62-11e5-885d-feff819cdc9f');
  assert.equal(F.FIGARO.beveragePreparation.characteristic, '6fd40013-4a62-11e5-885d-feff819cdc9f');
  assert.equal(F.FIGARO.serial.characteristic, '6fd40008-4a62-11e5-885d-feff819cdc9f');
  assert.equal(F.FIGARO.time.characteristic, '6fd4000a-4a62-11e5-885d-feff819cdc9f');
  assert.equal(G.GENIO.service, '82f21910-f300-4e71-b5f5-714578020395');
  assert.equal(G.GENIO.serial.service, '82f21920-f300-4e71-b5f5-714578020395');
  assert.equal(G.GENIO.serial.characteristic, '82f21928-f300-4e71-b5f5-714578020395');
  assert.equal(G.GENIO.recipeControl.characteristic, '82f21912-f300-4e71-b5f5-714578020395');
});

test('Figaro beverage preparation layout', () => {
  const b = F.beveragePreparation({ level: 4, recipeType: 'hot', temperature: 82, intensity: 0 }, R4);
  assert.equal(hex(b), '0401' + '00000000' + '00' + '52' + 'deadbeef' + '04040404');
  const c = F.beveragePreparation({ level: 8, recipeType: 'cold', temperature: 20, intensity: 255 }, R4);
  assert.equal(hex(c), '0800' + '00000000' + 'ff' + '14' + 'deadbeef' + '04040404');
  assert.equal(F.beveragePreparation({ level: 0, recipeType: 'delicateBrew', temperature: 96, intensity: 0 }, R4)[1], 4);
  assert.equal(F.beveragePreparation({ level: 1, recipeType: 'espressoBoost', temperature: 96, intensity: 0 }, R4)[1], 2);
  assert.equal(F.beveragePreparation({ level: 1, recipeType: 'coldBrew', temperature: 96, intensity: 0 }, R4)[1], 3);
  assert.throws(() => F.beveragePreparation({ level: 1, recipeType: 'hot', temperature: 19, intensity: 0 }, R4));
  assert.throws(() => F.beveragePreparation({ level: 1, recipeType: 'hot', temperature: 97, intensity: 0 }, R4));
  assert.throws(() => F.beveragePreparation({ level: 9, recipeType: 'hot', temperature: 80, intensity: 0 }, R4));
});

test('Figaro HMI button / time / preparation control', () => {
  assert.equal(hex(F.hmiButtonPress(R4)), '0100' + 'deadbeef' + '0a'.repeat(10));
  assert.equal(hex(F.machineTime(0x12345678, R4)), '78563412' + 'deadbeef' + '08'.repeat(8));
  assert.equal(hex(F.preparationControl('resume')), '01');
  assert.equal(hex(F.preparationControl('abort')), '02');
});

test('Figaro machine status decode', () => {
  // errors 0x0880 (heaterOverTemp + heatUpTimeout), alarms 0x1000 (water), state 3 READY,
  // peripherals 0x8003 (paired, capsule holder, clamp), leds on 0x8040, blink 0x0040
  const s = F.parseMachineStatus(h('0880 1000 03 8003 8040 0040'));
  assert.equal(s.state, 'READY');
  assert.equal(s.errors.heaterOverTemperature, true);
  assert.equal(s.errors.heatUpTimeout, true);
  assert.equal(s.errors.communicationError, false);
  assert.equal(s.waterTankEmpty, true);
  assert.equal(s.peripherals.paired, true);
  assert.equal(s.peripherals.capsuleHolderInserted, true);
  assert.equal(s.peripherals.clampHandleClosed, true);
  assert.equal(s.peripherals.descalingRequired, false);
  assert.equal(F.figaroReadiness(s).readiness, 'error');
  const ok = F.parseMachineStatus(h('0000 0000 03 0003 0000 0000'));
  assert.equal(ok.peripherals.paired, false);
  assert.equal(F.figaroReadiness(ok).readiness, 'ready');
  assert.equal(F.figaroReadiness(F.parseMachineStatus(h('0000 1000 03 0003 0000 0000'))).readiness, 'needsWater');
  assert.equal(F.figaroReadiness(F.parseMachineStatus(h('0000 0000 03 0002 0000 0000'))).readiness, 'needsCapsule');
  assert.equal(F.figaroReadiness(F.parseMachineStatus(h('0000 0000 01 0003 0000 0000'))).readiness, 'sleeping');
  assert.equal(F.figaroReadiness(F.parseMachineStatus(h('0000 0000 04 0003 0000 0000'))).readiness, 'brewing');
  assert.equal(F.parseMachineStatus(h('0000 0000 ff 0003 0000 0000')).state, 'UNKNOWN');
});

test('Figaro preparation status decode', () => {
  assert.deepEqual(F.parsePreparationStatus(h('3206 10')), { totalProgress: 50, step: 'EXTRACT_NORMAL_HOT', stepProgress: 16 });
  assert.equal(F.parsePreparationStatus(h('001b00')).step, 'WAIT_FOR_USER_RESPONSE');
  assert.equal(F.parsePreparationStatus(h('000900')).step, 'HEAT_UP_DESCALING');
  assert.equal(F.parsePreparationStatus(h('000800')).step, 'UNKNOWN');
  assert.throws(() => F.parsePreparationStatus(h('0000')));
});

test('Genio recipe / power / level / time layouts', () => {
  assert.equal(hex(G.brewControl('hot', R4)), '00' + 'deadbeef' + '0b'.repeat(11));
  assert.equal(hex(G.brewControl('cold', R4)), '01' + 'deadbeef' + '0b'.repeat(11));
  assert.equal(hex(G.temperatureData(87, R4)), '57' + 'deadbeef' + '0b'.repeat(11));
  assert.equal(hex(G.powerControl(true, R4)), '10' + 'deadbeef' + '0b'.repeat(11));
  assert.equal(hex(G.powerControl(false, R4)), '11' + 'deadbeef' + '0b'.repeat(11));
  assert.equal(hex(G.recipeLevel(8)), '08');
  assert.equal(hex(G.machineTime(0x12345678, R4)), '12345678' + 'deadbeef' + '08'.repeat(8));
  assert.throws(() => G.temperatureData(109, R4));
});

test('Genio status / errors decode', () => {
  assert.deepEqual(G.parseStatus(h('0301')), { state: 'READY', paired: true });
  assert.deepEqual(G.parseStatus(h('0500')), { state: 'RUNNING_RECIPE', paired: false });
  assert.equal(G.parseStatus(h('ff00')).state, 'NOT_DEFINED');
  const e = G.parseErrorsSensors(0b011000);
  assert.equal(e.capsHolderMissing, true);
  assert.equal(e.headOpen, true);
  assert.equal(e.pumpIssue, false);
  assert.equal(G.genioReadiness('READY', e).readiness, 'needsCapsule');
  assert.equal(G.genioReadiness('READY', G.parseErrorsSensors(0b100000)).readiness, 'error');
  assert.equal(G.genioReadiness('NO_FLOW', null).readiness, 'needsWater');
  assert.equal(G.genioReadiness('DESCALING', null).readiness, 'error');
});

test('Genio preheat firmware gate', () => {
  assert.equal(G.isPreheatAvailable(h('070300'), h('0702')), true);
  assert.equal(G.isPreheatAvailable(h('070200'), h('0702')), false);
  assert.equal(G.isPreheatAvailable(h('080000'), h('0701')), false);
  assert.equal(G.isPreheatAvailable(h('080000'), h('0800')), true);
});

const req = (o: Partial<BrewRequest>): BrewRequest => ({ capsuleId: 1, volumeLevel: 4, temperature: 'middle', iced: false, ...o });
const HOT = { iceType: 0, capsuleCount: 1 };

test('mapping: temperature modes and defaults', () => {
  assert.deepEqual(M.toFigaroRecipe(req({ temperature: 'high' }), HOT), { level: 4, recipeType: 'hot', temperature: 87, intensity: 0 });
  assert.equal(M.toFigaroRecipe(req({ temperature: 'middle' }), HOT).temperature, 82);
  assert.equal(M.toFigaroRecipe(req({ temperature: 'low' }), HOT).temperature, 77);
  assert.deepEqual(M.toFigaroRecipe(req({ temperature: 'cold' }), HOT), { level: 4, recipeType: 'cold', temperature: 20, intensity: 0 });
  assert.equal(M.toFigaroRecipe(req({}), HOT, 'espresso').recipeType, 'espressoBoost');
  assert.equal(M.toFigaroRecipe(req({}), HOT, 'handdrip').recipeType, 'delicateBrew');
  assert.deepEqual(M.toGenioRecipe(req({ temperature: 'low', volumeLevel: 7 }), HOT), { level: 7, extraction: 'hot', temperature: 77 });
});

test('mapping: iced two-capsule drinks force cold; single-capsule iced stays hot', () => {
  const capIce = { iceType: 1, capsuleCount: 2 }; // CAPPUCCINO ICE
  const icedCoffee = { iceType: 1, capsuleCount: 1 }; // ICED COFFEE BLEND
  assert.deepEqual(M.toGenioRecipe(req({ temperature: 'high' }), capIce), { level: 4, extraction: 'cold', temperature: 20 });
  assert.equal(M.toFigaroRecipe(req({ temperature: 'high', iced: true }), icedCoffee).recipeType, 'hot');
  assert.throws(() => M.toGenioRecipe(req({ volumeLevel: 9 }), HOT));
});

test('mapping: family from advertised name', () => {
  assert.equal(M.familyFromName('ESPERTA_1234'), 'figaro');
  assert.equal(M.familyFromName('GenioSan-ABCD'), 'genio');
  assert.equal(M.familyFromName('Prodigio'), null);
  assert.equal(M.familyFromName(null), null);
});

test('end-to-end: encrypted Figaro brew write is AES(key, plain) 16 bytes', () => {
  const key = new Uint8Array(randomBytes(16));
  const plain = F.beveragePreparation(M.toFigaroRecipe(req({}), HOT), R4);
  const wire = X.aesEcbEncrypt(plain, key);
  assert.equal(wire.length, 16);
  assert.equal(hex(wire), hex(refCipher(true, plain, key)));
});

// ---------------- Barista ----------------
test('Barista UUIDs and model identification', () => {
  assert.equal(BA.BARISTA_GATT.w.status.characteristic, '6fd40104-4a62-11e5-885d-feff819cdc9f');
  assert.equal(BA.BARISTA_GATT.w.customRecipe!.service, '6fd40102-4a62-11e5-885d-feff819cdc9f');
  assert.equal(BA.BARISTA_GATT.slim.customRecipe!.characteristic, 'c08b010f-6407-4a30-8aab-ccbbae8b7a4a');
  assert.equal(BA.BARISTA_GATT.duo.hmi!.characteristic, '4897d4b7-f755-4b76-b122-e1773e59c88e');
  assert.equal(BA.BARISTA_GATT.duo.serial!.service, '4897d4a0-f755-4b76-b122-e1773e59c88e');
  assert.equal(BA.BARISTA_GATT.legacy.customRecipe!.service, '6fd40002-4a62-11e5-885d-feff819cdc9f');
  assert.equal(BA.baristaModelFromName('NESCAFE S 5'), 'fifty5');
  assert.equal(BA.baristaModelFromName('NESCAFE S'), 'fifty');
  assert.equal(BA.baristaModelFromName('NESCAFE Duo'), 'duo');
  assert.equal(BA.baristaModelFromName('NESCAFE D'), 'simple');
  assert.equal(BA.baristaModelFromName('Tama2'), 'i');
  assert.equal(BA.baristaModelFromServices(['6FD40100-4A62-11E5-885D-FEFF819CDC9F'], 'My machine'), 'w');
  assert.equal(BA.baristaModelFromServices(['c08b0100-6407-4a30-8aab-ccbbae8b7a4a'], null), 'slim');
  assert.equal(BA.baristaModelFromServices(['6fd40000-4a62-11e5-885d-feff819cdc9f', BA.BARISTA_BST_SERVICE], 'kitchen'), 'simple');
  assert.equal(BA.baristaModelFromServices(['6fd40000-4a62-11e5-885d-feff819cdc9f'], 'NESCAFE S'), 'fifty');
  assert.equal(BA.isLegacyOldFirmware('T2_SP03_1.0'), true);
  assert.equal(BA.isLegacyOldFirmware('T2_SP06'), false);
});

test('Barista legacy (i/50/Simple) payloads', () => {
  const hmi = BA.legacyHmi(BA.LEGACY_BUTTON.custom, R4);
  assert.equal(hex(hmi), '0002deadbeef');
  const key = new Uint8Array(randomBytes(16));
  const wire = X.aesEcbEncrypt(hmi, key); // AES/ECB/PKCS5 of 6 bytes
  assert.equal(wire.length, 16);
  assert.equal(hex(wire), hex(refCipher(true, hmi, key)));
  assert.equal(hex(BA.legacyTime(0x12345678, R4)), '12345678deadbeef');
  assert.equal(hex(BA.legacyCustomRecipe(1, 3, 140, 0)), '13' + '8c00' + '0000');
  assert.equal(hex(BA.legacyCustomRecipe(4, 2, 300, 200)), '42' + '2c01' + 'c800');
});

test('Barista W / Slim / Duo payloads', () => {
  assert.equal(hex(BA.wHmi(BA.W_BUTTON.custom, R4)), '0002deadbeef' + '0a'.repeat(10));
  assert.equal(hex(BA.wHmi(BA.W_BUTTON.power, h('ff000102'))), '0001' + '00000102' + '0a'.repeat(10)); // random bytes are taken mod 255
  assert.equal(hex(BA.wTime(0x12345678, R4)), '12345678deadbeef' + '08'.repeat(8));
  assert.equal(hex(BA.dsuCustomRecipe(0, 2, 140, 60)), '02' + '008c' + '003c');
  assert.equal(hex(BA.dsuCustomRecipe(5, 2, 160, -5)), '52' + '00a0' + '0000');
  assert.equal(hex(BA.slimHmi(BA.SLIM_BUTTON.custom)), '0002');
  assert.equal(hex(BA.slimHmi(BA.SLIM_BUTTON.power)), '0001');
  assert.equal(hex(BA.slimHmi(BA.SLIM_BUTTON.hotWater)), '0100');
  assert.equal(hex(BA.slimTime(0x12345678)), '12345678');
  assert.equal(hex(BA.duoCommand(BA.DUO_COMMAND.espresso, R4)), '02deadbeef' + '0b'.repeat(11));
  assert.equal(hex(BA.duoTime(0x12345678, R4)), '78563412deadbeef' + '08'.repeat(8));
  // Fresh light-pairing verification write with empty credentials: AES_0(0).
  assert.equal(hex(X.aesEcbEncrypt(new Uint8Array(16), new Uint8Array(16))), '66e94bd4ef8a2c3b884cfa59ca342b2e');
});

test('Barista status decode', () => {
  // legacy LE: errors 0, alarms bit4 (no water), state 3, peripherals bit7 (paired)
  const l = BA.parseLegacyStatus('i', h('0000 1000 03 8000'));
  assert.deepEqual([l.state, l.paired, l.status.readiness], ['READY', true, 'needsWater']);
  assert.equal(BA.parseLegacyStatus('simple', h('0000 0000 0c 0000')).state, 'EXTRACT');
  assert.equal(BA.parseLegacyStatus('simple', h('0000 8000 03 0000')).status.coffee, 'empty');
  assert.equal(BA.parseLegacyStatus('i', h('0100 0000 03 0000')).status.readiness, 'error');
  // W/Slim: errorCode u32 LE bit2 lowCoffee, state 3 ready, paired
  const d = BA.parseDsuStatus(h('04000000 03 8000 0000 0000'));
  assert.deepEqual([d.state, d.paired, d.status.readiness, d.status.coffee], ['READY', true, 'ready', 'low']);
  assert.equal(BA.parseDsuStatus(h('10000000 03 0000 0000 0000')).status.readiness, 'needsCapsule'); // coffee empty
  assert.equal(BA.parseDsuStatus(h('08000000 01 0000 0000 0000')).status.readiness, 'needsWater');
  assert.equal(BA.parseDsuStatus(h('00080000 03 0000 0000 0000')).status.readiness, 'error'); // NTC broken
  // Duo: 21 bytes, paired flag byte1 bit0, status 6 ready, alarms bit3 no water
  const duo = h('00 01 32 ff 06 0000 0000 0800 0000 0000 0000 0000 0000');
  assert.equal(duo.length, 21);
  const ds = BA.parseDuoStatus(duo);
  assert.deepEqual([ds.state, ds.paired, ds.status.readiness], ['READY', true, 'needsWater']);
  assert.equal(BA.parseDuoStatus(h('00 01 34 ff 07 0000 0000 0000 0000 0000 0000 0000 0000')).state, 'RECIPE_RUNNING');
  assert.deepEqual(BA.parseDuoRecipeStatus(h('01 3200 7800 02 00')), { state: 'IN_PROGRESS', progression: 50, dispensedMl: 120, step: 2 });
});

test('Barista drink planning (menu defaults)', () => {
  const capp = getBaristaDrink('cappuccino')!;
  const slim = BA.planBaristaBrew('slim', capp);
  assert.equal(slim.kind, 'custom');
  if (slim.kind === 'custom') {
    assert.equal(hex(slim.recipe), '33' + '0078' + '003c'); // led 3, 3 scoops, 120 ml, jet 60 ml
    assert.equal(slim.button, 0x0200);
  }
  const w = BA.planBaristaBrew('w', capp, { strength: 4, waterMl: 999, milkMl: 10 });
  if (w.kind === 'custom') {
    assert.equal(hex(w.recipe), '01' + '012c' + '001e'); // first 300 ml pour, 1 of 4 total scoops
    assert.deepEqual(w.pours?.map((p) => p[0] & 15), [1, 1, 1, 1]);
  }
  const fifty = BA.planBaristaBrew('fifty', getBaristaDrink('lungo')!);
  if (fifty.kind === 'custom') assert.equal(hex(fifty.recipe), '02' + '8c00' + '0000'); // Barista 50 lungo led 0
  const iLatte = BA.planBaristaBrew('i', getBaristaDrink('latte')!);
  if (iLatte.kind === 'custom') assert.equal(hex(iLatte.recipe), '42' + '8200' + '1e00');
  const simple = BA.planBaristaBrew('simple', getBaristaDrink('latte')!);
  if (simple.kind === 'custom') {
    assert.equal(hex(simple.recipe), '01' + '8200' + '1e00'); // 1 scoop forced
    assert.equal(simple.button, 4);
  }
  assert.deepEqual(BA.planBaristaBrew('duo', getBaristaDrink('espresso')!), { kind: 'command', command: 2 });
  assert.throws(() => BA.planBaristaBrew('duo', getBaristaDrink('iced')!));
  assert.deepEqual(BA.planBaristaBrew('w', getBaristaDrink('hotWater')!), { kind: 'command', command: BA.W_BUTTON.rinse });
  const carafe = BA.planBaristaBrew('w', getBaristaDrink('espresso')!, { strength: 5, waterMl: 1000 });
  if (carafe.kind === 'custom') assert.deepEqual(carafe.pours?.map((p) => p[0] & 15), [2, 1, 1, 1]);
  assert.throws(() => BA.planBaristaBrew('simple', getBaristaDrink('xlungo')!));
  const hw = BA.planBaristaBrew('slim', getBaristaDrink('hotWater')!);
  if (hw.kind === 'custom') assert.equal(hw.recipe[0], 0x50); // Slim water-only recipe uses zero coffee turns.
  assert.equal(BARISTA_MENU.length, 7);
});

test('Barista W hot water: rinse cycles, timed last pour', () => {
  const cal = { rinseMl: 100, rinseMs: 10_000, stop: 'rinse' as const };
  assert.deepEqual(BA.planHotWater(250, cal), {
    pours: [{ ml: 100, stopAfterMs: null }, { ml: 100, stopAfterMs: null }, { ml: 50, stopAfterMs: 5000 }],
    totalMl: 250,
  });
  assert.deepEqual(BA.planHotWater(205, cal).pours.length, 2); // remainder below the minimum is dropped
  assert.deepEqual(BA.planHotWater(5, cal), { pours: [{ ml: 15, stopAfterMs: 1500 }], totalMl: 15 });
  assert.deepEqual(BA.planHotWater(195, cal).pours.at(-1), { ml: 100, stopAfterMs: null }); // 95% of a rinse: run it fully
  const noStop = { ...cal, stop: 'none' as const };
  assert.equal(BA.planHotWater(240, noStop).totalMl, 200);
  assert.equal(BA.planHotWater(260, noStop).totalMl, 300);
  assert.equal(BA.planHotWater(20, noStop).totalMl, 100); // always at least one rinse
});

console.log(`\n${n} tests passed`);
