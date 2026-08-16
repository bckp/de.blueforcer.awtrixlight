import fs from 'fs';
import { Device, DiscoveryResultMDNSSD } from 'homey';
import path from 'path';
import AwtrixNgApi, {
  AwtrixNgBasicAuthOptions,
  AwtrixNgDeviceProbeResult,
  AwtrixNgWeatherOverlayCapabilityId,
  formatAwtrixNgErrorDetails,
} from '../../lib/awtrixng/Api/Api';
import Poll from '../../lib/shared/Poll';
import { toAwtrixNgBaseUrl } from '../../lib/awtrixng/Discovery/Detection';
import { AwtrixNgHomeySettings, hasAwtrixNgLocalSettingsChange } from '../../lib/awtrixng/Services/Settings';
import runWithConcurrencyLimit from '../../lib/shared/Concurrency';
import { toValidTcpPort } from '../../lib/awtrixng/Support/Guards';
import { AwtrixDeviceType } from '../awtrix-device-type';

const PollIntervalMs = 60000;
const BundledIconsDirectory = path.join(__dirname, 'assets/images/icons');
const MaxConcurrentIconUploads = 3;
const RedactedSettingValue = '<redacted>';
const BuiltinAppsInitializedStoreKey = 'builtinAppsInitialized';
const BuiltinAppsFirmwareVersionStoreKey = 'builtinAppsFirmwareVersion';
const FirmwareVersionStoreKey = 'version';

// Hard-failing wrapper: the connection cannot be built without a usable port.
const toConnectionPort = (value: unknown): number => {
  const port = toValidTcpPort(value);

  if (port === undefined) {
    throw new RangeError('AWTRIX NG connection requires a valid TCP port.');
  }

  return port;
};

interface AwtrixNgDeviceStore {
  baseUrl?: string;
  address?: string;
  port?: number;
  version?: string;
  builtinAppsFirmwareVersion?: string;
  builtinAppsInitialized?: boolean;
}

interface AwtrixNgDeviceSettings extends AwtrixNgHomeySettings {
  address?: string;
  port?: number;
  authUser?: string;
  authPass?: string;
}

interface AwtrixNgDeviceSettingsChange {
  oldSettings: AwtrixNgHomeySettings;
  newSettings: AwtrixNgHomeySettings;
  changedKeys: string[];
}

interface AwtrixNgConnectionCandidate {
  address: string;
  port: number;
  baseUrl: string;
  auth?: AwtrixNgBasicAuthOptions;
}

interface AwtrixNgSettingsConnectionCandidate {
  connection: AwtrixNgConnectionCandidate;
  /**
   * True when the address did not come from the Homey settings and has to be written back
   * into them after the change was committed.
   */
  syncAddressIntoSettings: boolean;
}

const redactSettingsForLog = (settings: Record<string, unknown>): Record<string, unknown> => ({
  ...settings,
  ...(typeof settings.authUser === 'string' && settings.authUser.length > 0
    ? { authUser: RedactedSettingValue }
    : {}),
  ...(typeof settings.authPass === 'string' && settings.authPass.length > 0
    ? { authPass: RedactedSettingValue }
    : {}),
});

class AwtrixNgDevice extends Device {

  api?: AwtrixNgApi;

  poll?: Poll;

  /** Resolves once the deferred Homey settings sync scheduled by onSettings() has finished. */
  pendingSettingsSync?: Promise<void>;

  /** Serializes Homey settings writes and firmware-triggered app-order reconciliation. */
  private builtinAppsOperation: Promise<void> = Promise.resolve();

  /** Latest Homey snapshot, including a settings submission that has not been persisted yet. */
  private homeySettingsSnapshot?: AwtrixNgHomeySettings;

  /**
   * The flow actions (drivers/awtrixng/flow-actions.ts) reach the API through `client`
   * and the shared icon autocomplete (drivers/shared-flow-actions.ts) through `icons`;
   * both are read-only views of the facade.
   */
  get client(): AwtrixNgApi | undefined {
    return this.api;
  }

  get icons(): AwtrixNgApi['icons'] | undefined {
    return this.api?.icons;
  }

  getAwtrixDeviceType(): AwtrixDeviceType {
    return 'awtrixng';
  }

