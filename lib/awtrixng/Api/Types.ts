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
  radio: boolean;
  gpio: AwtrixNgApiGpioCapabilities;
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
  radioVolume: number;
  radioMeta: boolean;
  saturation: number;
  gamma: number;
  colorCorrection: AwtrixNgApiColor | null;
  colorTint: AwtrixNgApiColor | null;
}

export type AwtrixNgApiSettingsPatch = Partial<AwtrixNgApiSettingsResponse>;

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
  config?: boolean;
  error?: AwtrixNgApiScriptAppError | null;
  meta?: AwtrixNgApiScriptAppMeta;
}

export type AwtrixNgApiAppsResponse = AwtrixNgApiAppInventoryItem[];

export interface AwtrixNgApiAppsOrderPayload {
  order?: string[];
  disabled: string[];
}

export const AwtrixNgApiTextCases = ['inherit', 'upper', 'asTyped'] as const;

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

export interface AwtrixNgApiPagePayload {
  text?: string | AwtrixNgApiTextFragment[];
  textCase?: AwtrixNgApiTextCase;
  font?: AwtrixNgApiFont;
  textColor?: AwtrixNgApiColorInput | 'palette';
  textBlinkMs?: number;
  textFadeMs?: number;
  textCenter?: boolean;
  textOffsetX?: number;
  textInFront?: boolean;
  scroll?: AwtrixNgApiScrollPayload | AwtrixNgApiScrollMode;
  icon?: string;
  iconMode?: AwtrixNgApiIconMode;
  iconOffsetX?: number;
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

export interface AwtrixNgApiNotificationPayload extends AwtrixNgApiPagePayload {
  name?: string;
  hold?: boolean;
  stack?: boolean;
  wakeup?: boolean;
  sound?: string | number;
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
  name?: string;
  rtttl?: string;
  builtin?: string;
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
