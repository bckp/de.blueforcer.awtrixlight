export type AwtrixNgApiGpioDefaultValue = string | number | boolean | null;

export type AwtrixNgApiColor = string;

export type AwtrixNgApiColorInput = AwtrixNgApiColor | number | [number, number, number] | ['HSV', number, number, number];

export interface AwtrixNgApiPaletteStop {
  color: AwtrixNgApiColorInput;
  pos: number;
}

export type AwtrixNgApiPalette = string | AwtrixNgApiColorInput[] | AwtrixNgApiPaletteStop[] | null;

export interface AwtrixNgApiOkResponse {
  ok: true;
}

export interface AwtrixNgApiVersionResponse {
  version: string;
}

export interface AwtrixNgApiIndicatorState {
  on: boolean;
  color: AwtrixNgApiColor;
  blinkMs: number;
  fadeMs: number;
}

export type AwtrixNgApiLinkPhase = 'disabled' | 'offline' | 'connecting' | 'connected';

export interface AwtrixNgApiLinkStatus {
  enabled: boolean;
  state: AwtrixNgApiLinkPhase;
  host: string;
  endpoint: string;
  attempts: number;
  retryInMs: number;
  connects: number;
  error: string | null;
  lastError: string | null;
}

export interface AwtrixNgApiDeviceStateResponse {
  version: string;
  uid: string;
  boardType: string;
  soc: string;
  ipAddress: string;
  hostname: string;
  wifiRssi: number;
  uptimeSeconds: number;
  resetReason: string;
  freeHeapBytes: number;
  minFreeHeapBytes: number;
  largestFreeBlockBytes: number;
  scriptingRunning: boolean;
  scriptHeapPool: string;
  scriptHeapBudgetBytes: number;
  fps: number;
  brightness: number;
  lightLevel?: number;
  ldrRaw?: number;
  matrixPower: boolean;
  currentApp: string;
  indicators: AwtrixNgApiIndicatorState[];
  messageCount: number;
  wifi: AwtrixNgApiLinkStatus;
  mqtt: AwtrixNgApiLinkStatus;
  psramTotalBytes?: number;
  psramFreeBytes?: number;
  batteryPercent?: number;
  batteryVoltage?: number;
  batteryPinMillivolts?: number;
  lowBattery?: boolean;
  temperature?: number;
  humidity?: number;
  pressureHpa?: number;
}

export type AwtrixNgApiGpioRange = [number, number];

export interface AwtrixNgApiGpioReservedRange {
  lo: number;
  hi: number;
  why: string;
}

export interface AwtrixNgApiGpioCapabilities {
  soc: string;
  label: string;
  max: number;
  missing: AwtrixNgApiGpioRange[];
  inputOnly: AwtrixNgApiGpioRange[];
  reserved: AwtrixNgApiGpioReservedRange[];
  adc1: AwtrixNgApiGpioRange[];
  strapping: AwtrixNgApiGpioRange[];
  rtc: AwtrixNgApiGpioRange[];
  matrix: number[];
  defaults: Record<string, AwtrixNgApiGpioDefaultValue>;
}

export interface AwtrixNgApiCapabilitiesResponse {
  effects: string[];
  paletteEffects: string[];
  transitions: string[];
  overlays: string[];
  palettes: string[];
  radio?: boolean;
  gpio: AwtrixNgApiGpioCapabilities | null;
  platform?: { id: string };
  sensors?: { light?: boolean };
  display?: { width: number; height: number };
  fonts?: { name: string; ascent: number; descent: number; lineHeight: number }[];
  layouts?: {
    version: number;
    limits: { regions: number; scrollers: number; assets: number; chartPoints: number; textBytes: number };
  };
  audio?: {
    synth?: boolean; mp3?: boolean; radio?: boolean; mixer?: boolean;
    song?: boolean; rtttl?: boolean; speech?: boolean; track?: boolean;
    url?: boolean; effect?: boolean; clip?: boolean;
  };
}

export type AwtrixNgApiTimeSeparatorMode = 'steady' | 'blink' | 'pulse';

export type AwtrixNgApiDateOrder = 'dayMonthYear' | 'monthDayYear' | 'yearMonthDay';

export type AwtrixNgApiDateSeparator = 'dot' | 'slash' | 'dash';

export type AwtrixNgApiDateYearMode = 'none' | 'twoDigit' | 'fourDigit';

export const AwtrixNgApiScrollModes = ['static', 'wrap', 'loop', 'bounce'] as const;

export type AwtrixNgApiScrollMode = typeof AwtrixNgApiScrollModes[number];

export const AwtrixNgApiScrollDirections = ['left', 'right'] as const;

export type AwtrixNgApiScrollDirection = typeof AwtrixNgApiScrollDirections[number];

