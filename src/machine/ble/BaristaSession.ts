// Barista (Nescafé Gold Blend) session logic on top of the generic GATT helpers in BleTransport.
// Wire formats: src/machine/protocol/barista.ts.
import type {
  BaristaModel,
  BrewProgress,
  BrewRequest,
  HotWaterCalibration,
  MachineStatus,
  PairingPrompt,
  RinseStopMethod,
  RinseTestResult,
} from '../types';
import { aesEcbEncrypt, lightPairingResponse, repairResponse, START_PAIRING, type PairingCredentials } from '../protocol/crypto';
import * as B from '../protocol/barista';
import { getBaristaDrink } from '../../data/baristaMenu';
import { deleteCreds, loadCreds, queue, rnd4, saveCreds, sleep, type Char } from './util';

export interface BaristaIo {
  machineId: string;
  read(c: Char): Promise<Uint8Array>;
  write(c: Char, b: Uint8Array): Promise<void>;
  monitor(c: Char, cb: (b: Uint8Array) => void): void;
  alive(): boolean;
  cancelled(): boolean;
}

const ZERO16 = new Uint8Array(16);
const POLL_MS = 1000;
// Pairing notification timeouts (W/Slim/Duo 10 s each, legacy 11 s). Tune on hardware.
const DSU_WAIT_MS = 10_000;
const LEGACY_PAIR_MS = 11_000;

// The lit button is Espresso or Black coffee depending on the model.
const PRESS = 'When a button on the Barista lights up green, press it within about 5 seconds.';
const OFF = 'Switch the Barista OFF with its power button (do not unplug it).';

