// Shared contract between the UI layer and machine transports (BLE / demo).
// Keep this file free of React Native imports so protocol code can be tested in Node.

// figaro = Dolce Gusto Esperta, genio = Dolce Gusto Genio S, barista = Nescafé Gold Blend Barista (instant coffee).
export type MachineFamily = 'figaro' | 'genio' | 'barista';

export type ConnectionState =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'pairing'
  | 'ready'
  | 'brewing'
  | 'error';

export interface DiscoveredMachine {
  id: string;
  name: string;
  family: MachineFamily;
  rssi: number | null;
  // Barista generation, when it can be told from the advertisement. Optional.
  baristaModel?: BaristaModel;
}

// Nescafé Gold Blend Barista generations with BLE:
// i = Barista i, fifty = Barista 50, fifty5 = Barista 50 5-button,
// simple = Barista Simple, duo = Barista Duo, w = Barista W, slim = Barista Slim.
export type BaristaModel = 'i' | 'fifty' | 'fifty5' | 'simple' | 'duo' | 'w' | 'slim';

export type MachineReadiness =
  | 'ready'
  | 'sleeping'
  | 'heating'
  | 'brewing'
  | 'needsWater'
  | 'needsCapsule'
  | 'error'
  | 'unknown';

export interface MachineStatus {
  readiness: MachineReadiness;
  detail?: string;
  // Barista only: coffee powder tank from the alarm/warning bits. The machines expose no calibrated
  // percentage (Barista W/Slim have a raw counter with unknown scale), so this is coarse.
  coffee?: 'ok' | 'low' | 'empty';
}

// Figaro recipe types; each maps to an on-wire byte.
export type FigaroRecipeType = 'cold' | 'hot' | 'espressoBoost' | 'coldBrew' | 'delicateBrew';

export type TemperatureMode = 'high' | 'middle' | 'low' | 'cold';

export interface BrewRequest {
  // Dolce Gusto capsule (figaro/genio). Ignored for barista.
  capsuleId: number;
  // Barista menu item id from src/data/baristaMenu.ts. Required when the machine family is 'barista'.
  baristaDrinkId?: string;
  // 1..8, maps to the machine's volume level byte, LEVEL1..XL (30ml steps)
  volumeLevel: number;
  temperature: TemperatureMode;
  iced: boolean;
  // 0..255, Figaro only
  intensity?: number;
  // Barista only, all optional; defaults come from the drink in src/data/baristaMenu.ts.
  baristaOptions?: BaristaOptions;
}

export interface BaristaOptions {
  // Coffee scoops ("taste", coffee gauge turns) 1..5; for hot water this is the temperature step.
  strength?: number;
  // Coffee water volume in ml (0..300).
  waterMl?: number;
  // Milk-foam ("jet") water volume in ml (0..200), cappuccino/latte only.
  milkMl?: number;
  // Barista W hot water: required. W has no water-only recipe, so hot water is built from rinse cycles.
  hotWater?: HotWaterCalibration;
}

// How a stop request ends a running rinse on Barista W ('none' = rinses can only run to completion).
export type RinseStopMethod = 'rinse' | 'power' | 'none';

// Measured once per machine (Settings → Hot water) and saved by the UI.
export interface HotWaterCalibration {
  // Water from one full rinse, as measured by the user.
  rinseMl: number;
  // How long the machine reported extracting during that rinse.
  rinseMs: number;
  stop: RinseStopMethod;
}

export interface RinseTestResult {
  // Time the machine spent extracting (EXTRACT state) during this rinse.
  extractMs: number;
  // Only when stopAfterMs was given: which button press ended the rinse early.
  stop?: RinseStopMethod;
}

export type BrewPhase = 'sending' | 'heating' | 'brewing' | 'done' | 'error';

export interface BrewProgress {
  phase: BrewPhase;
  // 0..1
  progress: number;
  message?: string;
}

export interface PairingPrompt {
  // Text to show the user, e.g. "Press and hold the machine's button"
  message: string;
}

export interface MachineTransport {
  readonly kind: 'ble' | 'demo';
  // Starts scanning; returns a stop function.
  scan(onFound: (machine: DiscoveredMachine) => void, onError?: (e: Error) => void): () => void;
  connect(machine: DiscoveredMachine): Promise<void>;
  // The connected machine as resolved on connect (e.g. Barista model read from GATT services).
  connectedMachine?(): DiscoveredMachine | null;
  isPaired(machine: DiscoveredMachine): Promise<boolean>;
  // Runs the pairing handshake and persists credentials. onPrompt asks the user for physical actions.
  pair(onPrompt: (prompt: PairingPrompt) => void): Promise<void>;
  getStatus(): Promise<MachineStatus>;
  brew(request: BrewRequest, onProgress: (p: BrewProgress) => void): Promise<void>;
  abort(): Promise<void>;
  // Barista W only: run one rinse for hot-water calibration. With stopAfterMs, tries to end it early
  // (rinse press, then power press) and reports which worked.
  rinseTest?(stopAfterMs: number | null, onProgress: (p: BrewProgress) => void): Promise<RinseTestResult>;
  disconnect(): Promise<void>;
  onStateChange(cb: (state: ConnectionState) => void): () => void;
}
