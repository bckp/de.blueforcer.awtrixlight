import { Driver } from 'homey';
import PairSession from 'homey/lib/PairSession';
import AxiosAwtrixNgHttpTransport from '../../lib/awtrixng/Http/AxiosTransport';
import { AwtrixNgBasicAuthOptions } from '../../lib/awtrixng/Http/Transport';
import AwtrixNgClient from '../../lib/awtrixng/Api/Client';
import { AwtrixNgApiError, AwtrixNgApiErrorCode } from '../../lib/awtrixng/Api/ErrorParser';
import { AwtrixNgApiDeviceStateResponse } from '../../lib/awtrixng/Api/Types';
import { AwtrixNgHomeyCapabilityId, getAwtrixNgInitialCapabilityIds } from '../../lib/awtrixng/Device/State';
import {
  isAwtrixNgMdnsCandidate,
  probeAwtrixNgDevice,
  toAwtrixNgBaseUrl,
} from '../../lib/awtrixng/Discovery/Detection';

const AwtrixNgManualPairingOptionId = '__awtrixng_manual_pairing__' as const;
const AwtrixNgAuthRequiredPairingOptionPrefix = '__awtrixng_auth_required__:' as const;
const MaxConcurrentDiscoveryProbes = 4;

interface AwtrixNgPairDeviceData {
  id: string;
}

interface AwtrixNgPairDeviceStore {
  protocol: 'awtrix-ng';
  address: string;
  port: number;
  baseUrl: string;
  uid: string;
  hostname?: string;
  version: string;
}

interface AwtrixNgPairDeviceCredentials {
  authUser: string;
  authPass: string;
}

interface AwtrixNgPairDeviceSettings extends AwtrixNgPairDeviceCredentials {
  address: string;
  port: number;
}

interface AwtrixNgPairDevice {
  name: string;
  data: AwtrixNgPairDeviceData;
  store: AwtrixNgPairDeviceStore;
  settings: AwtrixNgPairDeviceSettings;
  capabilities: AwtrixNgHomeyCapabilityId[];
}

interface AwtrixNgManualPairingOption {
  name: string;
  data: {
    id: typeof AwtrixNgManualPairingOptionId;
  };
  store: {
    kind: 'manual-pairing-option';
  };
}

interface AwtrixNgAuthRequiredPairDevice {
  name: string;
  data: {
    id: string;
  };
  store: {
    kind: 'auth-required-discovery';
    address: string;
    port: number;
    baseUrl: string;
    hostname?: string;
  };
}

type AwtrixNgDiscoveredPairListItem = AwtrixNgPairDevice | AwtrixNgAuthRequiredPairDevice;

type AwtrixNgPairListItem = AwtrixNgDiscoveredPairListItem | AwtrixNgManualPairingOption;

interface AwtrixNgManualPairingProbeInput {
  address: string;
  port: number;
}

interface AwtrixNgCredentialsPairingInput {
  username: string;
  password: string;
}

interface AwtrixNgPendingAuthPairTarget {
  address: string;
  port: number;
  baseUrl: string;
  name?: string;
  hostname?: string;
}

interface AwtrixNgSerializedApiError {
  httpStatus?: number;
  code: AwtrixNgApiErrorCode;
  message: string;
  field?: string;
}

type AwtrixNgManualPairingProbeResponse =
  | {
    status: 'detected';
    device: AwtrixNgPairDevice;
  }
  | {
    status: 'auth-required';
    error: AwtrixNgSerializedApiError;
  }
  | {
    status: 'offline';
    message: string;
    error?: AwtrixNgSerializedApiError;
  }
  | {
    status: 'rejected';
    reason: 'wrong-shape';
  };

type AwtrixNgCredentialsPairingResponse = AwtrixNgManualPairingProbeResponse;

interface AwtrixNgDiscoveryResult {
  id: string;
  address: string;
  port: string | number;
  txt?: unknown;
  name?: string;
  host?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const toTxtRecord = (value: unknown): Record<string, unknown> => {
  if (isRecord(value)) {
    return value;
  }

  return {};
};

const toPort = (value: string | number): number | undefined => {
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return undefined;
  }

  return port;
};

class AwtrixNgDriver extends Driver {

  async onInit(): Promise<void> {
    this.log('AwtrixNgDriver has been initialized');
  }

