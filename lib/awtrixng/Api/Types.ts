export type AwtrixNgApiGpioDefaultValue = string | number | boolean | null;

export type AwtrixNgApiColor = string;

export type AwtrixNgApiColorInput = AwtrixNgApiColor | number | [number, number, number] | ['HSV', number, number, number];

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

export interface AwtrixNgApiDeviceStateResponse {
  version: string;
  uid: string;
  boardType: string;
  soc: string;
  ipAddress: string;
  wifiRssi: number;
  uptimeSeconds: number;
  resetReason: string;
  freeHeapBytes: number;
  minFreeHeapBytes: number;
  largestFreeBlockBytes: number;
  scriptHeapPool: string;
  scriptHeapBudgetBytes: number;
  fps: number;
  brightness: number;
  lightLevel: number;
  ldrRaw: number;
  matrixPower: boolean;
  currentApp: string;
  indicators: AwtrixNgApiIndicatorState[];
  messageCount: number;
  psramTotalBytes?: number;
  psramFreeBytes?: number;
  batteryPercent?: number;
  batteryVoltage?: number;
  batteryMillivolts?: number;
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
  inputOnly: number[];
  reserved: AwtrixNgApiGpioReservedRange[];
  adc1: AwtrixNgApiGpioRange[];
  strapping: AwtrixNgApiGpioRange[];
  matrix: number[];
  defaults: Record<string, AwtrixNgApiGpioDefaultValue>;
}

export interface AwtrixNgApiCapabilitiesResponse {
  effects: string[];
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

export type AwtrixNgApiScrollMode = 'static' | 'wrap' | 'loop' | 'bounce';

export type AwtrixNgApiScrollDirection = 'left' | 'right';

export type AwtrixNgApiScrollEntry = 'inline' | 'offscreen';

export type AwtrixNgApiScrollWhenFits = 'static' | 'scroll';

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
  palette?: string | string[] | null;
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

export type AwtrixNgApiAppOrigin = 'builtin' | 'pushed' | 'script';

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
  inLoop: boolean;
  position: number | null;
  origin: AwtrixNgApiAppOrigin;
  icon?: string;
  skipped?: boolean;
  error?: AwtrixNgApiScriptAppError | null;
  meta?: AwtrixNgApiScriptAppMeta;
}

export type AwtrixNgApiAppsResponse = AwtrixNgApiAppInventoryItem[];

export interface AwtrixNgApiAppsOrderPayload {
  order: string[];
}

export type AwtrixNgApiTextCase = 'inherit' | 'upper' | 'asTyped';

export type AwtrixNgApiIconMode = 'fixed' | 'pushOnce' | 'push';

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
}

export interface AwtrixNgApiDrawPixelCommand {
  dp: [number, number, AwtrixNgApiColorInput];
}

export interface AwtrixNgApiDrawLineCommand {
  dl: [number, number, number, number, AwtrixNgApiColorInput];
}

export interface AwtrixNgApiDrawRectangleCommand {
  dr: [number, number, number, number, AwtrixNgApiColorInput];
}

export interface AwtrixNgApiDrawFilledRectangleCommand {
  df: [number, number, number, number, AwtrixNgApiColorInput];
}

export interface AwtrixNgApiDrawCircleCommand {
  dc: [number, number, number, AwtrixNgApiColorInput];
}

export interface AwtrixNgApiDrawFilledCircleCommand {
  dfc: [number, number, number, AwtrixNgApiColorInput];
}

export interface AwtrixNgApiDrawTextCommand {
  dt: [number, number, string, AwtrixNgApiColorInput];
}

export interface AwtrixNgApiDrawBitmapCommand {
  db: [number, number, number, number, number[]];
}

export type AwtrixNgApiDrawCommand =
  | AwtrixNgApiDrawPixelCommand
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
  palette?: string | string[] | null;
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

export type AwtrixNgApiPushedAppLifetimeExpiry = 'remove' | 'mark';

export interface AwtrixNgApiPushedAppPayload extends AwtrixNgApiPagePayload {
  lifetimeMs?: number;
  lifetimeExpiry?: AwtrixNgApiPushedAppLifetimeExpiry;
  repeat?: number;
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
