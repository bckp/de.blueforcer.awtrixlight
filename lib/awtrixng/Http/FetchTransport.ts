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
import { isRecord } from '../Support/Guards';

const DefaultTimeoutMs = 10000;
const UserAgent = 'Homey/1.0';
const RedactedHeaderValue = '<redacted>';

interface HeaderProviderBody {
  getHeaders(): AwtrixNgHeaders;
}

const hasHeaderProvider = (body: unknown): body is HeaderProviderBody => (
  isRecord(body) && typeof body.getHeaders === 'function'
);

const normalizeHeaders = (headers: Headers): AwtrixNgHeaders => {
  const result: AwtrixNgHeaders = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
};

const hasHeader = (headers: AwtrixNgHeaders, headerName: string): boolean => {
  const normalizedName = headerName.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === normalizedName);
};

const redactSensitiveHeaders = (headers: AwtrixNgHeaders): AwtrixNgHeaders => Object.entries(headers).reduce<AwtrixNgHeaders>((result, [key, value]) => {
  result[key] = key.toLowerCase() === 'authorization' ? RedactedHeaderValue : value;
  return result;
}, {});

export default class FetchAwtrixNgHttpTransport implements AwtrixNgHttpTransport {

  readonly #baseUrl: string;
  readonly #timeoutMs: number;
  readonly #auth?: AwtrixNgHttpTransportOptions['auth'];
  readonly #debug: boolean;
  readonly #log: AwtrixNgDebugLogger;

  constructor(options: AwtrixNgHttpTransportOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.#timeoutMs = options.timeoutMs || DefaultTimeoutMs;
    this.#auth = options.auth;
    this.#debug = options.debug === true;
    // eslint-disable-next-line no-console
    this.#log = options.log || console.log;
  }

  async request<TResponse = unknown, TBody = unknown>(
    request: AwtrixNgHttpRequest<TBody>,
  ): Promise<AwtrixNgHttpSuccess<TResponse>> {
    const url = this.#getUrl(request.path, request.query);
    const headers = this.#getHeaders(request.headers, request.body);
    const timeout = request.timeoutMs || this.#timeoutMs;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error('Request Timeout')), timeout);

    const config: NonNullable<Parameters<typeof fetch>[1]> = {
      method: request.method,
      headers: headers as Record<string, string>,
      signal: controller.signal,
    };

    if (request.body instanceof FormData || request.body instanceof ArrayBuffer || request.body instanceof Uint8Array || typeof request.body === 'string') {
      config.body = request.body as any;
    } else if (request.body !== undefined) {
      config.body = JSON.stringify(request.body);
    }

    // Native fetch automatically sets Content-Type for FormData with the correct boundary
    if (request.body instanceof FormData && config.headers && 'Content-Type' in config.headers) {
      delete (config.headers as Record<string, string>)['Content-Type'];
    }

    try {
      this.#debugRequest(request.method, url, headers, request.body, request.query);

      const response = await fetch(url, config);
      clearTimeout(timeoutId);

      let responseData: any;
      if (request.responseType === 'binary') {
        responseData = await response.arrayBuffer();
      } else if (request.responseType === 'text') {
        responseData = await response.text();
      } else {
        const text = await response.text();
        try {
          responseData = text ? JSON.parse(text) : undefined;
        } catch {
          responseData = text;
        }
      }

      const normalizedHeaders = normalizeHeaders(response.headers);
      this.#debugResponse(request.method, url, response.status, response.statusText, responseData, normalizedHeaders);

      if (!response.ok) {
        throw new AwtrixNgHttpError({
          method: request.method,
          url,
          message: `Request failed with status code ${response.status}`,
          status: response.status,
          headers: normalizedHeaders,
          rawBody: responseData,
        });
      }

      return {
        status: response.status,
        headers: normalizedHeaders,
        data: responseData as TResponse,
      };
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      this.#debugFailure(request.method, url, error);
      if (error instanceof AwtrixNgHttpError) {
        throw error;
      }
      throw this.#toHttpError(error, request.method, url);
    }
  }

  #getUrl(path: string, query?: Record<string, unknown>): string {
    const basePath = path.startsWith('/') ? `${this.#baseUrl}${path}` : `${this.#baseUrl}/${path}`;
    if (!query || Object.keys(query).length === 0) {
      return basePath;
    }

    const searchParams = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    });

    return `${basePath}?${searchParams.toString()}`;
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

    if (body !== undefined && !hasHeader(result, 'content-type') && !(body instanceof FormData)) {
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

  #debugResponse(method: AwtrixNgHttpMethod, url: string, status: number, statusText: string, data: any, headers: AwtrixNgHeaders): void {
    if (!this.#debug) {
      return;
    }

    this.#log({
      message: `${method}(response)`,
      url,
      dump: {
        status,
        statusText,
        data,
        headers,
      },
    });
  }

  #debugFailure(method: AwtrixNgHttpMethod, url: string, error: unknown): void {
    if (!this.#debug) {
      return;
    }

    this.#log({
      message: `${method}(error)`,
      url,
      arg: error instanceof Error ? error.message : error,
    });
  }

  #toHttpError(error: unknown, method: AwtrixNgHttpMethod, url: string): AwtrixNgHttpError {
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
