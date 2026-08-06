import {
  isColor,
  isNumeric,
  isOverlay,
  isEffectSettings,
  isIndicatorEffect,
  isBarLineValues,
  isArrayOfStrings,
  isArrayOfTextFragments,
  isTextFragment,
} from './Validator';
import {
  AppOptions,
  NotifyOptions,
  BaseOptions,
  LifetimeMode,
  Color,
  IndicatorEffect,
  IndicatorOptions,
  SettingOptions,
  TransitionEffect,
  TextCase,
  PushIcon,
  PowerOptions,
  Text,
  TextFragment,
} from './Types';

const appPrefix: string = 'homey:';

function isString(input: any): input is string {
  return typeof input === 'string';
}

const toNumber = (input: string | number): number => {
  return Number.parseInt(input.toString(), 10);
};

const minMaxNumber = (min: number, max: number, number: number | string): number => {
  return Math.min(max, Math.max(min, toNumber(number)));
};

function toNumericType<Type>(input: any, min: number, max: number): Type {
  if (isNumeric(input)) {
    return <Type>minMaxNumber(min, max, toNumber(input));
  }
  return <Type>min;
}

function toLifetimeMode(mode: any): LifetimeMode {
  return <LifetimeMode>toNumericType(mode, 0, 1);
}

function toTextCase(textCase: any): TextCase {
  return <TextCase>toNumericType(textCase, 0, 2);
}

function toPushIcon(pushIcon: any): PushIcon {
  return <PushIcon>toNumericType(pushIcon, 0, 2);
}

function toTransitionEffect(effect: any): TransitionEffect {
  return <TransitionEffect>toNumericType(effect, 0, 10);
}

function toColor(color: any): Color {
  if (isColor(color)) {
    return color;
  }
  return '0';
}

function toFragmentText(value: unknown): TextFragment[] | undefined {
  if (isArrayOfTextFragments(value)) {
    return value.map((fragment) => ({ t: fragment.t, c: toColor(fragment.c) }));
  }

  return undefined;
}

/**
 * A text input is either a fragment array or literal text.
 *
 * JSON is only parsed when the trimmed input starts with `[`, so literal text is
 * never reinterpreted: `"abc"`, `null` and ` 123 ` are shown exactly as entered.
 */
function toText(text: any): Text | undefined {
  if (isString(text) && text.trim().startsWith('[')) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(text);
    } catch {
      // Not JSON at all - show it as literal text.
      return text;
    }

    return toFragmentText(parsed);
  }

  if (isString(text) || isNumeric(text)) {
    return text.toString();
  }

  return toFragmentText(text);
}

export const isHomeyApp = (app: string): boolean => {
  return app.startsWith(appPrefix);
};

// Public functions
export const indicatorOptions = (options: any): IndicatorOptions => {
  const ret: IndicatorOptions = {
    color: isColor(options.color) ? options.color : '0',
  };

  if ('effect' in options && isString(options.effect) && isIndicatorEffect(options.effect)) {
    ret[<IndicatorEffect>options.effect] = ('duration' in options && isNumeric(options.duration)) ? toNumber(options.duration) : 1000;
  }

  return ret;
};

export const toTextFragments = (fragments: any): TextFragment[] => {
  const ret = [];
  for (const fragment of fragments) {
    if (isTextFragment(fragment)) {
      ret.push({ t: fragment.t, c: toColor(fragment.c) });
    }
  }
  return ret;
};

export const indicatorNumber = (id: number | string): number => {
  const indicator = Number(id);
  if (!Number.isInteger(indicator) || indicator < 1 || indicator > 3) {
    throw new RangeError('Indicator id must be an integer from 1 to 3');
  }

  return indicator;
};

export const appName = (id: string): string => {
  const normalized = id.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (normalized.length === 0) {
    throw new RangeError('App name must contain at least one alphanumeric character');
  }

  return `${appPrefix}${normalized}`;
};

export const powerOptions = (options: Record<'power', any>): PowerOptions => {
  return {
    power: !!options.power,
  };
};

interface BasicOptionContext {
  /** Raw caller options. Rules may mutate it: `repeat` clears `duration`. */
  options: Record<string, any>;
  /** Output built so far - later rules depend on earlier results. */
  opt: BaseOptions;
  /** Effect names reported by the device. */
  effects: string[];
}

interface BasicOptionRule {
  key: keyof BaseOptions;
  /** Decides whether the raw value is accepted. */
  guard: (value: any, context: BasicOptionContext) => boolean;
  /** Converts an accepted value; the raw value is used when omitted. */
  transform?: (value: any) => any;
  /** Runs after the value was written. */
  onAccepted?: (context: BasicOptionContext) => void;
}

const isBoolean = (value: any): value is boolean => typeof value === 'boolean';

/**
 * Declarative description of `basicOptions`. The order matters twice: it defines the
 * key order of the payload and later rules read values produced by earlier ones
 * (blinkText/fadeText check gradient and rainbow, bar/line check icon, barBC checks bar/line).
 */
