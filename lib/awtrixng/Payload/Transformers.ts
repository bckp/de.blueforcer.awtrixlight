import {
  AwtrixNgApiDisplayPatch,
  AwtrixNgApiIndicatorPayload,
  AwtrixNgApiNotificationPayload,
  AwtrixNgApiPagePayload,
  AwtrixNgApiPushedAppPayload,
  AwtrixNgApiScrollPayload,
  AwtrixNgApiSettingsPatch,
  AwtrixNgApiSoundPlayPayload,
} from '../Api/Types';

export {
  AwtrixNgHomeyPushedAppName,
  InvalidAwtrixNgHomeyPushedAppNameError,
  fromAwtrixNgHomeyPushedAppName,
  toAwtrixNgHomeyPushedAppName,
} from './PushedApps';

export type AwtrixNgTransformTarget = 'notification' | 'pushedApp' | 'displayPower' | 'displayOverlay' | 'rtttl' | 'indicator' | 'settings';

export type AwtrixNgUnsupportedPayloadFieldReason = 'unsupported-field' | 'unknown-field' | 'invalid-value';

export interface UnsupportedAwtrixNgPayloadFieldErrorOptions {
  field: string;
  target: AwtrixNgTransformTarget;
  reason: AwtrixNgUnsupportedPayloadFieldReason;
  details?: string;
}

export class UnsupportedAwtrixNgPayloadFieldError extends Error {

  readonly protocol = 'awtrix-ng';

  readonly field: string;

  readonly target: AwtrixNgTransformTarget;

  readonly reason: AwtrixNgUnsupportedPayloadFieldReason;

  readonly details?: string;

  constructor(options: UnsupportedAwtrixNgPayloadFieldErrorOptions) {
    super(UnsupportedAwtrixNgPayloadFieldError.formatMessage(options));
    this.name = 'UnsupportedAwtrixNgPayloadFieldError';
    this.field = options.field;
    this.target = options.target;
    this.reason = options.reason;
    this.details = options.details;

    Object.setPrototypeOf(this, UnsupportedAwtrixNgPayloadFieldError.prototype);
  }

  private static formatMessage(options: UnsupportedAwtrixNgPayloadFieldErrorOptions): string {
    const baseMessage = `Device ${options.target} payload field "${options.field}" is not supported: ${options.reason}`;

    if (!options.details) {
      return baseMessage;
    }

    return `${baseMessage}. ${options.details}`;
  }

}

type AwtrixNgPageInput = Omit<AwtrixNgApiPagePayload, 'scroll'> & {
  scroll?: AwtrixNgApiScrollPayload;
};

export type AwtrixNgNotificationInput = AwtrixNgPageInput & Omit<AwtrixNgApiNotificationPayload, keyof AwtrixNgApiPagePayload>;

export type AwtrixNgPushedAppInput = AwtrixNgPageInput & Omit<AwtrixNgApiPushedAppPayload, keyof AwtrixNgApiPagePayload>;

export type AwtrixNgIndicatorInput = AwtrixNgApiIndicatorPayload;

export interface AwtrixNgSettingsPatchInput {
  autoBrightness?: boolean;
  autoTransition?: boolean;
  blockNavigation?: boolean;
  uppercase?: boolean;
  transitionEffect?: string;
}

const pageFields = [
  'backgroundColor',
  'barChart',
  'chartAutoscale',
  'chartColor',
  'draw',
  'durationMs',
  'effect',
  'effectSpeed',
  'icon',
  'iconMode',
  'iconOffsetX',
  'lineChart',
  'overlay',
  'palette',
  'paletteBlend',
  'paletteSpan',
  'paletteSpeed',
  'progress',
  'progressColor',
  'progressTrackColor',
  'scroll',
  'text',
  'textBlinkMs',
  'textCase',
  'textCenter',
  'textColor',
  'textFadeMs',
  'textInFront',
  'textOffsetX',
] as const;

const notificationFields = new Set<string>([
  ...pageFields,
  'hold',
  'name',
  'sound',
  'soundLoop',
  'soundRtttl',
  'stack',
  'wakeup',
]);

