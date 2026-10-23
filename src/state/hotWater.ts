import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import type { DiscoveredMachine, HotWaterCalibration } from '../machine/types';

// Barista W hot-water calibration (one rinse = N ml / M ms, and how a rinse can be stopped), per machine.
const key = (machineId: string) => `brew.hotwater.${machineId}`;
const listeners = new Set<() => void>();

export const needsHotWaterSetup = (m: DiscoveredMachine | null | undefined) =>
  m?.family === 'barista' && m.baristaModel === 'w';

export async function loadCalibration(machineId: string): Promise<HotWaterCalibration | null> {
  try {
    const raw = await AsyncStorage.getItem(key(machineId));
    return raw ? (JSON.parse(raw) as HotWaterCalibration) : null;
  } catch {
    return null;
  }
}

export async function saveCalibration(machineId: string, cal: HotWaterCalibration | null) {
  try {
    if (cal) await AsyncStorage.setItem(key(machineId), JSON.stringify(cal));
    else await AsyncStorage.removeItem(key(machineId));
  } catch {}
  listeners.forEach((l) => l());
}

/** Current calibration for a machine; re-reads whenever any calibration is saved. */
export function useHotWaterCalibration(machineId: string | undefined) {
  const [state, setState] = useState<{ id?: string; cal: HotWaterCalibration | null } | null>(null);
  useEffect(() => {
    if (!machineId) return;
    let alive = true;
    const load = () => loadCalibration(machineId).then((cal) => alive && setState({ id: machineId, cal }));
    load();
    listeners.add(load);
    return () => {
      alive = false;
      listeners.delete(load);
    };
  }, [machineId]);
  const current = state?.id === machineId ? state : null;
  return {
    calibration: current?.cal ?? null,
    loaded: current != null,
    save: (cal: HotWaterCalibration | null) => (machineId ? saveCalibration(machineId, cal) : Promise.resolve()),
  };
}

export const calibrationSummary = (cal: HotWaterCalibration) =>
  `1 rinse ≈ ${cal.rinseMl} ml · ${cal.stop === 'none' ? `${cal.rinseMl} ml steps` : 'exact amounts'}`;