export function createBaristaSession(io: BaristaIo, model: BaristaModel) {
  const gen = B.baristaGen(model);
  const g = B.BARISTA_GATT[gen];
  const serial = queue();
  let key: Uint8Array | null = null;
  let authed = false;
  let token: Uint8Array | null = null; // legacy N1 (connect-time challenge)
  let led = -1; // legacy HMI LEDs u16 @7 from status notifications
  let brewStarted = false;
  let hotWaterStop: RinseStopMethod | null = null; // set while a W hot-water run is pouring
  // Duo: general status is matched by the 4897D4B1 read; W/Duo light pairing re-reads status after this delay.
  const checkDelay = gen === 'w' ? 500 : 100; // W needs longer before the paired bit updates

  const enc = (plain: Uint8Array) => {
    if (!key) throw new Error('Barista is not paired.');
    return aesEcbEncrypt(plain, key);
  };

  const snapshot = async () => B.parseBaristaStatus(model, await io.read(g.status));

  async function waitFor(pred: (x: B.BaristaSnapshot) => boolean, ms: number, msg: string, brewing = false) {
    const end = Date.now() + ms;
    for (;;) {
      if (!io.alive()) throw new Error('Machine disconnected (connection lost).');
      if (brewing && io.cancelled()) throw new Error('Brew cancelled');
      const x = await snapshot();
      if (pred(x)) return x;
      if (Date.now() > end) throw new Error(msg);
      await sleep(POLL_MS);
    }
  }

  async function protectedReadOk() {
    if (!g.protectedRead) return false;
    return io.read(g.protectedRead).then(
      () => true,
      () => false,
    );
  }

  async function setTime() {
    if (!g.time) return;
    const now = Math.floor(Date.now() / 1000);
    const b =
      gen === 'legacy' ? enc(B.legacyTime(now, rnd4())) : gen === 'w' ? enc(B.wTime(now, rnd4())) : gen === 'duo' ? enc(B.duoTime(now, rnd4())) : B.slimTime(now);
    await io.write(g.time, b).catch(() => {}); // non-fatal, as for Dolce
  }

  async function press(button: number) {
    if (gen === 'legacy') await io.write(g.hmi!, enc(B.legacyHmi(button, rnd4()))); // PKCS5 6 -> 16 bytes
    else if (gen === 'w') await io.write(g.hmi!, enc(B.wHmi(button, rnd4())));
    else if (gen === 'slim') await io.write(g.hmi!, B.slimHmi(button));
    else await io.write(g.hmi!, enc(B.duoCommand(button, rnd4())));
  }

  const POWER = { legacy: B.LEGACY_BUTTON.power, w: B.W_BUTTON.power, slim: B.SLIM_BUTTON.power, duo: B.DUO_COMMAND.power }[gen];

  // Wake + wait until the machine can start a drink. waterOnly skips the coffee-powder checks.
  async function ensureReady(onProgress: (p: BrewProgress) => void, waterOnly = false) {
    const canBrew = B.baristaCanBrew(model);
    let x = await snapshot();
    if (x.state === 'SLEEP') {
      onProgress({ phase: 'heating', progress: 0, message: 'Waking the machine…' });
      await press(POWER); // wake = power button on every generation
    }
    if (!canBrew.includes(x.state) && x.status.readiness !== 'error') {
      onProgress({ phase: 'heating', progress: 0, message: 'Heating up…' });
      x = await waitFor((y) => canBrew.includes(y.state) || y.status.readiness === 'error', 120_000, 'Machine did not become ready (timed out).', true);
    }
    const blocked = x.status.readiness === 'error' || x.status.readiness === 'needsWater' || (!waterOnly && x.status.readiness === 'needsCapsule');
    if (blocked)
      throw new Error(x.status.detail ?? (x.status.readiness === 'needsWater' ? 'Fill the water tank.' : `Machine not ready (${x.state}).`));
    if (!canBrew.includes(x.state)) throw new Error(`Machine not ready (${x.state}).`);
    return x;
  }

  // Barista W: one rinse cycle. Polls fast so the timed stop lands close to stopAfterMs after EXTRACT begins.
  // stop: which press to send at stopAfterMs; 'detect' tries rinse, then power, and reports what worked.
  const FAST_POLL_MS = 200;
  const STOP_CONFIRM_MS = 3000;
  async function runRinse(
    stopAfterMs: number | null,
    stop: B.RinseStopPlan,
    onTick: (elapsedMs: number, started: boolean) => void,
  ): Promise<{ extractMs: number; stop?: 'rinse' | 'power' | 'none'; linkDropped: boolean }> {
    await press(B.W_BUTTON.rinse);
    const t0 = Date.now();
    let started = 0;
    let stopSent = false;
    let stoppedBy: 'rinse' | 'power' | 'none' | undefined;
    for (;;) {
      if (io.cancelled()) throw new Error('Brew cancelled');
      let x: B.BaristaSnapshot;
      try {
        if (!io.alive()) throw new Error('link');
        x = await snapshot();
      } catch (e) {
        // The machine may drop BLE when a drink ends (disconnected after running = finished).
        if (started && !io.alive()) return { extractMs: Date.now() - started, stop: stoppedBy, linkDropped: true };
        throw e;
      }
      const now = Date.now();
      if (!started && B.BARISTA_BREW_ACTIVE.includes(x.state)) {
        started = now;
        brewStarted = true; // a link drop from here on means the rinse finished, not a cancel
      }
      if (started && B.BARISTA_BREW_END.includes(x.state)) {
        if (x.status.readiness === 'error') throw new Error(x.status.detail ?? 'Machine reported an error.');
        return { extractMs: now - started, stop: stoppedBy ?? (stopSent ? 'none' : undefined), linkDropped: false };
      }
      if (!started && now - t0 > 30_000) throw new Error('The Barista did not start the rinse (timed out).');
      if (now - t0 > 180_000) throw new Error('Rinse timed out.');
      if (started && stopAfterMs != null && !stopSent && now - started >= stopAfterMs) {
        stopSent = true;
        const methods: ('rinse' | 'power')[] = stop === 'detect' ? ['rinse', 'power'] : stop === 'none' ? [] : [stop];
        for (const m of methods) {
          await press(m === 'rinse' ? B.W_BUTTON.rinse : POWER);
          const ended = await waitFor((y) => !B.BARISTA_BREW_ACTIVE.includes(y.state), STOP_CONFIRM_MS, 'still running').then(
            () => true,
            () => !io.alive(),
          );
          if (ended) {
            stoppedBy = m;
            return { extractMs: Date.now() - started, stop: m, linkDropped: !io.alive() };
          }
        }
        stoppedBy = 'none';
      }
      onTick(started ? now - started : 0, started > 0);
      await sleep(FAST_POLL_MS);
    }
  }

  // Barista W hot water: full rinses, last one stopped on a timer (B.planHotWater).
  async function brewHotWaterW(req: BrewRequest, onProgress: (p: BrewProgress) => void) {
    const cal = req.baristaOptions?.hotWater;
    if (!cal) throw new Error('Set up hot water first (Settings → Hot water).');
    const { pours, totalMl } = B.planHotWater(req.baristaOptions?.waterMl ?? cal.rinseMl, cal);
    brewStarted = false;
    hotWaterStop = cal.stop;
    try {
      await pourHotWater(pours, totalMl, cal, onProgress);
    } finally {
      hotWaterStop = null;
    }
  }

  async function pourHotWater(pours: B.HotWaterPour[], totalMl: number, cal: HotWaterCalibration, onProgress: (p: BrewProgress) => void) {
    onProgress({ phase: 'sending', progress: 0 });
    await ensureReady(onProgress, true);
    let pouredMl = 0;
    for (let i = 0; i < pours.length; i += 1) {
      const pour = pours[i];
      if (i > 0) {
        onProgress({ phase: 'brewing', progress: pouredMl / totalMl, message: `Pour ${i + 1} of ${pours.length}…` });
        await waitFor((y) => B.baristaCanBrew(model).includes(y.state) || y.status.readiness === 'error', 60_000, 'Machine was not ready for the next pour.', true).catch((e) => {
          throw io.alive() ? e : new Error(`Poured about ${pouredMl} ml, then the Barista disconnected. Reconnect to pour the rest.`);
        });
      }
      const r = await runRinse(pour.stopAfterMs, pour.stopAfterMs == null ? 'none' : cal.stop, (ms, started) => {
        const expected = pour.stopAfterMs ?? cal.rinseMs;
        const share = started ? Math.min(1, ms / Math.max(1, expected)) : 0;
        onProgress({
          phase: started ? 'brewing' : 'heating',
          progress: Math.min(0.97, (pouredMl + share * pour.ml) / totalMl),
          message: pours.length > 1 ? `Pour ${i + 1} of ${pours.length}` : undefined,
        });
      });
      pouredMl += pour.ml;
      if (r.linkDropped && i < pours.length - 1)
        throw new Error(`Poured about ${pouredMl} ml, then the Barista disconnected. Reconnect to pour the rest.`);
      // A power-press stop leaves the machine off; nothing follows the last pour, so that's fine.
    }
    onProgress({ phase: 'done', progress: 1 });
  }

  return {
    get authed() {
      return authed;
    },
    get brewStarted() {
      return brewStarted;
    },

    // Connect-time setup + session authentication with stored credentials.
    async init() {
      if (g.serial) io.monitor(g.serial, (b) => b.length === 16 && serial.push(b));
      if (gen === 'legacy') io.monitor(g.status, (b) => b.length >= 9 && (led = b[7] | (b[8] << 8)));
      await sleep(300); // let CCCD writes land

      if (gen === 'slim') {
        // OS bond; the paired bit is the credential.
        authed = (await snapshot()).paired;
        if (authed) await setTime();
        return;
      }
      const creds = await loadCreds(io.machineId);
      if (gen === 'legacy') {
        // Runs on every connect, with zero creds if none stored.
        serial.clear();
        if (await protectedReadOk()) {
          authed = creds != null; // counters readable = machine already paired this session
          key = creds?.key ?? null;
        } else {
          token = await serial.next(DSU_WAIT_MS, 'Barista did not send a pairing challenge (timed out).').catch((e) => {
            if (creds) throw e;
            return null; // never paired: pair() will report it
          });
          if (!token) return;
          await io.write(g.serial!, repairResponse(token, creds ?? { machinePassword: ZERO16, key: ZERO16 }));
          await sleep(100);
          const paired = (await snapshot()).paired;
          if (paired && creds) {
            key = creds.key;
            authed = true;
          } else if (creds) await deleteCreds(io.machineId);
        }
      } else if (creds) {
        // Reconnect with stored credentials.
        serial.clear();
        await protectedReadOk();
        const t = await serial.next(DSU_WAIT_MS, 'Barista did not send a pairing challenge (timed out).');
        await io.write(g.serial!, repairResponse(t, creds));
        await sleep(checkDelay);
        if ((await snapshot()).paired) {
          key = creds.key;
          authed = true;
        } else await deleteCreds(io.machineId); // rejected: forget the stored pairing
      }
      if (authed) await setTime();
    },

    async pair(onPrompt: (p: PairingPrompt) => void) {
      if (authed) return;
      let x = await snapshot();
      if (x.state !== 'SLEEP') {
        onPrompt({ message: OFF });
        // Legacy machines refuse to pair unless asleep; newer ones pair either way.
        x = await waitFor((y) => y.state === 'SLEEP', 60_000, 'Timed out waiting for the Barista to be switched off.').catch((e) => {
          if (gen === 'legacy') throw e;
          return x;
        });
      }
      onPrompt({ message: 'Starting pairing…' });

      if (gen === 'slim') {
        // OS bonding: ble-plx has no createBond, so touch characteristics until the OS bonds; poll the paired bit 30 s.
        onPrompt({ message: PRESS });
        const end = Date.now() + 30_000;
        while (Date.now() < end) {
          await io.read(B.SLIM_COUNTERS).catch(() => {});
          if ((await snapshot()).paired) {
            authed = true;
            await setTime();
            return;
          }
          await sleep(POLL_MS);
        }
        throw new Error('Pairing failed: the Barista did not confirm (button not pressed?).');
      }

      let n1: Uint8Array;
      if (gen === 'legacy') {
        if (!token) throw new Error('Pairing failed: no challenge from the Barista. Reconnect and try again.');
        n1 = token;
        serial.clear();
        await io.write(g.serial!, START_PAIRING);
      } else {
        serial.clear();
        await protectedReadOk();
        n1 = await serial.next(DSU_WAIT_MS, 'Barista did not send a pairing challenge (timed out).');
        await io.write(g.serial!, aesEcbEncrypt(ZERO16, ZERO16)); // empty credentials = AES_0(0)
        await sleep(checkDelay);
        await io.write(g.serial!, START_PAIRING);
      }
      const deadline = Date.now() + (gen === 'legacy' ? LEGACY_PAIR_MS : 2 * DSU_WAIT_MS);
      const n2 = await serial.next(gen === 'legacy' ? LEGACY_PAIR_MS : DSU_WAIT_MS, 'Pairing timed out: no response from the Barista.');
      onPrompt({ message: PRESS });
      let n3: Uint8Array;
      if (gen === 'legacy') {
        // LED register 4 (lit) then 0 (pressed), then READ the serial char.
        led = -1;
        let lit = false;
        while (Date.now() < deadline) {
          if (led === 4) lit = true;
          if (lit && led === 0) break;
          await sleep(50);
        }
        if (!(lit && led === 0)) throw new Error('Pairing timed out: the lit button was not pressed.');
        n3 = await io.read(g.serial!);
      } else {
        n3 = await serial.next(DSU_WAIT_MS, 'Pairing timed out: the lit button was not pressed.');
      }
      const { response, credentials } = lightPairingResponse(n1, n2, n3);
      await io.write(g.serial!, response);
      await sleep(gen === 'legacy' ? 150 : checkDelay);
      if (!(await snapshot()).paired) throw new Error('Pairing failed: the Barista rejected the pairing key.');
      await saveCreds(io.machineId, credentials as PairingCredentials);
      key = credentials.key;
      authed = true;
      await setTime();
    },

    async status(): Promise<MachineStatus> {
      return (await snapshot()).status;
    },

    async brew(req: BrewRequest, onProgress: (p: BrewProgress) => void) {
      if (!authed) throw new Error('Barista is not paired.');
      const drink = getBaristaDrink(req.baristaDrinkId);
      if (!drink) throw new Error('Choose a Barista drink.');
      if (gen === 'w' && drink.id === 'hotWater') return brewHotWaterW(req, onProgress);
      const plan = B.planBaristaBrew(model, drink, req.baristaOptions);
      const canBrew = B.baristaCanBrew(model);
      brewStarted = false;

      onProgress({ phase: 'sending', progress: 0 });
      let x = await ensureReady(onProgress);

      const { waterMl, milkMl } = B.resolveBaristaOptions(drink, req.baristaOptions);
      const pours = plan.kind === 'custom' ? plan.pours ?? [plan.recipe] : [];
      const pourCount = Math.max(1, pours.length);
      for (let pourIndex = 0; pourIndex < pourCount; pourIndex += 1) {
        if (pourIndex > 0) {
          x = await waitFor((y) => canBrew.includes(y.state) || y.status.readiness === 'error', 120_000, 'Machine did not become ready for the next pour.', true);
          if (x.status.readiness === 'error' || !canBrew.includes(x.state))
            throw new Error(x.status.detail ?? 'Machine was not ready for the next pour.');
        }
        if (plan.kind === 'custom') {
          await io.write(g.customRecipe!, pours[pourIndex]);
          await press(plan.button);
        } else await press(plan.command);

        const t0 = Date.now();
        const pourMl = pours.length > 1 ? Math.min(300, waterMl - pourIndex * 300) : waterMl;
        const expectedMs = 15_000 + ((pourMl + milkMl) / 8) * 1000; // ~8 ml/s guess; calibrate on hardware
        brewStarted = false;
        for (;;) {
          if (io.cancelled()) throw new Error('Brew cancelled');
          // The machine drops the BLE link when a brew ends.
          if (!io.alive()) {
          if (brewStarted && pourIndex === pourCount - 1) break;
            throw new Error('Machine disconnected before all pours completed.');
          }
          try {
            x = await snapshot();
          } catch (e) {
            if (!io.alive() && brewStarted && pourIndex === pourCount - 1) break;
            throw e;
          }
          if (B.BARISTA_BREW_ACTIVE.includes(x.state)) brewStarted = true;
          if (brewStarted && B.BARISTA_BREW_END.includes(x.state)) {
            if (x.status.readiness === 'error') throw new Error(x.status.detail ?? 'Machine reported an error.');
            break;
          }
          if (!brewStarted && Date.now() - t0 > 60_000) throw new Error('Machine did not start brewing (timed out).');
          if (Date.now() - t0 > 300_000) throw new Error('Brew timed out.');
          onProgress({
            phase: brewStarted ? 'brewing' : 'heating',
            progress: Math.min(0.95, (pourIndex + Math.min(1, (Date.now() - t0) / expectedMs)) / pourCount),
            message: x.status.readiness === 'needsWater' ? 'Water tank empty — refill it.' : x.status.detail,
          });
          await sleep(POLL_MS);
        }
      }
      onProgress({ phase: 'done', progress: 1 });
    },

    async rinseTest(stopAfterMs: number | null, onProgress: (p: BrewProgress) => void): Promise<RinseTestResult> {
      if (!authed) throw new Error('Barista is not paired.');
      if (gen !== 'w') throw new Error('Hot water setup is only needed on Barista W.');
      brewStarted = false;
      onProgress({ phase: 'sending', progress: 0 });
      await ensureReady(onProgress, true);
      const r = await runRinse(stopAfterMs, stopAfterMs == null ? 'none' : 'detect', (ms, started) =>
        onProgress({ phase: started ? 'brewing' : 'heating', progress: started ? Math.min(0.95, ms / 20_000) : 0, message: 'Rinsing…' }),
      );
      onProgress({ phase: 'done', progress: 1 });
      return { extractMs: r.extractMs, ...(stopAfterMs != null ? { stop: r.stop ?? 'none' } : {}) };
    },

    async abort() {
      // W hot water: the caller's cancel flag stops further rinses; also end the current one if the machine allows it.
      if (gen === 'w' && hotWaterStop) {
        if (hotWaterStop !== 'none' && B.BARISTA_BREW_ACTIVE.includes((await snapshot()).state))
          await press(hotWaterStop === 'rinse' ? B.W_BUTTON.rinse : POWER);
        return;
      }
      // Only the Duo has a stop command (DUO_COMMAND.stop = 8).
      if (gen !== 'duo') throw new Error('This Barista cannot stop a drink over Bluetooth; press the button on the machine.');
      await press(B.DUO_COMMAND.stop);
    },
  };
}

export type BaristaSession = ReturnType<typeof createBaristaSession>;