const pushedAppFields = new Set<string>([
  ...pageFields,
  'lifetimeExpiry',
  'lifetimeMs',
  'repeat',
]);

const indicatorFields = new Set<string>([
  'blinkMs',
  'color',
  'fadeMs',
]);

const settingsFields = new Set<string>([
  'autoBrightness',
  'autoTransition',
  'blockNavigation',
  'transitionEffect',
  'uppercase',
]);

const awtrix3FieldReplacements: Readonly<Record<string, string>> = {
  background: 'backgroundColor',
  bar: 'barChart',
  blinkText: 'textBlinkMs',
  center: 'textCenter',
  color: 'textColor',
  duration: 'durationMs',
  effectSettings: 'effectSpeed/palette/paletteBlend',
  fadeText: 'textFadeMs',
  gradient: 'palette + textColor',
  lifetime: 'lifetimeMs',
  lifetimeMode: 'lifetimeExpiry',
  line: 'lineChart',
  loopSound: 'soundLoop',
  noScroll: 'scroll',
  progressBC: 'progressTrackColor',
  progressC: 'progressColor',
  pushIcon: 'iconMode',
  rainbow: 'palette + textColor',
  rtttl: 'soundRtttl',
  scrollMode: 'scroll',
  scrollSpeed: 'scroll.speed',
  textOffset: 'textOffsetX',
  topText: 'textInFront',
};

const unsupportedAwtrix3Fields = new Set<string>([
  ...Object.keys(awtrix3FieldReplacements),
  'barBC',
  'clients',
  'pos',
  'save',
]);

const notificationOnlyFields = new Set<string>([
  'hold',
  'name',
  'sound',
  'soundLoop',
  'soundRtttl',
  'stack',
  'wakeup',
]);

const pushedAppOnlyFields = new Set<string>([
  'lifetimeExpiry',
  'lifetimeMs',
  'repeat',
]);

const scrollFields = new Set<string>([
  'direction',
  'entry',
  'gap',
  'mode',
  'speed',
  'whenFits',
]);

const scrollModes = ['static', 'wrap', 'loop', 'bounce'] as const;

const scrollDirections = ['left', 'right'] as const;

const scrollEntries = ['inline', 'offscreen'] as const;

const scrollWhenFits = ['static', 'scroll'] as const;

const textCases = ['inherit', 'upper', 'asTyped'] as const;

const iconModes = ['fixed', 'pushOnce', 'push'] as const;

