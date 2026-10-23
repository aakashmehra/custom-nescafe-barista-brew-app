import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { BARISTA_MODEL_NAMES } from '../data/baristaMenu';
import {
  getTransport,
  type BrewProgress,
  type BrewRequest,
  type ConnectionState,
  type DiscoveredMachine,
  type MachineStatus,
  type PairingPrompt,
  type RinseTestResult,
} from '../machine';

export type MachineErrorKind = 'bluetoothOff' | 'permission' | 'notFound' | 'connectionLost' | 'unknown';
export interface MachineError {
  kind: MachineErrorKind;
  title: string;
  message: string;
}

const ERRORS: Record<Exclude<MachineErrorKind, 'unknown'>, Omit<MachineError, 'kind'>> = {
  bluetoothOff: { title: 'Bluetooth is off', message: 'Turn on Bluetooth, then try again.' },
  permission: {
    title: 'Bluetooth access needed',
    message: 'Allow Brew to use Bluetooth in Settings so it can find your machine.',
  },
  notFound: {
    title: 'No machine found',
    message: 'Make sure the machine is on and close by, then try again.',
  },
  connectionLost: { title: 'Connection lost', message: 'The machine went out of reach. Reconnect to keep brewing.' },
};

const err = (kind: Exclude<MachineErrorKind, 'unknown'>): MachineError => ({ kind, ...ERRORS[kind] });

// Note: matches on error text; switch to typed error codes once the BLE layer exposes them.
export function toMachineError(e: unknown): MachineError {
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.toLowerCase();
  if (/powered ?off|bluetooth (is )?off|bluetooth disabled/.test(m)) return err('bluetoothOff');
  if (/permission|unauthori[sz]ed|denied/.test(m)) return err('permission');
  if (/not found|no machine/.test(m)) return err('notFound');
  if (/disconnect|connection lost/.test(m)) return err('connectionLost');
  return { kind: 'unknown', title: 'Something went wrong', message: msg || 'Please try again.' };
}

/** Real machines advertise ids like "esperta1a2b" / "geniosan_3c4d"; show a friendly model name instead. */
export function machineName(m: DiscoveredMachine) {
  if (m.family === 'barista' && m.baristaModel && !/demo/i.test(m.name)) return BARISTA_MODEL_NAMES[m.baristaModel];
  if (/\s/.test(m.name)) return m.name;
  if (/^esperta/i.test(m.name)) return 'Esperta';
  if (/^genio/i.test(m.name)) return 'Genio S';
  if (/^barista/i.test(m.name)) return 'Barista';
  return m.name;
}

const FAMILY_LABEL: Record<DiscoveredMachine['family'], string> = { figaro: 'Esperta', genio: 'Genio S', barista: 'Barista' };
export const familyLabel = (m: DiscoveredMachine) =>
  m.family === 'barista' && m.baristaModel ? BARISTA_MODEL_NAMES[m.baristaModel] : (FAMILY_LABEL[m.family] ?? 'Dolce Gusto');

/** Home tab for the connected machine. */
export const homeHref = (m: DiscoveredMachine | null) => (m?.family === 'barista' ? '/menu' : '/black') as '/menu' | '/black';

const SCAN_TIMEOUT_MS = 15000;
const LAST_KEY = 'brew.lastMachine';
let memoryLast: string | null = null; // fallback when SecureStore is unavailable

async function loadLast(): Promise<DiscoveredMachine | null> {
  let raw = memoryLast;
  try {
    raw = await SecureStore.getItemAsync(LAST_KEY);
  } catch {}
  try {
    return raw ? (JSON.parse(raw) as DiscoveredMachine) : null;
  } catch {
    return null;
  }
}

async function saveLast(m: DiscoveredMachine | null) {
  memoryLast = m ? JSON.stringify(m) : null;
  try {
    if (memoryLast) await SecureStore.setItemAsync(LAST_KEY, memoryLast);
    else await SecureStore.deleteItemAsync(LAST_KEY);
  } catch {}
}

