// Real BLE transport (react-native-ble-plx). Only required when the native module exists (see ../index.ts).
import { BleError, BleErrorCode, BleManager, State, type Characteristic, type Device, type Subscription } from 'react-native-ble-plx';
import { PermissionsAndroid, Platform } from 'react-native';
import { deleteCreds, friendly, loadCreds, queue, rnd4, saveCreds, sleep, type Char } from './util';
import { getCapsule } from '../../data/capsules';
import type {
  BrewProgress,
  BrewRequest,
  ConnectionState,
  DiscoveredMachine,
  MachineFamily,
  MachineStatus,
  MachineTransport,
  PairingPrompt,
} from '../types';
import {
  aesEcbEncrypt,
  fromBase64,
  lightPairingResponse,
  repairResponse,
  START_PAIRING,
  toBase64,
  type PairingCredentials,
} from '../protocol/crypto';
import * as F from '../protocol/figaro';
import * as G from '../protocol/genio';
import { familyFromName, toFigaroRecipe, toGenioRecipe } from '../protocol/mapping';
import * as BA from '../protocol/barista';
import { createBaristaSession, type BaristaSession } from './BaristaSession';

interface Snapshot {
  state: string;
  paired: boolean;
  status: MachineStatus;
}

interface Session {
  machine: DiscoveredMachine;
  device: Device;
  chars: Map<string, Characteristic>;
  key: Uint8Array | null; // AES session key (= stored credentials.key) once authenticated
  subs: Subscription[];
  serial: ReturnType<typeof queue>;
  prep: F.FigaroPreparationStatus | null;
  barista: BaristaSession | null; // set for family 'barista' (separate protocol, see BaristaSession.ts)
}

const LIGHT_PAIRING_TIMEOUT_MS = 20_000; // time allowed for each pairing step (button press)
const CHALLENGE_TIMEOUT_MS = 10_000; // chosen empirically; tune on a real machine
const POLL_MS = 1000; // Note: status is polled at 1 Hz; switch to notify on the status char if battery matters

const PROMPTS: Record<Exclude<MachineFamily, 'barista'>, { off: string; press: string }> = {
  figaro: {
    off: 'Hold the power / mode button for 1 second to switch the machine off (the scale goes dark).',
    press: "The three lamps at the top of the scale are blinking. While they blink, tap the machine's blue brew button.",
  },
  genio: {
    off: 'Switch the machine off (the power button light goes out).',
    press: "The whole scale is blinking green. While it blinks, tap the machine's red brew button.",
  },
};

