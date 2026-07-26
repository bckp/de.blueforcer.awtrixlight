import Homey from 'homey';
import {
  autocompleteSharedIconAction,
  runSharedDismissNotificationAction,
  runSharedDisplaySetAction,
  runSharedIndicatorAction,
  runSharedIndicatorDismissAction,
  runSharedNotificationAction,
  runSharedNotificationRawAction,
  runSharedApplicationAction,
  runSharedApplicationRawAction,
  runSharedApplicationRemoveAction,
  runSharedRtttlAction,
  runSharedStickyNotificationAction,
  runSharedWeatherOverlayAction,
} from './drivers/shared-flow-actions';

module.exports = class AwtrixApp extends Homey.App {

  async onInit() {
    this.log('AwtrixApp has been initialized');
    this.initSharedFlows();
  }

  initSharedFlows(): void {
    this.homey.flow.getActionCard('notification')
      .registerRunListener(runSharedNotificationAction)
      .getArgument('icon')
      .registerAutocompleteListener(autocompleteSharedIconAction);

    this.homey.flow.getActionCard('notificationSticky')
      .registerRunListener(runSharedStickyNotificationAction)
      .getArgument('icon')
      .registerAutocompleteListener(autocompleteSharedIconAction);

    this.homey.flow.getActionCard('notificationRaw')
      .registerRunListener(runSharedNotificationRawAction);

    this.homey.flow.getActionCard('notificationDismiss')
      .registerRunListener(runSharedDismissNotificationAction);

    this.homey.flow.getActionCard('displaySet')
      .registerRunListener(runSharedDisplaySetAction);

    this.homey.flow.getActionCard('playRTTTL')
      .registerRunListener(runSharedRtttlAction);

    this.homey.flow.getActionCard('indicator')
      .registerRunListener(runSharedIndicatorAction);

    this.homey.flow.getActionCard('indicatorDismiss')
      .registerRunListener(runSharedIndicatorDismissAction);

    this.homey.flow.getActionCard('application')
      .registerRunListener(runSharedApplicationAction)
      .getArgument('icon')
      .registerAutocompleteListener(autocompleteSharedIconAction);

    this.homey.flow.getActionCard('applicationRaw')
      .registerRunListener(runSharedApplicationRawAction);

    this.homey.flow.getActionCard('applicationRemove')
      .registerRunListener(runSharedApplicationRemoveAction);

    this.homey.flow.getActionCard('weatherOverlay')
      .registerRunListener(runSharedWeatherOverlayAction);
  }

};
