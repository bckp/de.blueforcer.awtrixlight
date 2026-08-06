import fs from 'fs';
import { Device, DiscoveryResultMDNSSD } from 'homey';
import path from 'path';
import AxiosAwtrixNgHttpTransport from '../../lib/awtrixng/Http/AxiosTransport';
import AwtrixNgClient from '../../lib/awtrixng/Api/Client';
import { AwtrixNgInvalidResponseError } from '../../lib/awtrixng/Api/InvalidResponseError';
import { formatAwtrixNgErrorDetails } from '../../lib/awtrixng/Device/Availability';
import {
  runAwtrixNgMatrixPowerCapability,
  runAwtrixNgNextAppCapability,
  runAwtrixNgPreviousAppCapability,
  runAwtrixNgWeatherOverlayCapability,
} from '../../lib/awtrixng/Device/Controls';
import { createAwtrixNgCapabilityUpdatePlan } from '../../lib/awtrixng/Device/State';
import { AwtrixNgDeviceProbeResult, probeAwtrixNgDevice, toAwtrixNgBaseUrl } from '../../lib/awtrixng/Discovery/Detection';
import { AwtrixNgBasicAuthOptions } from '../../lib/awtrixng/Http/Transport';
import AwtrixNgIcons from '../../lib/awtrixng/Services/Icons';
import {
  prepareAwtrixNgBuiltinAppSettingsChange,
  isAwtrixNgBuiltinAppSetting,
  toAwtrixNgBuiltinAppSettingsUpdate,
  validateAwtrixNgBuiltinAppSettingsChange,
  writeAwtrixNgAppsOrder,
} from '../../lib/awtrixng/Services/Apps';
import {
  AwtrixNgWeatherOverlayCapabilityId,
  toAwtrixNgHomeyWeatherOverlayValue,
} from '../../lib/awtrixng/Services/Display';
import AwtrixNgPoll from '../../lib/awtrixng/Device/Poll';
import {
  AwtrixNgHomeySettings,
  createAwtrixNgSettingsPatchFromChangedSettings,
  hasAwtrixNgLocalSettingsChange,
  toAwtrixNgHomeySettingsUpdate,
  writeAwtrixNgSettingsPatch,
} from '../../lib/awtrixng/Services/Settings';
import {
  AwtrixNgApiAppsOrderPayload,
  AwtrixNgApiDeviceStateResponse,
  AwtrixNgApiSettingsPatch,
} from '../../lib/awtrixng/Api/Types';
import { isPlainObject, toValidTcpPort } from '../../lib/awtrixng/Support/Guards';
import { AwtrixDeviceType } from '../awtrix-device-type';

const PollIntervalMs = 60000;
const BundledIconsDirectory = path.join(__dirname, 'assets/images/icons');

// Hard-failing wrapper: the connection cannot be built without a usable port.
const toConnectionPort = (value: unknown): number => {
  const port = toValidTcpPort(value);

  if (port === undefined) {
    throw new RangeError('AWTRIX NG connection requires a valid TCP port.');
  }

  return port;
};

interface AwtrixNgDeviceIdentityMismatchError extends Error {
  readonly protocol: 'awtrix-ng';
  readonly expectedUid: string;
  readonly actualUid: string;
}

const createAwtrixNgDeviceIdentityMismatchError = (
  expectedUid: string,
  actualUid: string,
): AwtrixNgDeviceIdentityMismatchError => Object.assign(
  new Error(`AWTRIX NG device identity mismatch: expected ${expectedUid}, received ${actualUid}.`),
  {
    name: 'AwtrixNgDeviceIdentityMismatchError',
    protocol: 'awtrix-ng' as const,
    expectedUid,
    actualUid,
  },
);

interface AwtrixNgDeviceStore {
  baseUrl?: string;
  address?: string;
  port?: number;
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
   * True when the Homey settings carried no address and it had to be restored from the pairing
   * store. Devices paired before 2.1.0 keep the connection values only in the store.
   */
  restoredFromStore: boolean;
}

