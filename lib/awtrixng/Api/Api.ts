import FetchAwtrixNgHttpTransport from '../Http/FetchTransport';
import { AwtrixNgBasicAuthOptions, AwtrixNgDebugLogger } from '../Http/Transport';
import AwtrixNgClient, { AwtrixNgIndicatorId } from './Client';
import { AwtrixNgInvalidResponseError } from './InvalidResponseError';
import { AwtrixNgDeviceIdentityMismatchError } from './IdentityMismatchError';
import { AwtrixNgDeviceProbeResult, probeAwtrixNgDevice } from '../Discovery/Detection';
import {
  AwtrixNgHomeySettings,
  AwtrixNgHomeySettingsPatch,
  createAwtrixNgSettingsPatchFromChangedSettings,
  toAwtrixNgHomeySettingsUpdate,
  writeAwtrixNgSettingsPatch,
} from '../Services/Settings';
import {
  AwtrixNgBuiltinAppSettingIds,
  AwtrixNgBuiltinAppSettings,
  AwtrixNgBuiltinAppSettingsApplyResult,
  applyAwtrixNgBuiltinAppSettingsChange,
  isAwtrixNgBuiltinAppSetting,
  prepareAwtrixNgBuiltinAppSettingsChange,
  toAwtrixNgBuiltinAppSettingsUpdate,
  validateAwtrixNgBuiltinAppSettingsChange,
  writeAwtrixNgAppsOrder,
  getAwtrixNgSelectableScripts,
} from '../Services/Apps';
import { AwtrixNgWeatherOverlayValue, toAwtrixNgHomeyWeatherOverlayValue } from '../Services/Display';
import {
  runAwtrixNgMatrixPowerCapability,
  runAwtrixNgNextAppCapability,
  runAwtrixNgPreviousAppCapability,
  runAwtrixNgWeatherOverlayCapability,
} from '../Device/Controls';
import {
  AwtrixNgCapabilityUpdatePlan,
  AwtrixNgFeatureCapabilityIds,
  AwtrixNgHomeyFeatureCapabilityId,
  createAwtrixNgCapabilityUpdatePlan,
} from '../Device/State';
import AwtrixNgIcons, { AwtrixNgIconsOptions } from '../Services/Icons';
import { readAwtrixNgButtonCallback, writeAwtrixNgButtonCallback } from '../Services/ButtonCallback';
import { isPlainObject } from '../Support/Guards';
import { assertAwtrixNgLayoutCapabilities, AwtrixNgHeaderLayoutInput, createAwtrixNgHeaderLayout } from '../Services/Layouts';
import { assertAwtrixNgPageCapabilities, needsAwtrixNgPageCapabilities } from '../Services/PageCapabilities';
import {
  AwtrixNgNotificationInput, AwtrixNgPushedAppInput,
  toAwtrixNgHomeyPushedAppName, toAwtrixNgNotificationPayload, toAwtrixNgPushedAppPayload,
  UnsupportedAwtrixNgPayloadFieldError,
} from '../Payload/Transformers';
import {
  AwtrixNgAudioPlaybackError,
  toAwtrixNgSoundObjectNotification,
  usesAwtrixNgSoundObjects,
  validateAwtrixNgMp3Url,
  waitForAwtrixNgUrlSound,
  hasAwtrixNgGroupAudio, assertAwtrixNgMixerLevel, readAwtrixNgMixerLevels,
  readAwtrixNgRadioStations, validateAwtrixNgStation, assertAwtrixNgClip, downloadAwtrixNgClip,
  AwtrixNgAudioGroup, AwtrixNgMixerField, AwtrixNgMixerLevels, AwtrixNgRadioStation,
  findAwtrixNgUnsupportedSoundSource,
} from '../Services/Audio';
import isAwtrixNgFirmwareVersionSupported from './FirmwareVersion';
import { AwtrixNgUnsupportedVersionError } from './UnsupportedVersionError';
import {
  AwtrixNgApiCapabilitiesResponse,
  AwtrixNgApiDeviceStateResponse,
  AwtrixNgApiDisplayPatch,
  AwtrixNgApiIndicatorPayload,
  AwtrixNgApiNotificationPayload,
  AwtrixNgApiOkResponse,
  AwtrixNgApiPushedAppPayload,
  AwtrixNgApiAppInventoryItem,
} from './Types';

// Re-exported facade surface: device.ts consumes these alongside AwtrixNgApi so it does
// not have to import the individual lib modules the facade already wraps.
export { AwtrixNgDeviceIdentityMismatchError } from './IdentityMismatchError';
export { AwtrixNgUnsupportedVersionError } from './UnsupportedVersionError';
export { formatAwtrixNgErrorDetails } from '../Device/Availability';
export { AwtrixNgWeatherOverlayCapabilityId } from '../Services/Display';
export { AwtrixNgFeatureCapabilityIds } from '../Device/State';
export type { AwtrixNgHeaderLayoutInput } from '../Services/Layouts';
export { AwtrixNgMixerFields } from '../Services/Audio';
export type { AwtrixNgAudioGroup, AwtrixNgMixerField, AwtrixNgMixerLevels } from '../Services/Audio';
export type { AwtrixNgBasicAuthOptions } from '../Http/Transport';
export type { AwtrixNgDeviceProbeResult } from '../Discovery/Detection';

