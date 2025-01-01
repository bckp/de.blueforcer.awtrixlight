import axios, { AxiosResponse } from 'axios';
import FormData from 'form-data';
import { Response, Status } from './Response';

const Timeout = 5000; // 5 seconds
const TimeoutUpload = Timeout * 2; // 4 seconds
const TimeoutRequest = Timeout / 2; // 2.5 seconds

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

function abortSignal(timeout: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeout);

  return controller.signal;
}

export default class Client {

  ip: string;
  debug: boolean = false;
  user: string = '';
  pass: string = '';

  // eslint-disable-next-line no-console
  log = console.log;

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

  #getApiUrl(path: string): string {
    return this.#getUrl(`api/${path}`);
  }

  #getUrl(path: string): string {
    return `http://${this.ip}/${path}`;
  }

  async get(cmd: string): Promise<Response> {
    return this.#getRequest(this.#getApiUrl(cmd));
  }

  async getDirect(path: string): Promise<Response> {
    return this.#getRequest(this.#getUrl(path));
  }

  async #getRequest(url: string): Promise<Response> {
    try {
      this.#debugRequest('GET', url);
      const result = await axios.get(url, {
        headers: this.#getHeaders(),
        timeout: Timeout,
        signal: abortSignal(TimeoutRequest),
      });
      this.#debugResponse('GET', url, result);
      return {
        status: this.#translateStatusCode(result.status),
        data: result.data,
      };
    } catch (error: any) {
      return this.#requestError(error, url);
    }
  }

  async post(cmd: string, data: any, headers?: RequestHeaders): Promise<Response> {
    const url: string = this.#getApiUrl(cmd);
    try {
      this.#debugRequest('POST', url, this.#getHeaders(headers), data);
      const result = await axios.post(url, data, {
        headers: this.#getHeaders(headers),
        timeout: Timeout,
        signal: abortSignal(TimeoutRequest),
      });
      this.#debugResponse('POST', url, result);
      return {
        status: this.#translateStatusCode(result.status),
      };
    } catch (error: any) {
      return this.#requestError(error, url);
    }
  }

  async upload(path: string, form: FormData): Promise<Response> {
    const url: string = this.#getUrl(path);
    try {
      this.#debugRequest('POST(upload)', url);
      const result = await axios.post(url, form, {
        headers: this.#getHeaders(form.getHeaders()),
        timeout: TimeoutUpload,
        signal: abortSignal(TimeoutRequest),
      });
      this.#debugResponse('POST(upload)', url, result);
      return {
        status: this.#translateStatusCode(result.status),
      };
    } catch (error: any) {
      return this.#requestError(error, url);
    }
  }

  #translateStatusCode(code: number): Status {
    if (code >= 200 && code <= 400) {
      return Status.Ok;
    }

    if (code === 401) {
      return Status.AuthRequired;
    }

    if (code === 403) {
      return Status.AuthFailed;
    }

    if (code === 404) {
      return Status.NotFound;
    }

    return Status.Error;
  }

  #getHeaders(headers: RequestHeaders = {}): object {
    headers['Content-Type'] = 'application/json';
    headers['User-Agent'] = 'Homey/1.0';
    headers.Accept = '*/*';

    if (!this.user || !this.pass) {
      return headers;
    }

    const token = Buffer.from(`${this.user}:${this.pass}`).toString('base64');
    headers.Authorization = `Basic ${token}`;

    return headers;
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
      status = this.#translateStatusCode(error.response?.status || 500);
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
      headers,
      data
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
      dump.headers = response.headers;
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