interface AwtrixNgLocallyPreparedSettingsChanges {
  settingsPatch?: AwtrixNgApiSettingsPatch;
}

interface AwtrixNgPreparedSettingsChanges extends AwtrixNgLocallyPreparedSettingsChanges {
  appsOrderPayload?: AwtrixNgApiAppsOrderPayload;
}

class AwtrixNgDevice extends Device {

  client?: AwtrixNgClient;

  icons?: AwtrixNgIcons;

  poll?: AwtrixNgPoll;

  /** Resolves once the deferred Homey settings sync scheduled by onSettings() has finished. */
  pendingSettingsSync?: Promise<void>;

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

    this.configureClient(baseUrl, await this.getSettings() as AwtrixNgDeviceSettings);

    try {
      const deviceStateResult = await this.refreshDeviceState({ allowAddCapabilities: true });

      if (deviceStateResult?.status === 'detected') {
        await this.refreshSettingsFromDevice();
        await this.refreshDisplayFromDevice();
        await this.refreshAppsFromDevice();
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
    this.log('AwtrixNgDevice settings were changed', oldSettings, newSettings, changedKeys);
    const locallyPreparedChanges = this.prepareLocalSettingsChanges(newSettings, changedKeys);

    if (hasAwtrixNgLocalSettingsChange(changedKeys)) {
      await this.applySettingsChangesWithCandidateConnection(
        newSettings as AwtrixNgDeviceSettings,
        changedKeys,
        locallyPreparedChanges,
      );
      return;
    }

    const client = this.getClient();
    const preparedChanges = await this.prepareSettingsChanges(
      client,
      newSettings,
      changedKeys,
      locallyPreparedChanges,
    );

    await this.writePreparedSettingsChanges(client, preparedChanges);
  }

  async refreshAvailability(): Promise<AwtrixNgDeviceProbeResult | undefined> {
    return this.refreshDeviceState({ allowAddCapabilities: false });
  }

  private initCapabilityListeners(): void {
    this.registerCapabilityListener('awtrix_matrix', async (value: unknown): Promise<void> => {
      await runAwtrixNgMatrixPowerCapability(this.getClient(), value);
    });

    this.registerCapabilityListener('button_next', async (): Promise<void> => {
      await runAwtrixNgNextAppCapability(this.getClient());
    });

    this.registerCapabilityListener('button_prev', async (): Promise<void> => {
      await runAwtrixNgPreviousAppCapability(this.getClient());
    });

    this.registerCapabilityListener(AwtrixNgWeatherOverlayCapabilityId, async (value: unknown): Promise<void> => {
      await runAwtrixNgWeatherOverlayCapability(this.getClient(), value);
    });
  }

  private initializePoll(): AwtrixNgPoll {
    const poll = new AwtrixNgPoll(async () => {
      await this.refreshDeviceState({ allowAddCapabilities: false });
    }, this.homey, PollIntervalMs, (error: unknown) => this.error(error));

    this.poll = poll;

    return poll;
  }

  private getClient(): AwtrixNgClient {
    if (this.client === undefined) {
      throw new Error(this.getConnectionNotConfiguredMessage());
    }

    return this.client;
  }

  async refreshDeviceState(options: { allowAddCapabilities: boolean }): Promise<AwtrixNgDeviceProbeResult | undefined> {
    if (this.client === undefined) {
      throw new Error(this.getConnectionNotConfiguredMessage());
    }

    const result = await probeAwtrixNgDevice(this.client);

    if (result.status === 'detected') {
      await this.applyDeviceState(result.device, options.allowAddCapabilities);
      await this.setAvailable();
      return result;
    }

    await this.setUnavailable(this.getUnavailableMessage(result));

    return result;
  }

  private async refreshSettingsFromDevice(): Promise<void> {
    const apiSettings = await this.getClient().getSettings();

    if (!isPlainObject(apiSettings)) {
      throw new AwtrixNgInvalidResponseError({
        endpoint: '/api/v1/settings',
        expectedShape: 'a plain object',
        actualValue: apiSettings,
      });
    }

    const currentSettings = await this.getSettings() as AwtrixNgHomeySettings;
    const homeySettingsUpdate = toAwtrixNgHomeySettingsUpdate(apiSettings, currentSettings);

    if (Object.keys(homeySettingsUpdate).length > 0) {
      await this.setSettings(homeySettingsUpdate);
    }
  }

  private async refreshDisplayFromDevice(): Promise<void> {
    const display = await this.getClient().getDisplay();
    const weatherOverlay = toAwtrixNgHomeyWeatherOverlayValue(display.overlay);

    if (this.hasCapability(AwtrixNgWeatherOverlayCapabilityId)) {
      await this.setCapabilityValue(AwtrixNgWeatherOverlayCapabilityId, weatherOverlay);
    }
  }

  private async refreshAppsFromDevice(): Promise<void> {
    const apps = await this.getClient().getApps();

    if (!Array.isArray(apps)) {
      throw new AwtrixNgInvalidResponseError({
        endpoint: '/api/v1/apps',
        expectedShape: 'an array',
        actualValue: apps,
      });
    }

    const currentSettings = await this.getSettings() as AwtrixNgHomeySettings;
    const homeySettingsUpdate = toAwtrixNgBuiltinAppSettingsUpdate(apps, currentSettings);

    if (Object.keys(homeySettingsUpdate).length > 0) {
      await this.setSettings(homeySettingsUpdate);
    }
  }

  private async applyDeviceState(deviceState: AwtrixNgApiDeviceStateResponse, allowAddCapabilities: boolean): Promise<void> {
    const plan = createAwtrixNgCapabilityUpdatePlan(deviceState, this.getCapabilities(), {
      allowAddCapabilities,
    });

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

  private configureClient(baseUrl: string, settings: AwtrixNgDeviceSettings): void {
    this.activateClient(this.createClient(baseUrl, this.getAuthFromSettingsSnapshot(settings)));
  }

  private createClient(baseUrl: string, auth?: AwtrixNgBasicAuthOptions): AwtrixNgClient {
    return new AwtrixNgClient(new AxiosAwtrixNgHttpTransport({
      baseUrl,
      auth,
      debug: process.env.DEBUG === '1',
      log: this.log.bind(this),
    }));
  }

  private activateClient(client: AwtrixNgClient): void {
    this.client = client;
    this.icons = new AwtrixNgIcons(this.client, {
      emptyIcon: {
        name: this.homey.__('list.icons.empty.name'),
        id: '-',
        description: this.homey.__('list.icons.empty.description'),
      },
      timerHost: this.homey,
    });
  }

  private async verifyCandidateConnection(
    baseUrl: string,
    auth?: AwtrixNgBasicAuthOptions,
  ): Promise<AwtrixNgClient> {
    const client = this.createClient(baseUrl, auth);
    const result = await probeAwtrixNgDevice(client);

    if (result.status === 'auth-required' || result.status === 'offline') {
      throw result.error;
    }

    if (result.status === 'rejected') {
      throw new AwtrixNgInvalidResponseError({
        endpoint: '/api/v1/device',
        expectedShape: 'a valid AWTRIX NG device state object',
        actualValue: result.rawResponse,
      });
    }

    const expectedUid = this.getData().id as string;

    if (result.device.uid !== expectedUid) {
      throw createAwtrixNgDeviceIdentityMismatchError(expectedUid, result.device.uid);
    }

    return client;
  }

  private getConnectionCandidateFromSettings(
    settings: AwtrixNgDeviceSettings,
  ): AwtrixNgSettingsConnectionCandidate {
    const settingsAddress = typeof settings.address === 'string' ? settings.address.trim() : '';

    if (settingsAddress !== '') {
      return {
        connection: this.toConnectionCandidate(settingsAddress, settings.port, settings),
        restoredFromStore: false,
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
      restoredFromStore: true,
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
    locallyPreparedChanges: AwtrixNgLocallyPreparedSettingsChanges,
  ): Promise<void> {
    const { connection, restoredFromStore } = this.getConnectionCandidateFromSettings(newSettings);
    const client = await this.verifyCandidateConnection(connection.baseUrl, connection.auth);
    const preparedChanges = await this.prepareSettingsChanges(
      client,
      newSettings,
      changedKeys,
      locallyPreparedChanges,
    );

    await this.writePreparedSettingsChanges(client, preparedChanges);

    await this.commitConnection(connection, client, false);

    if (restoredFromStore) {
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

  private prepareLocalSettingsChanges(
    newSettings: AwtrixNgHomeySettings,
    changedKeys: readonly string[],
  ): AwtrixNgLocallyPreparedSettingsChanges {
    const remoteSettingsKeys = changedKeys.filter((key) => !isAwtrixNgBuiltinAppSetting(key));
    const settingsPatch = createAwtrixNgSettingsPatchFromChangedSettings(newSettings, remoteSettingsKeys);

    validateAwtrixNgBuiltinAppSettingsChange(newSettings, changedKeys);

    return { settingsPatch };
  }

  private async prepareSettingsChanges(
    client: AwtrixNgClient,
    newSettings: AwtrixNgHomeySettings,
    changedKeys: readonly string[],
    locallyPreparedChanges: AwtrixNgLocallyPreparedSettingsChanges,
  ): Promise<AwtrixNgPreparedSettingsChanges> {
    const appsOrderPayload = await prepareAwtrixNgBuiltinAppSettingsChange(client, newSettings, changedKeys);

    return {
      ...locallyPreparedChanges,
      appsOrderPayload,
    };
  }

  private async writePreparedSettingsChanges(
    client: AwtrixNgClient,
    changes: AwtrixNgPreparedSettingsChanges,
  ): Promise<void> {
    // These endpoints do not provide a transaction. Writes are sequential and fail-fast:
    // if the second write fails, the first may already be applied and the next save reconciles the state.
    if (changes.appsOrderPayload !== undefined) {
      await writeAwtrixNgAppsOrder(client, changes.appsOrderPayload);
    }

    if (changes.settingsPatch !== undefined) {
      await writeAwtrixNgSettingsPatch(client, changes.settingsPatch);
    }
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
    const client = await this.verifyCandidateConnection(
      connection.baseUrl,
      this.getAuthFromSettingsSnapshot(settings),
    );

    await this.commitConnection(connection, client, true);
    this.ensurePollingStarted();

    const result = await this.refreshDeviceState({ allowAddCapabilities: false });

    return result?.status === 'detected';
  }

  private async commitConnection(
    connection: AwtrixNgConnectionCandidate,
    client: AwtrixNgClient,
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

    this.activateClient(client);
  }

  private ensurePollingStarted(): void {
    const poll = this.poll || this.initializePoll();

    if (!poll.isActive()) {
      poll.start();
    }
  }

  private async uploadBundledIcons(): Promise<void> {
    if (this.icons === undefined) {
      throw new Error(this.getConnectionNotConfiguredMessage());
    }

    const iconFiles = fs.readdirSync(BundledIconsDirectory)
      .filter((fileName) => fs.statSync(path.join(BundledIconsDirectory, fileName)).isFile());
    const failures: Array<{ fileName: string; error: unknown }> = [];

    for (const fileName of iconFiles) {
      try {
        await this.icons.upload({
          fileName,
          body: fs.readFileSync(path.join(BundledIconsDirectory, fileName)),
        });
      } catch (error: unknown) {
        failures.push({ fileName, error });
      }
    }

    if (failures.length > 0) {
      this.error(failures);
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

    return {
      baseUrl: typeof baseUrl === 'string' && baseUrl.length > 0 ? baseUrl : undefined,
      address: typeof address === 'string' && address.length > 0 ? address : undefined,
      port: typeof port === 'number' ? port : undefined,
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
