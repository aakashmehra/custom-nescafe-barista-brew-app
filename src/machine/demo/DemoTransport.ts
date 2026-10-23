import type {
  BrewProgress,
  BrewRequest,
  ConnectionState,
  DiscoveredMachine,
  MachineStatus,
  MachineTransport,
  PairingPrompt,
} from '../types';
import { planHotWater } from '../protocol/barista';

// Simulated machine for Expo Go / no-BLE environments. Timings are rough approximations of the real thing.
const FAKES: DiscoveredMachine[] = [
  { id: 'demo-genio', name: 'Genio S Demo', family: 'genio', rssi: -52 },
  { id: 'demo-esperta', name: 'Esperta Demo', family: 'figaro', rssi: -74 },
  { id: 'demo-barista-w', name: 'Barista W Demo', family: 'barista', baristaModel: 'w', rssi: -63 },
];

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const jitter = (rssi: number) => rssi + Math.round(Math.random() * 8 - 4);

export function createDemoTransport(): MachineTransport {
  let state: ConnectionState = 'idle';
  let current: DiscoveredMachine | null = null;
  const paired = new Set<string>();
  const listeners = new Set<(s: ConnectionState) => void>();
  let aborted = false;

  const setState = (s: ConnectionState) => {
    if (s === state) return;
    state = s;
    listeners.forEach((l) => l(s));
  };

  return {
    kind: 'demo',

    scan(onFound) {
      setState('scanning');
      const timers = [
        setTimeout(() => onFound({ ...FAKES[0], rssi: jitter(FAKES[0].rssi!) }), 1000),
        setTimeout(() => onFound({ ...FAKES[1], rssi: jitter(FAKES[1].rssi!) }), 1800),
        setTimeout(() => onFound({ ...FAKES[2], rssi: jitter(FAKES[2].rssi!) }), 1400),
      ];
      return () => {
        timers.forEach(clearTimeout);
        if (state === 'scanning') setState(current ? 'ready' : 'idle');
      };
    },

    async connect(machine) {
      setState('connecting');
      await wait(1000);
      current = machine;
      setState('ready');
    },

    async isPaired(machine) {
      return paired.has(machine.id);
    },

    async pair(onPrompt: (p: PairingPrompt) => void) {
      if (!current) throw new Error('Not connected');
      setState('pairing');
      // mirrors the real two-step flow
      const barista = current.family === 'barista';
      onPrompt({
        message: barista ? 'Switch the Barista off (keep it plugged in)' : 'Switch the machine off, then on again',
      });
      await wait(2500);
      onPrompt({
        message: barista ? 'Press the button that lights green' : "Press the machine's button while the lights blink",
      });
      await wait(2000);
      paired.add(current.id);
      setState('ready');
    },

    async getStatus(): Promise<MachineStatus> {
      const readiness = current ? (state === 'brewing' ? 'brewing' : 'ready') : 'unknown';
      // Barista: coffee powder runs "low" now and then so the indicator can be seen
      if (current?.family === 'barista') return { readiness, coffee: Math.random() < 0.4 ? 'low' : 'ok' };
      return { readiness };
    },

    async brew(request: BrewRequest, onProgress: (p: BrewProgress) => void) {
      if (!current) throw new Error('Not connected');
      aborted = false;
      setState('brewing');
      const check = () => {
        if (aborted) throw new Error('Brew cancelled');
      };
      try {
        onProgress({ phase: 'sending', progress: 0 });
        await wait(700);
        check();
        onProgress({ phase: 'heating', progress: 0, message: request.iced ? 'Chilling' : 'Heating water' });
        await wait(2000);
        check();
        const o = request.baristaOptions;
        const hotW = request.baristaDrinkId === 'hotWater' && current.baristaModel === 'w';
        if (hotW) {
          if (!o?.hotWater) throw new Error('Set up hot water first (Settings → Hot water).');
          // Barista W hot water = rinse cycles, the last one maybe cut short (see planHotWater)
          const plan = planHotWater(o.waterMl ?? 160, o.hotWater);
          const total = plan.pours.reduce((n, p) => n + (p.stopAfterMs ?? o.hotWater!.rinseMs), 0);
          let elapsed = 0;
          for (const [i, pour] of plan.pours.entries()) {
            const ms = pour.stopAfterMs ?? o.hotWater.rinseMs;
            const start = Date.now();
            const label = plan.pours.length > 1 ? `Rinse ${i + 1} of ${plan.pours.length}` : 'Rinsing';
            while (Date.now() - start < ms) {
              check();
              onProgress({ phase: 'brewing', progress: (elapsed + Date.now() - start) / total, message: label });
              await wait(100);
            }
            elapsed += ms;
            if (i < plan.pours.length - 1) await wait(800);
          }
          onProgress({ phase: 'done', progress: 1 });
          return;
        }
        // ~6s for a mid-size cup, scaled by volume level (1..8)
        const level = o ? ((o.waterMl ?? 120) + (o.milkMl ?? 0)) / 30 : request.volumeLevel;
        const duration = 6000 * (0.4 + level / 6.5);
        const start = Date.now();
        while (true) {
          check();
          const p = Math.min(1, (Date.now() - start) / duration);
          onProgress({ phase: 'brewing', progress: p });
          if (p >= 1) break;
          await wait(100);
        }
        onProgress({ phase: 'done', progress: 1 });
      } finally {
        if (current) setState('ready');
      }
    },

    async rinseTest(stopAfterMs: number | null, onProgress: (p: BrewProgress) => void) {
      if (current?.family !== 'barista') throw new Error('Rinse test is only for Barista machines.');
      setState('brewing');
      try {
        const full = 6000; // a demo rinse runs ~6 s
        const ms = stopAfterMs == null ? full : Math.min(stopAfterMs, full);
        onProgress({ phase: 'sending', progress: 0 });
        await wait(600);
        const start = Date.now();
        while (Date.now() - start < ms) {
          onProgress({ phase: 'brewing', progress: (Date.now() - start) / full, message: 'Rinsing' });
          await wait(100);
        }
        return stopAfterMs == null ? { extractMs: full } : { extractMs: ms, stop: 'rinse' as const };
      } finally {
        if (current) setState('ready');
      }
    },

    async abort() {
      aborted = true;
    },

    async disconnect() {
      aborted = true;
      current = null;
      setState('idle');
    },

    onStateChange(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}
