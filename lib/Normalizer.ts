import { isColor, isNumeric } from './Validator';
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

const basicOptions = (options: Record<keyof BaseOptions, any>): BaseOptions => {
  const opt: BaseOptions = {};

  if (options.text && isString(options.text)) {
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

  // TODO: Add support for base64 icons, or rewrite this to use only base64 icons
  if (options.icon && options.icon !== '-') {
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

  /*
  blinkText?: number; // Blinks the text in an given interval, not compatible with gradient or rainbow
  fadeText?: number; // Fades the text on and off in an given interval, not compatible with gradient or rainbow
  progress?: number; // Shows a progress bar. Value can be 0-100.
  progressC?: Color; // The color of the progress bar.
  progressBC?: Color; // The color of the progress bar background.
  effect?: string; // Shows an effect as background.
  */

  return opt;
};

export const notifyOptions = (options: Record<keyof NotifyOptions, any>): NotifyOptions => {
  const opt: NotifyOptions = basicOptions(options);

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

  return opt;
};

export const appOptions = (options: any): AppOptions => {
  const opt: AppOptions = basicOptions(options);

  if (options.lifetime && isNumeric(options.lifetime)) {
    opt.lifetime = toNumber(options.lifetime);
  }

  if (options.lifetimeMode) {
    opt.lifetimeMode = toLifetimeMode(options.lifetimeMode);
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
  const { TEFF, ...optionalOptions } = {...defaultSettingsOptions, ...options}
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
