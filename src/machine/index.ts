import Constants, { ExecutionEnvironment } from 'expo-constants';
import { NativeModules } from 'react-native';
import type { MachineTransport } from './types';
import { createDemoTransport } from './demo/DemoTransport';

export * from './types';

// Expo Go has no react-native-ble-plx native module, so fall back to the demo transport there.
export function isBleAvailable(): boolean {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return false;
  return NativeModules.BlePlx != null;
}

let transport: MachineTransport | null = null;

export function getTransport(): MachineTransport {
  if (transport) return transport;
  if (isBleAvailable()) {
    // Lazy require keeps the native module out of the Expo Go bundle path.
    const { createBleTransport } = require('./ble/BleTransport') as typeof import('./ble/BleTransport');
    transport = createBleTransport();
  } else {
    transport = createDemoTransport();
  }
  return transport;
}