  async onInit(): Promise<void> {
    this.log('AwtrixNgDevice has been initialized');
    this.initCapabilityListeners();
    const poll = this.initializePoll();

    const baseUrl = this.getBaseUrlFromStore();

    if (baseUrl === undefined) {
      await this.setUnavailable(this.getConnectionNotConfiguredMessage());
      return;
    }

    const initialSettings = await this.getSettings() as AwtrixNgDeviceSettings;
    this.homeySettingsSnapshot = initialSettings;
    this.configureApi(baseUrl, initialSettings);

    try {
      const deviceStateResult = await this.refreshDeviceState({ allowAddCapabilities: true });

      if (deviceStateResult?.status === 'detected') {
        await this.refreshSettingsFromDevice();
        await this.refreshDisplayFromDevice();
        await this.synchronizeBuiltinAppsForFirmware(deviceStateResult.device.version, true, true);
      }
    } catch (error: unknown) {
      this.error(error);
      await this.setUnavailable(
        `${this.homey.__('states.awtrixNg.initialSynchronizationFailed')}: ${formatAwtrixNgErrorDetails(error)}`,
      );
    } finally {
      poll.start();
    }
  }

  async onAdded(): Promise<void> {
    this.log('AwtrixNgDevice has been added');
    await this.uploadBundledIcons();
  }

  async onDeleted(): Promise<void> {
    this.log('AwtrixNgDevice has been deleted');
    this.poll?.stop();
    this.icons?.invalidate();
  }

  onDiscoveryResult(discoveryResult: DiscoveryResultMDNSSD): boolean {
    return discoveryResult.id === this.getData().id;
  }

  // Homey ignores the resolved value of the discovery hooks but reports rejections as unhandled,
  // so failures are logged and reported as "not reconnected" - parity with the AWTRIX 3 driver.
  // An AwtrixNgDeviceIdentityMismatchError ends up here too, which is worth logging: it means the
  // discovered address now belongs to a different device (recycled IP address).
  async onDiscoveryAddressChanged(discoveryResult: DiscoveryResultMDNSSD): Promise<boolean> {
    try {
      return await this.commitDiscoveredConnection(discoveryResult);
    } catch (error: unknown) {
      this.error(error);
      return false;
    }
  }

  async onDiscoveryAvailable(discoveryResult: DiscoveryResultMDNSSD): Promise<boolean> {
    if (this.getAvailable()) {
      return false;
    }

    try {
      return await this.commitDiscoveredConnection(discoveryResult);
    } catch (error: unknown) {
      this.error(error);
      return false;
    }
  }

  async onSettings({ oldSettings, newSettings, changedKeys }: AwtrixNgDeviceSettingsChange): Promise<void> {
    this.log(
      'AwtrixNgDevice settings were changed',
      redactSettingsForLog(oldSettings),
      redactSettingsForLog(newSettings),
      changedKeys,
    );

    // Pure validation first: an invalid key or value must fail before any request is made.
    AwtrixNgApi.validateSettingsChange(newSettings, changedKeys);
    const previousSettingsSnapshot = this.homeySettingsSnapshot;
    this.homeySettingsSnapshot = {
      ...(previousSettingsSnapshot ?? oldSettings),
      ...newSettings,
    };

    try {
      if (hasAwtrixNgLocalSettingsChange(changedKeys)) {
        await this.applySettingsChangesWithCandidateConnection(newSettings as AwtrixNgDeviceSettings, changedKeys);
        return;
      }

      await this.runBuiltinAppsOperation(async () => {
        await this.getApi().applySettingsChange(newSettings, changedKeys);
      });
    } catch (error: unknown) {
      this.homeySettingsSnapshot = previousSettingsSnapshot;
      throw error;
    }
  }

  /**
   * Read-only availability probe: refreshes the device state without ever adding capabilities.
   *
   * Kept even though no production code calls it (H5): it is the public, side-effect-free entry
   * point the availability tests drive, which keeps them off the private refreshDeviceState().
   */
  async refreshAvailability(): Promise<AwtrixNgDeviceProbeResult | undefined> {
    return this.refreshDeviceState({ allowAddCapabilities: false });
  }

