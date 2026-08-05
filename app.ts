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

type SharedApplicationActionArgs = Parameters<typeof runSharedApplicationAction>[0];

type LegacyApplicationIconActionArgs = Omit<SharedApplicationActionArgs, 'name'> & {
  name: unknown;
};

type LegacyApplicationNameAutocompleteItem = {
  id: string;
  name: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const normalizeLegacyApplicationName = (value: unknown): string => {
  const candidates: unknown[] = [];

  if (typeof value === 'string') {
    candidates.push(value);
  } else if (isRecord(value)) {
    candidates.push(value.id, value.name);
  }

  const name = candidates.find((candidate): candidate is string => (
    typeof candidate === 'string' && candidate.trim().length > 0
  ));

  if (name === undefined) {
    throw new TypeError('Legacy application name must be a non-empty string or autocomplete selection.');
  }

  return name;
};

const runLegacyApplicationIconAction = async (args: LegacyApplicationIconActionArgs): Promise<void> => {
  await runSharedApplicationAction({
    ...args,
    name: normalizeLegacyApplicationName(args.name),
  });
};

const autocompleteLegacyApplicationNameAction = async (query: string): Promise<LegacyApplicationNameAutocompleteItem[]> => {
  if (query.trim().length === 0) {
    return [];
  }

  return [{ id: query, name: query }];
};

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

    const legacyApplicationIconCard = this.homey.flow.getActionCard('applicationIcon')
      .registerRunListener(runLegacyApplicationIconAction);
    legacyApplicationIconCard.getArgument('icon')
      .registerAutocompleteListener(autocompleteSharedIconAction);
    legacyApplicationIconCard.getArgument('name')
      .registerAutocompleteListener(autocompleteLegacyApplicationNameAction);

    this.homey.flow.getActionCard('applicationRaw')
      .registerRunListener(runSharedApplicationRawAction);

    this.homey.flow.getActionCard('applicationRemove')
      .registerRunListener(runSharedApplicationRemoveAction);

    this.homey.flow.getActionCard('weatherOverlay')
      .registerRunListener(runSharedWeatherOverlayAction);
  }

};
