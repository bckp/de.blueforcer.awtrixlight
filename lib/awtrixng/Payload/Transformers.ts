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
  'font',
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
  'repeat',
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
]);

const scrollFields = new Set<string>([
  'direction',
  'entry',
  'gap',
  'holdMs',
  'mode',
  'speed',
  'whenFits',
]);

const scrollModes = ['static', 'wrap', 'loop', 'bounce'] as const;

const scrollDirections = ['left', 'right'] as const;

const scrollEntries = ['inline', 'offscreen'] as const;

const scrollWhenFits = ['static', 'scroll'] as const;

const textCases = ['inherit', 'upper', 'asTyped'] as const;

const fonts = ['small', 'large'] as const;

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

    throw new UnsupportedAwtrixNgPayloadFieldError({
      field,
      target,
      reason: 'unknown-field',
      details: 'Unknown fields are rejected so they cannot be silently dropped before sending a request.',
    });
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

  for (const field of ['speed', 'gap', 'holdMs'] as const) {
    const count = value[field];

    if (count !== undefined && (!Number.isInteger(count) || (count as number) < 0)) {
      throw new UnsupportedAwtrixNgPayloadFieldError({
        field: `scroll.${field}`,
        target,
        reason: 'invalid-value',
        details: 'Expected a non-negative integer.',
      });
    }
  }
};

const drawCommandSpecs: Record<string, { minLength: number; maxLength: number; numericIndexes: number[] }> = {
  pixel: { minLength: 3, maxLength: 4, numericIndexes: [1, 2] },
  line: { minLength: 5, maxLength: 6, numericIndexes: [1, 2, 3, 4] },
  rect: { minLength: 5, maxLength: 6, numericIndexes: [1, 2, 3, 4] },
  rectFill: { minLength: 5, maxLength: 6, numericIndexes: [1, 2, 3, 4] },
  circle: { minLength: 4, maxLength: 5, numericIndexes: [1, 2, 3] },
  circleFill: { minLength: 4, maxLength: 5, numericIndexes: [1, 2, 3] },
  text: { minLength: 4, maxLength: 5, numericIndexes: [1, 2] },
  bitmap: { minLength: 6, maxLength: 6, numericIndexes: [1, 2, 3, 4] },
};

const invalidDrawValue = (field: string, target: AwtrixNgTransformTarget, details: string): never => {
  throw new UnsupportedAwtrixNgPayloadFieldError({
    field,
    target,
    reason: 'invalid-value',
    details,
  });
};

const assertDrawValue = (input: Record<string, unknown>, target: AwtrixNgTransformTarget): void => {
  const value = input.draw;

  if (value === undefined) {
    return;
  }

  const commands = Array.isArray(value)
    ? value
    : invalidDrawValue('draw', target, 'Draw must be an array of AWTRIX NG command arrays.');

  for (const [index, commandValue] of commands.entries()) {
    const field = `draw[${index}]`;
    const command = Array.isArray(commandValue)
      ? commandValue
      : invalidDrawValue(field, target, 'Each draw command must be an array with the command name first.');

    const name = command[0];

    if (name === 'pixels') {
      if (command.length < 4 || (command.length - 2) % 2 !== 0) {
        invalidDrawValue(field, target, 'The pixels command needs a color and one or more x, y pairs.');
      }

      for (let coordinateIndex = 2; coordinateIndex < command.length; coordinateIndex += 1) {
        if (!Number.isInteger(command[coordinateIndex])) {
          invalidDrawValue(field, target, 'Draw command coordinates must be integers.');
        }
      }

      continue;
    }

    if (typeof name !== 'string') {
      invalidDrawValue(field, target, 'Unknown AWTRIX NG draw command.');
    }

    const spec = drawCommandSpecs[name];

    if (spec === undefined) {
      invalidDrawValue(field, target, 'Unknown AWTRIX NG draw command.');
    }

    if (command.length < spec.minLength || command.length > spec.maxLength) {
      invalidDrawValue(field, target, `Draw command "${name}" has the wrong number of arguments.`);
    }

    for (const coordinateIndex of spec.numericIndexes) {
      if (!Number.isInteger(command[coordinateIndex])) {
        invalidDrawValue(field, target, 'Draw command coordinates and sizes must be integers.');
      }
    }

    if (name === 'text' && typeof command[3] !== 'string') {
      invalidDrawValue(field, target, 'The text draw command requires a string argument.');
    }

    if (name === 'bitmap' && typeof command[5] !== 'string' && !Array.isArray(command[5])) {
      invalidDrawValue(field, target, 'Bitmap data must be a base64 string or an array of colors.');
    }
  }
};

