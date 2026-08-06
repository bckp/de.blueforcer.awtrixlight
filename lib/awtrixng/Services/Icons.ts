import FormData from 'form-data';
import path from 'path';
import { AwtrixNgFileDirectory, AwtrixNgFileUploadRequest } from '../Api/Client';
import { AwtrixNgInvalidResponseError } from '../Api/InvalidResponseError';
import { AwtrixNgApiFilesResponse, AwtrixNgApiOkResponse } from '../Api/Types';

const IconsDirectory: AwtrixNgFileDirectory = '/ICONS';
const FilesEndpoint = '/api/v1/files';
// AWTRIX NG exposes a fast, specialized files API, so a short cache keeps results fresh.
const DefaultCacheTtlMs = 5000;

export interface AwtrixNgIconAutocompleteItem {
  name: string;
  id: string;
  description?: string;
}

export interface AwtrixNgIconListLabels {
  emptyName: string;
  emptyDescription: string;
}

export interface AwtrixNgIconUploadSource {
  fileName: string;
  body: Buffer;
}

export interface AwtrixNgIconClient {
  listFiles(dir: AwtrixNgFileDirectory): Promise<AwtrixNgApiFilesResponse>;
  uploadFile<TBody = unknown>(upload: AwtrixNgFileUploadRequest<TBody>): Promise<AwtrixNgApiOkResponse>;
}

interface AwtrixNgIconTimerHost {
  setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}

export interface AwtrixNgIconsOptions {
  emptyIcon: AwtrixNgIconAutocompleteItem;
  timerHost?: AwtrixNgIconTimerHost;
  cacheTtlMs?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object'
  && value !== null
  && !Array.isArray(value);

export const toAwtrixNgIconAutocompleteItems = (
  response: AwtrixNgApiFilesResponse,
  labels: AwtrixNgIconListLabels,
): AwtrixNgIconAutocompleteItem[] => [
  {
    name: labels.emptyName,
    id: '-',
    description: labels.emptyDescription,
  },
  ...response.files.map((file): AwtrixNgIconAutocompleteItem => {
    const iconName = path.parse(file.name).name;

    return {
      name: iconName,
      id: iconName,
    };
  }),
];

export const createAwtrixNgIconUploadForm = (source: AwtrixNgIconUploadSource): FormData => {
  const form = new FormData();
  form.append('file', source.body, { filename: source.fileName });

  return form;
};

export default class AwtrixNgIcons {

  readonly #client: AwtrixNgIconClient;

  readonly #emptyIcon: AwtrixNgIconAutocompleteItem;

  readonly #timerHost?: AwtrixNgIconTimerHost;

  readonly #cacheTtlMs: number;

  #list: AwtrixNgIconAutocompleteItem[] = [];

  #inFlight?: Promise<void>;

  #timer?: ReturnType<typeof setTimeout>;

  constructor(client: AwtrixNgIconClient, options: AwtrixNgIconsOptions) {
    this.#client = client;
    this.#emptyIcon = options.emptyIcon;
    this.#timerHost = options.timerHost;
    this.#cacheTtlMs = options.cacheTtlMs ?? DefaultCacheTtlMs;
  }

  async find(query: string): Promise<AwtrixNgIconAutocompleteItem[]> {
    const normalizedQuery = query.toLowerCase();

    return (await this.all()).filter((icon) => icon.name.toLowerCase().includes(normalizedQuery));
  }

  async all(): Promise<AwtrixNgIconAutocompleteItem[]> {
    if (this.#list.length === 0) {
      this.#inFlight ??= this.loadIcons().finally(() => {
        this.#inFlight = undefined;
      });
      await this.#inFlight;
    }

    this.#resetTimer();
    return this.#list;
  }

  async loadIcons(): Promise<void> {
    const response = await this.#client.listFiles(IconsDirectory);

    if (!isRecord(response) || !Array.isArray(response.files)) {
      throw new AwtrixNgInvalidResponseError({
        endpoint: FilesEndpoint,
        expectedShape: 'an object with a files array',
        actualValue: response,
      });
    }

    this.#list = toAwtrixNgIconAutocompleteItems(response, {
      emptyName: this.#emptyIcon.name,
      emptyDescription: this.#emptyIcon.description ?? '',
    });
  }

  async upload(source: AwtrixNgIconUploadSource): Promise<AwtrixNgApiOkResponse> {
    const response = await this.#client.uploadFile({
      dir: IconsDirectory,
      body: createAwtrixNgIconUploadForm(source),
    });

    this.invalidate();
    return response;
  }

  invalidate(): void {
    this.#list = [];

    if (this.#timerHost !== undefined && this.#timer !== undefined) {
      this.#timerHost.clearTimeout(this.#timer);
      this.#timer = undefined;
    }
  }

  #resetTimer(): void {
    if (this.#timerHost === undefined) {
      return;
    }

    if (this.#timer !== undefined) {
      this.#timerHost.clearTimeout(this.#timer);
    }

    this.#timer = this.#timerHost.setTimeout(() => {
      this.#list = [];
      this.#timer = undefined;
    }, this.#cacheTtlMs);
  }

}
