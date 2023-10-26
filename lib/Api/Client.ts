import axios from 'axios';
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
    const url: string = this.#getApiUrl(cmd);

    // eslint-disable-next-line
    this.debug && this.log(`GET ${url}`);

    try {
      const result = await axios.get(url, {
        headers: this.#getHeaders(),
      });
      return {
        status: this.#translateStatusCode(result.status),
        data: result.data,
      };
    } catch (error) {
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
  }

  async post(cmd: string, data: any): Promise<Response> {
    const url: string = this.#getApiUrl(cmd);

    // eslint-disable-next-line
    this.debug && this.log(`GET ${url}`);

    try {
      const result = await axios.post(url, data, {
        headers: this.#getHeaders(),
      });
      return {
        status: this.#translateStatusCode(result.status),
      };
    } catch (error) {
      let status = Status.Error;
      let message = 'unknown error';

      if (axios.isAxiosError(error)) {
        status = this.#translateStatusCode(error.response?.status || 500);
        message = error.message;
      }

      return {
        status,
        message,
      };
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

}