  private initCapabilityListeners(): void {
    this.registerCapabilityListener('awtrix_matrix', async (value: unknown): Promise<void> => {
      await this.getApi().setMatrixPower(value);
    });

    this.registerCapabilityListener('button_next', async (): Promise<void> => {
      await this.getApi().nextApp();
    });

    this.registerCapabilityListener('button_prev', async (): Promise<void> => {
      await this.getApi().previousApp();
    });

    this.registerCapabilityListener(AwtrixNgWeatherOverlayCapabilityId, async (value: unknown): Promise<void> => {
      await this.getApi().setWeatherOverlay(value);
    });

    this.registerCapabilityListener('button.rediscover', async (): Promise<void> => {
      this.log('Rediscover button pressed');

      if (!await this.tryRediscover()) {
        throw new Error(this.homey.__('states.awtrixNg.rediscoveryFailed'));
      }
    });
  }

  /**
   * Manual counterpart to the automatic mDNS hooks: looks up the current discovery result
   * and commits it. This is the supported way to point the device at a new address, which
   * is why clearing the address setting does not need to double as a rediscovery trigger.
   */
  private async tryRediscover(): Promise<boolean> {
    const discoveryResult = this.getDiscoveryResultForDevice();

    if (discoveryResult === undefined) {
      this.log('No discovery result available for this device');
      return false;
    }

    try {
      return await this.commitDiscoveredConnection(discoveryResult);
    } catch (error: unknown) {
      this.error(error);
      return false;
    }
  }

  private getDiscoveryResultForDevice(): DiscoveryResultMDNSSD | undefined {
    try {
      const result = this.driver.getDiscoveryStrategy().getDiscoveryResult(this.getData().id as string);

      if (result instanceof DiscoveryResultMDNSSD && typeof result.address === 'string' && result.address.length > 0) {
        return result;
      }
    } catch (error: unknown) {
      this.error(error);
    }

    return undefined;
  }

  private initializePoll(): Poll {
    const poll = new Poll(async () => {
      const result = await this.refreshDeviceState({ allowAddCapabilities: false });

      if (result?.status === 'detected') {
        await this.synchronizeBuiltinAppsForFirmware(result.device.version, false, true);
      }
    }, this.homey, {
      intervalMs: PollIntervalMs,
      onError: (error: unknown) => this.error(error),
    });

    this.poll = poll;

    return poll;
  }

  private getApi(): AwtrixNgApi {
    if (this.api === undefined) {
      throw new Error(this.getConnectionNotConfiguredMessage());
    }

    return this.api;
  }

  async refreshDeviceState(options: { allowAddCapabilities: boolean }): Promise<AwtrixNgDeviceProbeResult | undefined> {
    const result = await this.getApi().probe();

    if (result.status === 'detected') {
      await this.applyDeviceState(result.device, options.allowAddCapabilities);
      await this.setAvailable();
      return result;
    }

    await this.setUnavailable(this.getUnavailableMessage(result));

    return result;
  }

  private async refreshSettingsFromDevice(): Promise<void> {
    const currentSettings = await this.getSettings() as AwtrixNgHomeySettings;
    const homeySettingsUpdate = await this.getApi().readSettings(currentSettings);

    if (homeySettingsUpdate !== undefined) {
      await this.setSettings(homeySettingsUpdate);
    }
  }

  private async refreshDisplayFromDevice(): Promise<void> {
    const weatherOverlay = await this.getApi().readWeatherOverlay();

    if (this.hasCapability(AwtrixNgWeatherOverlayCapabilityId)) {
      await this.setCapabilityValue(AwtrixNgWeatherOverlayCapabilityId, weatherOverlay);
    }
  }

  private async refreshAppsFromDevice(): Promise<void> {
    const currentSettings = await this.getSettings() as AwtrixNgHomeySettings;
    const homeySettingsUpdate = await this.getApi().readBuiltinAppSettings(currentSettings);

    if (homeySettingsUpdate !== undefined) {
      await this.setSettings(homeySettingsUpdate);
      this.homeySettingsSnapshot = {
        ...currentSettings,
        ...homeySettingsUpdate,
      };
      return;
    }

    this.homeySettingsSnapshot = currentSettings;
  }