interface MachineContextValue {
  kind: 'ble' | 'demo';
  connection: ConnectionState;
  machines: DiscoveredMachine[];
  machine: DiscoveredMachine | null;
  lastMachine: DiscoveredMachine | null;
  connectingId: string | null;
  restoring: boolean;
  pairingPrompt: PairingPrompt | null;
  /** set when pairing failed; the sheet stays up with a Retry */
  pairError: MachineError | null;
  /** machine the last failed connect was for */
  retryTarget: DiscoveredMachine | null;
  status: MachineStatus | null;
  brew: BrewProgress | null;
  error: MachineError | null;
  scan(): void;
  stopScan(): void;
  connect(m: DiscoveredMachine): Promise<void>;
  cancelConnect(): void;
  startBrew(req: BrewRequest): Promise<void>;
  abort(): Promise<void>;
  clearBrew(): void;
  disconnect(): Promise<void>;
  forget(): Promise<void>;
  clearError(): void;
  retry(): void;
  /** Barista W hot-water calibration: one rinse, optionally stopped after `stopAfterMs`. */
  rinseTest(stopAfterMs: number | null): Promise<RinseTestResult>;
  rinse: BrewProgress | null;
}

const MachineContext = createContext<MachineContextValue | null>(null);

export function useMachine() {
  const ctx = use(MachineContext);
  if (!ctx) throw new Error('useMachine must be used inside MachineProvider');
  return ctx;
}

