import {
  AwtrixNgApiDisplayPatch,
  AwtrixNgApiFonts,
  AwtrixNgApiIconModes,
  AwtrixNgApiIndicatorPayload,
  AwtrixNgApiNotificationPayload,
  AwtrixNgApiPagePayload,
  AwtrixNgApiPushedAppLifetimeExpiries,
  AwtrixNgApiPushedAppPayload,
  AwtrixNgApiScrollDirections,
  AwtrixNgApiScrollEntries,
  AwtrixNgApiScrollModes,
  AwtrixNgApiScrollPayload,
  AwtrixNgApiScrollWhenFitsValues,
  AwtrixNgApiSettingsPatch,
  AwtrixNgApiSoundPlayPayload,
  AwtrixNgApiTextCases,
} from '../Api/Types';
import { isPlainObject } from '../Support/Guards';
import { assertAwtrixNgSound } from '../Services/Audio';

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

const pageFieldMap: Record<keyof AwtrixNgApiPagePayload, true> = {
  backgroundColor: true,
  barChart: true,
  chartAutoscale: true,
  chartColor: true,
  draw: true,
  durationMs: true,
  effect: true,
  effectSpeed: true,
  font: true,
  icon: true,
  iconMode: true,
  iconOffsetX: true,
  lineChart: true,
  layout: true,
  overlay: true,
  palette: true,
  paletteBlend: true,
  paletteSpan: true,
  paletteSpeed: true,
  progress: true,
  progressColor: true,
  progressTrackColor: true,
  repeat: true,
  scroll: true,
  text: true,
  textBlinkMs: true,
  textCase: true,
  textCenter: true,
  textColor: true,
  textFadeMs: true,
  textInFront: true,
  textOffsetX: true,
};

const pageFields = Object.keys(pageFieldMap);

const notificationOnlyFieldMap: Record<
  Exclude<keyof AwtrixNgApiNotificationPayload, keyof AwtrixNgApiPagePayload>,
  true
> = {
  hold: true,
  name: true,
  sound: true,
  soundLoop: true,
  soundRtttl: true,
  stack: true,
  wakeup: true,
};

const notificationOnlyFields = new Set<string>(Object.keys(notificationOnlyFieldMap));

const notificationFields = new Set<string>([
  ...pageFields,
  ...notificationOnlyFields,
]);

const pushedAppOnlyFieldMap: Record<
  Exclude<keyof AwtrixNgApiPushedAppPayload, keyof AwtrixNgApiPagePayload>,
  true
> = {
  lifetimeExpiry: true,
  lifetimeMs: true,
};

const pushedAppOnlyFields = new Set<string>(Object.keys(pushedAppOnlyFieldMap));

const pushedAppFields = new Set<string>([
  ...pageFields,
  ...pushedAppOnlyFields,
]);

const indicatorFieldMap: Record<keyof AwtrixNgApiIndicatorPayload, true> = {
  blinkMs: true,
  color: true,
  fadeMs: true,
};

const indicatorFields = new Set<string>(Object.keys(indicatorFieldMap));

const settingsFieldMap: Record<keyof AwtrixNgSettingsPatchInput, true> = {
  autoBrightness: true,
  autoTransition: true,
  blockNavigation: true,
  transitionEffect: true,
  uppercase: true,
};

export const AwtrixNgWritableSettingsFields = Object.keys(settingsFieldMap);

const settingsFields = new Set<string>(AwtrixNgWritableSettingsFields);

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

const scrollFieldMap: Record<keyof AwtrixNgApiScrollPayload, true> = {
  direction: true,
  entry: true,
  gap: true,
  holdMs: true,
  mode: true,
  speed: true,
  whenFits: true,
};

const scrollFields = new Set<string>(Object.keys(scrollFieldMap));

const isOneOf = <TValue extends string>(value: unknown, allowedValues: readonly TValue[]): value is TValue => (
  typeof value === 'string' && allowedValues.includes(value as TValue)
);