  /**
   * Keeps the normal device-to-Homey sync direction until a firmware version change is
   * observed. On that one transition Homey's persisted built-in app settings are reapplied
   * before the new version is committed, so a failed write is retried by the next poll.
   */
  private async synchronizeBuiltinAppsForFirmware(
    detectedVersion: string,
    syncFromDeviceWhenUnchanged: boolean,
    initializeBaseline: boolean,
  ): Promise<void> {
    await this.runBuiltinAppsOperation(async () => {
      const store = this.getStoreSnapshot();
      const lastAppliedVersion = store.builtinAppsFirmwareVersion ?? store.version;
      const isNewPairingBaseline = store.builtinAppsInitialized === false;
      const isLegacyBaseline = store.builtinAppsInitialized === undefined
        && (lastAppliedVersion === undefined || lastAppliedVersion === detectedVersion);

      if (isNewPairingBaseline || isLegacyBaseline) {
        if (!initializeBaseline) {
          return;
        }

        await this.refreshAppsFromDevice();
        await this.commitBuiltinAppsFirmwareVersion(detectedVersion);
        return;
      }

      if (lastAppliedVersion !== detectedVersion) {
        const currentSettings = this.homeySettingsSnapshot ?? await this.getSettings() as AwtrixNgHomeySettings;

        await this.getApi().reapplyBuiltinAppSettings(currentSettings);
        await this.commitBuiltinAppsFirmwareVersion(detectedVersion);
        return;
      }

      if (syncFromDeviceWhenUnchanged) {
        await this.refreshAppsFromDevice();
      }
    });
  }

  private async commitBuiltinAppsFirmwareVersion(version: string): Promise<void> {
    await this.setStoreValue(BuiltinAppsFirmwareVersionStoreKey, version);
    await this.setStoreValue(FirmwareVersionStoreKey, version);
    await this.setStoreValue(BuiltinAppsInitializedStoreKey, true);
  }

  private runBuiltinAppsOperation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.builtinAppsOperation.then(operation, operation);

    this.builtinAppsOperation = result.then(() => undefined, () => undefined);

