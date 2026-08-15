import axios, { AxiosResponse } from 'axios';
import FormData from 'form-data';
import { Response, Status } from './Response';

const Timeout = 10000;
const RedactedHeaderValue = '<redacted>';

export const statusFromHttpCode = (code: number): Status => {
  if (code >= 200 && code < 300) return Status.Ok;
  if (code === 401) return Status.AuthRequired;
  if (code === 403) return Status.AuthFailed;
  if (code === 404) return Status.NotFound;
  return Status.Error;
};
type ClientOptions = {
  ip: string;
  user?: string;
  pass?: string;
  log?: (message?: any, ...optionalParams: any[]) => void;
}

export interface RequestHeaders {
  Authorization?: string;
  [propName: string]: any;
}

const redactAuthorization = (headers: unknown): unknown => {
  if (typeof headers !== 'object' || headers === null) return headers;
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [
    key, key.toLowerCase() === 'authorization' ? RedactedHeaderValue : value,
  ]));
};

export default class Client {

  ip: string;
  debug: boolean = false;
  user: string = '';
  pass: string = '';

  log: (message?: any, ...optionalParams: any[]) => void;

  constructor(options: ClientOptions) {
    this.ip = options.ip;

    this.user = options.user || '';
    this.pass = options.pass || '';

    // eslint-disable-next-line no-console
    this.log = options.log || console.log;
  }

  setDebug(debug: boolean): void {
    this.debug = debug;
  }

  setIp(ip: string): void {
    this.ip = ip;
  }

  setCredentials(user: string, pass: string): void {
    this.user = user;
    this.pass = pass;
  }

  #normalizeAddress(address: string): string {
    const trimmed = address.trim();
    const containsMultipleColons = trimmed.indexOf(':') !== trimmed.lastIndexOf(':');

    if (containsMultipleColons && !trimmed.startsWith('[') && !trimmed.endsWith(']')) {
      return `[${trimmed}]`;
    }

    return trimmed;
  }

  #getApiUrl(path: string): string {
    return this.#getUrl(`api/${path}`);
  }

  #getUrl(path: string): string {
    const address = this.#normalizeAddress(this.ip);
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    return `http://${address}/${cleanPath}`;
  }

  async get(cmd: string): Promise<Response> {
    return this.#getRequest(this.#getApiUrl(cmd));
  }

  async getDirect(path: string): Promise<Response> {
    return this.#getRequest(this.#getUrl(path));
  }

  async #getRequest(url: string): Promise<Response> {
    try {
      const headers = this.#getHeaders();
      this.#debugRequest('GET', url, headers);
      const result = await axios.get(url, {
        headers,
        timeout: Timeout,
        maxRedirects: 0,
      });
      this.#debugResponse('GET', url, result);
      return {
        status: statusFromHttpCode(result.status),
        data: result.data,
      };
    } catch (error: any) {
      return this.#requestError(error, url);
    }
  }

  async post(cmd: string, data: any, headers?: RequestHeaders): Promise<Response> {
    const url: string = this.#getApiUrl(cmd);
    try {
      const requestHeaders = this.#getHeaders(headers);
      this.#debugRequest('POST', url, requestHeaders, data);
      const result = await axios.post(url, data, {
        headers: requestHeaders,
        timeout: Timeout,
        maxRedirects: 0,
      });
      this.#debugResponse('POST', url, result);
      return {
        status: statusFromHttpCode(result.status),
      };
    } catch (error: any) {
      return this.#requestError(error, url);
    }
  }

  async upload(path: string, form: FormData): Promise<Response> {
    const url: string = this.#getUrl(path);
    try {
      const headers = this.#getHeaders(form.getHeaders());
      this.#debugRequest('POST(upload)', url, headers);
      const result = await axios.post(url, form, {
        headers,
        timeout: Timeout,
        maxRedirects: 0,
      });
      this.#debugResponse('POST(upload)', url, result);
      return {
        status: statusFromHttpCode(result.status),
      };
    } catch (error: any) {
      return this.#requestError(error, url);
    }
  }

  #getHeaders(headers: RequestHeaders = {}): RequestHeaders {
    const result: RequestHeaders = {
      Accept: '*/*',
      'User-Agent': 'Homey/1.0',
      ...headers,
    };

    const hasContentType = Object.keys(result).some((key) => key.toLowerCase() === 'content-type');
    if (!hasContentType) {
      result['Content-Type'] = 'application/json';
    }

    if (!this.user || !this.pass) {
      return result;
    }

    const token = Buffer.from(`${this.user}:${this.pass}`).toString('base64');
    result.Authorization = `Basic ${token}`;

    return result;
  }

  #requestError(error: any, url: string): Response {
    this.#debugError('Result(error)', url, error.message || error);

    // Device did not respond in time
    if (error.code === 'ECONNABORTED' || error.code === 'ERR_CANCELED') {
      return {
        status: Status.NotFound,
      };
    }

    let message = 'unknown error';
    let status = Status.Error;

    if (axios.isAxiosError(error)) {
      message = error.message;
      status = statusFromHttpCode(error.response?.status || 500);
    }

    return {
      status,
      message,
    };
  }

  #debugRequest(message: string, url: string, headers?: RequestHeaders, data?: any): void {
    if (!this.debug) {
      return;
    }
    this.log({
      message,
      url,
      headers: redactAuthorization(headers),
      data,
    });
  }

  #debugResponse(message: string, url: string, response?: AxiosResponse): void {
    if (!this.debug) {
      return;
    }

    const dump: {status?: number, statusText?: string, data?: any, headers?: any} = {};
    if (response) {
      dump.status = response.status;
      dump.statusText = response.statusText;
      dump.data = response.data;
      dump.headers = redactAuthorization(response.headers);
    }
    this.log({
      message,
      url,
      dump,
    });
  }

  #debugError(message: string, url: string, arg: any): void {
    if (!this.debug) {
      return;
    }
    this.log({
      message,
      url,
      arg,
    });
  }

}