const lifetimeExpiries = ['remove', 'mark'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const isOneOf = <TValue extends string>(value: unknown, allowedValues: readonly TValue[]): value is TValue => (
  typeof value === 'string' && allowedValues.includes(value as TValue)
);

const assertObjectInput = (input: unknown, target: AwtrixNgTransformTarget): Record<string, unknown> => {
  if (isRecord(input)) {
    return input;
  }

  throw new UnsupportedAwtrixNgPayloadFieldError({
    field: '<payload>',
    target,
    reason: 'invalid-value',
    details: 'Payload transform input must be an object.',
  });
};

const unsupportedFieldDetails = (field: string): string => {
  const replacement = awtrix3FieldReplacements[field];

  if (replacement !== undefined) {
    return `Public payloads must use supported field "${replacement}" instead of legacy field "${field}".`;
  }

  return `No documented equivalent exists for legacy field "${field}".`;
};

const assertKnownFields = (input: Record<string, unknown>, allowedFields: Set<string>, target: AwtrixNgTransformTarget): void => {
  for (const field of Object.keys(input)) {
    if (allowedFields.has(field)) {
      continue;
    }

    if (unsupportedAwtrix3Fields.has(field)) {
      throw new UnsupportedAwtrixNgPayloadFieldError({
        field,
        target,
        reason: 'unsupported-field',
        details: unsupportedFieldDetails(field),
      });
    }

    if (!allowedFields.has(field)) {
      throw new UnsupportedAwtrixNgPayloadFieldError({
        field,
        target,
        reason: 'unknown-field',
        details: 'Unknown fields are rejected so they cannot be silently dropped before sending a request.',
      });
    }
  }
};

const assertNoTargetOnlyFields = (input: Record<string, unknown>, disallowedFields: Set<string>, target: AwtrixNgTransformTarget): void => {
  for (const field of Object.keys(input)) {
    if (disallowedFields.has(field)) {
      throw new UnsupportedAwtrixNgPayloadFieldError({
        field,
        target,
        reason: 'unsupported-field',
        details: `Field "${field}" is not supported for ${target} payloads.`,
      });
    }
  }
};

const assertStringEnumField = (
  input: Record<string, unknown>,
  field: string,
  allowedValues: readonly string[],
  target: AwtrixNgTransformTarget,
): void => {
  const value = input[field];

  if (value === undefined || isOneOf(value, allowedValues)) {
    return;
  }

  throw new UnsupportedAwtrixNgPayloadFieldError({
    field,
    target,
    reason: 'invalid-value',
    details: `Expected one of: ${allowedValues.join(', ')}.`,
  });
};

const assertTextValue = (input: Record<string, unknown>, target: AwtrixNgTransformTarget): void => {
  const value = input.text;

  if (value === undefined || typeof value === 'string') {
    return;
  }

  if (!Array.isArray(value)) {
    throw new UnsupportedAwtrixNgPayloadFieldError({
      field: 'text',
      target,
      reason: 'invalid-value',
      details: 'Text must be a string or an array of { text, color? } fragments.',
    });
  }

  value.forEach((fragment, index) => {
    const field = `text[${index}]`;

    if (!isRecord(fragment)) {
      throw new UnsupportedAwtrixNgPayloadFieldError({
        field,
        target,
        reason: 'invalid-value',
        details: 'Text fragments must be objects with a text field.',
      });
    }

    if ('t' in fragment || 'c' in fragment) {
      throw new UnsupportedAwtrixNgPayloadFieldError({
        field,
        target,
        reason: 'unsupported-field',
        details: 'Legacy text fragments { t, c } are not valid payload fragments. Use { text, color? }.',
      });
    }

    const fragmentKeys = Object.keys(fragment);
    const invalidKey = fragmentKeys.find((key) => key !== 'text' && key !== 'color');

    if (invalidKey !== undefined) {
      throw new UnsupportedAwtrixNgPayloadFieldError({
        field: `${field}.${invalidKey}`,
        target,
        reason: 'unknown-field',
        details: 'Unknown text fragment fields are rejected so they cannot be silently dropped.',
      });
    }

    if (typeof fragment.text !== 'string') {
      throw new UnsupportedAwtrixNgPayloadFieldError({
        field: `${field}.text`,
        target,
        reason: 'invalid-value',
        details: 'Text fragment text must be a string.',
      });
    }
  });
};

const assertScrollValue = (input: Record<string, unknown>, target: AwtrixNgTransformTarget): void => {
  const value = input.scroll;

  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    throw new UnsupportedAwtrixNgPayloadFieldError({
      field: 'scroll',
      target,
      reason: 'invalid-value',
      details: 'Public payloads must use the documented scroll object, for example { mode: "static" }.',
    });
  }

  for (const field of Object.keys(value)) {
    if (!scrollFields.has(field)) {
      throw new UnsupportedAwtrixNgPayloadFieldError({
        field: `scroll.${field}`,
        target,
        reason: 'unknown-field',
        details: 'Unknown scroll fields are rejected so they cannot be silently dropped.',
      });
    }
  }

  if (value.mode !== undefined && !isOneOf(value.mode, scrollModes)) {
    throw new UnsupportedAwtrixNgPayloadFieldError({
      field: 'scroll.mode',
      target,
      reason: 'invalid-value',
      details: `Expected one of: ${scrollModes.join(', ')}.`,
    });
  }

  if (value.direction !== undefined && !isOneOf(value.direction, scrollDirections)) {
    throw new UnsupportedAwtrixNgPayloadFieldError({
      field: 'scroll.direction',
      target,
      reason: 'invalid-value',
      details: `Expected one of: ${scrollDirections.join(', ')}.`,
    });
  }

  if (value.entry !== undefined && !isOneOf(value.entry, scrollEntries)) {
    throw new UnsupportedAwtrixNgPayloadFieldError({
      field: 'scroll.entry',
      target,
      reason: 'invalid-value',
      details: `Expected one of: ${scrollEntries.join(', ')}.`,
    });
  }

  if (value.whenFits !== undefined && !isOneOf(value.whenFits, scrollWhenFits)) {
    throw new UnsupportedAwtrixNgPayloadFieldError({
      field: 'scroll.whenFits',
      target,
      reason: 'invalid-value',
      details: `Expected one of: ${scrollWhenFits.join(', ')}.`,
    });
  }
};