const DeviceEndpoint = '/api/v1/device';
const CapabilitiesEndpoint = '/api/v1/capabilities';
const SettingsEndpoint = '/api/v1/settings';
const AppsEndpoint = '/api/v1/apps';
const RtttlMinimumFirmwareVersion = '1.1.0';
const ButtonCallbackMinimumFirmwareVersion = '1.1.1';
const PositionedIconsMinimumFirmwareVersion = '1.1.2';
const TextAlignmentMinimumFirmwareVersion = '1.1.7';

export interface AwtrixNgConnectionOptions {
  baseUrl: string;
  auth?: AwtrixNgBasicAuthOptions;
  timeoutMs?: number;
  debug?: boolean;
  log?: AwtrixNgDebugLogger;
}

/**
 * The API surface the flow actions run against. Lives next to the facade (which implements
 * it) so `lib/awtrixng` never depends on `drivers/`; drivers/awtrixng/flow-actions.ts
 * re-exports it for backwards compatibility.
 */
export interface AwtrixNgFlowActionClient {
  sendNotification(payload: AwtrixNgApiNotificationPayload): Promise<AwtrixNgApiOkResponse>;
  dismissActiveNotification(): Promise<AwtrixNgApiOkResponse>;
  patchDisplay(patch: AwtrixNgApiDisplayPatch): Promise<AwtrixNgApiOkResponse>;
  playRtttl(rtttl: string): Promise<AwtrixNgApiOkResponse>;
  putIndicator(id: AwtrixNgIndicatorId, payload: AwtrixNgApiIndicatorPayload): Promise<AwtrixNgApiOkResponse>;
  deleteIndicator(id: AwtrixNgIndicatorId): Promise<AwtrixNgApiOkResponse>;
  putPushedApp(name: string, payload: AwtrixNgApiPushedAppPayload): Promise<AwtrixNgApiOkResponse>;
  deleteApp(name: string): Promise<AwtrixNgApiOkResponse>;
}

export interface AwtrixNgSettingsChangeResult {
  /** Values to write back into the Homey settings (device.setSettings), if any diverged. */
  homeyUpdate?: AwtrixNgHomeySettingsPatch;
}

export type AwtrixNgDetectedDeviceProbeResult = Extract<AwtrixNgDeviceProbeResult, { status: 'detected' }>;

/**
 * Facade that owns the client and the icon list and carries every device operation the
 * driver layer needs. It deliberately never imports `homey`: it returns domain results
 * (settings patches, overlay values, capability plans) and leaves all Homey writes -
 * setSettings, setCapabilityValue, i18n messages - to the device, so the whole
 * `lib/awtrixng` stays testable with a fake transport and no Homey mocks.
 */
export default class AwtrixNgApi implements AwtrixNgFlowActionClient {

  readonly baseUrl: string;

  readonly icons: AwtrixNgIcons;

  readonly #client: AwtrixNgClient;

  #firmwareVersion?: string;

  #alertPlayback?: { cancelled: boolean; startFinished: Promise<void>; cancel?: () => void };

  #stoppingAudio = false;

  #stationWrites: Promise<void> = Promise.resolve();

  /**
   * Production code constructs the facade through fromConnection(); the constructor stays
   * public only so tests can inject a client backed by a fake transport.
   */
  constructor(client: AwtrixNgClient, options: { baseUrl: string; icons: AwtrixNgIconsOptions }) {
    this.#client = client;
    this.baseUrl = options.baseUrl;
    this.icons = new AwtrixNgIcons(client, options.icons);
  }

  /** The only production construction path - encapsulates the transport and client wiring. */
  static fromConnection(options: AwtrixNgConnectionOptions, icons: AwtrixNgIconsOptions): AwtrixNgApi {
    return new AwtrixNgApi(AwtrixNgApi.createClient(options), {
      baseUrl: options.baseUrl,
      icons,
    });
  }

  /** One-off probe without holding an instance - for pairing and rediscovery in driver.ts. */
  static async probe(options: AwtrixNgConnectionOptions): Promise<AwtrixNgDeviceProbeResult> {
    return probeAwtrixNgDevice(AwtrixNgApi.createClient(options));
  }

  /** Pairing-time feature markers. Knob is an observed TC002 board feature, not a reported API field. */
  static async getPairingFeatures(
    options: AwtrixNgConnectionOptions,
    device: AwtrixNgApiDeviceStateResponse,
  ): Promise<AwtrixNgHomeyFeatureCapabilityId[]> {
    const capabilities = await AwtrixNgApi.createClient(options).getCapabilities();
    return AwtrixNgApi.featuresFromCapabilities(device, capabilities);
  }