    return result;
  }

  private async applyDeviceState(
    deviceState: Extract<AwtrixNgDeviceProbeResult, { status: 'detected' }>['device'],
    allowAddCapabilities: boolean,
  ): Promise<void> {
    const plan = this.getApi().planCapabilityUpdate(deviceState, this.getCapabilities(), {
      allowAddCapabilities,
    });

    for (const capabilityId of plan.capabilitiesToRemove) {
      if (this.hasCapability(capabilityId)) {
        await this.removeCapability(capabilityId).catch((error: unknown) => this.error(error));
      }
    }

    for (const capabilityId of plan.capabilitiesToAdd) {
      if (!this.hasCapability(capabilityId)) {
        await this.addCapability(capabilityId);
      }
    }

    for (const update of plan.valuesToSet) {
      if (this.hasCapability(update.capabilityId)) {
        await this.setCapabilityValue(update.capabilityId, update.value);
      }
    }
  }

  private configureApi(baseUrl: string, settings: AwtrixNgDeviceSettings): void {
    this.activateApi(this.createApi(baseUrl, this.getAuthFromSettingsSnapshot(settings)));
  }

  private createApi(baseUrl: string, auth?: AwtrixNgBasicAuthOptions): AwtrixNgApi {
    return AwtrixNgApi.fromConnection({
      baseUrl,
      auth,
      debug: process.env.DEBUG === '1',
      log: this.log.bind(this),
    }, {
      emptyIcon: {
        name: this.homey.__('list.icons.empty.name'),
        id: '-',
        description: this.homey.__('list.icons.empty.description'),
      },
      timerHost: this.homey,
    });
  }

  private activateApi(api: AwtrixNgApi): void {
    this.api = api;
  }

  private async verifyCandidateConnection(
    baseUrl: string,
    auth?: AwtrixNgBasicAuthOptions,
  ): Promise<AwtrixNgApi> {
    const api = this.createApi(baseUrl, auth);

    await api.verifyIdentity(this.getData().id as string);

    return api;
  }

  private getConnectionCandidateFromSettings(
    settings: AwtrixNgDeviceSettings,
    changedKeys: readonly string[],
  ): AwtrixNgSettingsConnectionCandidate {
    const settingsAddress = typeof settings.address === 'string' ? settings.address.trim() : '';

    if (settingsAddress !== '') {
      return {
        connection: this.toConnectionCandidate(settingsAddress, settings.port, settings),
        syncAddressIntoSettings: false,
      };
    }

    // The user just cleared the address on purpose. Falling back to the store would silently
    // undo that, so the address is taken from discovery instead - the same source the manual
    // rediscover button uses. Without a discovery result the device stays unconfigured.
    if (changedKeys.includes('address')) {
      const discoveryResult = this.getDiscoveryResultForDevice();

      if (discoveryResult === undefined) {
        throw new Error(this.getConnectionNotConfiguredMessage());
      }

      return {
        connection: this.toConnectionCandidate(discoveryResult.address, discoveryResult.port, settings),
        syncAddressIntoSettings: true,
      };
    }

    // Devices paired before 2.1.0 carry the connection only in the store, so changing a local
    // setting (typically the credentials) must not fail with "connection not configured".
    const store = this.getStoreSnapshot();
    const storeAddress = store.address === undefined ? '' : store.address.trim();

    if (storeAddress === '' || store.port === undefined) {
      throw new Error(this.getConnectionNotConfiguredMessage());
    }

    return {
      connection: this.toConnectionCandidate(storeAddress, store.port, settings),
      syncAddressIntoSettings: true,
    };
  }

  private toConnectionCandidate(
    address: string,
    port: unknown,
    settings: AwtrixNgDeviceSettings,
  ): AwtrixNgConnectionCandidate {
    if (address.includes('://') || address.includes('/')) {
      throw new Error('Device address must be a hostname or IP address without protocol or path.');
    }

    const connectionPort = toConnectionPort(port);

    return {
      address,
      port: connectionPort,
      baseUrl: toAwtrixNgBaseUrl({
        address,
        port: connectionPort,
      }),
      auth: this.getAuthFromSettingsSnapshot(settings),
    };
  }

  private async applySettingsChangesWithCandidateConnection(
    newSettings: AwtrixNgDeviceSettings,
    changedKeys: readonly string[],
  ): Promise<void> {
    const { connection, syncAddressIntoSettings } = this.getConnectionCandidateFromSettings(newSettings, changedKeys);
    const api = await this.verifyCandidateConnection(connection.baseUrl, connection.auth);

    await this.runBuiltinAppsOperation(async () => {
      await api.applySettingsChange(newSettings, changedKeys);
    });

    await this.commitConnection(connection, api, false);

    if (syncAddressIntoSettings) {
      this.scheduleRestoredConnectionSettingsSync(connection);
    }

    this.ensurePollingStarted();
    await this.refreshDeviceState({ allowAddCapabilities: false });
  }

  /**
   * Writes a connection restored from the store back into the Homey settings so the fallback in
   * getConnectionCandidateFromSettings() stays a one-off migration.
   *
   * The write is deferred: Homey keeps the submitted settings pending for the whole onSettings()
   * call, so setSettings() must not run inside the handler (docs/awtrix-ng/06-user-maintainer-guide.md).
   * It is best effort - the store remains the authoritative source and a failed sync only means the
   * next local settings change falls back to the store again.
   */
  private scheduleRestoredConnectionSettingsSync(connection: AwtrixNgConnectionCandidate): void {
    this.pendingSettingsSync = new Promise<void>((resolve) => {
      setImmediate(resolve);
    })
      .then(() => this.setSettings({
        address: connection.address,
        port: connection.port,
      }))
      .catch((error: unknown) => {
        this.error(error);
      });
  }

  private async commitDiscoveredConnection(discoveryResult: DiscoveryResultMDNSSD): Promise<boolean> {
    const port = toConnectionPort(discoveryResult.port);
    const connection: AwtrixNgConnectionCandidate = {
      address: discoveryResult.address,
      port,
      baseUrl: toAwtrixNgBaseUrl({
        address: discoveryResult.address,
        port,
      }),
    };
    const settings = await this.getSettings() as AwtrixNgDeviceSettings;
    const api = await this.verifyCandidateConnection(
      connection.baseUrl,
      this.getAuthFromSettingsSnapshot(settings),
    );

    await this.commitConnection(connection, api, true);
    this.ensurePollingStarted();

    const result = await this.refreshDeviceState({ allowAddCapabilities: false });

    if (result?.status === 'detected') {
      await this.synchronizeBuiltinAppsForFirmware(result.device.version, false, false);
    }

    return result?.status === 'detected';
  }

  private async commitConnection(
    connection: AwtrixNgConnectionCandidate,
    api: AwtrixNgApi,
    syncHomeySettings: boolean,
  ): Promise<void> {
    await this.setStoreValue('baseUrl', connection.baseUrl);
    await this.setStoreValue('address', connection.address);
    await this.setStoreValue('port', connection.port);

    if (syncHomeySettings) {
      await this.setSettings({
        address: connection.address,
        port: connection.port,
      });
    }

    this.activateApi(api);
  }

  private ensurePollingStarted(): void {
    const poll = this.poll || this.initializePoll();

    if (!poll.isActive()) {
      poll.start();
    }
  }

  /**
   * Uploads the bundled icons with bounded parallelism - same worker-pool shape as
   * findDiscoveredDevices() in the driver.
   *
   * R9 is preserved: every file is attempted even after a failure, failures are collected
   * instead of thrown and reported once. They are logged in file order so the diagnostics
   * stay stable regardless of which worker hit them.
   */
  private async uploadBundledIcons(): Promise<void> {
    const { icons } = this;

    if (icons === undefined) {
      throw new Error(this.getConnectionNotConfiguredMessage());
    }

    const dirEntries = await fs.promises.readdir(BundledIconsDirectory, { withFileTypes: true });
    const iconFiles = dirEntries.filter((entry) => entry.isFile()).map((entry) => entry.name);
    const failures: Array<{ fileName: string; error: unknown; index: number }> = [];
    await runWithConcurrencyLimit(iconFiles, MaxConcurrentIconUploads, async (fileName, index) => {
      try {
        const body = await fs.promises.readFile(path.join(BundledIconsDirectory, fileName));
        await icons.upload({
          fileName,
          body,
        });
      } catch (error: unknown) {
        failures.push({ fileName, error, index });
      }
    });

    if (failures.length > 0) {
      failures.sort((left, right) => left.index - right.index);
      this.error(failures.map(({ fileName, error }) => ({ fileName, error })));
    }
  }

  private getBaseUrlFromStore(): string | undefined {
    const store = this.getStoreSnapshot();

    if (store.baseUrl !== undefined) {
      return store.baseUrl;
    }

    if (store.address !== undefined && store.port !== undefined) {
      return toAwtrixNgBaseUrl({
        address: store.address,
        port: store.port,
      });
    }

    return undefined;
  }

  private getStoreSnapshot(): AwtrixNgDeviceStore {
    const baseUrl = this.getStoreValue('baseUrl') as unknown;
    const address = this.getStoreValue('address') as unknown;
    const port = this.getStoreValue('port') as unknown;
    const version = this.getStoreValue(FirmwareVersionStoreKey) as unknown;
    const builtinAppsFirmwareVersion = this.getStoreValue(BuiltinAppsFirmwareVersionStoreKey) as unknown;
    const builtinAppsInitialized = this.getStoreValue(BuiltinAppsInitializedStoreKey) as unknown;

    return {
      baseUrl: typeof baseUrl === 'string' && baseUrl.length > 0 ? baseUrl : undefined,
      address: typeof address === 'string' && address.length > 0 ? address : undefined,
      port: typeof port === 'number' ? port : undefined,
      version: typeof version === 'string' && version.length > 0 ? version : undefined,
      builtinAppsFirmwareVersion: typeof builtinAppsFirmwareVersion === 'string'
        && builtinAppsFirmwareVersion.length > 0
        ? builtinAppsFirmwareVersion
        : undefined,
      builtinAppsInitialized: typeof builtinAppsInitialized === 'boolean' ? builtinAppsInitialized : undefined,
    };
  }

  private getAuthFromSettingsSnapshot(settings: AwtrixNgDeviceSettings): AwtrixNgBasicAuthOptions | undefined {
    if (typeof settings.authUser === 'string' && settings.authUser.length > 0
      && typeof settings.authPass === 'string' && settings.authPass.length > 0) {
      return {
        username: settings.authUser,
        password: settings.authPass,
      };
    }

    return undefined;
  }

  private getConnectionNotConfiguredMessage(): string {
    return this.homey.__('states.awtrixNg.connectionNotConfigured');
  }

  private getUnavailableMessage(
    result: Exclude<AwtrixNgDeviceProbeResult, { status: 'detected' }>,
  ): string {
    if (result.status === 'auth-required') {
      return `${this.homey.__('states.awtrixNg.authenticationRequired')}: ${formatAwtrixNgErrorDetails(result.error)}`;
    }

    if (result.status === 'rejected') {
      return this.homey.__('states.awtrixNg.invalidResponse');
    }

    return `${this.homey.__('states.awtrixNg.offline')}: ${formatAwtrixNgErrorDetails(result.error)}`;
  }

}

export default AwtrixNgDevice;
module.exports = AwtrixNgDevice;
