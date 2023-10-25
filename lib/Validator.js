'use strict';

module.exports = class Validator {

  static isColor(color) {
    return /^#[0-9A-F]{6}$/i.test(color);
  }

  static isNumeric(number) {
    return Number.parseInt(number, 10) !== false;
  }

};