const basicOptionRules: BasicOptionRule[] = [
  { key: 'text', guard: (value) => toText(value) !== undefined, transform: toText },
  { key: 'textCase', guard: isNumeric, transform: toTextCase },
  { key: 'topText', guard: isBoolean },
  { key: 'textOffset', guard: isNumeric, transform: toNumber },
  { key: 'center', guard: isBoolean },
  // H4/P2: an invalid color is dropped instead of being sent as '0'.
  { key: 'color', guard: isColor },
  {
    key: 'gradient',
    guard: (value) => Array.isArray(value) && value.length === 2 && isColor(value[0]) && isColor(value[1]),
  },
  { key: 'background', guard: isColor },
  { key: 'rainbow', guard: isBoolean },
  {
    key: 'icon',
    guard: (value) => isString(value) && value !== '-' && (value.length < 32 || value.startsWith('data:image/jpeg;base64,')),
  },
  { key: 'pushIcon', guard: isNumeric, transform: toPushIcon },
  {
    key: 'repeat',
    guard: isNumeric,
    transform: toNumber,
    // Repeat and duration are mutually exclusive; repeat wins.
    onAccepted: ({ options }) => {
      options.duration = undefined;
    },
  },
  { key: 'duration', guard: isNumeric, transform: toNumber },
  { key: 'noScroll', guard: isBoolean },
  { key: 'scrollSpeed', guard: isNumeric, transform: toNumber },
  { key: 'effect', guard: (value, { effects }) => Boolean(value) && isString(value) && effects.includes(value) },
  { key: 'effectSettings', guard: (value) => Boolean(value) && isEffectSettings(value) },
  { key: 'progress', guard: isNumeric, transform: (value) => minMaxNumber(0, 100, value) },
  { key: 'progressC', guard: isColor },
  { key: 'progressBC', guard: isColor },
  // H4/P2: zero is a valid interval, so `isNumeric` replaces the truthy check.
  { key: 'blinkText', guard: (value, { opt }) => isNumeric(value) && !opt.gradient && !opt.rainbow, transform: toNumber },
  { key: 'fadeText', guard: (value, { opt }) => isNumeric(value) && !opt.gradient && !opt.rainbow, transform: toNumber },
  { key: 'overlay', guard: (value) => Boolean(value) && isOverlay(value) },
  { key: 'bar', guard: (value, { opt }) => Boolean(value) && isBarLineValues(value, !!opt.icon) },
  { key: 'line', guard: (value, { opt }) => Boolean(value) && isBarLineValues(value, !!opt.icon) },
  { key: 'barBC', guard: (value, { opt }) => isColor(value) && Boolean(opt.bar || opt.line) },
];

const basicOptions = (options: Record<keyof BaseOptions, any>, effects: string[]): BaseOptions => {
  const opt: BaseOptions = {};
  const context: BasicOptionContext = { options, opt, effects };

  for (const rule of basicOptionRules) {
    const value = options[rule.key];

    if (!rule.guard(value, context)) {
      continue;
    }

    (opt as Record<string, any>)[rule.key] = rule.transform ? rule.transform(value) : value;
    rule.onAccepted?.(context);
  }

  return opt;
};

export const notifyOptions = (options: Record<keyof NotifyOptions, any>, effects: string[]): NotifyOptions => {
  const opt: NotifyOptions = basicOptions(options, effects);

  if (typeof options.hold === 'boolean') {
    opt.hold = options.hold;
  }

  if (options.rtttl && isString(options.rtttl)) {
    opt.rtttl = options.rtttl;
  }

  if (typeof options.loopSound === 'boolean') {
    opt.loopSound = options.loopSound;
  }

  if (typeof options.stack === 'boolean') {
    opt.stack = options.stack;
  }

  if (typeof options.wakeup === 'boolean') {
    opt.wakeup = options.wakeup;
  }

  if (options.clients && isArrayOfStrings(options.clients)) {
    opt.clients = options.clients;
  }

  return opt;
};

export const appOptions = (options: any, effects: string[]): AppOptions => {
  const opt: AppOptions = basicOptions(options, effects);

  if (isNumeric(options.lifetime)) {
    opt.lifetime = toNumber(options.lifetime);
  }

  if (isNumeric(options.lifetimeMode)) {
    opt.lifetimeMode = toLifetimeMode(options.lifetimeMode);
  }

  if (isNumeric(options.pos)) {
    opt.pos = Math.abs(toNumber(options.pos));
  }

  return opt;
};

const defaultSettingsOptions: Omit<SettingOptions, 'TEFF'> = {
  ABRI: false,
  ATRANS: false,
  BAT: false,
  BLOCKN: false,
  DAT: false,
  HUM: false,
  TEMP: false,
  TIM: false,
  UPPERCASE: false,
};

type OptionalSettingOptions = keyof Omit<SettingOptions, 'TEFF'>

export const settingOptions = (options: Record<string, any>): SettingOptions => {
  const opt: SettingOptions = {};
  if (isNumeric(options.TEFF)) {
    opt.TEFF = toTransitionEffect(options.TEFF);
  }

  Object.keys(defaultSettingsOptions).forEach((key) => {
    if (key in options) {
      opt[key as OptionalSettingOptions] = !!options[key];
    }
  });

  return opt;
};
