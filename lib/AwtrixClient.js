'use strict';

const axios = require('axios');
const responses = require('./AwtrixClientResponses');

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
      const result = await this.get('stats');
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

  get(path) {
    // eslint-disable-next-line
    this.debug && this.log(`GET ${this.getUrl(path)}`);

    return axios.get(this.getUrl(path), {
      headers: this.getHeaders(),
    });
  }

  post(path, data) {
    // eslint-disable-next-line
    this.debug && this.log(`GET ${this.getUrl(path)}`, data);

    return axios.post(this.getUrl(path), data, {
      headers: this.getHeaders(),
    });
  }

  getHeaders() {
    if (!this.user || !this.pass) {
      return {};
    }

    const token = Buffer.from(`${this.user}:${this.pass}`).toString('base64');
    return {
      Authorization: `Basic ${token}`,
    };
  }

  async notify(msg, options) {
    const opt = this._parseNotifyOptions(options || {});
    opt.text = msg;

    const response = await this.post('notify', opt);
    return response.status === 200;
  }

  async app(id, msg, options) {
    const opt = this._parseAppOptions(options || {});
    const app = this._parseAppName(id);
    opt.text = msg;

    const response = await this.post(`notify?name=${app}`, opt);
    return response.status === 200;
  }

  async power(power) {
    return this.post('power', { power: !!power }).then((result) => result.status === 200).catch((error) => {
      this.log(error);
      return false;
    });
  }

  async dismiss() {
    return this.post('notify/dismiss').then((result) => result.status === 200).catch((error) => {
      this.log(error);
      return false;
    });
  }

  async indicator(id, options) {
    const indicator = Math.min(Math.max(id, 1), 3);
    const opt = {};

    opt.color = options.color || '0';

    if (options.fade !== undefined) {
      opt.fade = options.fade;
    }
    if (options.blink !== undefined) {
      opt.blink = options.blink;
    }

    this.post(`indicator${indicator}`, opt).then((result) => result.status === 200).catch((error) => {
      this.log(error);
      return false;
    });
  }

  async getStats() {
    return this.get('stats').then((result) => result.data);
  }

  async getSettings() {
    return this.get('settings').then((result) => result.data);
  }

  async setSettings(settings) {
    this.post('settings', settings).then((result) => result.status === 200).catch((error) => {
      this.log(error);
      return false;
    });
  }

  async reboot() {
    this.post('reboot').then((result) => result.status === 200).catch((error) => {
      this.log(error);
      return false;
    });
  }

  _parseNotifyOptions(options) {
    // Parse common data
    const opt = this._parseBasicOptions(options);

    // Duration and stickiness
    if (options.duration === 'hold') {
      opt.hold = true;
      opt.duration = 0;
    } else if (!Number.isNaN(Number.parseInt(options.duration, 10))) {
      this.log('parsed', Number.isNaN(parseInt(options.duration, 10)), options.duration);
      opt.duration = parseInt(options.duration, 10);
    }

    // Return
    return opt;
  }

  _parseAppOptions(options) {
    const opt = this._parseBasicOptions(options);

    return opt;
  }

  _parseBasicOptions(options) {
    const opt = {};

    // Color
    if (options.color) {
      opt.color = options.color;
    }

    // Return
    return opt;
  }

  _parseAppName(id) {
    const name = id.replace(/[^a-z0-9]+/g, '').toLowerCase();

    // Return
    return `homey_${name}`;
  }

};
