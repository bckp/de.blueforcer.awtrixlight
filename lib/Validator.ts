import { IndicatorEffect } from "./Types";

export const isColor = (color: any): color is string => {
  if (typeof color === 'number' || typeof color === 'string') {
    return /^#[0-9A-F]{6}$/i.test(color.toString());
  }
  return false;
};

export const isNumeric = (input: any): input is number | string => {
  if (typeof input === 'string' || typeof input === 'number') {
    return Number.isNaN(Number.parseInt(input.toString(), 10));
  }
  return false;
};

export const isIndicatorEffect = (effect: any): effect is IndicatorEffect => {
  if (typeof effect === 'string') {
    return effect === 'blink' || effect === 'fade';
  }
  return false;
};
