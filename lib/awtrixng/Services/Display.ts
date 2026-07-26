import { AwtrixNgApiDisplayPatch } from '../Api/Types';
import { UnsupportedAwtrixNgPayloadFieldError } from '../Payload/Transformers';

export const AwtrixNgWeatherOverlayValues = [
  'none',
  'drizzle',
  'frost',
  'rain',
  'snow',
  'storm',
  'thunder',
] as const;

export type AwtrixNgWeatherOverlayValue = typeof AwtrixNgWeatherOverlayValues[number];

export type AwtrixNgWeatherOverlayApiValue = Exclude<AwtrixNgWeatherOverlayValue, 'none'>;

export const AwtrixNgWeatherOverlayCapabilityId = 'awtrixng_weather_overlay' as const;

const weatherOverlayValues = new Set<string>(AwtrixNgWeatherOverlayValues);

const weatherOverlayApiValues = new Set<string>(AwtrixNgWeatherOverlayValues.filter((value) => value !== 'none'));

const expectedWeatherOverlayValues = AwtrixNgWeatherOverlayValues.join(', ');

export const isAwtrixNgWeatherOverlayValue = (value: unknown): value is AwtrixNgWeatherOverlayValue => (
  typeof value === 'string' && weatherOverlayValues.has(value)
);

export const toAwtrixNgWeatherOverlayPatch = (value: unknown): AwtrixNgApiDisplayPatch => {
  if (!isAwtrixNgWeatherOverlayValue(value)) {
    throw new UnsupportedAwtrixNgPayloadFieldError({
      field: AwtrixNgWeatherOverlayCapabilityId,
      target: 'displayOverlay',
      reason: 'invalid-value',
      details: `Expected one of: ${expectedWeatherOverlayValues}.`,
    });
  }

  return {
    overlay: value === 'none' ? null : value,
  };
};

export const toAwtrixNgHomeyWeatherOverlayValue = (overlay: string | null): AwtrixNgWeatherOverlayValue => {
  if (overlay === null) {
    return 'none';
  }

  if (weatherOverlayApiValues.has(overlay)) {
    return overlay as AwtrixNgWeatherOverlayApiValue;
  }

  throw new UnsupportedAwtrixNgPayloadFieldError({
    field: 'overlay',
    target: 'displayOverlay',
    reason: 'invalid-value',
    details: `Expected null or one of: ${AwtrixNgWeatherOverlayValues.filter((value) => value !== 'none').join(', ')}.`,
  });
};