const assertObjectInput = (input: unknown, target: AwtrixNgTransformTarget): Record<string, unknown> => {
  if (isPlainObject(input)) {
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

    if (!isPlainObject(fragment)) {
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

  if (!isPlainObject(value)) {
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

  if (value.mode !== undefined && !isOneOf(value.mode, AwtrixNgApiScrollModes)) {
    throw new UnsupportedAwtrixNgPayloadFieldError({
      field: 'scroll.mode',
      target,
      reason: 'invalid-value',
      details: `Expected one of: ${AwtrixNgApiScrollModes.join(', ')}.`,
    });
  }

  if (value.direction !== undefined && !isOneOf(value.direction, AwtrixNgApiScrollDirections)) {
    throw new UnsupportedAwtrixNgPayloadFieldError({
      field: 'scroll.direction',
      target,
      reason: 'invalid-value',
      details: `Expected one of: ${AwtrixNgApiScrollDirections.join(', ')}.`,
    });
  }

  if (value.entry !== undefined && !isOneOf(value.entry, AwtrixNgApiScrollEntries)) {
    throw new UnsupportedAwtrixNgPayloadFieldError({
      field: 'scroll.entry',
      target,
      reason: 'invalid-value',
      details: `Expected one of: ${AwtrixNgApiScrollEntries.join(', ')}.`,
    });
  }

  if (value.whenFits !== undefined && !isOneOf(value.whenFits, AwtrixNgApiScrollWhenFitsValues)) {
    throw new UnsupportedAwtrixNgPayloadFieldError({
      field: 'scroll.whenFits',
      target,
      reason: 'invalid-value',
      details: `Expected one of: ${AwtrixNgApiScrollWhenFitsValues.join(', ')}.`,
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

const layoutFields = new Set(['version', 'regions', 'backgroundColor', 'effect', 'effectSpeed', 'overlay',
  'palette', 'paletteBlend', 'paletteSpan', 'paletteSpeed']);
const regionContents = ['text', 'icon', 'chart', 'progress', 'draw'] as const;
const regionOptions: Record<typeof regionContents[number], string[]> = {
  text: ['font', 'color', 'textColor', 'palette', 'paletteBlend', 'paletteSpan', 'paletteSpeed', 'align', 'valign',
    'scroll', 'repeat', 'textCase', 'textBlinkMs', 'textFadeMs'],
  icon: ['align', 'valign'],
  chart: ['color', 'textColor', 'palette', 'paletteBlend', 'paletteSpan', 'paletteSpeed'],
  progress: ['color', 'textColor', 'palette', 'paletteBlend', 'paletteSpan', 'paletteSpeed', 'trackColor'],
  draw: ['color', 'textColor', 'font'],
};

const invalidLayoutField = (
  field: string, target: AwtrixNgTransformTarget, details: string,
  reason: AwtrixNgUnsupportedPayloadFieldReason = 'invalid-value',
): never => {
  throw new UnsupportedAwtrixNgPayloadFieldError({
    field, target, reason, details,
  });
};

/** Keep nested validation errors attached to the actual JSON field. */
const withLayoutPath = (path: string, validate: () => void): void => {
  try {
    validate();
  } catch (error: unknown) {
    if (error instanceof UnsupportedAwtrixNgPayloadFieldError) {
      throw new UnsupportedAwtrixNgPayloadFieldError({
        field: `${path}.${error.field}`, target: error.target, reason: error.reason, details: error.details,
      });
    }
    throw error;
  }
};

const assertLayoutPalette = (value: Record<string, unknown>, target: AwtrixNgTransformTarget): void => {
  assertPaletteValue(value, target);
  assertBooleanField(value, 'paletteBlend', target);
  for (const key of ['paletteSpan', 'paletteSpeed']) assertFiniteNumberField(value, key, target);
  if (['paletteBlend', 'paletteSpan', 'paletteSpeed'].some((key) => value[key] !== undefined)
    && value.palette === undefined) {
    invalidLayoutField('palette', target, 'Palette options require a palette in the same object.');
  }
};

const assertLayoutRegion = (region: Record<string, unknown>, target: AwtrixNgTransformTarget): void => {
  const contents = regionContents.filter((key) => region[key] !== undefined);
  if (contents.length !== 1) invalidLayoutField('<content>', target, 'A region requires exactly one of text, icon, chart, progress or draw.');
  const content = contents[0];
  assertKnownFields(region, new Set(['id', 'box', content, ...regionOptions[content]]), target);
  if (typeof region.id !== 'string' || region.id.length === 0 || Buffer.byteLength(region.id) > 64) {
    invalidLayoutField('id', target, 'Region ID must be a non-empty string of at most 64 UTF-8 bytes.');
  }
  if (!Array.isArray(region.box) || region.box.length !== 4
    || !region.box.every((coordinate) => Number.isInteger(coordinate) && coordinate >= 0)
    || region.box[2] === 0 || region.box[3] === 0) {
    invalidLayoutField('box', target, 'Expected [x, y, width, height] with non-negative integer coordinates and positive sizes.');
  }
  for (const key of ['align', 'valign']) assertStringEnumField(region, key, ['start', 'center', 'end'], target);
  if (region.font !== undefined && (typeof region.font !== 'string' || region.font.length === 0)) {
    invalidLayoutField('font', target, 'Expected a font name from device capabilities.');
  }
  if (region.color !== undefined && region.textColor !== undefined) {
    invalidLayoutField('textColor', target, 'Use color or textColor, not both.');
  }
  assertLayoutPalette(region, target);
  if (content === 'text') {
    assertTextValue(region, target);
    if (typeof region.scroll === 'string') {
      assertStringEnumField(region, 'scroll', AwtrixNgApiScrollModes, target);
    } else {
      assertScrollValue(region, target);
    }
    const scroll = isPlainObject(region.scroll) ? region.scroll : {};
    for (const [key, max] of [['speed', 1000000], ['holdMs', 1000000], ['gap', 32767]] as const) {
      if (typeof scroll[key] === 'number' && scroll[key] > max) {
        invalidLayoutField(`scroll.${key}`, target, `Expected a value no greater than ${max}.`);
      }
    }
    assertStringEnumField(region, 'textCase', AwtrixNgApiTextCases, target);
    for (const key of ['repeat', 'textBlinkMs', 'textFadeMs']) {
      assertFiniteNumberField(region, key, target, true);
      if (typeof region[key] === 'number' && (region[key] < 0 || (key === 'repeat' && region[key] > 1000000))) {
        invalidLayoutField(key, target, key === 'repeat' ? 'Expected an integer in the range 0..1000000.' : 'Expected a non-negative integer.');
      }
    }
  }
  if (content === 'icon' && (typeof region.icon !== 'string' || region.icon.length === 0)) {
    invalidLayoutField('icon', target, 'Expected a non-empty icon ID or data URL.');
  }
  if (content === 'draw') assertDrawValue(region, target);
  if (content === 'progress' && (typeof region.progress !== 'number' || !Number.isFinite(region.progress)
    || region.progress < 0 || region.progress > 100)) {
    invalidLayoutField('progress', target, 'Expected a number in the range 0..100.');
  }
  if (content === 'chart') {
    if (!isPlainObject(region.chart)) invalidLayoutField('chart', target, 'Expected a chart object.');
    const chart = region.chart as Record<string, unknown>;
    withLayoutPath('chart', () => {
      assertKnownFields(chart, new Set(['values', 'type', 'min', 'max']), target);
      assertStringEnumField(chart, 'type', ['line', 'bar'], target);
      if (!Array.isArray(chart.values) || chart.values.length === 0 || chart.values.length > 128
        || !chart.values.every(Number.isInteger)) invalidLayoutField('values', target, 'Expected 1..128 integer chart points.');
      if (chart.min !== undefined || chart.max !== undefined) {
        if (typeof chart.min !== 'number' || typeof chart.max !== 'number'
          || !Number.isFinite(chart.min) || !Number.isFinite(chart.max) || chart.min >= chart.max) {
          invalidLayoutField('min', target, 'Set both min and max, with min smaller than max.');
        }
      }
    });
  }
};

const assertLayoutValue = (input: Record<string, unknown>, target: 'notification' | 'pushedApp'): void => {
  if (input.layout === undefined) return;
  const conflicting = pageFields.find((key) => !['layout', 'durationMs', 'repeat'].includes(key) && input[key] !== undefined);
  if (conflicting !== undefined) {
    invalidLayoutField(conflicting, target, 'Drawing fields must be inside layout when a layout is supplied.', 'unsupported-field');
  }
  if (!isPlainObject(input.layout)) invalidLayoutField('layout', target, 'Expected a layout object.');
  const layout = input.layout as Record<string, unknown>;
  withLayoutPath('layout', () => {
    assertKnownFields(layout, layoutFields, target);
    if (layout.version !== 1) invalidLayoutField('version', target, 'Only layout version 1 is supported.');
    if (!Array.isArray(layout.regions) || layout.regions.length === 0 || layout.regions.length > 16) {
      invalidLayoutField('regions', target, 'Expected 1..16 regions.');
    }
    const ids = new Set<string>();
    (layout.regions as unknown[]).forEach((region, index) => withLayoutPath(`regions[${index}]`, () => {
      if (!isPlainObject(region)) invalidLayoutField('<region>', target, 'Expected a region object.');
      const record = region as Record<string, unknown>;
      assertLayoutRegion(record, target);
      if (ids.has(record.id as string)) invalidLayoutField('id', target, 'Region IDs must be unique within the layout.');
      ids.add(record.id as string);
    }));
    if (layout.backgroundColor !== undefined && layout.effect !== undefined) {
      invalidLayoutField('effect', target, 'An effect cannot be combined with backgroundColor.');
    }
    for (const key of ['effect', 'overlay']) {
      if (layout[key] !== undefined && typeof layout[key] !== 'string') invalidLayoutField(key, target, 'Expected a name from device capabilities.');
    }
    if (layout.effectSpeed !== undefined && (typeof layout.effectSpeed !== 'number' || !Number.isFinite(layout.effectSpeed)
      || layout.effectSpeed < 0.1 || layout.effectSpeed > 10)) {
      invalidLayoutField('effectSpeed', target, 'Expected a number in the range 0.1..10.');
    }
    assertLayoutPalette(layout, target);
  });
};

const assertPagePayload = (input: Record<string, unknown>, target: 'notification' | 'pushedApp'): void => {
  assertLayoutValue(input, target);
  assertTextValue(input, target);
  assertScrollValue(input, target);
  assertDrawValue(input, target);
  assertPaletteValue(input, target);
  assertStringEnumField(input, 'textCase', AwtrixNgApiTextCases, target);
  assertStringEnumField(input, 'font', AwtrixNgApiFonts, target);
  assertStringEnumField(input, 'iconMode', AwtrixNgApiIconModes, target);
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
  if (inputRecord.sound !== undefined && typeof inputRecord.sound !== 'number') assertAwtrixNgSound(inputRecord.sound);

  return {
    ...input,
  };
};

export const toAwtrixNgPushedAppPayload = (input: AwtrixNgPushedAppInput): AwtrixNgApiPushedAppPayload => {
  const inputRecord = assertObjectInput(input, 'pushedApp');
  assertNoTargetOnlyFields(inputRecord, notificationOnlyFields, 'pushedApp');
  assertKnownFields(inputRecord, pushedAppFields, 'pushedApp');
  assertPagePayload(inputRecord, 'pushedApp');
  assertStringEnumField(inputRecord, 'lifetimeExpiry', AwtrixNgApiPushedAppLifetimeExpiries, 'pushedApp');
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
