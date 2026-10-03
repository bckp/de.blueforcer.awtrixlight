import { AwtrixNgApiCapabilitiesResponse, AwtrixNgApiPagePayload } from '../Api/Types';
import { UnsupportedAwtrixNgPayloadFieldError } from '../Payload/Transformers';
import { isPlainObject } from '../Support/Guards';

export const needsAwtrixNgPageCapabilities = (page: AwtrixNgApiPagePayload): boolean => (
  page.layout !== undefined || page.icons !== undefined || page.iconGap !== undefined
  || (page.font !== undefined && !['small', 'large'].includes(page.font))
  || (typeof page.icon === 'string' && /^https?:\/\//i.test(page.icon))
);

/** No icon-gap/multiple-icon capability flag exists. Those fields use the verified 1.1.6 contract. */
export const assertAwtrixNgPageCapabilities = (
  page: AwtrixNgApiPagePayload,
  caps: AwtrixNgApiCapabilitiesResponse,
  extendedFieldsSupported: boolean,
  target: 'notification' | 'pushedApp',
): void => {
  const unsupported = (field: string, details: string): never => {
    throw new UnsupportedAwtrixNgPayloadFieldError({
      field, target, reason: 'unsupported-field', details,
    });
  };
  if (page.font !== undefined && !['small', 'large'].includes(page.font)
    && (!Array.isArray(caps.fonts) || !caps.fonts.some((font) => font.name === page.font))) {
    unsupported('font', 'This font is not advertised by the device.');
  }
  for (const field of ['iconGap', 'icons'] as const) {
    if (page[field] !== undefined && !extendedFieldsSupported) unsupported(field, 'Requires the verified AWTRIX NG 1.1.6 payload contract or newer.');
  }
  const checkIcon = (icon: string | undefined, field: string): void => {
    if (icon !== undefined && /^https?:\/\//i.test(icon)
      && (!isPlainObject(caps.platform) || caps.platform.id !== 'tc002')) {
      unsupported(field, 'Internet pictures are documented only for TC002.');
    }
  };
  checkIcon(page.icon, 'icon');
  page.icons?.forEach((icon, index) => checkIcon(icon.icon, `icons[${index}].icon`));
  page.layout?.regions.forEach((region, index) => checkIcon(region.icon, `layout.regions[${index}].icon`));
};