const assertPaletteValue = (input: Record<string, unknown>, target: AwtrixNgTransformTarget): void => {
  const value = input.palette;

  if (value === undefined || value === null || typeof value === 'string') {
    return;
  }

  if (!Array.isArray(value) || value.length === 0 || value.length > 16) {
    throw new UnsupportedAwtrixNgPayloadFieldError({
      field: 'palette',
      target,
      reason: 'invalid-value',
      details: 'Palette arrays must contain between 1 and 16 color or structured stop entries.',
    });
  }

  const structured = typeof value[0] === 'object' && value[0] !== null && !Array.isArray(value[0]);

  value.forEach((stop, index) => {
    const isStructuredStop = typeof stop === 'object' && stop !== null && !Array.isArray(stop);

    if (isStructuredStop !== structured) {
      throw new UnsupportedAwtrixNgPayloadFieldError({
        field: `palette[${index}]`,
        target,
        reason: 'invalid-value',
        details: 'Structured and unstructured palette stops cannot be mixed.',
      });
    }

    if (structured) {
      const stopRecord = stop as Record<string, unknown>;
      const keys = Object.keys(stopRecord);

      if (keys.length !== 2 || !keys.includes('color') || !keys.includes('pos')
        || stopRecord.color === undefined || !Number.isInteger(stopRecord.pos)
        || (stopRecord.pos as number) < 0 || (stopRecord.pos as number) > 100) {
        throw new UnsupportedAwtrixNgPayloadFieldError({
          field: `palette[${index}]`,
          target,
          reason: 'invalid-value',
          details: 'Structured palette stops require exactly color and pos, with pos in the range 0..100.',
        });
      }
    }
  });
};

const assertFiniteNumberField = (
  input: Record<string, unknown>,
  field: string,
  target: AwtrixNgTransformTarget,
  requireInteger = false,
): void => {
  const value = input[field];

  if (value === undefined
    || (typeof value === 'number' && Number.isFinite(value) && (!requireInteger || Number.isInteger(value)))) {
    return;
  }

  throw new UnsupportedAwtrixNgPayloadFieldError({
    field,
    target,
    reason: 'invalid-value',
    details: requireInteger ? 'Expected a finite integer.' : 'Expected a finite number.',
  });
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

const assertPagePayload = (input: Record<string, unknown>, target: 'notification' | 'pushedApp'): void => {
  assertTextValue(input, target);
  assertScrollValue(input, target);
  assertDrawValue(input, target);
  assertPaletteValue(input, target);
  assertStringEnumField(input, 'textCase', textCases, target);
  assertStringEnumField(input, 'font', fonts, target);
  assertStringEnumField(input, 'iconMode', iconModes, target);
  // UNKNOWN: range not documented (durationMs).
  assertFiniteNumberField(input, 'durationMs', target);
  // UNKNOWN: range not documented (repeat).
  assertFiniteNumberField(input, 'repeat', target);
  // UNKNOWN: range not documented (textBlinkMs).
  assertFiniteNumberField(input, 'textBlinkMs', target);
  // UNKNOWN: range not documented (textFadeMs).
  assertFiniteNumberField(input, 'textFadeMs', target);
  // UNKNOWN: range not documented (textOffsetX); flat pushed-app OpenAPI requires an integer.
  assertFiniteNumberField(input, 'textOffsetX', target, target === 'pushedApp');
  // UNKNOWN: range not documented (iconOffsetX).
  assertFiniteNumberField(input, 'iconOffsetX', target);
  // UNKNOWN: range not documented (effectSpeed).
  assertFiniteNumberField(input, 'effectSpeed', target);
  // UNKNOWN: range not documented (paletteSpan).
  assertFiniteNumberField(input, 'paletteSpan', target);
  // UNKNOWN: range not documented (paletteSpeed).
  assertFiniteNumberField(input, 'paletteSpeed', target);
  // UNKNOWN: range not documented (progress).
  assertFiniteNumberField(input, 'progress', target);
  assertBooleanField(input, 'textCenter', target);
  assertBooleanField(input, 'textInFront', target);
  assertBooleanField(input, 'chartAutoscale', target);
  assertBooleanField(input, 'paletteBlend', target);
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
  assertBooleanField(inputRecord, 'hold', 'notification');
  assertBooleanField(inputRecord, 'stack', 'notification');
  assertBooleanField(inputRecord, 'wakeup', 'notification');
  assertBooleanField(inputRecord, 'soundLoop', 'notification');

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
  // UNKNOWN: range not documented (lifetimeMs).
  assertFiniteNumberField(inputRecord, 'lifetimeMs', 'pushedApp');

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
