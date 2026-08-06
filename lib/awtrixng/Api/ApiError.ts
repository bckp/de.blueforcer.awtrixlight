import { AwtrixNgHeaders, AwtrixNgHttpError, AwtrixNgHttpMethod } from '../Http/Transport';
import { isRecord } from '../Support/Guards';

export type AwtrixNgErrorCode =
  | 'invalidJson'
  | 'invalidPinConfig'
  | 'invalidPath'
  | 'invalidName'
  | 'badRequest'
  | 'wrongChip'
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'methodNotAllowed'
  | 'payloadTooLarge'
  | 'unsupportedMediaType'
  | 'validationFailed'
  | 'internalError'
  | 'unavailable'
  | 'serviceBusy'
  | 'insufficientStorage';

export type AwtrixNgApiErrorCode = AwtrixNgErrorCode | 'unknownErrorEnvelope' | (string & Record<never, never>);

export interface AwtrixNgErrorEnvelope {
  error: {
    code: AwtrixNgApiErrorCode;
    message: string;
    field?: string;
  };
}

export interface AwtrixNgApiErrorOptions {
  method: AwtrixNgHttpMethod;
  url: string;
  message: string;
  code: AwtrixNgApiErrorCode;
  httpStatus?: number;
  field?: string;
  headers?: AwtrixNgHeaders;
  rawBody?: unknown;
  errorCause?: unknown;
}

export class AwtrixNgApiError extends Error {

  readonly protocol = 'awtrix-ng';

  readonly method: AwtrixNgHttpMethod;

  readonly url: string;

  readonly httpStatus?: number;

  readonly code: AwtrixNgApiErrorCode;

  readonly field?: string;

  readonly headers: AwtrixNgHeaders;

  readonly rawBody?: unknown;

  readonly errorCause?: unknown;

  constructor(options: AwtrixNgApiErrorOptions) {
    super(options.message);
    this.name = 'AwtrixNgApiError';
    this.method = options.method;
    this.url = options.url;
    this.httpStatus = options.httpStatus;
    this.code = options.code;
    this.field = options.field;
    this.headers = options.headers || {};
    this.rawBody = options.rawBody;
    this.errorCause = options.errorCause;

    Object.setPrototypeOf(this, AwtrixNgApiError.prototype);
  }

}

export const isAwtrixNgErrorEnvelope = (value: unknown): value is AwtrixNgErrorEnvelope => {
  if (!isRecord(value)) {
    return false;
  }

  const { error } = value;

  if (!isRecord(error)) {
    return false;
  }

  if (typeof error.code !== 'string' || typeof error.message !== 'string') {
    return false;
  }

  return error.field === undefined || typeof error.field === 'string';
};

export const parseAwtrixNgApiError = (error: AwtrixNgHttpError): AwtrixNgApiError => {
  const {
    headers,
    message,
    method,
    rawBody,
    status,
    url,
  } = error;

  if (isAwtrixNgErrorEnvelope(rawBody)) {
    return new AwtrixNgApiError({
      method,
      url,
      httpStatus: status,
      headers,
      code: rawBody.error.code,
      message: rawBody.error.message,
      field: rawBody.error.field,
      rawBody,
      errorCause: error,
    });
  }

  return new AwtrixNgApiError({
    method,
    url,
    httpStatus: status,
    headers,
    code: 'unknownErrorEnvelope',
    message,
    rawBody,
    errorCause: error,
  });
};