export const AwtrixNgApiScrollEntries = ['inline', 'offscreen'] as const;

export type AwtrixNgApiScrollEntry = typeof AwtrixNgApiScrollEntries[number];

export const AwtrixNgApiScrollWhenFitsValues = ['static', 'scroll'] as const;

export type AwtrixNgApiScrollWhenFits = typeof AwtrixNgApiScrollWhenFitsValues[number];

export type AwtrixNgApiWeekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface AwtrixNgApiWeekdayBarSettings {
  show: boolean;
  startOnMonday: boolean;
  weekendDays: AwtrixNgApiWeekday[];
  activeColor: AwtrixNgApiColor;
  inactiveColor: AwtrixNgApiColor;
  weekendActiveColor: AwtrixNgApiColor;
  weekendInactiveColor: AwtrixNgApiColor;
}

export interface AwtrixNgApiScrollSettings {
  mode: AwtrixNgApiScrollMode;
  direction: AwtrixNgApiScrollDirection;
  entry: AwtrixNgApiScrollEntry;
  whenFits: AwtrixNgApiScrollWhenFits;
  speed: number;
  gap: number;
  holdMs: number;
}

export interface AwtrixNgApiSettingsResponse {
  autoBrightness: boolean;
  brightness: number;
  autoTransition: boolean;
  textColor: AwtrixNgApiColor;
  transitionEffect: string;
  transitionDurationMs: number;
  appDurationMs: number;
  timeMode: number;
  calendarHeaderColor: AwtrixNgApiColor;
  calendarTextColor: AwtrixNgApiColor;
  calendarBodyColor: AwtrixNgApiColor;
  time24h: boolean;
  timeLeadingZero: boolean;
  timeShowSeconds: boolean;
  timeShowAmPm: boolean;
  timeSeparatorMode: AwtrixNgApiTimeSeparatorMode;
  dateOrder: AwtrixNgApiDateOrder;
  dateSeparator: AwtrixNgApiDateSeparator;
  dateYearMode: AwtrixNgApiDateYearMode;
  dateShowWeekday: boolean;
  dateMonthNames: boolean;
  useCelsius: boolean;
  blockNavigation: boolean;
  soundEnabled: boolean;
  uppercase: boolean;
  smoothScroll: boolean;
  weekdayBar: AwtrixNgApiWeekdayBarSettings;
  timeColor: AwtrixNgApiColor | null;
  dateColor: AwtrixNgApiColor | null;
  humidityColor: AwtrixNgApiColor | null;
  temperatureColor: AwtrixNgApiColor | null;
  batteryColor: AwtrixNgApiColor | null;
  scroll: AwtrixNgApiScrollSettings;
  volume: number;
  alertVolume?: number;
  appVolume?: number;
  bootSound?: boolean;
  radioVolume: number;
  radioMeta: boolean;
  saturation: number;
  gamma: number;
  colorCorrection: AwtrixNgApiColor | null;
  colorTint: AwtrixNgApiColor | null;
}

export type AwtrixNgApiSettingsPatch = Partial<AwtrixNgApiSettingsResponse>;

/** The sole documented system field this app writes. */
export interface AwtrixNgApiSystemPatch {
  buttonCallback: string;
}

/**
 * The system endpoint has many firmware-owned fields.  Keep that surface structural: this
 * integration only relies on (and runtime-validates) buttonCallback.
 */
export interface AwtrixNgApiSystemResponse {
  buttonCallback: string;
  [key: string]: unknown;
}

export interface AwtrixNgApiOverlaySettings {
  speed?: number;
  palette?: AwtrixNgApiPalette;
  blend?: boolean;
}

export interface AwtrixNgApiMoodlightState {
  color: AwtrixNgApiColor;
  brightness: number;
}

export interface AwtrixNgApiDisplayResponse {
  power: boolean;
  brightness: number;
  overlay: string | null;
  overlaySettings: Required<AwtrixNgApiOverlaySettings>;
  moodlight: AwtrixNgApiMoodlightState | null;
}

export interface AwtrixNgApiDisplayPatch {
  power?: boolean;
  overlay?: string | null;
  overlaySettings?: AwtrixNgApiOverlaySettings;
}

export type AwtrixNgApiAppOrigin = 'builtin' | 'pushed' | 'script' | 'module';

export interface AwtrixNgApiScriptAppError {
  message: string;
  line?: number;
  hook?: string;
}

export interface AwtrixNgApiScriptAppMeta {
  name: string;
  desc: string;
  author: string;
  version: string;
  display?: { width: number; height: number; fits: boolean } | null;
}

