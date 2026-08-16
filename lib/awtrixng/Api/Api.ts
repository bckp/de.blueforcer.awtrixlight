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
} from '../Services/Apps';
import { AwtrixNgWeatherOverlayValue, toAwtrixNgHomeyWeatherOverlayValue } from '../Services/Display';
import {
  runAwtrixNgMatrixPowerCapability,
  runAwtrixNgNextAppCapability,
  runAwtrixNgPreviousAppCapability,
  runAwtrixNgWeatherOverlayCapability,
} from '../Device/Controls';
import { AwtrixNgCapabilityUpdatePlan, createAwtrixNgCapabilityUpdatePlan } from '../Device/State';
import AwtrixNgIcons, { AwtrixNgIconsOptions } from '../Services/Icons';
import { isPlainObject } from '../Support/Guards';
import isAwtrixNgFirmwareVersionSupported from './FirmwareVersion';
import { AwtrixNgUnsupportedVersionError } from './UnsupportedVersionError';
import {
  AwtrixNgApiDeviceStateResponse,
  AwtrixNgApiDisplayPatch,
  AwtrixNgApiIndicatorPayload,
  AwtrixNgApiNotificationPayload,
  AwtrixNgApiOkResponse,
  AwtrixNgApiPushedAppPayload,
} from './Types';

// Re-exported facade surface: device.ts consumes these alongside AwtrixNgApi so it does
// not have to import the individual lib modules the facade already wraps.
export { AwtrixNgDeviceIdentityMismatchError } from './IdentityMismatchError';
export { AwtrixNgUnsupportedVersionError } from './UnsupportedVersionError';
export { formatAwtrixNgErrorDetails } from '../Device/Availability';
export { AwtrixNgWeatherOverlayCapabilityId } from '../Services/Display';
export type { AwtrixNgBasicAuthOptions } from '../Http/Transport';
export type { AwtrixNgDeviceProbeResult } from '../Discovery/Detection';

const DeviceEndpoint = '/api/v1/device';
const SettingsEndpoint = '/api/v1/settings';
const AppsEndpoint = '/api/v1/apps';
const RtttlMinimumFirmwareVersion = '1.1.0';

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

  sendNotification(payload: AwtrixNgApiNotificationPayload): Promise<AwtrixNgApiOkResponse> {
    return this.#client.sendNotification(payload);
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

  putIndicator(id: AwtrixNgIndicatorId, payload: AwtrixNgApiIndicatorPayload): Promise<AwtrixNgApiOkResponse> {
    return this.#client.putIndicator(id, payload);
  }

  deleteIndicator(id: AwtrixNgIndicatorId): Promise<AwtrixNgApiOkResponse> {
    return this.#client.deleteIndicator(id);
  }

  putPushedApp(name: string, payload: AwtrixNgApiPushedAppPayload): Promise<AwtrixNgApiOkResponse> {
    return this.#client.putPushedApp(name, payload);
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
