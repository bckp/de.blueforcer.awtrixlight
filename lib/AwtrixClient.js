'use strict';

const axios = require('axios');
const responses = require('./AwtrixClientResponses');
const DataNormalizer = require('./DataNormalizer');

module.exports = class AwtrixClient {

  constructor(options) {
    options = options || {};
    this.ip = options.ip;
    this.debug = false;

    this.user = options.user || '';
    this.pass = options.pass || '';

    this.log = options.log || console.log;
  }

  async test() {
    try {
      const result = await this._get('stats');
      if (result.status >= 200 && result.status <= 400) {
        return { state: responses.Ok };
      }

      if (result.status === 401) {
        return { state: responses.LoginRequired };
      }

      if (result.status === 404) {
        return { state: responses.NotFound };
      }

      return { state: responses.Error, msg: result.statusText };
    } catch (error) {
      return { state: responses.Error, msg: error };
    }
  }

  setDebug(debug) {
    this.debug = debug;
  }

  setIp(ip) {
    this.ip = ip;
  }

  setCredentials(user, pass) {
    this.user = user;
    this.pass = pass;
  }

  getUrl(path) {
    return `http://${this.ip}/api/${path}`;
  }

  _get(path) {
    // eslint-disable-next-line
    this.debug && this.log(`GET ${this.getUrl(path)}`);

    return axios.get(this.getUrl(path), {
      headers: this._getHeaders(),
    });
  }

  _post(path, data) {
    // eslint-disable-next-line
    this.debug && this.log(`GET ${this.getUrl(path)}`, data);

    return axios.post(this.getUrl(path), data, {
      headers: this._getHeaders(),
    });
  }

  _getHeaders() {
    if (!this.user || !this.pass) {
      return {};
    }

    const token = Buffer.from(`${this.user}:${this.pass}`).toString('base64');
    return {
      Authorization: `Basic ${token}`,
    };
  }

  async notify(msg, options) {
    const opt = DataNormalizer.notifyOptions(options || {});
    opt.text = msg;

    const response = await this._post('notify', opt);
    return response.status === 200;
  }

  async app(id, msg, options) {
    const opt = DataNormalizer.appOptions(options || {});
    const app = DataNormalizer.appName(id, 'homey');
    opt.text = msg;

    const response = await this._post(`notify?name=${app}`, opt);
    return response.status === 200 ? app : null;
  }

  async power(power) {
    return this._post('power', { power: !!power }).then((result) => result.status === 200).catch((error) => {
      this.log(error);
      return false;
    });
  }

  async dismiss() {
    return this._post('notify/dismiss').then((result) => result.status === 200).catch((error) => {
      this.log(error);
      return false;
    });
  }

  async indicator(id, options) {
    const indicator = DataNormalizer.indicatorNumber(id);
    const opt = DataNormalizer.indicatorOptions(options || {});

    this._post(`indicator${indicator}`, opt).then((result) => result.status === 200).catch((error) => {
      this.log(error);
      return false;
    });
  }

  async getStats() {
    return this._get('stats').then((result) => result.data);
  }

  async getSettings() {
    return this._get('settings').then((result) => result.data);
  }

  async setSettings(settings) {
    this._post('settings', settings).then((result) => result.status === 200).catch((error) => {
      this.log(error);
      return false;
    });
  }

  async reboot() {
    this._post('reboot').then((result) => result.status === 200).catch((error) => {
      this.log(error);
      return false;
    });
  }

  async getApps() {
    this._get('loop').then((result) => {
      return result.data.values().filter(DataNormalizer.isHomeyApp);
    }).catch((error) => this.error);
  }

};
