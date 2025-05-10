import { IndicatorEffect, Overlay, EffectSettings, ColorPalette, ColorPaletteBuildIn, ColorPaletteColors, BarLineValues, TextFragment } from "./Types";

export const isColor = (color: any): color is string => {
  if (typeof color === 'number' || typeof color === 'string') {
    return /^#[0-9A-F]{6}$/i.test(color.toString());
  }
  return false;
};

export const isNumeric = (input: any): input is number | string => {
  if (typeof input === 'string' || typeof input === 'number') {
    return !Number.isNaN(Number.parseInt(input.toString(), 10));
  }
  return false;
};

export const isIndicatorEffect = (effect: any): effect is IndicatorEffect => {
  if (typeof effect === 'string') {
    return effect === 'blink' || effect === 'fade';
  }
  return false;
};

export const isOverlay = (overlay: any): overlay is Overlay => {
  if (typeof overlay === 'string') {
    return overlay === 'clear' || overlay === 'snow' || overlay === 'rain' || overlay === 'drizzle' || overlay === 'storm' || overlay === 'thunder' || overlay === 'frost';
  }
  return false;
}

export const isArrayOfStrings = (array: any): array is string[] => {
  if (Array.isArray(array)) {
    return array.every((item) => typeof item === 'string');
  }
  return false;
}

export const isEffectSettings = (settings: any): settings is EffectSettings => {
  if (typeof settings === 'object') {
    return isNumeric(settings.speed) && isPalette(settings.palette) && typeof settings.blend === 'boolean';
  }
  return false;
}

const isColorPaletteColors = (colors: any): colors is ColorPaletteColors => {
  if (Array.isArray(colors) && colors.length === 16) {
    return colors.every((color) => isColor(color));
  }
  return false;
}

const isPaletteBuildIn = (pallete: any): pallete is ColorPaletteBuildIn => {
  if (typeof pallete === 'string') {
    return pallete === 'Cloud' || pallete === 'Lava' || pallete === 'Ocean' || pallete === 'Forest' || pallete === 'Stripe' || pallete === 'Party' || pallete === 'Heat' || pallete === 'Rainbow';
  }
  return false;
}

export const isArrayOfTextFragments = (fragments: any): fragments is TextFragment[] => {
  if (Array.isArray(fragments)) {
    return fragments.every((item) => isTextFragment(item));
  }
  return false;
}

export const isTextFragment = (fragment: any): fragment is TextFragment => {
  if (typeof fragment === 'object') {
    return typeof fragment.t === 'string' && isColor(fragment.c);
  }
  return false;
}

export const isPalette = (palette: any): palette is ColorPalette => {
  return isPaletteBuildIn(palette) || isColorPaletteColors(palette);
}

export const isBarLineValues = (values: any, hasIcon: boolean): values is BarLineValues => {
  if (Array.isArray(values) && (hasIcon ? values.length <= 11 : values.length <= 16)) {
    return values.every((value) => isNumeric(value));
  }
  return false;
}