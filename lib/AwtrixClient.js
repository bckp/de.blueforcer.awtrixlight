'use strict';

const axios = require('axios');
const path = require('path');
const FormData = require('form-data');
const responses = require('./AwtrixClientResponses');
const normalizer = require('./DataNormalizer');

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
      return this._translateStatusCode(result.status, result.statusText);
    } catch (error) {
      if (error.response) {
        return this._translateStatusCode(error.response.status, error.response.statusText);
      }

      return { state: responses.Error, msg: error.message || 'unknown error' };
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

  getApiUrl(path) {
    return this.getUrl(`api/${path}`);
  }

  getUrl(path) {
    return `http://${this.ip}/${path}`;
  }

  _get(path) {
    // eslint-disable-next-line
    this.debug && this.log(`GET ${this.getApiUrl(path)}`);

    return axios.get(this.getApiUrl(path), {
      headers: this._getHeaders(),
    });
  }

  _post(path, data, headers = {}) {
    // eslint-disable-next-line
    this.debug && this.log(`POST ${this.getApiUrl(path)}`, data);

    return axios.post(this.getApiUrl(path), data, {
      headers: {
        ...this._getHeaders(),
        ...headers,
      },
    });
  }

  async _uploadImage(name, data) {
    const form = new FormData();
    form.append('image', data, { filepath: `/ICONS/${name}` });

    return axios.post(this.getUrl('edit'), form, {
      headers: {
        ...this._getHeaders(),
        ...form.getHeaders(),
      },
    }).then((result) => result.status === 200).catch((error) => {
      this.log(error);
      return false;
    });
  }

  async _images() {
    return axios.get(this.getUrl('list?dir=/ICONS/'), {
      headers: this._getHeaders(),
    }).then((result) => result.data.map((image) => path.parse(image.name).name)).catch((error) => {
      this.log(error.message || error);
    });
  }

  /*
  // TODO: Switch to PROXY that will perform translate from PNG to JPG
  async _imageFromSource(imageId) {
    return axios.get(`https://developer.lametric.com/content/apps/icon_thumbs/${imageId}`).then((result) => {
      if (result.status !== 200) {
        return null;
      }

      const type = result.headers['content-type'];
      const extension = mime.extension(type);
      return {
        type,
        data: result.data,
        name: imageId,
        extension,
      };
    }).catch((error) => {
      return null;
    });
  }
   */

  _getHeaders() {
    if (!this.user || !this.pass) {
      return {};
    }

    const token = Buffer.from(`${this.user}:${this.pass}`).toString('base64');
    return {
      Authorization: `Basic ${token}`,
    };
  }

  _translateStatusCode(code, text = '') {
    if (code >= 200 && code <= 400) {
      return { state: responses.Ok, msg: text };
    }

    if (code === 401) {
      return { state: responses.LoginRequired, msg: text };
    }

    if (code === 404) {
      return { state: responses.NotFound, msg: text };
    }

    return { state: responses.Error, msg: text };
  }

  async notify(msg, options) {
    const opt = normalizer.notifyOptions(options || {});
    opt.text = msg;

    return this._post('notify', opt).then((result) => result.status === 200).catch((error) => {
      this.log(error);
      return false;
    });
  }

  async app(id, msg, options) {
    const opt = normalizer.appOptions(options || {});
    const app = normalizer.appName(id, 'homey');
    opt.text = msg;

    return this._post(`notify?name=${app}`, opt).then((result) => result.status === 200).catch((error) => {
      this.log(error);
      return false;
    });
  }

  async power(power) {
    return this._post('power', { power: !!power }).then((result) => result.status === 200).catch((error) => {
      this.log(error);
      return false;
    });
  }

  async rtttl(melody) {
    return this._post('rtttl', melody, { 'Content-Type': 'text/plain' }).then((result) => result.status === 200).catch((error) => {
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
    const indicator = normalizer.indicatorNumber(id);
    const opt = normalizer.indicatorOptions(options || {});

    return this._post(`indicator${indicator}`, opt).then((result) => result.status === 200).catch((error) => {
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
    return this._get('loop').then((result) => {
      return Object.keys(result.data).filter(normalizer.isHomeyApp);
    });
  }

};
