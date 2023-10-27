import axios, { AxiosResponse } from 'axios';
import FormData from 'form-data';
import { Response, Status } from './Response';

type ClientOptions = {
  ip: string;
  user?: string;
  pass?: string;
  log?: (message?: any, ...optionalParams: any[]) => void;
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
      const result = await axios.get(url, {
        headers: this.#getHeaders(),
      });
      this.#debugInfo('GET: ', url, result);
      return {
        status: this.#translateStatusCode(result.status),
        data: result.data,
      };
    } catch (error: any) {
      return this.#requestError(error, url);
    }
  }

  async post(cmd: string, data: any): Promise<Response> {
    const url: string = this.#getApiUrl(cmd);
    try {
      const result = await axios.post(url, data, {
        headers: this.#getHeaders(),
      });
      this.#debugInfo('POST: ', url, result);
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
      const result = await axios.post(url, form, {
        headers: {
          ...this.#getHeaders(),
          ...form.getHeaders(),
        },
      });
      this.#debugInfo('POST(upload): ', url, result);
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

  #getHeaders(): object {
    if (!this.user || !this.pass) {
      return {};
    }

    const token = Buffer.from(`${this.user}:${this.pass}`).toString('base64');
    return {
      Authorization: `Basic ${token}`,
    };
  }

  #requestError(error: any, url: string): Response {
    this.#debugError('RESULT: ', url, error.message || error);

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

  #debugInfo(message: string, url: string, args?: AxiosResponse): void {
    if (!this.debug) {
      return;
    }

    const dump: {status?: number, statusText?: string, data?: any, headers?: any} = {};
    if (args) {
      dump.status = args.status;
      dump.statusText = args.statusText;
      dump.data = args.data;
      dump.headers = args.headers;
    }
    this.log(message, url, dump);
  }

  #debugError(message: string, url: string, arg: any): void {
    if (!this.debug) {
      return;
    }
    this.log(message, url, arg);
  }

}
