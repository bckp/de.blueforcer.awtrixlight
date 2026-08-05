import { AwtrixNgHttpError, AwtrixNgHttpRequest, AwtrixNgHttpTransport } from '../Http/Transport';
import { parseAwtrixNgApiError } from './ErrorParser';
import {
  AwtrixNgApiAppsOrderPayload,
  AwtrixNgApiAppsResponse,
  AwtrixNgApiCapabilitiesResponse,
  AwtrixNgApiDeviceStateResponse,
  AwtrixNgApiDisplayPatch,
  AwtrixNgApiDisplayResponse,
  AwtrixNgApiFilesResponse,
  AwtrixNgApiIndicatorPayload,
  AwtrixNgApiNotificationPayload,
  AwtrixNgApiOkResponse,
  AwtrixNgApiPushedAppPayload,
  AwtrixNgApiSettingsPatch,
  AwtrixNgApiSettingsResponse,
  AwtrixNgApiSoundPlayPayload,
  AwtrixNgApiVersionResponse,
} from './Types';

export type AwtrixNgIndicatorId = 1 | 2 | 3;

export type AwtrixNgFileDirectory = '/ICONS' | '/MELODIES' | '/PALETTES';

export interface AwtrixNgFileUploadRequest<TBody = unknown> {
  dir: AwtrixNgFileDirectory;
  body: TBody;
}

export default class AwtrixNgClient {

  readonly #transport: AwtrixNgHttpTransport;

  constructor(transport: AwtrixNgHttpTransport) {
    this.#transport = transport;
  }