export interface AwtrixNgApiAppInventoryItem {
  name: string;
  enabled?: boolean;
  inLoop?: boolean;
  slot?: number | null;
  present?: boolean;
  origin: AwtrixNgApiAppOrigin | null;
  import?: string;
  icon?: string;
  skipped?: boolean;
  headless?: boolean;
  ondemand?: boolean;
  config?: boolean;
  error?: AwtrixNgApiScriptAppError | null;
  meta?: AwtrixNgApiScriptAppMeta;
}

export type AwtrixNgApiAppsResponse = AwtrixNgApiAppInventoryItem[];

export interface AwtrixNgApiScriptSetting {
  key: string;
  type: 'bool' | 'text' | 'number' | 'slider' | 'select' | 'color';
  label?: string;
  value: unknown;
  min?: number;
  max?: number;
  maxlen?: number;
  options?: string[];
}

export interface AwtrixNgApiScriptConfig {
  name: string;
  fields: AwtrixNgApiScriptSetting[];
  warnings: unknown[];
}

export interface AwtrixNgApiScriptWriteResult {
  ok: true;
  name: string;
  error: AwtrixNgApiScriptAppError | null;
}

export interface AwtrixNgApiSharedScriptValue {
  owner: string;
  key: string;
  type: 'int' | 'real' | 'bool' | 'string';
  value: number | boolean | string | null;
  ageMs: number;
}

export interface AwtrixNgApiAppsOrderPayload {
  order?: string[];
  disabled: string[];
}

export const AwtrixNgApiTextCases = ['inherit', 'upper', 'asTyped'] as const;

export const AwtrixNgApiTextAlignments = ['start', 'center', 'end'] as const;

export type AwtrixNgApiTextAlignment = typeof AwtrixNgApiTextAlignments[number];

export type AwtrixNgApiTextCase = typeof AwtrixNgApiTextCases[number];

export const AwtrixNgApiIconModes = ['fixed', 'pushOnce', 'push'] as const;

export type AwtrixNgApiIconMode = typeof AwtrixNgApiIconModes[number];

export interface AwtrixNgApiTextFragment {
  text: string;
  color?: AwtrixNgApiColorInput;
}

export interface AwtrixNgApiScrollPayload {
  mode?: AwtrixNgApiScrollMode;
  direction?: AwtrixNgApiScrollDirection;
  entry?: AwtrixNgApiScrollEntry;
  whenFits?: AwtrixNgApiScrollWhenFits;
  speed?: number;
  gap?: number;
  holdMs?: number;
}

export const AwtrixNgApiFonts = ['small', 'large'] as const;

export type AwtrixNgApiFont = typeof AwtrixNgApiFonts[number];

export type AwtrixNgApiDrawPixelCommand = ['pixel', number, number, AwtrixNgApiColorInput?];

export type AwtrixNgApiDrawPixelsCommand = ['pixels', AwtrixNgApiColorInput | null, number, number, ...number[]];

export type AwtrixNgApiDrawLineCommand = ['line', number, number, number, number, AwtrixNgApiColorInput?];

export type AwtrixNgApiDrawRectangleCommand = ['rect', number, number, number, number, AwtrixNgApiColorInput?];

export type AwtrixNgApiDrawFilledRectangleCommand = ['rectFill', number, number, number, number, AwtrixNgApiColorInput?];

export type AwtrixNgApiDrawCircleCommand = ['circle', number, number, number, AwtrixNgApiColorInput?];

export type AwtrixNgApiDrawFilledCircleCommand = ['circleFill', number, number, number, AwtrixNgApiColorInput?];

export type AwtrixNgApiDrawTextCommand = ['text', number, number, string, AwtrixNgApiColorInput?];

export type AwtrixNgApiDrawBitmapCommand = [
  'bitmap',
  number,
  number,
  number,
  number,
  string | AwtrixNgApiColorInput[],
];

export type AwtrixNgApiDrawCommand =
  | AwtrixNgApiDrawPixelCommand
  | AwtrixNgApiDrawPixelsCommand
  | AwtrixNgApiDrawLineCommand
  | AwtrixNgApiDrawRectangleCommand
  | AwtrixNgApiDrawFilledRectangleCommand
  | AwtrixNgApiDrawCircleCommand
  | AwtrixNgApiDrawFilledCircleCommand
  | AwtrixNgApiDrawTextCommand
  | AwtrixNgApiDrawBitmapCommand;

export type AwtrixNgApiLayoutAlignment = 'start' | 'center' | 'end';

