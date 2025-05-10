import { isColor, isNumeric, isOverlay, isEffectSettings, isBarLineValues, isArrayOfStrings, isArrayOfTextFragments, isTextFragment } from './Validator';
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
  TextFragment,
} from './Types';
import { Device } from 'homey';

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

function isIndicatorEffect(effect: any): effect is IndicatorEffect {
  if (typeof effect === 'string') {
    return effect === 'blink' || effect === 'fade';
  }
  return false;
}

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
  return <PushIcon>toNumericType(textCase, 0, 2);
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
      ret.push({t: fragment.t, c: toColor(fragment.c)});
    }
  }
  return ret;
}

export const indicatorNumber = (id: number | string): number => {
  return minMaxNumber(1, 3, toNumber(id));
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

  if (options.text && (isString(options.text) || isArrayOfTextFragments(options.text))) {
    opt.text = options.text;
  } 
  
  if (options.textCase) {
    opt.textCase = toTextCase(options.textCase);
  }

  if (options.topText) {
    opt.topText = !!options.topText;
  }

  if (options.textOffset && isNumeric(options.textOffset)) {
    opt.textOffset = toNumber(options.textOffset);
  }

  if (options.center) {
    opt.center = !!options.center;
  }

  if (options.color) {
    opt.color = toColor(options.color);
  }

  if (options.gradient && options.gradient.length === 2 && isColor(options.gradient[0]) && isColor(options.gradient[1])) {
    opt.gradient = options.gradient;
  }

  if (options.background && isColor(options.background)) {
    opt.background = options.background;
  }

  if (options.rainbow) {
    opt.rainbow = !!options.rainbow;
  }

  if (options.icon && options.icon !== '-' && (options.icon.length < 32 || options.icon.startsWith('data:image/jpeg;base64,'))) {
    opt.icon = options.icon.toString();
  }

  if (options.pushIcon) {
    opt.pushIcon = toPushIcon(options.pushIcon);
  }

  if (options.repeat && isNumeric(options.repeat)) {
    opt.repeat = toNumber(options.repeat);
  }

  if (options.duration && isNumeric(options.duration)) {
    opt.duration = toNumber(options.duration);
  }

  if (options.noScroll) {
    opt.noScroll = !!options.noScroll;
  }

  if (options.scrollSpeed && isNumeric(options.scrollSpeed)) {
    opt.scrollSpeed = toNumber(options.scrollSpeed);
  }

  if (options.effect && isString(options.effect) && effects.includes(options.effect)) {
    opt.effect = options.effect;
  }

  if (options.effectSettings && isEffectSettings(options.effectSettings)) {
    opt.effectSettings = options.effectSettings;
  }

  if (options.progress && isNumeric(options.progress)) {
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

  console.log('opt', opt);

  return opt;
};

export const notifyOptions = (options: Record<keyof NotifyOptions, any>, effects: string[]): NotifyOptions => {
  const opt: NotifyOptions = basicOptions(options, effects);

  if (options.hold) {
    opt.hold = !!options.hold;
  }

  if (options.rtttl && isString(options.rtttl)) {
    opt.rtttl = options.rtttl;
  }

  if (options.loopSound) {
    opt.loopSound = !!options.loopSound;
  }

  if (options.stack) {
    opt.stack = !!options.stack;
  }

  if (options.wakeup) {
    opt.wakeup = !!options.wakeup;
  }

  if (options.clients && isArrayOfStrings(options.clients)) {
    opt.clients = options.clients;
  }

  return opt;
};

export const appOptions = (options: any, effects: string[]): AppOptions => {
  const opt: AppOptions = basicOptions(options, effects);

  if (options.lifetime && isNumeric(options.lifetime)) {
    opt.lifetime = toNumber(options.lifetime);
  }

  if (options.lifetimeMode) {
    opt.lifetimeMode = toLifetimeMode(options.lifetimeMode);
  }

  if (options.pos && isNumeric(options.pos)) {
    opt.pos = Math.abs(toNumber(options.pos));
  }

  return opt;
};

const defaultSettingsOptions: SettingOptions = {
  ABRI: false,
  ATRANS: false,
  BAT: false,
  BLOCKN: false,
  DAT: false,
  HUM: false,
  TEFF: undefined,
  TEMP: false,
  TIM: false,
  UPPERCASE: false,
}

type OptionalSettingOptions = keyof Omit<SettingOptions, 'TEFF'>

export const settingOptions = (options: Record<string, any>): SettingOptions => {
  const opt: SettingOptions = {};
  const { TEFF, ...optionalOptions } = { ...defaultSettingsOptions, ...options }
  if (TEFF) {
    opt.TEFF = toTransitionEffect(TEFF);
  }

  for (const key in optionalOptions) {
    if (key in options) {
      opt[key as OptionalSettingOptions] = !!options[key];
    }
  }

  return opt;
};
