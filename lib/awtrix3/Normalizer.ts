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

function toText(text: any): Text | undefined {
  try {
    if (isString(text)) {
      text = JSON.parse(text);
    }

    if (isString(text) || isNumeric(text)) {
      return text.toString();
    }

    if (isArrayOfTextFragments(text)) {
      return text.map((fragment) => ({ t: fragment.t, c: toColor(fragment.c) }));
    }
  } catch {
  }

  if (isString(text) || isNumeric(text)) {
    return text.toString();
  }

  return undefined;
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
  return `${appPrefix}${id.replace(/[^a-z0-9]+/g, '').toLowerCase()}`;
};

export const powerOptions = (options: Record<'power', any>): PowerOptions => {
  return {
    power: !!options.power,
  };
};

const basicOptions = (options: Record<keyof BaseOptions, any>, effects: string[]): BaseOptions => {
  const opt: BaseOptions = {};

  const text = toText(options.text);
  if (text !== undefined) {
    opt.text = text;
  }

  if (isNumeric(options.textCase)) {
    opt.textCase = toTextCase(options.textCase);
  }

  if (typeof options.topText === 'boolean') {
    opt.topText = options.topText;
  }

  if (isNumeric(options.textOffset)) {
    opt.textOffset = toNumber(options.textOffset);
  }

  if (typeof options.center === 'boolean') {
    opt.center = options.center;
  }

  if (options.color !== undefined) {
    opt.color = toColor(options.color);
  }

  if (options.gradient && options.gradient.length === 2 && isColor(options.gradient[0]) && isColor(options.gradient[1])) {
    opt.gradient = options.gradient;
  }

  if (options.background && isColor(options.background)) {
    opt.background = options.background;
  }

  if (typeof options.rainbow === 'boolean') {
    opt.rainbow = options.rainbow;
  }

  if (isString(options.icon) && options.icon !== '-' && (options.icon.length < 32 || options.icon.startsWith('data:image/jpeg;base64,'))) {
    opt.icon = options.icon;
  }

  if (isNumeric(options.pushIcon)) {
    opt.pushIcon = toPushIcon(options.pushIcon);
  }

  if (isNumeric(options.repeat)) {
    opt.repeat = toNumber(options.repeat);
    options.duration = undefined;
  }

  if (isNumeric(options.duration)) {
    opt.duration = toNumber(options.duration);
  }

  if (typeof options.noScroll === 'boolean') {
    opt.noScroll = options.noScroll;
  }

  if (isNumeric(options.scrollSpeed)) {
    opt.scrollSpeed = toNumber(options.scrollSpeed);
  }

  if (options.effect && isString(options.effect) && effects.includes(options.effect)) {
    opt.effect = options.effect;
  }

  if (options.effectSettings && isEffectSettings(options.effectSettings)) {
    opt.effectSettings = options.effectSettings;
  }

  if (isNumeric(options.progress)) {
    opt.progress = minMaxNumber(0, 100, options.progress); // 0-100
  }

  if (options.progressC && isColor(options.progressC)) {
    opt.progressC = options.progressC;
  }

  if (options.progressBC && isColor(options.progressBC)) {
    opt.progressBC = options.progressBC;
  }

  if (options.blinkText && isNumeric(options.blinkText) && !opt.gradient && !opt.rainbow) {
    opt.blinkText = toNumber(options.blinkText);
  }

  if (options.fadeText && isNumeric(options.fadeText) && !opt.gradient && !opt.rainbow) {
    opt.fadeText = toNumber(options.fadeText);
  }

  if (options.overlay && isOverlay(options.overlay)) {
    opt.overlay = options.overlay;
  }

  if (options.bar && isBarLineValues(options.bar, !!opt.icon)) {
    opt.bar = options.bar;
  }

  if (options.line && isBarLineValues(options.line, !!opt.icon)) {
    opt.line = options.line;
  }

  if (options.barBC && isColor(options.barBC) && (opt.bar || opt.line)) {
    opt.barBC = options.barBC;
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