export function createBleTransport(): MachineTransport {
  let mgr: BleManager | null = null;
  const manager = () => (mgr ??= new BleManager());
  let session: Session | null = null;
  let state: ConnectionState = 'idle';
  let brewCancelled = false;
  const listeners = new Set<(s: ConnectionState) => void>();
  const setState = (s: ConnectionState) => {
    if (s === state) return;
    state = s;
    listeners.forEach((l) => l(s));
  };

  async function ensureBluetooth() {
    if (Platform.OS === 'android') {
      const P = PermissionsAndroid.PERMISSIONS;
      const wanted =
        Number(Platform.Version) >= 31 ? [P.BLUETOOTH_SCAN, P.BLUETOOTH_CONNECT] : [P.ACCESS_FINE_LOCATION];
      const res = await PermissionsAndroid.requestMultiple(wanted);
      if (wanted.some((p) => res[p] !== PermissionsAndroid.RESULTS.GRANTED))
        throw new Error('Bluetooth permission denied. Allow Nearby devices / Location access in Settings.');
    }
    const m = manager();
    let s = await m.state();
    if (s === State.Unknown || s === State.Resetting) {
      s = await new Promise<State>((resolve) => {
        const t = setTimeout(() => {
          sub.remove();
          resolve(s);
        }, 3000);
        const sub = m.onStateChange((n) => {
          if (n === State.Unknown || n === State.Resetting) return;
          clearTimeout(t);
          sub.remove();
          resolve(n);
        }, true);
      });
    }
    if (s === State.PoweredOn) return;
    if (s === State.PoweredOff) throw new Error('Bluetooth is powered off. Turn it on and try again.');
    if (s === State.Unauthorized) throw new Error('Bluetooth permission denied. Allow Bluetooth access in Settings.');
    if (s === State.Unsupported) throw new Error('This device does not support Bluetooth Low Energy.');
    throw new Error(`Bluetooth is not ready (${s}). Try again in a moment.`);
  }

  // ---- GATT helpers -------------------------------------------------------------------------------------------
  const C = (s: Session) => (s.machine.family === 'figaro' ? F.FIGARO : G.GENIO);

  async function read(s: Session, c: Char): Promise<Uint8Array> {
    const ch = await manager().readCharacteristicForDevice(s.device.id, c.service, c.characteristic);
    return fromBase64(ch.value ?? '');
  }

  // Write "with response" by default; fall back to without-response only if the characteristic
  // doesn't support it.
  async function write(s: Session, c: Char, bytes: Uint8Array) {
    const props = s.chars.get(c.characteristic);
    const m = manager();
    const v = toBase64(bytes);
    if (props && !props.isWritableWithResponse && props.isWritableWithoutResponse)
      await m.writeCharacteristicWithoutResponseForDevice(s.device.id, c.service, c.characteristic, v);
    else await m.writeCharacteristicWithResponseForDevice(s.device.id, c.service, c.characteristic, v);
  }

  function encrypt(s: Session, plain: Uint8Array) {
    if (!s.key) throw new Error('Machine is not paired.');
    return aesEcbEncrypt(plain, s.key);
  }

  // Reading the protected char must fail while unpaired.
  async function expectProtectedReadFails(s: Session) {
    const c = s.machine.family === 'figaro' ? F.FIGARO.protectedCounter : G.GENIO.hmiVersion;
    try {
      await read(s, c);
    } catch (e) {
      if (e instanceof BleError && e.errorCode === BleErrorCode.DeviceDisconnected) throw friendly(e);
      return;
    }
    throw new Error('Pairing aborted: protected variable should error when not paired.');
  }

  async function snapshot(s: Session): Promise<Snapshot> {
    if (s.machine.family === 'figaro') {
      const st = F.parseMachineStatus(await read(s, F.FIGARO.status));
      return { state: st.state, paired: st.peripherals.paired, status: F.figaroReadiness(st) };
    }
    const st = G.parseStatus(await read(s, G.GENIO.status));
    // Error sensors may not be readable before pairing; tolerate failure.
    const errs = await read(s, G.GENIO.errorsSensors).then(
      (b) => (b.length ? G.parseErrorsSensors(b[0]) : null),
      () => null,
    );
    return { state: st.state, paired: st.paired, status: G.genioReadiness(st.state, errs) };
  }

  async function waitFor(s: Session, pred: (x: Snapshot) => boolean, ms: number, timeoutMessage: string, brewing = false) {
    const end = Date.now() + ms;
    for (;;) {
      if (session !== s) throw new Error('Machine disconnected (connection lost).');
      if (brewing && brewCancelled) throw new Error('Brew cancelled');
      const x = await snapshot(s);
      if (pred(x)) return x;
      if (Date.now() > end) throw new Error(timeoutMessage);
      await sleep(POLL_MS);
    }
  }

  // Post-auth setup: set the machine clock, subscribe to preparation status (Figaro).
  async function afterAuth(s: Session) {
    const now = Math.floor(Date.now() / 1000);
    const fam = s.machine.family;
    await write(s, C(s).time, encrypt(s, fam === 'figaro' ? F.machineTime(now, rnd4()) : G.machineTime(now, rnd4()))).catch(
      () => {}, // ignore failure here; a bad key surfaces on brew anyway
    );
    if (fam === 'figaro') {
      s.subs.push(
        manager().monitorCharacteristicForDevice(
          s.device.id,
          F.FIGARO.preparationStatus.service,
          F.FIGARO.preparationStatus.characteristic,
          (_e, c) => {
            const b = c?.value ? fromBase64(c.value) : null;
            if (b?.length === 3) s.prep = F.parsePreparationStatus(b);
          },
        ),
      );
    }
  }

  // Re-pair with stored credentials when the machine is not yet paired for this connection.
  async function authenticate(s: Session, creds: PairingCredentials) {
    if (!(await snapshot(s)).paired) {
      s.serial.clear();
      await expectProtectedReadFails(s);
      const token = await s.serial.next(CHALLENGE_TIMEOUT_MS, 'Machine did not send a pairing challenge (timed out).');
      await write(s, C(s).serial, repairResponse(token, creds));
      if (!(await snapshot(s)).paired) {
        // Machine rejected the stored key (e.g. it was paired to another phone). Forget it so pair() runs again.
        await deleteCreds(s.machine.id);
        return;
      }
    }
    s.key = creds.key;
    await afterAuth(s);
  }

  function teardown(s: Session) {
    s.subs.forEach((x) => x.remove());
    s.subs = [];
  }

  // Barista: pick the generation from the discovered GATT services, then hand off to BaristaSession.
  async function connectBarista(machine: DiscoveredMachine, device: Device, chars: Map<string, Characteristic>) {
    const m = manager();
    const services = (await device.services()).map((x) => x.uuid.toLowerCase());
    const model = BA.baristaModelFromServices(services, machine.name) ?? machine.baristaModel;
    if (!model) throw new Error('This device does not look like a supported Barista machine.');
    const gen = BA.baristaGen(model);
    if (!chars.has(BA.BARISTA_GATT[gen].status.characteristic))
      throw new Error('This device does not look like a supported Barista machine.');
    const s: Session = { machine: { ...machine, baristaModel: model }, device, chars, key: null, subs: [], serial: queue(), prep: null, barista: null };
    session = s;
    brewCancelled = false;
    s.subs.push(
      m.onDeviceDisconnected(device.id, () => {
        if (session !== s) return;
        teardown(s);
        session = null;
        if (state === 'brewing' && s.barista?.brewStarted) return; // brew() completes and emits 'idle'
        brewCancelled = true;
        setState('idle');
      }),
    );
    if (gen === 'legacy' && chars.has(BA.FW_REVISION_CHAR)) {
      const fw = String.fromCharCode(...(await read(s, { service: BA.DEVICE_INFO_SERVICE, characteristic: BA.FW_REVISION_CHAR })));
      if (BA.isLegacyOldFirmware(fw))
        throw new Error('This Barista has old firmware that uses system Bluetooth bonding, which this app does not support yet.');
    }
    s.barista = createBaristaSession(
      {
        machineId: machine.id,
        read: (c) => read(s, c),
        write: (c, b) => write(s, c, b),
        monitor: (c, cb) => {
          s.subs.push(
            m.monitorCharacteristicForDevice(device.id, c.service, c.characteristic, (_e, ch) => {
              if (ch?.value) cb(fromBase64(ch.value));
            }),
          );
        },
        alive: () => session === s,
        cancelled: () => brewCancelled,
      },
      model,
    );
    await s.barista.init();
  }

  async function dropSession() {
    const s = session;
    session = null;
    brewCancelled = true;
    if (!s) return;
    teardown(s);
    await manager().cancelDeviceConnection(s.device.id).catch(() => {});
  }

  const requireSession = () => {
    if (!session) throw new Error('Not connected to a machine.');
    return session;
  };

  // ---- MachineTransport ---------------------------------------------------------------------------------------
  return {
    kind: 'ble',

    scan(onFound, onError) {
      let stopped = false;
      const stop = () => {
        if (stopped) return;
        stopped = true;
        manager().stopDeviceScan().catch(() => {});
        if (state === 'scanning') setState(session ? 'ready' : 'idle');
      };
      const fail = (e: unknown) => {
        stop();
        onError?.(friendly(e));
      };
      setState('scanning');
      ensureBluetooth().then(() => {
        if (stopped) return;
        // Scan filter on the advertised service UUIDs:
        manager()
          // Figaro, Genio, Barista W/Slim/Duo primary services; legacy Barista shares 6FD40000.
          .startDeviceScan([F.FIGARO.service, G.GENIO.service, BA.BARISTA_GATT.w.service, BA.BARISTA_GATT.slim.service, BA.BARISTA_GATT.duo.service], null, (error, d) => {
            if (error) return fail(error);
            if (!d) return;
            const name = d.localName ?? d.name;
            const uuids = (d.serviceUUIDs ?? []).map((u) => u.toLowerCase());
            // Name prefix decides; fall back to the advertised UUID if the name is missing.
            const dolce = familyFromName(name);
            const baristaModel = dolce ? null : (BA.baristaModelFromName(name) ?? BA.baristaModelFromServices(uuids, name));
            // An unnamed 6FD40000 advert is ambiguous (Esperta vs legacy Barista); keep treating it as Esperta.
            const unnamedLegacy = baristaModel && !name && BA.baristaGen(baristaModel) === 'legacy';
            const family =
              dolce ??
              (baristaModel && !unnamedLegacy ? 'barista' : null) ??
              (uuids.includes(F.FIGARO.service) ? 'figaro' : uuids.includes(G.GENIO.service) ? 'genio' : null);
            if (!family) return;
            const fallback = family === 'figaro' ? 'ESPERTA' : family === 'genio' ? 'GENIOSAN' : 'Barista';
            onFound({ id: d.id, name: name ?? fallback, family, rssi: d.rssi, ...(family === 'barista' && baristaModel ? { baristaModel } : {}) });
          })
          .catch(fail);
      }, fail);
      return stop;
    },

    connectedMachine: () => session?.machine ?? null,

    async connect(machine) {
      await dropSession();
      await ensureBluetooth();
      setState('connecting');
      const m = manager();
      try {
        const device = await m.connectToDevice(machine.id, { timeout: 30_000 });
        await device.discoverAllServicesAndCharacteristics();
        const chars = new Map<string, Characteristic>();
        for (const svc of await device.services())
          for (const c of await svc.characteristics()) chars.set(c.uuid.toLowerCase(), c);
        if (machine.family === 'barista') {
          await connectBarista(machine, device, chars);
          setState('ready');
          return;
        }
        const fam = machine.family === 'figaro' ? F.FIGARO : G.GENIO;
        if (!chars.has(fam.serial.characteristic) || !chars.has(fam.status.characteristic))
          throw new Error('This device does not look like a supported Dolce Gusto machine.');

        const s: Session = { machine, device, chars, key: null, subs: [], serial: queue(), prep: null, barista: null };
        session = s;
        brewCancelled = false;
        s.subs.push(
          m.onDeviceDisconnected(device.id, () => {
            if (session !== s) return;
            teardown(s);
            session = null;
            brewCancelled = true;
            setState('idle');
          }),
          // Serial notifications (CCCD 0x2902 enable) carry the pairing challenges.
          m.monitorCharacteristicForDevice(device.id, fam.serial.service, fam.serial.characteristic, (_e, c) => {
            if (c?.value) s.serial.push(fromBase64(c.value));
          }),
        );
        await sleep(300); // Note: let the CCCD write land before the first read; tune if challenges are missed

        const creds = await loadCreds(machine.id);
        if (creds) await authenticate(s, creds);
        setState('ready');
      } catch (e) {
        await dropSession();
        setState('idle');
        throw friendly(e);
      }
    },

    async isPaired(machine) {
      if (session?.machine.id === machine.id && session.barista) return session.barista.authed;
      const stored = (await loadCreds(machine.id)) != null;
      if (session?.machine.id === machine.id) return stored && session.key != null;
      return stored;
    },

    // Fresh light pairing.
    async pair(onPrompt: (prompt: PairingPrompt) => void) {
      const s = requireSession();
      const fam = s.machine.family;
      if (fam === 'barista' || s.barista) {
        setState('pairing');
        try {
          await s.barista!.pair(onPrompt);
          setState('ready');
        } catch (e) {
          if (session === s) setState('connecting'); // caller disconnects; avoid 'idle'/'error' which mean "lost"
          throw friendly(e);
        }
        return;
      }
      const serial = C(s).serial;
      setState('pairing');
      try {
        let x = await snapshot(s);
        if (x.paired) throw new Error('Pairing failed: machine expected to be not paired. Switch it off and on, then retry.');
        // Pairing only starts once the machine is asleep.
        if (x.state !== 'SLEEP') {
          onPrompt({ message: PROMPTS[fam].off });
          x = await waitFor(s, (y) => y.state === 'SLEEP', 60_000, 'Timed out waiting for the machine to be switched off.');
        }
        onPrompt({ message: 'Starting pairing…' });
        s.serial.clear();
        await read(s, serial); // read serial (16 bytes ASCII) …
        await expectProtectedReadFails(s); // … then the protected read
        const n1 = await s.serial.next(CHALLENGE_TIMEOUT_MS, 'Machine did not send a pairing challenge (timed out).');
        await write(s, serial, new Uint8Array(16)); // 16 zero bytes for machine verification
        if ((await snapshot(s)).paired) throw new Error('Pairing failed: machine expected to be not paired.');
        await write(s, serial, START_PAIRING);
        onPrompt({ message: PROMPTS[fam].press });
        const n2 = await s.serial.next(LIGHT_PAIRING_TIMEOUT_MS, 'Pairing timed out: no response from the machine.');
        const n3 = await s.serial.next(
          LIGHT_PAIRING_TIMEOUT_MS,
          'Pairing timed out: the brew button was not pressed while the lights were blinking.',
        );
        const { response, credentials } = lightPairingResponse(n1, n2, n3);
        await write(s, serial, response);
        if (!(await snapshot(s)).paired) throw new Error('Pairing failed: the machine rejected the pairing key.');
        await saveCreds(s.machine.id, credentials);
        s.key = credentials.key;
        await afterAuth(s);
        setState('ready');
      } catch (e) {
        if (session === s) setState('connecting'); // caller disconnects; avoid 'idle'/'error' which mean "lost"
        throw friendly(e);
      }
    },

    async getStatus() {
      if (session?.barista) return session.barista.status();
      return session ? (await snapshot(session)).status : { readiness: 'unknown' };
    },

    async rinseTest(stopAfterMs: number | null, onProgress: (p: BrewProgress) => void) {
      const s = requireSession();
      if (!s.barista) throw new Error('Hot water setup is only for Barista W.');
      brewCancelled = false;
      setState('brewing');
      try {
        return await s.barista.rinseTest(stopAfterMs, onProgress);
      } catch (e) {
        throw friendly(e);
      } finally {
        setState(session === s ? 'ready' : 'idle');
      }
    },

    async brew(request: BrewRequest, onProgress: (p: BrewProgress) => void) {
      const s = requireSession();
      if (s.barista) {
        brewCancelled = false;
        setState('brewing');
        try {
          await s.barista.brew(request, onProgress);
        } catch (e) {
          throw friendly(e);
        } finally {
          // Barista machines drop the link when a drink finishes; the disconnect handler defers 'idle' to here.
          setState(session === s ? 'ready' : 'idle');
        }
        return;
      }
      if (!s.key) throw new Error('Machine is not paired.');
      const fig = s.machine.family === 'figaro';
      const canBrew = fig ? F.FIGARO_CAN_BREW : G.GENIO_CAN_BREW;
      const active = fig ? F.FIGARO_BREW_ACTIVE : G.GENIO_BREW_ACTIVE;
      const ended = fig ? F.FIGARO_BREW_END : G.GENIO_BREW_END;
      brewCancelled = false;
      setState('brewing');
      try {
        onProgress({ phase: 'sending', progress: 0 });
        let x = await snapshot(s);

        // Wake the machine if asleep, then wait for ready.
        if (x.state === 'SLEEP') {
          onProgress({ phase: 'heating', progress: 0, message: 'Waking the machine…' });
          if (fig) await write(s, F.FIGARO.hmiButton, encrypt(s, F.hmiButtonPress(rnd4())));
          else {
            const ok = G.isPreheatAvailable(await read(s, G.GENIO.hmiVersion), await read(s, G.GENIO.mboVersion));
            if (!ok) throw new Error('The machine is switched off. Switch it on, then brew again.');
            await write(s, G.GENIO.recipeControl, encrypt(s, G.powerControl(true, rnd4())));
          }
        }
        if (!canBrew.includes(x.state) && x.status.readiness !== 'error') {
          onProgress({ phase: 'heating', progress: 0, message: 'Heating up…' });
          x = await waitFor(s, (y) => canBrew.includes(y.state) || y.status.readiness === 'error', 120_000, 'Machine did not become ready (timed out).', true);
        }
        if (x.status.readiness === 'error' || x.status.readiness === 'needsCapsule')
          throw new Error(x.status.detail ?? `Machine not ready (${x.state})`);
        if (!canBrew.includes(x.state)) throw new Error(`Machine not ready (${x.state}).`);

        const capsule = getCapsule(request.capsuleId) ?? { iceType: 0, capsuleCount: 1 };
        s.prep = null;
        if (fig) {
          const recipe = toFigaroRecipe(request, capsule);
          await write(s, F.FIGARO.beveragePreparation, encrypt(s, F.beveragePreparation(recipe, rnd4())));
        } else {
          // Temperature, then level, then control.
          const recipe = toGenioRecipe(request, capsule);
          await write(s, G.GENIO.recipeTemperature, encrypt(s, G.temperatureData(recipe.temperature, rnd4())));
          await write(s, G.GENIO.recipeLevel, G.recipeLevel(recipe.level));
          await write(s, G.GENIO.recipeControl, encrypt(s, G.brewControl(recipe.extraction, rnd4())));
        }

        const t0 = Date.now();
        // Note: Genio reports no progress; time-based estimate (~5 s per level step). Calibrate on hardware.
        const expectedMs = (15 + 5 * Math.max(1, request.volumeLevel)) * 1000;
        let started = false;
        for (;;) {
          if (brewCancelled) throw new Error('Brew cancelled');
          if (session !== s) throw new Error('Machine disconnected (connection lost).');
          x = await snapshot(s);
          const p = s.prep as F.FigaroPreparationStatus | null; // set by the notification callback (TS can't see that)
          if (active.includes(x.state) || p) started = true;
          if (started && ended.includes(x.state)) {
            if (x.state === 'ERROR') throw new Error(x.status.detail ?? 'Machine reported an error.');
            break;
          }
          if (!started && Date.now() - t0 > 60_000) throw new Error('Machine did not start brewing (timed out).');
          if (Date.now() - t0 > 300_000) throw new Error('Brew timed out.');
          const progress = p ? Math.min(1, p.totalProgress / 100) : Math.min(0.95, (Date.now() - t0) / expectedMs);
          const message =
            x.status.readiness === 'needsWater'
              ? 'Water tank empty — refill it to continue.'
              : p?.step === 'WAIT_FOR_USER_RESPONSE'
                ? 'The machine is waiting for you — check the machine.'
                : undefined;
          const heating = p ? p.step.startsWith('HEAT_UP') : !started;
          onProgress({ phase: heating ? 'heating' : 'brewing', progress, message });
          await sleep(POLL_MS);
        }
        onProgress({ phase: 'done', progress: 1 });
      } finally {
        if (session === s) setState('ready');
      }
    },

    async abort() {
      const s = session;
      if (s?.barista) {
        await s.barista.abort(); // throws on models without a stop command; the brew keeps being tracked
        brewCancelled = true;
        return;
      }
      brewCancelled = true;
      if (!s) return;
      if (s.machine.family !== 'figaro')
        throw new Error('Genio machines cannot stop a brew over Bluetooth; press the button on the machine.');
      // Single plain byte 0x02.
      await write(s, F.FIGARO.preparationControl, F.preparationControl('abort'));
    },

    async disconnect() {
      await dropSession();
      setState('idle');
    },

    onStateChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