  async onPair(session: PairSession): Promise<void> {
    let selectedPairItemId: string | undefined;
    let pendingAuthTarget: AwtrixNgPendingAuthPairTarget | undefined;

    const handlePairSelection = async (selection: unknown): Promise<boolean> => {
      selectedPairItemId = this.getSelectedPairItemId(selection);
      pendingAuthTarget = this.getPendingAuthTargetFromSelection(selection);

      if (selectedPairItemId === undefined) {
        throw new Error('No pairing selection was received.');
      }

      return true;
    };

    session.setHandler('list_devices', async (): Promise<AwtrixNgPairListItem[]> => [
      ...await this.findDiscoveredDevices(),
      this.createManualPairingOption(),
    ]);

    session.setHandler('list_devices_selection', handlePairSelection);
    session.setHandler('list_my_devices_selection', handlePairSelection);

    session.setHandler('resolve_pair_selection', async (): Promise<boolean> => {
      if (selectedPairItemId === undefined) {
        throw new Error('No pairing selection was received.');
      }

      if (selectedPairItemId === AwtrixNgManualPairingOptionId) {
        await session.showView('manual_pairing_placeholder');
        return true;
      }

      if (pendingAuthTarget !== undefined) {
        await session.showView('credentials_placeholder');
        return true;
      }

      await session.showView('add_my_devices');
      return true;
    });

    session.setHandler('manual_pairing_probe', async (payload: unknown): Promise<AwtrixNgManualPairingProbeResponse> => {
      const input = this.parseManualPairingProbeInput(payload);
      const response = await this.probeManualPairingInput(input);

      if (response.status === 'auth-required') {
        pendingAuthTarget = this.toPendingAuthPairTarget(input);
      } else if (response.status === 'detected') {
        pendingAuthTarget = undefined;
      }

      return response;
    });

    session.setHandler('credentials_pairing_add', async (payload: unknown): Promise<AwtrixNgCredentialsPairingResponse> => {
      if (pendingAuthTarget === undefined) {
        throw new Error('No device is waiting for credentials.');
      }

      const credentials = this.parseCredentialsPairingInput(payload);
      const response = await this.probePendingAuthPairTarget(pendingAuthTarget, credentials);

      if (response.status === 'detected') {
        pendingAuthTarget = undefined;
      }

      return response;
    });
  }

  private createManualPairingOption(): AwtrixNgManualPairingOption {
    return {
      name: this.homey.__('pair.manual.title'),
      data: {
        id: AwtrixNgManualPairingOptionId,
      },
      store: {
        kind: 'manual-pairing-option',
      },
    };
  }

  private getSelectedPairItem(selection: unknown): Record<string, unknown> | undefined {
    const selectedItem = Array.isArray(selection) ? selection[0] : selection;

    if (!isRecord(selectedItem)) {
      return undefined;
    }

    return selectedItem;
  }

  private getSelectedPairItemId(selection: unknown): string | undefined {
    const selectedItem = this.getSelectedPairItem(selection);

    if (selectedItem === undefined) {
      return undefined;
    }

    const { data } = selectedItem;

    if (!isRecord(data) || typeof data.id !== 'string') {
      return undefined;
    }

    return data.id;
  }

  private getPendingAuthTargetFromSelection(selection: unknown): AwtrixNgPendingAuthPairTarget | undefined {
    const selectedItem = this.getSelectedPairItem(selection);

    if (selectedItem === undefined || !isRecord(selectedItem.store)) {
      return undefined;
    }

    const { store } = selectedItem;

    if (store.kind !== 'auth-required-discovery'
      || typeof store.address !== 'string'
      || typeof store.port !== 'number'
      || typeof store.baseUrl !== 'string') {
      return undefined;
    }

    return {
      address: store.address,
      port: store.port,
      baseUrl: store.baseUrl,
      hostname: typeof store.hostname === 'string' ? store.hostname : undefined,
      name: typeof selectedItem.name === 'string' ? selectedItem.name : undefined,
    };
  }

