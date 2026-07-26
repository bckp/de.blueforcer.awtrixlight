import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import {
  AwtrixNgDebugLogger,
  AwtrixNgHeaders,
  AwtrixNgHttpError,
  AwtrixNgHttpMethod,
  AwtrixNgHttpRequest,
  AwtrixNgHttpSuccess,
  AwtrixNgHttpTransport,
  AwtrixNgHttpTransportOptions,
} from './Transport';

const DefaultTimeoutMs = 10000;
const UserAgent = 'Homey/1.0';
const RedactedHeaderValue = '<redacted>';

interface HeaderProviderBody {
  getHeaders(): AwtrixNgHeaders;
}

interface AxiosRequestExecutor {
  request<TResponse = unknown, TBody = unknown>(config: AxiosRequestConfig<TBody>): Promise<AxiosResponse<TResponse, TBody>>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const hasHeaderProvider = (body: unknown): body is HeaderProviderBody => (
  isRecord(body) && typeof body.getHeaders === 'function'
);

const normalizeHeaders = (headers: unknown): AwtrixNgHeaders => {
  if (!isRecord(headers)) {
    return {};
  }

  return Object.entries(headers).reduce<AwtrixNgHeaders>((result, [key, value]) => {
    if (value === undefined || value === null) {
      return result;
    }

    if (Array.isArray(value)) {
      result[key] = value.join(', ');
      return result;
    }

    result[key] = String(value);
    return result;
  }, {});
};

const hasHeader = (headers: AwtrixNgHeaders, headerName: string): boolean => {
  const normalizedName = headerName.toLowerCase();

  return Object.keys(headers).some((key) => key.toLowerCase() === normalizedName);
};

const redactSensitiveHeaders = (headers: AwtrixNgHeaders): AwtrixNgHeaders => Object.entries(headers).reduce<AwtrixNgHeaders>((result, [key, value]) => {
  result[key] = key.toLowerCase() === 'authorization' ? RedactedHeaderValue : value;
  return result;
}, {});

const toAxiosResponseType = (responseType: AwtrixNgHttpRequest['responseType']): AxiosRequestConfig['responseType'] => {
  if (responseType === 'binary') {
    return 'arraybuffer';
  }

  return responseType;
};

export default class AxiosAwtrixNgHttpTransport implements AwtrixNgHttpTransport {

  readonly #baseUrl: string;

  readonly #timeoutMs: number;

  readonly #auth?: AwtrixNgHttpTransportOptions['auth'];

  readonly #debug: boolean;

  readonly #log: AwtrixNgDebugLogger;

  readonly #axiosClient: AxiosRequestExecutor;

  constructor(options: AwtrixNgHttpTransportOptions, axiosClient: AxiosRequestExecutor = axios as AxiosInstance) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.#timeoutMs = options.timeoutMs || DefaultTimeoutMs;
    this.#auth = options.auth;
    this.#debug = options.debug === true;
    // eslint-disable-next-line no-console
    this.#log = options.log || console.log;
    this.#axiosClient = axiosClient;
  }

  async request<TResponse = unknown, TBody = unknown>(
    request: AwtrixNgHttpRequest<TBody>,
  ): Promise<AwtrixNgHttpSuccess<TResponse>> {
    const url = this.#getUrl(request.path);
    const headers = this.#getHeaders(request.headers, request.body);
    const timeout = request.timeoutMs || this.#timeoutMs;

    const config: AxiosRequestConfig<TBody> = {
      method: request.method,
      url,
      headers,
      params: request.query,
      data: request.body,
      timeout,
      responseType: toAxiosResponseType(request.responseType),
    };

    try {
      this.#debugRequest(request.method, url, headers, request.body, request.query);
      const response = await this.#axiosClient.request<TResponse, TBody>(config);
      this.#debugResponse(request.method, url, response);

      return {
        status: response.status,
        headers: normalizeHeaders(response.headers),
        data: response.data,
      };
    } catch (error: unknown) {
      this.#debugFailure(request.method, url, error);
      throw this.#toHttpError(error, request.method, url);
    }
  }

  #getUrl(path: string): string {
    if (path.startsWith('/')) {
      return `${this.#baseUrl}${path}`;
    }

    return `${this.#baseUrl}/${path}`;
  }

  #getHeaders<TBody>(headers: AwtrixNgHeaders = {}, body?: TBody): AwtrixNgHeaders {
    const result: AwtrixNgHeaders = {
      Accept: '*/*',
      'User-Agent': UserAgent,
      ...headers,
    };

    if (this.#auth) {
      const token = Buffer.from(`${this.#auth.username}:${this.#auth.password}`).toString('base64');
      result.Authorization = `Basic ${token}`;
    }

    if (hasHeaderProvider(body)) {
      return {
        ...result,
        ...body.getHeaders(),
      };
    }

    if (body !== undefined && !hasHeader(result, 'content-type')) {
      result['Content-Type'] = 'application/json';
    }

    return result;
  }

  #debugRequest<TBody>(
    method: AwtrixNgHttpMethod,
    url: string,
    headers: AwtrixNgHeaders,
    data?: TBody,
    query?: Record<string, unknown>,
  ): void {
    if (!this.#debug) {
      return;
    }

    this.#log({
      message: method,
      url,
      headers: redactSensitiveHeaders(headers),
      query,
      data,
    });
  }

  #debugResponse<TResponse, TBody>(method: AwtrixNgHttpMethod, url: string, response: AxiosResponse<TResponse, TBody>): void {
    if (!this.#debug) {
      return;
    }

    this.#log({
      message: `${method}(response)`,
      url,
      dump: {
        status: response.status,
        statusText: response.statusText,
        data: response.data,
        headers: response.headers,
      },
    });
  }

  #debugFailure(method: AwtrixNgHttpMethod, url: string, error: unknown): void {
    if (!this.#debug) {
      return;
    }

    if (axios.isAxiosError(error) && error.response !== undefined) {
      this.#debugResponse(method, url, error.response);
    }

    this.#log({
      message: `${method}(error)`,
      url,
      arg: error instanceof Error ? error.message : error,
    });
  }

  #toHttpError(error: unknown, method: AwtrixNgHttpMethod, url: string): AwtrixNgHttpError {
    if (axios.isAxiosError(error)) {
      return new AwtrixNgHttpError({
        method,
        url,
        message: error.message,
        status: error.response?.status,
        headers: normalizeHeaders(error.response?.headers),
        rawBody: error.response?.data,
        errorCause: error,
      });
    }

    if (error instanceof Error) {
      return new AwtrixNgHttpError({
        method,
        url,
        message: error.message,
        errorCause: error,
      });
    }

    return new AwtrixNgHttpError({
      method,
      url,
      message: 'Unknown HTTP transport error',
      errorCause: error,
    });
  }

}