const assertPagePayload = (input: Record<string, unknown>, target: 'notification' | 'pushedApp'): void => {
  assertTextValue(input, target);
  assertScrollValue(input, target);
  assertStringEnumField(input, 'textCase', textCases, target);
  assertStringEnumField(input, 'iconMode', iconModes, target);
};

const assertBooleanField = (input: Record<string, unknown>, field: string, target: AwtrixNgTransformTarget): void => {
  const value = input[field];

  if (value === undefined || typeof value === 'boolean') {
    return;
  }

  throw new UnsupportedAwtrixNgPayloadFieldError({
    field,
    target,
    reason: 'invalid-value',
    details: 'Expected a boolean value.',
  });
};

const assertSettingsPatch = (input: Record<string, unknown>): void => {
  assertBooleanField(input, 'autoBrightness', 'settings');
  assertBooleanField(input, 'autoTransition', 'settings');
  assertBooleanField(input, 'blockNavigation', 'settings');
  assertBooleanField(input, 'uppercase', 'settings');

  if (input.transitionEffect !== undefined && typeof input.transitionEffect !== 'string') {
    throw new UnsupportedAwtrixNgPayloadFieldError({
      field: 'transitionEffect',
      target: 'settings',
      reason: 'invalid-value',
      details: 'Expected a transitionEffect string from /api/v1/capabilities.transitions.',
    });
  }
};

export const toAwtrixNgDisplayPowerPatch = (power: boolean): AwtrixNgApiDisplayPatch => ({
  power,
});

export const toAwtrixNgRtttlPayload = (rtttl: string): AwtrixNgApiSoundPlayPayload => ({
  rtttl,
});

export const toAwtrixNgIndicatorPayload = (input: AwtrixNgIndicatorInput): AwtrixNgApiIndicatorPayload => {
  const inputRecord = assertObjectInput(input, 'indicator');
  assertKnownFields(inputRecord, indicatorFields, 'indicator');

  return {
    ...input,
  };
};

export const toAwtrixNgNotificationPayload = (input: AwtrixNgNotificationInput): AwtrixNgApiNotificationPayload => {
  const inputRecord = assertObjectInput(input, 'notification');
  assertNoTargetOnlyFields(inputRecord, pushedAppOnlyFields, 'notification');
  assertKnownFields(inputRecord, notificationFields, 'notification');
  assertPagePayload(inputRecord, 'notification');

  return {
    ...input,
  };
};

export const toAwtrixNgPushedAppPayload = (input: AwtrixNgPushedAppInput): AwtrixNgApiPushedAppPayload => {
  const inputRecord = assertObjectInput(input, 'pushedApp');
  assertNoTargetOnlyFields(inputRecord, notificationOnlyFields, 'pushedApp');
  assertKnownFields(inputRecord, pushedAppFields, 'pushedApp');
  assertPagePayload(inputRecord, 'pushedApp');
  assertStringEnumField(inputRecord, 'lifetimeExpiry', lifetimeExpiries, 'pushedApp');

  return {
    ...input,
  };
};

export const toAwtrixNgSettingsPatch = (input: AwtrixNgSettingsPatchInput): AwtrixNgApiSettingsPatch => {
  const inputRecord = assertObjectInput(input, 'settings');
  assertKnownFields(inputRecord, settingsFields, 'settings');
  assertSettingsPatch(inputRecord);

  return {
    ...input,
  };
};
