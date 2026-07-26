export type AwtrixNgHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type AwtrixNgResponseType = 'json' | 'text' | 'binary';

export type AwtrixNgQueryValue = string | number | boolean | null | undefined;

export type AwtrixNgHeaders = Record<string, string>;

export interface AwtrixNgBasicAuthOptions {
  username: string;
  password: string;
}

export type AwtrixNgDebugLogger = (message?: unknown, ...optionalParams: unknown[]) => void;

export interface AwtrixNgHttpTransportOptions {
  baseUrl: string;
  timeoutMs?: number;
  auth?: AwtrixNgBasicAuthOptions;
  debug?: boolean;
  log?: AwtrixNgDebugLogger;
}

export interface AwtrixNgHttpRequest<TBody = unknown> {
  method: AwtrixNgHttpMethod;
  path: string;
  query?: Record<string, AwtrixNgQueryValue>;
  headers?: AwtrixNgHeaders;
  body?: TBody;
  responseType?: AwtrixNgResponseType;
  timeoutMs?: number;
}

export interface AwtrixNgHttpSuccess<TResponse = unknown> {
  status: number;
  headers: AwtrixNgHeaders;
  data: TResponse;
}

export interface AwtrixNgHttpErrorOptions {
  method: AwtrixNgHttpMethod;
  url: string;
  message: string;
  status?: number;
  headers?: AwtrixNgHeaders;
  rawBody?: unknown;
  errorCause?: unknown;
}

export class AwtrixNgHttpError extends Error {

  readonly method: AwtrixNgHttpMethod;

  readonly url: string;

  readonly status?: number;

  readonly headers: AwtrixNgHeaders;

  readonly rawBody?: unknown;

  readonly errorCause?: unknown;

  constructor(options: AwtrixNgHttpErrorOptions) {
    super(options.message);
    this.name = 'AwtrixNgHttpError';
    this.method = options.method;
    this.url = options.url;
    this.status = options.status;
    this.headers = options.headers || {};
    this.rawBody = options.rawBody;
    this.errorCause = options.errorCause;

    Object.setPrototypeOf(this, AwtrixNgHttpError.prototype);
  }

}

export interface AwtrixNgHttpTransport {
  request<TResponse = unknown, TBody = unknown>(request: AwtrixNgHttpRequest<TBody>): Promise<AwtrixNgHttpSuccess<TResponse>>;
}