  static supportsGroupAudioFirmware(version: string): boolean {
    return isAwtrixNgFirmwareVersionSupported(version, '1.1.6');
  }

  async readFeatures(device: AwtrixNgApiDeviceStateResponse): Promise<AwtrixNgHomeyFeatureCapabilityId[]> {
    return AwtrixNgApi.featuresFromCapabilities(device, await this.#client.getCapabilities());
  }

  private static featuresFromCapabilities(
    device: AwtrixNgApiDeviceStateResponse,
    capabilities: AwtrixNgApiCapabilitiesResponse,
  ): AwtrixNgHomeyFeatureCapabilityId[] {
    if (!isPlainObject(capabilities)) {
      throw new AwtrixNgInvalidResponseError({ endpoint: CapabilitiesEndpoint, expectedShape: 'a capabilities object', actualValue: capabilities });
    }
    const features: AwtrixNgHomeyFeatureCapabilityId[] = [];
    if (device.boardType === 'tc002') {
      AwtrixNgApi.validateTc002Capabilities(capabilities);
      features.push(AwtrixNgFeatureCapabilityIds.knob);
    }
    if (device.boardType === 'tc002' && capabilities.display?.height === 16) {
      features.push(AwtrixNgFeatureCapabilityIds.display16);
    }
    if (usesAwtrixNgSoundObjects(capabilities) ? capabilities.audio?.song === true : capabilities.audio?.synth === true) {
      features.push(AwtrixNgFeatureCapabilityIds.audioSynth);
    }
    if (capabilities.audio?.mp3 === true && capabilities.audio?.url === true && usesAwtrixNgSoundObjects(capabilities)) {
      features.push(AwtrixNgFeatureCapabilityIds.audioUrl);
    }
    if (capabilities.layouts?.version === 1) features.push(AwtrixNgFeatureCapabilityIds.layout);
    if (hasAwtrixNgGroupAudio(capabilities)) {
      features.push(AwtrixNgFeatureCapabilityIds.audioGroups, AwtrixNgFeatureCapabilityIds.audioMixer,
        AwtrixNgFeatureCapabilityIds.volume, AwtrixNgFeatureCapabilityIds.alertVolume, AwtrixNgFeatureCapabilityIds.appVolume);
      if (capabilities.audio?.radio === true) features.push(AwtrixNgFeatureCapabilityIds.audioRadio, AwtrixNgFeatureCapabilityIds.radioVolume);
      if (capabilities.audio?.clip === true) features.push(AwtrixNgFeatureCapabilityIds.audioClip);
    }
    return features;
  }

  private static validateTc002Capabilities(capabilities: unknown): asserts capabilities is AwtrixNgApiCapabilitiesResponse {
    if (!isPlainObject(capabilities)
      || !isPlainObject(capabilities.platform)
      || capabilities.platform.id !== 'tc002'
      || !isPlainObject(capabilities.display)
      || capabilities.display.width !== 52
      || capabilities.display.height !== 16) {
      throw new AwtrixNgInvalidResponseError({
        endpoint: CapabilitiesEndpoint,
        expectedShape: 'TC002 platform with a 52x16 display',
        actualValue: capabilities,
      });
    }
  }

  /**
   * Pure validation of a Homey settings change: builds and discards the settings patch and
   * validates the built-in app values. Static so device.ts can fail fast before probing a
   * candidate connection; applySettingsChange() repeats the cheap work on the live instance.
   */
  static validateSettingsChange(newSettings: AwtrixNgHomeySettings, changedKeys: readonly string[]): void {
    const remoteSettingsKeys = changedKeys.filter((key) => !isAwtrixNgBuiltinAppSetting(key));

    createAwtrixNgSettingsPatchFromChangedSettings(newSettings, remoteSettingsKeys);
    validateAwtrixNgBuiltinAppSettingsChange(newSettings, changedKeys);
  }

  private static createClient(options: AwtrixNgConnectionOptions): AwtrixNgClient {
    return new AwtrixNgClient(new FetchAwtrixNgHttpTransport({
      baseUrl: options.baseUrl,
      ...(options.auth === undefined ? {} : { auth: options.auth }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      ...(options.debug === undefined ? {} : { debug: options.debug }),
      ...(options.log === undefined ? {} : { log: options.log }),
    }));
  }

  // ---- identity / availability -------------------------------------------

  async probe(): Promise<AwtrixNgDeviceProbeResult> {
    const result = await probeAwtrixNgDevice(this.#client);

    if (result.status === 'detected') {
      this.#firmwareVersion = result.device.version;
    }

    return result;
  }

  /**
   * Probe plus uid check: throws the probe error for unreachable or auth-guarded devices,
   * an AwtrixNgInvalidResponseError for a wrong-shaped response and an
   * AwtrixNgDeviceIdentityMismatchError when the address answers as a different device.
   */
  async verifyIdentity(expectedUid: string): Promise<AwtrixNgDetectedDeviceProbeResult> {
    const result = await this.probe();

    if (result.status === 'auth-required' || result.status === 'offline') {
      throw result.error;
    }

    if (result.status === 'rejected') {
      throw new AwtrixNgInvalidResponseError({
        endpoint: DeviceEndpoint,
        expectedShape: 'a valid AWTRIX NG device state object',
        actualValue: result.rawResponse,
      });
    }

    if (result.device.uid !== expectedUid) {
      throw new AwtrixNgDeviceIdentityMismatchError(expectedUid, result.device.uid);
    }

    return result;
  }

  // ---- state reads (sync into Homey) ---------------------------------------

  async getDeviceState(): Promise<AwtrixNgApiDeviceStateResponse> {
    const state = await this.#client.getDevice();
    this.#firmwareVersion = state.version;
    return state;
  }

  /** Selects bundled icon artwork from the verified device and its reported panel size. */
  async getBundledIconSize(expectedUid: string): Promise<8 | 16> {
    const result = await this.verifyIdentity(expectedUid);

    // Observed on TC002 beta 1.1.5: boardType is "tc002" (older docs only show "awtrixng").
    if (result.device.boardType !== 'tc002') {
      return 8;
    }

    const capabilities = await this.#client.getCapabilities();

    AwtrixNgApi.validateTc002Capabilities(capabilities);

    return 16;
  }

  /** Returns the Homey settings update derived from the device settings, or undefined when in sync. */
  async readSettings(current: AwtrixNgHomeySettings): Promise<AwtrixNgHomeySettingsPatch | undefined> {
    const apiSettings = await this.#client.getSettings();

    if (!isPlainObject(apiSettings)) {
      throw new AwtrixNgInvalidResponseError({
        endpoint: SettingsEndpoint,
        expectedShape: 'a plain object',
        actualValue: apiSettings,
      });
    }

    const update = toAwtrixNgHomeySettingsUpdate(apiSettings, current);

    return Object.keys(update).length > 0 ? update : undefined;
  }

  async readWeatherOverlay(): Promise<AwtrixNgWeatherOverlayValue> {
    const display = await this.#client.getDisplay();

    return toAwtrixNgHomeyWeatherOverlayValue(display.overlay);
  }

  async readButtonCallback(): Promise<string> {
    return readAwtrixNgButtonCallback(this.#client);
  }

  /** Enabling needs JSON callback support; read and cleanup stay available on older firmware. */
  requireButtonCallbackSupport(): void {
    this.#requireFirmwareVersion(ButtonCallbackMinimumFirmwareVersion);
  }

  async writeButtonCallback(url: string): Promise<void> {
    if (url !== '') {
      this.requireButtonCallbackSupport();
    }
    await writeAwtrixNgButtonCallback(this.#client, url);
  }

  /** Returns the built-in app settings update derived from the app inventory, or undefined when in sync. */
  async readBuiltinAppSettings(current: AwtrixNgHomeySettings): Promise<AwtrixNgBuiltinAppSettings | undefined> {
    const apps = await this.#client.getApps();

    if (!Array.isArray(apps)) {
      throw new AwtrixNgInvalidResponseError({
        endpoint: AppsEndpoint,
        expectedShape: 'an array',
        actualValue: apps,
      });
    }

    const update = toAwtrixNgBuiltinAppSettingsUpdate(apps, current);

    return Object.keys(update).length > 0 ? update : undefined;
  }

  /**
   * Reapplies Homey's complete built-in app preference after a firmware change.
   * The apps inventory is read first so the Apps service can preserve every non-built-in
   * app, its order and its disabled state while replacing only the five managed entries.
   */
  async reapplyBuiltinAppSettings(
    settings: AwtrixNgHomeySettings,
  ): Promise<AwtrixNgBuiltinAppSettingsApplyResult> {
    return applyAwtrixNgBuiltinAppSettingsChange(
      this.#client,
      settings,
      AwtrixNgBuiltinAppSettingIds,
    );
  }

  planCapabilityUpdate(
    state: AwtrixNgApiDeviceStateResponse,
    existingCapabilities: readonly string[],
    options: { allowAddCapabilities: boolean },
  ): AwtrixNgCapabilityUpdatePlan {
    return createAwtrixNgCapabilityUpdatePlan(state, existingCapabilities, options);
  }

  // ---- settings writes ------------------------------------------------------

  /**
   * Consolidates the settings-change pipeline: build the settings patch, validate the
   * built-in app change, prepare the apps-order payload and write both. The order matters
   * and mirrors the pre-facade device code; the writes are sequential and fail-fast because
   * these endpoints offer no transaction - if the second write fails the first may already
   * be applied and the next save reconciles the state.
   * Throws AwtrixNgBuiltinAppUnavailableError before anything is written.
   */
  async applySettingsChange(
    newSettings: AwtrixNgHomeySettings,
    changedKeys: readonly string[],
  ): Promise<AwtrixNgSettingsChangeResult> {
    const remoteSettingsKeys = changedKeys.filter((key) => !isAwtrixNgBuiltinAppSetting(key));
    const settingsPatch = createAwtrixNgSettingsPatchFromChangedSettings(newSettings, remoteSettingsKeys);

    validateAwtrixNgBuiltinAppSettingsChange(newSettings, changedKeys);

    if (settingsPatch?.autoBrightness !== undefined) {
      const caps = await this.#client.getCapabilities();
      if (!isPlainObject(caps)) {
        throw new AwtrixNgInvalidResponseError({ endpoint: CapabilitiesEndpoint, expectedShape: 'a capabilities object', actualValue: caps });
      }
      if (caps.sensors?.light === false || caps.platform?.id === 'tc002') {
        throw new UnsupportedAwtrixNgPayloadFieldError({
          field: 'autoBrightness', target: 'settings', reason: 'unsupported-field', details: 'This device has no light sensor; automatic brightness has no effect.',
        });
      }
    }

    const appsOrderPayload = await prepareAwtrixNgBuiltinAppSettingsChange(this.#client, newSettings, changedKeys);

    if (appsOrderPayload !== undefined) {
      await writeAwtrixNgAppsOrder(this.#client, appsOrderPayload);
    }

    if (settingsPatch === undefined) {
      return {};
    }

    const apiSettings = await writeAwtrixNgSettingsPatch(this.#client, settingsPatch);

    if (!isPlainObject(apiSettings)) {
      return {};
    }

    const homeyUpdate = toAwtrixNgHomeySettingsUpdate(apiSettings, newSettings);

    return Object.keys(homeyUpdate).length > 0 ? { homeyUpdate } : {};
  }

  // ---- control capabilities -------------------------------------------------

  /** Values arrive as unknown from the capability listeners; validation stays in lib. */
  async setMatrixPower(value: unknown): Promise<void> {
    await runAwtrixNgMatrixPowerCapability(this.#client, value);
  }

  /** Homey's normalized dim value maps to the documented 0..255 panel brightness. */
  async setBrightness(value: number): Promise<{ brightness: number; autoBrightness: boolean }> {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new TypeError('Brightness must be a number between 0 and 1.');
    }
    const settings = await this.#client.getSettings();
    if (!isPlainObject(settings) || typeof settings.autoBrightness !== 'boolean') {
      throw new AwtrixNgInvalidResponseError({ endpoint: SettingsEndpoint, expectedShape: 'settings with an autoBrightness boolean', actualValue: settings });
    }
    let disableAutomatic = settings.autoBrightness;
    if (disableAutomatic) {
      const caps = await this.readAudioCapabilities();
      disableAutomatic = caps.sensors?.light !== false && caps.platform?.id !== 'tc002';
    }
    const result = await this.#client.patchSettings({
      brightness: Math.round(value * 255), ...(disableAutomatic ? { autoBrightness: false } : {}),
    });
    if (!isPlainObject(result) || !Number.isInteger(result.brightness) || result.brightness < 0 || result.brightness > 255
      || typeof result.autoBrightness !== 'boolean') {
      throw new AwtrixNgInvalidResponseError({ endpoint: SettingsEndpoint, expectedShape: 'settings with brightness 0..255 and autoBrightness', actualValue: result });
    }
    return { brightness: result.brightness / 255, autoBrightness: result.autoBrightness };
  }

  async nextApp(): Promise<void> {
    await runAwtrixNgNextAppCapability(this.#client);
  }

  async previousApp(): Promise<void> {
    await runAwtrixNgPreviousAppCapability(this.#client);
  }

  async setWeatherOverlay(value: unknown): Promise<void> {
    await runAwtrixNgWeatherOverlayCapability(this.#client, value);
  }

  // ---- AwtrixNgFlowActionClient (delegation to the client) --------------------

  async sendNotification(payload: AwtrixNgApiNotificationPayload): Promise<AwtrixNgApiOkResponse> {
    if (needsAwtrixNgPageCapabilities(payload)) {
      toAwtrixNgNotificationPayload(payload as AwtrixNgNotificationInput);
      await this.validatePageCapabilities(payload, 'notification');
    }
    const page = await this.prepareTextAlignment(payload, 'notification');
    if (page.sound === undefined && page.soundRtttl === undefined && page.soundLoop === undefined) {
      return this.#client.sendNotification(page);
    }
    const capabilities = await this.readAudioCapabilities();
    if (usesAwtrixNgSoundObjects(capabilities)) {
      const prepared = toAwtrixNgSoundObjectNotification(page);
      const field = prepared.sound === undefined ? undefined : findAwtrixNgUnsupportedSoundSource(prepared.sound as Exclude<typeof prepared.sound, number | undefined>, capabilities);
      if (field !== undefined) {
        throw new UnsupportedAwtrixNgPayloadFieldError({
          field: `sound.${field}`, target: 'notification', reason: 'unsupported-field', details: 'This device does not advertise the required audio output.',
        });
      }
      return this.#client.sendNotification(prepared);
    }
    if (typeof page.sound === 'object') {
      throw new Error('Sound objects and lists require the new AWTRIX NG audio API.');
    }
    return this.#client.sendNotification(page);
  }

  dismissActiveNotification(): Promise<AwtrixNgApiOkResponse> {
    return this.#client.dismissActiveNotification();
  }

  patchDisplay(patch: AwtrixNgApiDisplayPatch): Promise<AwtrixNgApiOkResponse> {
    return this.#client.patchDisplay(patch);
  }

  async playRtttl(rtttl: string): Promise<AwtrixNgApiOkResponse> {
    this.#requireFirmwareVersion(RtttlMinimumFirmwareVersion);
    return this.#client.playRtttl(rtttl);
  }

  playSynthFx(fx: string): Promise<AwtrixNgApiOkResponse> {
    if (typeof fx !== 'string' || fx.trim().length === 0) {
      throw new TypeError('AWTRIX NG synth effect must be a non-empty string.');
    }
    return this.playSynthSound(fx);
  }

  private async playSynthSound(song: string): Promise<AwtrixNgApiOkResponse> {
    const capabilities = await this.readAudioCapabilities();
    if (usesAwtrixNgSoundObjects(capabilities)) {
      if (capabilities.audio?.song !== true) throw new Error('This AWTRIX NG device has no synthesizer.');
      return this.#client.playSound({ song });
    }
    if (capabilities.audio?.synth !== true) throw new Error('This AWTRIX NG device has no synthesizer.');
    return this.#client.playSynthFx(song);
  }

  /** Resolves only after a finite URL sound finishes, including asynchronous download errors. */
  async playMp3Url(value: string): Promise<void> {
    const url = validateAwtrixNgMp3Url(value);
    if (this.#alertPlayback !== undefined || this.#stoppingAudio) throw new Error('An alert action is already running or stopping on this device. Stop it before starting another.');
    let finishStart!: () => void;
    const playback = {
      cancelled: false,
      startFinished: new Promise<void>((resolve) => {
        finishStart = resolve;
      }),
    };
    this.#alertPlayback = playback;
    try {
      await this.requireUrlAudio();
      if (playback.cancelled) throw new Error('MP3 playback was cancelled.');
      await this.#client.playSound({ file: url });
      finishStart();
      await waitForAwtrixNgUrlSound(this.#client, url);
      if (playback.cancelled) throw new Error('MP3 playback was cancelled.');
    } catch (error) {
      if (error instanceof AwtrixNgAudioPlaybackError && error.timedOut) {
        const state = await this.#client.getAudio();
        if (state.alert?.playing && state.alert.name === url) {
          await this.#client.stopAlert();
        }
      }
      throw error;
    } finally {
      finishStart();
      this.#alertPlayback = undefined;
    }
  }

  async stopUrlSound(): Promise<void> {
    await this.stopAudioGroup('alert');
  }

  async stopAudioGroup(group: AwtrixNgAudioGroup): Promise<void> {
    if (!['alert', 'app', 'radio', 'all'].includes(group)) throw new TypeError('Unknown audio group.');
    const caps = await this.requireGroupAudio();
    if (group === 'radio' && caps.audio?.radio !== true) throw new Error('This AWTRIX NG device has no internet radio.');
    if (group === 'app' || group === 'radio') {
      await this.#client.stopAudio(group);
      return;
    }
    if (this.#stoppingAudio) throw new Error('An alert stop is already running.');
    this.#stoppingAudio = true;
    try {
      const playback = this.#alertPlayback;
      if (playback !== undefined) {
        playback.cancelled = true;
        playback.cancel?.();
      }
      await playback?.startFinished;
      await this.#client.stopAudio(group);
    } finally {
      this.#stoppingAudio = false;
    }
  }

  private async requireGroupAudio(): Promise<AwtrixNgApiCapabilitiesResponse> {
    const caps = await this.readAudioCapabilities();
    if (!hasAwtrixNgGroupAudio(caps)) throw new Error('This AWTRIX NG device does not support the audio group API.');
    return caps;
  }

  async readMixer(): Promise<AwtrixNgMixerLevels> {
    await this.requireGroupAudio();
    return readAwtrixNgMixerLevels(await this.#client.getSettings());
  }

  async setMixerLevel(field: AwtrixNgMixerField, value: number): Promise<AwtrixNgMixerLevels> {
    assertAwtrixNgMixerLevel(field, value);
    const caps = await this.requireGroupAudio();
    if (field === 'radioVolume' && caps.audio?.radio !== true) throw new Error('This AWTRIX NG device has no internet radio.');
    // Read first: the capability schema identifies the new protocol; the settings confirm its mixer.
    readAwtrixNgMixerLevels(await this.#client.getSettings());
    return readAwtrixNgMixerLevels(await this.#client.patchSettings({ [field]: value }));
  }

  private async requireRadio(): Promise<void> {
    const caps = await this.requireGroupAudio();
    if (caps.audio?.radio !== true) throw new Error('This AWTRIX NG device has no internet radio.');
  }

  async readRadioStations(): Promise<AwtrixNgRadioStation[]> {
    await this.requireRadio();
    return readAwtrixNgRadioStations(await this.#client.getAudio());
  }

  async playRadio(value: string | number): Promise<void> {
    const station = validateAwtrixNgStation(value);
    await this.requireRadio();
    await this.#client.playSound({ station });
    const state = await this.#client.getAudio();
    if (!isPlainObject(state.radio) || typeof state.radio.error !== 'string') {
      throw new AwtrixNgInvalidResponseError({ endpoint: '/api/v1/audio', expectedShape: 'a radio group with an error string', actualValue: state });
    }
    if (state.radio.error) throw new AwtrixNgAudioPlaybackError(state.radio.error, false, 'radio.error');
  }

  async playRadioUrl(value: string): Promise<void> {
    await this.playRadio(validateAwtrixNgMp3Url(value));
  }

  async saveRadioStation(name: string, value: string): Promise<void> {
    if (typeof name !== 'string' || name.trim().length === 0 || Buffer.byteLength(name) > 24) throw new TypeError('Station name must contain 1..24 bytes.');
    const url = validateAwtrixNgMp3Url(value);
    if (Buffer.byteLength(url) > 255) throw new TypeError('Station URL must contain at most 255 bytes.');
    const write = this.#stationWrites.then(async () => {
      const stations = await this.readRadioStations();
      const index = stations.findIndex((station) => station.name === name);
      if (index >= 0) stations[index] = { name, url };
      else stations.push({ name, url });
      if (stations.length > 32) throw new RangeError('At most 32 radio stations can be saved.');
      await this.#client.putRadioStations(stations);
    });
    this.#stationWrites = write.then(() => undefined, () => undefined);
    await write;
  }

  async playAudioClipUrl(value: string): Promise<void> {
    await this.startAudioClip((signal) => downloadAwtrixNgClip(value, signal));
  }

  async playAudioClip(body: Uint8Array): Promise<void> {
    assertAwtrixNgClip(body);
    await this.startAudioClip(async () => body);
  }

  private async startAudioClip(readBody: (signal: AbortSignal) => Promise<Uint8Array>): Promise<void> {
    if (this.#alertPlayback !== undefined || this.#stoppingAudio) throw new Error('An alert is already running or stopping.');
    let finishStart!: () => void;
    const controller = new AbortController();
    const playback = {
      cancelled: false,
      cancel: () => controller.abort(new Error('Audio clip was cancelled.')),
      startFinished: new Promise<void>((resolve) => {
        finishStart = resolve;
      }),
    };
    this.#alertPlayback = playback;
    try {
      await this.requireClip();
      if (playback.cancelled) throw new Error('Audio clip was cancelled.');
      const body = await readBody(controller.signal);
      assertAwtrixNgClip(body);
      if (playback.cancelled) throw new Error('Audio clip was cancelled.');
      await this.#client.playClip(body);
    } finally {
      finishStart();
      this.#alertPlayback = undefined;
    }
  }

  private async requireClip(): Promise<void> {
    const caps = await this.requireGroupAudio();
    if (caps.audio?.clip !== true) throw new Error('This AWTRIX NG device does not support transient audio clips.');
  }

  private async requireUrlAudio(): Promise<void> {
    const capabilities = await this.readAudioCapabilities();
    if (capabilities.audio?.mp3 !== true || capabilities.audio?.url !== true || !usesAwtrixNgSoundObjects(capabilities)) {
      throw new Error('This AWTRIX NG device does not support native MP3 URL playback.');
    }
  }

  private async readAudioCapabilities(): Promise<AwtrixNgApiCapabilitiesResponse> {
    const capabilities = await this.#client.getCapabilities();
    if (!isPlainObject(capabilities) || (capabilities.audio !== undefined && !isPlainObject(capabilities.audio))) {
      throw new AwtrixNgInvalidResponseError({ endpoint: CapabilitiesEndpoint, expectedShape: 'a capabilities object with optional audio flags', actualValue: capabilities });
    }
    return capabilities;
  }

  putIndicator(id: AwtrixNgIndicatorId, payload: AwtrixNgApiIndicatorPayload): Promise<AwtrixNgApiOkResponse> {
    return this.#client.putIndicator(id, payload);
  }

  deleteIndicator(id: AwtrixNgIndicatorId): Promise<AwtrixNgApiOkResponse> {
    return this.#client.deleteIndicator(id);
  }

  async putPushedApp(name: string, payload: AwtrixNgApiPushedAppPayload): Promise<AwtrixNgApiOkResponse> {
    if (needsAwtrixNgPageCapabilities(payload)) {
      toAwtrixNgPushedAppPayload(payload as AwtrixNgPushedAppInput);
      await this.validatePageCapabilities(payload, 'pushedApp');
    }
    return this.#client.putPushedApp(name, await this.prepareTextAlignment(payload, 'pushedApp'));
  }

  /** Documented compatibility adapter: legacy centering stays native before 1.1.7. */
  private async prepareTextAlignment<T extends AwtrixNgApiNotificationPayload | AwtrixNgApiPushedAppPayload>(
    page: T,
    target: 'notification' | 'pushedApp',
  ): Promise<T> {
    if (page.textAlign === undefined && page.textCenter === undefined) return page;
    if (target === 'notification') toAwtrixNgNotificationPayload(page as AwtrixNgNotificationInput);
    else toAwtrixNgPushedAppPayload(page as AwtrixNgPushedAppInput);
    const version = await this.readPageFirmwareVersion();
    if (!isAwtrixNgFirmwareVersionSupported(version, TextAlignmentMinimumFirmwareVersion)) {
      if (page.textAlign !== undefined) {
        throw new UnsupportedAwtrixNgPayloadFieldError({
          field: 'textAlign', target, reason: 'unsupported-field', details: 'Requires AWTRIX NG 1.1.7 or newer.',
        });
      }
      return page;
    }
    if (page.textCenter === undefined) return page;
    const { textCenter, ...rest } = page;
    return { ...rest, textAlign: textCenter ? 'center' : 'start' } as T;
  }

  private async readPageFirmwareVersion(): Promise<string> {
    const version = this.#firmwareVersion ?? (await this.#client.getVersion()).version;
    if (typeof version !== 'string' || !isAwtrixNgFirmwareVersionSupported(version, '0.0.0')) {
      throw new AwtrixNgInvalidResponseError({ endpoint: '/api/v1/version', expectedShape: 'a semantic firmware version', actualValue: version });
    }
    return version;
  }

  private async validatePageCapabilities(
    page: AwtrixNgApiNotificationPayload | AwtrixNgApiPushedAppPayload,
    target: 'notification' | 'pushedApp',
  ): Promise<void> {
    const caps = await this.readAudioCapabilities();
    if (page.layout !== undefined) assertAwtrixNgLayoutCapabilities(page.layout, caps, target);
    let extended = false;
    if (page.icons !== undefined || page.iconGap !== undefined) {
      const version = await this.readPageFirmwareVersion();
      extended = isAwtrixNgFirmwareVersionSupported(version, PositionedIconsMinimumFirmwareVersion);
    }
    assertAwtrixNgPageCapabilities(page, caps, extended, target);
  }

  async sendHeaderNotification(input: AwtrixNgHeaderLayoutInput): Promise<void> {
    await this.sendNotification(createAwtrixNgHeaderLayout(input));
  }

  async putHeaderApp(name: string, input: AwtrixNgHeaderLayoutInput): Promise<void> {
    await this.putPushedApp(toAwtrixNgHomeyPushedAppName(name), createAwtrixNgHeaderLayout(input));
  }

  async readSelectableScripts(): Promise<AwtrixNgApiAppInventoryItem[]> {
    const device = await this.#client.getDevice();
    if (!isPlainObject(device) || typeof device.scriptingRunning !== 'boolean') {
      throw new AwtrixNgInvalidResponseError({ endpoint: DeviceEndpoint, expectedShape: 'a scriptingRunning boolean', actualValue: device });
    }
    if (!device.scriptingRunning) throw new Error('Scripting is disabled on this AWTRIX NG device.');
    return getAwtrixNgSelectableScripts(await this.#client.getApps());
  }

  async showScript(name: string): Promise<void> {
    if (typeof name !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(name)) throw new TypeError('Invalid script name.');
    const scripts = await this.readSelectableScripts();
    if (!scripts.some((script) => script.name === name)) throw new Error(`Script ${name} is unavailable, disabled, incompatible or has an error.`);
    await this.#client.showApp(name, true);
  }

  deleteApp(name: string): Promise<AwtrixNgApiOkResponse> {
    return this.#client.deleteApp(name);
  }

  #requireFirmwareVersion(minimumVersion: string): void {
    if (
      this.#firmwareVersion === undefined
      || !isAwtrixNgFirmwareVersionSupported(this.#firmwareVersion, minimumVersion)
    ) {
      throw new AwtrixNgUnsupportedVersionError({
        currentVersion: this.#firmwareVersion,
        minimumVersion,
      });
    }
  }

}
