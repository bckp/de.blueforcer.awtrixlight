import { AwtrixNgApiCapabilitiesResponse, AwtrixNgApiLayout, AwtrixNgApiPagePayload } from '../Api/Types';
import { AwtrixNgInvalidResponseError } from '../Api/InvalidResponseError';
import { AwtrixNgTransformTarget, UnsupportedAwtrixNgPayloadFieldError } from '../Payload/Transformers';
import { isPlainObject } from '../Support/Guards';

export interface AwtrixNgHeaderLayoutInput {
  header: string;
  text: string;
  icon?: string;
  durationMs?: number;
}

/** This preset is deliberately for a 52x16 panel. Smaller panels need their own layout. */
export const createAwtrixNgHeaderLayout = (input: AwtrixNgHeaderLayoutInput): AwtrixNgApiPagePayload => {
  if (typeof input.header !== 'string' || typeof input.text !== 'string') throw new TypeError('Header and text must be strings.');
  if (input.durationMs !== undefined && (!Number.isInteger(input.durationMs) || input.durationMs <= 0)) {
    throw new TypeError('Duration must be a positive integer in milliseconds.');
  }
  if (input.icon !== undefined && (typeof input.icon !== 'string' || input.icon.length === 0)) throw new TypeError('Icon must be a non-empty ID.');
  const icon = input.icon !== undefined && input.icon !== '-';
  const x = icon ? 17 : 0;
  const width = 52 - x;
  return {
    ...(input.durationMs === undefined ? { repeat: 1 } : { durationMs: input.durationMs }),
    layout: {
      version: 1,
      regions: [
        ...(icon ? [{ id: 'icon', box: [0, 0, 16, 16] as [number, number, number, number], icon: input.icon }] : []),
        {
          id: 'header', box: [x, 0, width, 8], text: input.header, font: 'small', align: 'start', color: '#00AAFF', scroll: { mode: 'loop' },
        },
        {
          id: 'text', box: [x, 8, width, 8], text: input.text, font: 'small', align: 'start', color: '#FFFFFF', scroll: { mode: 'loop' },
        },
      ],
    },
  };
};

const unsupported = (field: string, target: AwtrixNgTransformTarget, details: string): never => {
  throw new UnsupportedAwtrixNgPayloadFieldError({
    field, target, reason: 'unsupported-field', details,
  });
};

/** Device-independent JSON validation has already run. All checks here use advertised facts. */
export const assertAwtrixNgLayoutCapabilities = (
  layout: AwtrixNgApiLayout,
  capabilities: AwtrixNgApiCapabilitiesResponse,
  target: 'notification' | 'pushedApp',
): void => {
  if (!isPlainObject(capabilities)) {
    throw new AwtrixNgInvalidResponseError({ endpoint: '/api/v1/capabilities', expectedShape: 'a capabilities object', actualValue: capabilities });
  }
  if (!isPlainObject(capabilities.layouts) || capabilities.layouts.version !== layout.version) {
    unsupported('layout', target, 'This device does not advertise support for layout version 1.');
  }
  const { display, fonts } = capabilities;
  const { limits } = capabilities.layouts!;
  if (!isPlainObject(display) || !Number.isInteger(display.width) || display.width <= 0
    || !Number.isInteger(display.height) || display.height <= 0
    || !Array.isArray(fonts) || !fonts.every((font) => isPlainObject(font) && typeof font.name === 'string')
    || !isPlainObject(limits)
    || !(['regions', 'scrollers', 'assets', 'chartPoints', 'textBytes'] as const).every((key) => (
      Number.isInteger(limits[key]) && (limits[key] as number) >= 0
    ))) {
    throw new AwtrixNgInvalidResponseError({
      endpoint: '/api/v1/capabilities', expectedShape: 'layout limits, font names and positive display dimensions', actualValue: capabilities,
    });
  }
  const counts = {
    regions: layout.regions.length, scrollers: 0, assets: 0, textBytes: 0,
  };
  const checkName = (field: string, name: unknown, names: unknown): void => {
    if (name !== undefined && (typeof name !== 'string' || !Array.isArray(names) || !names.includes(name))) {
      unsupported(field, target, 'This name is not advertised by the device capabilities.');
    }
  };
  checkName('layout.effect', layout.effect, capabilities.effects);
  checkName('layout.overlay', layout.overlay, capabilities.overlays);
  if (typeof layout.palette === 'string') checkName('layout.palette', layout.palette, capabilities.palettes);
  layout.regions.forEach((region, index) => {
    const path = `layout.regions[${index}]`;
    const [x, y, width, height] = region.box;
    if (x + width > display.width || y + height > display.height) {
      unsupported(`${path}.box`, target, `Region must fit inside this device's ${display.width}x${display.height} display.`);
    }
    if (region.text !== undefined || region.draw !== undefined) {
      checkName(`${path}.font`, region.font ?? 'small', fonts.map((font) => font.name));
    }
    if (typeof region.palette === 'string') checkName(`${path}.palette`, region.palette, capabilities.palettes);
    if (region.text !== undefined) {
      const mode = typeof region.scroll === 'string' ? region.scroll : region.scroll?.mode;
      if (mode !== 'static') counts.scrollers += 1;
      counts.textBytes += Buffer.byteLength(typeof region.text === 'string' ? region.text : region.text.map((part) => part.text).join(''));
    }
    if (region.draw !== undefined) {
      for (const command of region.draw) if (command[0] === 'text') counts.textBytes += Buffer.byteLength(command[3]);
    }
    if (region.icon !== undefined) counts.assets += 1;
    if (region.chart !== undefined && region.chart.values.length > limits.chartPoints) {
      unsupported(`${path}.chart.values`, target, `Device allows at most ${limits.chartPoints} chart points.`);
    }
  });
  for (const key of ['regions', 'scrollers', 'assets', 'textBytes'] as const) {
    if (counts[key] > limits[key]) unsupported('layout.regions', target, `Device layout limit ${key} is ${limits[key]}; payload needs ${counts[key]}.`);
  }
};