  #createProbeClient(input: {
    baseUrl: string;
    auth?: AwtrixNgBasicAuthOptions;
  }): AwtrixNgClient {
    return new AwtrixNgClient(new AxiosAwtrixNgHttpTransport({
      baseUrl: input.baseUrl,
      ...(input.auth === undefined ? {} : { auth: input.auth }),
      debug: process.env.DEBUG === '1',
      log: this.log.bind(this),
    }));
  }

  private async probeManualPairingInput(input: AwtrixNgManualPairingProbeInput): Promise<AwtrixNgManualPairingProbeResponse> {
    const baseUrl = toAwtrixNgBaseUrl(input);
    const client = this.#createProbeClient({
      baseUrl,
    });
    const result = await probeAwtrixNgDevice(client);

    if (result.status === 'detected') {
      return {
        status: 'detected',
        device: this.toPairDevice({
          name: result.device.boardType,
          address: input.address,
          port: input.port,
          baseUrl,
          device: result.device,
        }),
      };
    }

    if (result.status === 'auth-required') {
      return {
        status: 'auth-required',
        error: this.serializeAwtrixNgApiError(result.error),
      };
    }

    if (result.status === 'rejected') {
      return {
        status: 'rejected',
        reason: result.reason,
      };
    }

    return {
      status: 'offline',
      message: result.error instanceof Error ? result.error.message : 'Device is offline or unreachable.',
      error: result.error instanceof AwtrixNgApiError ? this.serializeAwtrixNgApiError(result.error) : undefined,
    };
  }

  private toPendingAuthPairTarget(input: AwtrixNgManualPairingProbeInput): AwtrixNgPendingAuthPairTarget {
    return {
      address: input.address,
      port: input.port,
      baseUrl: toAwtrixNgBaseUrl(input),
    };
  }

  private async probePendingAuthPairTarget(
    target: AwtrixNgPendingAuthPairTarget,
    credentials: AwtrixNgCredentialsPairingInput,
  ): Promise<AwtrixNgCredentialsPairingResponse> {
    const client = this.#createProbeClient({
      baseUrl: target.baseUrl,
      auth: {
        username: credentials.username,
        password: credentials.password,
      },
    });
    const result = await probeAwtrixNgDevice(client);

    if (result.status === 'detected') {
      return {
        status: 'detected',
        device: this.toPairDevice({
          name: target.name || result.device.boardType,
          address: target.address,
          port: target.port,
          baseUrl: target.baseUrl,
          hostname: target.hostname,
          device: result.device,
          settings: {
            authUser: credentials.username,
            authPass: credentials.password,
          },
        }),
      };
    }

    if (result.status === 'auth-required') {
      return {
        status: 'auth-required',
        error: this.serializeAwtrixNgApiError(result.error),
      };
    }

    if (result.status === 'rejected') {
      return {
        status: 'rejected',
        reason: result.reason,
      };
    }

    return {
      status: 'offline',
      message: result.error instanceof Error ? result.error.message : 'Device is offline or unreachable.',
      error: result.error instanceof AwtrixNgApiError ? this.serializeAwtrixNgApiError(result.error) : undefined,
    };
  }

  private parseManualPairingProbeInput(payload: unknown): AwtrixNgManualPairingProbeInput {
    if (!isRecord(payload)) {
      throw new Error(this.homey.__('pair.manual.errors.addressRequired'));
    }

    const address = typeof payload.address === 'string' ? payload.address.trim() : '';

    if (address === '') {
      throw new Error(this.homey.__('pair.manual.errors.addressRequired'));
    }

    if (address.includes('://') || address.includes('/')) {
      throw new Error(this.homey.__('pair.manual.errors.invalidAddress'));
    }

    const rawPort = payload.port;
    const portInput = typeof rawPort === 'string' || typeof rawPort === 'number' ? rawPort : undefined;
    const port = portInput === undefined ? undefined : toPort(typeof portInput === 'string' ? portInput.trim() : portInput);

    if (port === undefined) {
      throw new Error(this.homey.__('pair.manual.errors.invalidPort'));
    }

    return {
      address,
      port,
    };
  }

  private parseCredentialsPairingInput(payload: unknown): AwtrixNgCredentialsPairingInput {
    if (!isRecord(payload)) {
      throw new Error(this.homey.__('pair.credentials.errors.required'));
    }

    const username = typeof payload.username === 'string' ? payload.username.trim() : '';
    const password = typeof payload.password === 'string' ? payload.password : '';

    if (username === '' || password === '') {
      throw new Error(this.homey.__('pair.credentials.errors.required'));
    }

    return {
      username,
      password,
    };
  }

  private serializeAwtrixNgApiError(error: AwtrixNgApiError): AwtrixNgSerializedApiError {
    return {
      httpStatus: error.httpStatus,
      code: error.code,
      message: error.message,
      field: error.field,
    };
  }

  private async findDiscoveredDevices(): Promise<AwtrixNgDiscoveredPairListItem[]> {
    const discoveryResults = this.getDiscoveryStrategy().getDiscoveryResults();
    const candidates = (Object.values(discoveryResults) as unknown[])
      .filter((discoveryResult): discoveryResult is AwtrixNgDiscoveryResult => this.isAwtrixNgDiscoveryResult(discoveryResult));
    const devices: Array<AwtrixNgDiscoveredPairListItem | undefined> = new Array(candidates.length);
    let nextCandidateIndex = 0;

    const probeNextCandidate = async (): Promise<void> => {
      while (nextCandidateIndex < candidates.length) {
        const candidateIndex = nextCandidateIndex;
        nextCandidateIndex += 1;
        devices[candidateIndex] = await this.probeDiscoveryResult(candidates[candidateIndex]);
      }
    };

    const concurrency = Math.min(MaxConcurrentDiscoveryProbes, candidates.length);
    await Promise.all(Array.from({ length: concurrency }, () => probeNextCandidate()));

    return devices
      .filter((device): device is AwtrixNgDiscoveredPairListItem => device !== undefined)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  private isAwtrixNgDiscoveryResult(discoveryResult: unknown): discoveryResult is AwtrixNgDiscoveryResult {
    if (!isRecord(discoveryResult)) {
      return false;
    }

    const hasAddress = typeof discoveryResult.address === 'string';
    const hasPort = typeof discoveryResult.port === 'string' || typeof discoveryResult.port === 'number';
    const hasId = typeof discoveryResult.id === 'string';

    if (!hasAddress || !hasPort || !hasId) {
      return false;
    }

    return isAwtrixNgMdnsCandidate({
      txt: toTxtRecord(discoveryResult.txt),
    });
  }

  private async probeDiscoveryResult(discoveryResult: AwtrixNgDiscoveryResult): Promise<AwtrixNgDiscoveredPairListItem | undefined> {
    const port = toPort(discoveryResult.port);

    if (port === undefined) {
      this.log(`Ignoring AWTRIX NG discovery result with invalid port: ${discoveryResult.port}`);
      return undefined;
    }

    const baseUrl = toAwtrixNgBaseUrl({
      address: discoveryResult.address,
      port,
    });
    const client = this.#createProbeClient({
      baseUrl,
    });
    const result = await probeAwtrixNgDevice(client);

    if (result.status === 'detected') {
      return this.toPairDevice({
        name: discoveryResult.name || discoveryResult.host || result.device.uid,
        address: discoveryResult.address,
        port,
        baseUrl,
        hostname: discoveryResult.host || undefined,
        device: result.device,
      });
    }

    if (result.status === 'auth-required') {
      return this.toAuthRequiredPairDevice({
        discoveryResult,
        port,
        baseUrl,
      });
    }

    this.log(`Ignoring AWTRIX NG discovery result ${discoveryResult.id}: probe status ${result.status}`);
    return undefined;
  }

  private toAuthRequiredPairDevice(input: {
    discoveryResult: AwtrixNgDiscoveryResult;
    port: number;
    baseUrl: string;
  }): AwtrixNgAuthRequiredPairDevice {
    return {
      name: input.discoveryResult.name || input.discoveryResult.host || input.discoveryResult.id,
      data: {
        id: `${AwtrixNgAuthRequiredPairingOptionPrefix}${input.discoveryResult.id}`,
      },
      store: {
        kind: 'auth-required-discovery',
        address: input.discoveryResult.address,
        port: input.port,
        baseUrl: input.baseUrl,
        hostname: input.discoveryResult.host || undefined,
      },
    };
  }

  private toPairDevice(input: {
    name: string;
    address: string;
    port: number;
    baseUrl: string;
    hostname?: string;
    device: AwtrixNgApiDeviceStateResponse;
    settings?: AwtrixNgPairDeviceCredentials;
  }): AwtrixNgPairDevice {
    return {
      name: input.name,
      data: {
        id: input.device.uid,
      },
      store: {
        protocol: 'awtrix-ng',
        address: input.address,
        port: input.port,
        baseUrl: input.baseUrl,
        uid: input.device.uid,
        hostname: input.hostname,
        version: input.device.version,
      },
      settings: {
        address: input.address,
        port: input.port,
        authUser: input.settings?.authUser || '',
        authPass: input.settings?.authPass || '',
      },
      capabilities: getAwtrixNgInitialCapabilityIds(input.device),
    };
  }

}

export default AwtrixNgDriver;
module.exports = AwtrixNgDriver;
