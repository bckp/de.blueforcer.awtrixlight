'use strict';

const Homey = require('homey');

module.exports = class AwtrixApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('AwtrixApp has been initialized');
  }

}