  getDevice(): Promise<AwtrixNgApiDeviceStateResponse> {
    return this.#request<AwtrixNgApiDeviceStateResponse>({
      method: 'GET',
      path: '/api/v1/device',
    });
  }

  getVersion(): Promise<AwtrixNgApiVersionResponse> {
    return this.#request<AwtrixNgApiVersionResponse>({
      method: 'GET',
      path: '/api/v1/version',
    });
  }

  getCapabilities(): Promise<AwtrixNgApiCapabilitiesResponse> {
    return this.#request<AwtrixNgApiCapabilitiesResponse>({
      method: 'GET',
      path: '/api/v1/capabilities',
    });
  }

  getSettings(): Promise<AwtrixNgApiSettingsResponse> {
    return this.#request<AwtrixNgApiSettingsResponse>({
      method: 'GET',
      path: '/api/v1/settings',
    });
  }

  patchSettings(patch: AwtrixNgApiSettingsPatch): Promise<AwtrixNgApiSettingsResponse> {
    return this.#request<AwtrixNgApiSettingsResponse, AwtrixNgApiSettingsPatch>({
      method: 'PATCH',
      path: '/api/v1/settings',
      body: patch,
    });
  }

  getDisplay(): Promise<AwtrixNgApiDisplayResponse> {
    return this.#request<AwtrixNgApiDisplayResponse>({
      method: 'GET',
      path: '/api/v1/display',
    });
  }

  patchDisplay(patch: AwtrixNgApiDisplayPatch): Promise<AwtrixNgApiOkResponse> {
    return this.#request<AwtrixNgApiOkResponse, AwtrixNgApiDisplayPatch>({
      method: 'PATCH',
      path: '/api/v1/display',
      body: patch,
    });
  }

  sendNotification(payload: AwtrixNgApiNotificationPayload): Promise<AwtrixNgApiOkResponse> {
    return this.#request<AwtrixNgApiOkResponse, AwtrixNgApiNotificationPayload>({
      method: 'POST',
      path: '/api/v1/notifications',
      body: payload,
    });
  }

  dismissActiveNotification(): Promise<AwtrixNgApiOkResponse> {
    return this.#request<AwtrixNgApiOkResponse>({
      method: 'DELETE',
      path: '/api/v1/notifications/active',
    });
  }

  putIndicator(id: AwtrixNgIndicatorId, payload: AwtrixNgApiIndicatorPayload): Promise<AwtrixNgApiOkResponse> {
    return this.#request<AwtrixNgApiOkResponse, AwtrixNgApiIndicatorPayload>({
      method: 'PUT',
      path: `/api/v1/indicators/${id}`,
      body: payload,
    });
  }

  deleteIndicator(id: AwtrixNgIndicatorId): Promise<AwtrixNgApiOkResponse> {
    return this.#request<AwtrixNgApiOkResponse>({
      method: 'DELETE',
      path: `/api/v1/indicators/${id}`,
    });
  }

  playRtttl(rtttl: string): Promise<AwtrixNgApiOkResponse> {
    return this.#request<AwtrixNgApiOkResponse, AwtrixNgApiSoundPlayPayload>({
      method: 'POST',
      path: '/api/v1/sounds/play',
      body: { rtttl },
    });
  }

  getApps(): Promise<AwtrixNgApiAppsResponse> {
    return this.#request<AwtrixNgApiAppsResponse>({
      method: 'GET',
      path: '/api/v1/apps',
    });
  }

  putAppsOrder(payload: AwtrixNgApiAppsOrderPayload): Promise<AwtrixNgApiOkResponse> {
    return this.#request<AwtrixNgApiOkResponse, AwtrixNgApiAppsOrderPayload>({
      method: 'PUT',
      path: '/api/v1/apps/order',
      body: {
        ...(payload.order === undefined ? {} : { order: [...payload.order] }),
        disabled: [...payload.disabled],
      },
    });
  }

  putPushedApp(name: string, payload: AwtrixNgApiPushedAppPayload): Promise<AwtrixNgApiOkResponse> {
    return this.#request<AwtrixNgApiOkResponse, AwtrixNgApiPushedAppPayload>({
      method: 'PUT',
      path: `/api/v1/apps/pushed/${this.#pathSegment(name)}`,
      body: payload,
    });
  }

  deleteApp(name: string): Promise<AwtrixNgApiOkResponse> {
    return this.#request<AwtrixNgApiOkResponse>({
      method: 'DELETE',
      path: `/api/v1/apps/${this.#pathSegment(name)}`,
    });
  }

  appNext(): Promise<AwtrixNgApiOkResponse> {
    return this.#request<AwtrixNgApiOkResponse>({
      method: 'POST',
      path: '/api/v1/apps/next',
    });
  }

  appPrevious(): Promise<AwtrixNgApiOkResponse> {
    return this.#request<AwtrixNgApiOkResponse>({
      method: 'POST',
      path: '/api/v1/apps/previous',
    });
  }

  listFiles(dir: AwtrixNgFileDirectory): Promise<AwtrixNgApiFilesResponse> {
    return this.#request<AwtrixNgApiFilesResponse>({
      method: 'GET',
      path: '/api/v1/files',
      query: { dir },
    });
  }

  uploadFile<TBody = unknown>(upload: AwtrixNgFileUploadRequest<TBody>): Promise<AwtrixNgApiOkResponse> {
    return this.#request<AwtrixNgApiOkResponse, TBody>({
      method: 'POST',
      path: '/api/v1/files',
      query: { dir: upload.dir },
      body: upload.body,
    });
  }

  reboot(): Promise<AwtrixNgApiOkResponse> {
    return this.#request<AwtrixNgApiOkResponse>({
      method: 'POST',
      path: '/api/v1/device/reboot',
    });
  }

  async #request<TResponse, TBody = unknown>(request: AwtrixNgHttpRequest<TBody>): Promise<TResponse> {
    try {
      return (await this.#transport.request<TResponse, TBody>(request)).data;
    } catch (error: unknown) {
      if (error instanceof AwtrixNgHttpError) {
        throw parseAwtrixNgApiError(error);
      }

      throw error;
    }
  }

  #pathSegment(value: string): string {
    return encodeURIComponent(value);
  }

}
