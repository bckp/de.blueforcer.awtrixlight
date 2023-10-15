'use strict';

module.exports = class DataNormalizer {

  static prefix = 'homey:';

  static notifyOptions(options) {
    const opt = DataNormalizer.basicOptions(options);

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

  static appOptions(options) {
    const opt = DataNormalizer.basicOptions(options);

    return opt;
  }

  static basicOptions(options) {
    const opt = {};

    // Color
    if (options.color) {
      opt.color = options.color;
    }

    // Return
    return opt;
  }

  static indicatorOptions(options) {
    return this._filterValues({
      color: options.color || null,
      fade: this._parseInt(options.fade),
      blink: this._parseInt(options.blink),
    });
  }

  static indicatorNumber(id) {
    return Math.min(Math.max(id, 1), 3);
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

};
