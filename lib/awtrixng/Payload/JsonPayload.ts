import {
  AwtrixNgTransformTarget,
  UnsupportedAwtrixNgPayloadFieldError,
} from './Transformers';
import { isPlainObject } from '../Support/Guards';

const parseAwtrixNgJsonObjectPayload = (source: string | undefined, target: AwtrixNgTransformTarget): Record<string, unknown> => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(source !== undefined && source.trim().length > 0 ? source : '{}') as unknown;
  } catch {
    throw new UnsupportedAwtrixNgPayloadFieldError({
      field: '<payload>',
      target,
      reason: 'invalid-value',
      details: 'Payload must be valid JSON.',
    });
  }

  if (!isPlainObject(parsed)) {
    throw new UnsupportedAwtrixNgPayloadFieldError({
      field: '<payload>',
      target,
      reason: 'invalid-value',
      details: 'Payload must be a JSON object. Array payloads are not supported by this Homey flow. Scalar JSON values are not supported by this Homey flow.',
    });
  }

  return parsed;
};

export default parseAwtrixNgJsonObjectPayload;