export interface AwtrixNgApiLayoutRegion {
  id: string;
  box: [number, number, number, number];
  text?: string | AwtrixNgApiTextFragment[];
  icon?: string;
  chart?: { values: number[]; type?: 'line' | 'bar'; min?: number; max?: number };
  progress?: number;
  draw?: AwtrixNgApiDrawCommand[];
  font?: string;
  color?: AwtrixNgApiColorInput | 'palette';
  textColor?: AwtrixNgApiColorInput | 'palette';
  trackColor?: AwtrixNgApiColorInput;
  align?: AwtrixNgApiLayoutAlignment;
  valign?: AwtrixNgApiLayoutAlignment;
  scroll?: AwtrixNgApiScrollPayload | AwtrixNgApiScrollMode;
  repeat?: number;
  textCase?: AwtrixNgApiTextCase;
  textBlinkMs?: number;
  textFadeMs?: number;
  palette?: AwtrixNgApiPalette;
  paletteBlend?: boolean;
  paletteSpan?: number;
  paletteSpeed?: number;
}

export interface AwtrixNgApiLayout {
  version: 1;
  regions: AwtrixNgApiLayoutRegion[];
  backgroundColor?: AwtrixNgApiColorInput;
  effect?: string;
  effectSpeed?: number;
  overlay?: string;
  palette?: AwtrixNgApiPalette;
  paletteBlend?: boolean;
  paletteSpan?: number;
  paletteSpeed?: number;
}

export interface AwtrixNgApiPagePayload {
  layout?: AwtrixNgApiLayout;
  text?: string | AwtrixNgApiTextFragment[];
  textCase?: AwtrixNgApiTextCase;
  font?: string;
  textColor?: AwtrixNgApiColorInput | 'palette';
  textBlinkMs?: number;
  textFadeMs?: number;
  textCenter?: boolean;
  textAlign?: AwtrixNgApiTextAlignment;
  textOffsetX?: number;
  textInFront?: boolean;
  scroll?: AwtrixNgApiScrollPayload | AwtrixNgApiScrollMode;
  icon?: string;
  iconMode?: AwtrixNgApiIconMode;
  iconOffsetX?: number;
  iconGap?: number;
  icons?: { icon: string; x?: number; y?: number }[];
  durationMs?: number;
  repeat?: number;
  backgroundColor?: AwtrixNgApiColorInput;
  barChart?: number[];
  lineChart?: number[];
  chartAutoscale?: boolean;
  chartColor?: AwtrixNgApiColorInput | 'palette';
  progress?: number;
  progressColor?: AwtrixNgApiColorInput | 'palette';
  progressTrackColor?: AwtrixNgApiColorInput;
  effect?: string;
  effectSpeed?: number;
  palette?: AwtrixNgApiPalette;
  paletteBlend?: boolean;
  paletteSpan?: number;
  paletteSpeed?: number;
  overlay?: string;
  draw?: AwtrixNgApiDrawCommand[];
}

export type AwtrixNgApiSoundObject = (
  | { file: string }
  | { rtttl: string }
  | { song: string }
  | { speech: string }
  | { track: number }
  | { station: string | number }
) & { loop?: boolean; nextBar?: boolean };

export type AwtrixNgApiSound = string | AwtrixNgApiSoundObject | (string | AwtrixNgApiSoundObject)[];

export interface AwtrixNgApiNotificationPayload extends AwtrixNgApiPagePayload {
  name?: string;
  hold?: boolean;
  stack?: boolean;
  wakeup?: boolean;
  sound?: AwtrixNgApiSound | number;
  soundRtttl?: string;
  soundLoop?: boolean;
}

export const AwtrixNgApiPushedAppLifetimeExpiries = ['remove', 'mark'] as const;

export type AwtrixNgApiPushedAppLifetimeExpiry = typeof AwtrixNgApiPushedAppLifetimeExpiries[number];

export interface AwtrixNgApiPushedAppPayload extends AwtrixNgApiPagePayload {
  lifetimeMs?: number;
  lifetimeExpiry?: AwtrixNgApiPushedAppLifetimeExpiry;
}

export interface AwtrixNgApiIndicatorPayload {
  color?: AwtrixNgApiColorInput | null;
  blinkMs?: number;
  fadeMs?: number;
}

export interface AwtrixNgApiSoundPlayPayload {
  speech?: string;
  station?: string | number;
  name?: string;
  rtttl?: string;
  builtin?: string;
  fx?: string;
  file?: string;
  song?: string;
  loop?: boolean;
}

export interface AwtrixNgApiAudioGroup {
  playing: boolean;
  name: string;
  error: string;
}

export interface AwtrixNgApiAudioResponse {
  alert: AwtrixNgApiAudioGroup;
  app: AwtrixNgApiAudioGroup;
  radio: { playing: boolean; error: string };
}

export interface AwtrixNgApiFileEntry {
  name: string;
  size: number;
}

export interface AwtrixNgApiFilesResponse {
  files: AwtrixNgApiFileEntry[];
  usedBytes: number;
  totalBytes: number;
}
