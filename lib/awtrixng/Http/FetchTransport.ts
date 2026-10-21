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
import { DefaultMaxResponseBytes, readLimitedResponse, ResponseTooLargeError } from './ResponseBody';

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

const redactSensitivePayload = (url: string, data: unknown): unknown => {
  // Audio state and payloads can contain Soundboard's bearer-like file locator.
  if (url.includes('/api/v1/system') || url.includes('/api/v1/audio')) {
    return RedactedHeaderValue;
  }
  if (url.includes('/api/v1/notifications') && isRecord(data) && data.sound !== undefined) {
    return { ...data, sound: RedactedHeaderValue };
  }
  return data;
};

export default class FetchAwtrixNgHttpTransport implements AwtrixNgHttpTransport {

  readonly #baseUrl: string;
  readonly #timeoutMs: number;
  readonly #maxResponseBytes: number;
  readonly #auth?: AwtrixNgHttpTransportOptions['auth'];
  readonly #debug: boolean;
  readonly #log: AwtrixNgDebugLogger;

  constructor(options: AwtrixNgHttpTransportOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.#timeoutMs = options.timeoutMs || DefaultTimeoutMs;
    this.#maxResponseBytes = options.maxResponseBytes ?? DefaultMaxResponseBytes;
    if (!Number.isSafeInteger(this.#maxResponseBytes) || this.#maxResponseBytes < 1) throw new RangeError('Invalid HTTP response byte limit.');
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
    const debugUrl = request.redactDebug ? RedactedHeaderValue : url;
    const timeout = request.timeoutMs || this.#timeoutMs;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error('Request Timeout')), timeout);

    const config: NonNullable<Parameters<typeof fetch>[1]> = {
      method: request.method,
      headers: headers as Record<string, string>,
      signal: controller.signal,
      redirect: 'manual',
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

    let response: Response | undefined;
    try {
      this.#debugRequest(request.method, debugUrl,
        request.redactDebug ? {} : headers,
        request.redactDebug ? RedactedHeaderValue : request.body,
        request.redactDebug ? undefined : request.query);

      response = await fetch(url, config);
      const bytes = await readLimitedResponse(response, this.#maxResponseBytes, controller);

      let responseData: any;
      if (request.responseType === 'binary') {
        responseData = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      } else if (request.responseType === 'text') {
        responseData = new TextDecoder().decode(bytes);
      } else {
        const text = new TextDecoder().decode(bytes);
        try {
          responseData = text ? JSON.parse(text) : undefined;
        } catch {
          responseData = text;
        }
      }

      const normalizedHeaders = normalizeHeaders(response.headers);
      this.#debugResponse(request.method, debugUrl, response.status,
        request.redactDebug ? RedactedHeaderValue : response.statusText,
        request.redactDebug ? RedactedHeaderValue : responseData,
        request.redactDebug ? {} : normalizedHeaders);

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
      this.#debugFailure(request.method, debugUrl, request.redactDebug ? RedactedHeaderValue : error);
      if (error instanceof AwtrixNgHttpError) {
        throw error;
      }
      if (error instanceof ResponseTooLargeError && response !== undefined) {
        throw new AwtrixNgHttpError({
          method: request.method,
          url,
          status: response.status,
          headers: normalizeHeaders(response.headers),
          message: error.message,
          errorCause: error,
        });
      }
      throw this.#toHttpError(error, request.method, url);
    } finally {
      clearTimeout(timeoutId);
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
      data: redactSensitivePayload(url, data),
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
        data: redactSensitivePayload(url, data),
        headers,
      },
    });
  }

  #debugFailure(method: AwtrixNgHttpMethod, url: string, error: unknown): void {
    if (!this.#debug) {
      return;
    }

    let arg: unknown;
    if (url.includes('/api/v1/system')) {
      arg = RedactedHeaderValue;
    } else {
      arg = error instanceof Error ? error.message : error;
    }

    this.#log({
      message: `${method}(error)`,
      url,
      arg,
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