export function MachineProvider({ children }: { children: ReactNode }) {
  const transport = getTransport();
  const [connection, setConnection] = useState<ConnectionState>('idle');
  const [machines, setMachines] = useState<DiscoveredMachine[]>([]);
  const [machine, setMachine] = useState<DiscoveredMachine | null>(null);
  const [lastMachine, setLastMachine] = useState<DiscoveredMachine | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [pairingPrompt, setPairingPrompt] = useState<PairingPrompt | null>(null);
  const [pairError, setPairError] = useState<MachineError | null>(null);
  const [retryTarget, setRetryTarget] = useState<DiscoveredMachine | null>(null);
  const [status, setStatus] = useState<MachineStatus | null>(null);
  const [brew, setBrew] = useState<BrewProgress | null>(null);
  const [error, setError] = useState<MachineError | null>(null);

  const stopRef = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const foundRef = useRef(0);
  const machineRef = useRef<DiscoveredMachine | null>(null);
  const attemptRef = useRef(0); // bumps to invalidate an in-flight connect
  const quietRef = useRef(false); // true while we disconnect on purpose
  const abortedRef = useRef(false);

  // Watch for unexpected drops.
  useEffect(
    () =>
      transport.onStateChange((s) => {
        setConnection(s);
        if ((s === 'idle' || s === 'error') && machineRef.current && !quietRef.current) {
          machineRef.current = null;
          setMachine(null);
          setBrew((b) => (b && b.phase !== 'done' ? { ...b, phase: 'error', message: ERRORS.connectionLost.title } : b));
          setError(err('connectionLost'));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      }),
    [transport],
  );

  const stopScan = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const scan = useCallback(() => {
    stopScan();
    setError(null);
    setMachines([]);
    foundRef.current = 0;
    const fail = (e: unknown) => {
      stopScan();
      setConnection('idle');
      setError(toMachineError(e));
    };
    try {
      stopRef.current = transport.scan(
        (m) => {
          foundRef.current++;
          setMachines((prev) => {
            const rest = prev.filter((p) => p.id !== m.id);
            return [...rest, m].sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999));
          });
        },
        fail,
      );
    } catch (e) {
      fail(e);
      return;
    }
    timeoutRef.current = setTimeout(() => {
      stopScan();
      if (foundRef.current === 0) setError(err('notFound'));
    }, SCAN_TIMEOUT_MS);
  }, [transport, stopScan]);

  const connect = useCallback(
    async (target: DiscoveredMachine) => {
      let m = target;
      stopScan();
      setError(null);
      setPairError(null);
      setRetryTarget(null);
      setConnectingId(m.id);
      let pairing = false;
      const attempt = ++attemptRef.current;
      const live = () => attempt === attemptRef.current;
      try {
        await transport.connect(m);
        if (!live()) return;
        // Prefer what the transport resolved on connect (Barista model from GATT services).
        m = transport.connectedMachine?.() ?? m;
        machineRef.current = m;
        if (!(await transport.isPaired(m))) {
          if (!live()) return;
          pairing = true;
          setPairingPrompt({ message: 'Getting ready to pair…' });
          await transport.pair((p) => live() && setPairingPrompt(p));
        }
        if (!live()) return;
        setStatus(await transport.getStatus().catch(() => null));
        // the transport may resolve more detail on connect (e.g. the Barista model from GATT services)
        const resolved = transport.connectedMachine?.() ?? m;
        machineRef.current = resolved;
        setMachine(resolved);
        setLastMachine(resolved);
        await saveLast(resolved);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {
        if (!live()) return;
        machineRef.current = null;
        setRetryTarget(m);
        if (pairing) {
          const msg = e instanceof Error ? e.message : String(e);
          setPairError({
            kind: 'unknown',
            title: 'Pairing didn’t finish',
            message: /time/i.test(msg) ? 'The pairing window closed. Try again and follow the steps as they appear.' : msg,
          });
        } else setError(toMachineError(e));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        quietRef.current = true;
        await transport.disconnect().catch(() => {});
        quietRef.current = false;
      } finally {
        if (live()) {
          setConnectingId(null);
          setPairingPrompt(null);
          setRestoring(false);
        }
      }
    },
    [transport, stopScan],
  );

  const disconnect = useCallback(async () => {
    attemptRef.current++;
    stopScan();
    quietRef.current = true;
    machineRef.current = null;
    await transport.disconnect().catch(() => {});
    quietRef.current = false;
    setMachine(null);
    setBrew(null);
    setStatus(null);
    setConnectingId(null);
    setPairingPrompt(null);
    setPairError(null);
    setRestoring(false);
  }, [transport, stopScan]);

  const forget = useCallback(async () => {
    await disconnect();
    setLastMachine(null);
    await saveLast(null);
  }, [disconnect]);

  // Auto-reconnect to the last machine on launch.
  useEffect(() => {
    let cancelled = false;
    loadLast().then((last) => {
      if (cancelled) return;
      setLastMachine(last);
      if (last) connect(last);
      else setRestoring(false);
    });
    return () => {
      cancelled = true;
      stopScan();
    };
  }, [connect, stopScan]);

  // Refresh status every 30 s while connected and idle (coffee powder level, readiness).
  useEffect(() => {
    if (!machine || connection !== 'ready') return;
    const id = setInterval(() => transport.getStatus().then(setStatus, () => {}), 30000);
    return () => clearInterval(id);
  }, [machine, connection, transport]);

  const startBrew = useCallback(
    async (req: BrewRequest) => {
      abortedRef.current = false;
      setBrew({ phase: 'sending', progress: 0 });
      try {
        await transport.brew(req, (p) => !abortedRef.current && setBrew(p));
        if (abortedRef.current) return;
        setBrew({ phase: 'done', progress: 1 });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {
        if (abortedRef.current) return;
        const msg = e instanceof Error ? e.message : String(e);
        setBrew((b) => ({ phase: 'error', progress: b?.progress ?? 0, message: msg || 'The brew stopped.' }));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      transport.getStatus().then(setStatus, () => {});
    },
    [transport],
  );

  const [rinse, setRinse] = useState<BrewProgress | null>(null);
  const rinseTest = useCallback(
    async (stopAfterMs: number | null) => {
      if (!transport.rinseTest) throw new Error('This machine can’t run a rinse test from the app.');
      setRinse({ phase: 'sending', progress: 0 });
      try {
        const r = await transport.rinseTest(stopAfterMs, setRinse);
        setRinse({ phase: 'done', progress: 1 });
        return r;
      } catch (e) {
        setRinse(null);
        throw e;
      }
    },
    [transport],
  );

  const abort = useCallback(async () => {
    abortedRef.current = true;
    setBrew(null);
    await transport.abort().catch(() => {});
  }, [transport]);

  return (
    <MachineContext
      value={{
        kind: transport.kind,
        connection,
        machines,
        machine,
        lastMachine,
        connectingId,
        restoring,
        pairingPrompt,
        pairError,
        retryTarget,
        status,
        brew,
        error,
        scan,
        stopScan,
        connect,
        cancelConnect: disconnect,
        startBrew,
        abort,
        clearBrew: () => setBrew(null),
        disconnect,
        forget,
        clearError: () => {
          setError(null);
          setPairError(null);
        },
        retry: () => (retryTarget ? connect(retryTarget) : scan()),
        rinseTest,
        rinse,
      }}>
      {children}
    </MachineContext>
  );
}
