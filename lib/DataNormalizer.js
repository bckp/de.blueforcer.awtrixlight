'use strict';

module.exports = class DataNormalizer {

  static prefix = 'homey:';

  static notifyOptions(options) {
    const opt = DataNormalizer.basicOptions(options);

    if ('hold' in options) {
      opt.hold = !!options.hold;
    }

    if ('duration' in options && !Number.isNaN(options.duration) && options.duration > 0) {
      opt.duration = options.duration;
    }

    return opt;
  }

  static appOptions(options) {
    const opt = DataNormalizer.basicOptions(options);

    if ('textCase' in options && Number.parseInt(options.textCase, 10) !== false) {
      opt.textCase = Math.max(2, Math.min(0, Number.parseInt(options.textCase, 10)));
    }
    if ('topText' in options) {
      opt.topText = !!options.topText;
    }
    if ('textOffset' in options && Number.parseInt(options.textOffset, 10) !== false) {
      opt.textOffset = Number.parseInt(options.textOffset, 10);
    }
    if ('center' in options) {
      opt.center = !!options.center;
    }
    if ('color' in options && DataNormalizer.#isValidColor(options.color)) {
      opt.color = options.color;
    }
    if ('gradient' in options && options.gradient.length === 2 && DataNormalizer.#isValidColor(options.gradient[0]) && DataNormalizer.#isValidColor(options.gradient[1])) {
      opt.gradient = options.gradient;
    }

    return opt;
  }

  static basicOptions(options) {
    const opt = {};

    // Color
    if (options.color) {
      opt.color = options.color;
    }
    if (options.icon && options.icon !== '-') {
      opt.icon = options.icon.toString();
    }

    // Return
    return opt;
  }

  static settings(settings) {
    const ret = {};

    Object.keys(settings).forEach((key) => {
      switch (key.toLowerCase()) {
        case 'tim':
        case 'dat':
        case 'hum':
        case 'temp':
        case 'bat':
        case 'abri':
        case 'atrans':
        case 'blockn':
        case 'uppercase':
          ret[key.toUpperCase()] = !!settings[key];
          break;

        case 'teff':
          ret[key.toUpperCase()] = Number.parseInt(settings[key], 10);
          break;

        default:
          break;
      }
    });

    return ret;
  }

  static indicatorOptions(options) {
    const ret = {
      color: options.color || '0',
    };

    if ('effect' in options && options.effect !== '-') {
      ret[options.effect] = options.duration || 1000;
    }
    return ret;
  }

  static indicatorNumber(id) {
    return Math.min(Math.max(Number.parseInt(id, 10), 1), 3);
  }

  static appName(id) {
    const name = id.replace(/[^a-z0-9]+/g, '').toLowerCase();

    // Return
    return `${DataNormalizer.prefix}${name}`;
  }

  static isHomeyApp(app) {
    return app.startsWith(DataNormalizer.prefix);
  }

  static _parseInt(value) {
    return parseInt(value, 10) || null;
  }

  static _filterValues(obj) {
    return Object.keys(obj).filter((key) => obj[key] !== null);
  }

  static #isValidColor(color) {
    return /^#[0-9A-F]{6}$/i.test(color);
  }

};
