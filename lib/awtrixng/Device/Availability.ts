import { AwtrixNgDeviceProbeResult } from '../Discovery/Detection';
import { AwtrixNgApiError } from '../Api/ErrorParser';

export type AwtrixNgAvailabilityState =
  | {
    available: true;
  }
  | {
    available: false;
    message: string;
  };

const formatApiErrorDetails = (error: AwtrixNgApiError): string => {
  const details = [error.message];

  if (error.field !== undefined) {
    details.push(`field: ${error.field}`);
  }

  details.push(`code: ${error.code}`);

  if (error.httpStatus !== undefined) {
    details.push(`HTTP status: ${error.httpStatus}`);
  }

  return details.join(' | ');
};

const formatUnknownError = (error: unknown): string => {
  if (error instanceof AwtrixNgApiError) {
    return formatApiErrorDetails(error);
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error.';
};

export const toAwtrixNgAvailabilityState = (result: AwtrixNgDeviceProbeResult): AwtrixNgAvailabilityState => {
  if (result.status === 'detected') {
    return {
      available: true,
    };
  }

  if (result.status === 'auth-required') {
    return {
      available: false,
      message: `Authentication is required. ${formatApiErrorDetails(result.error)}`,
    };
  }

  if (result.status === 'rejected') {
    return {
      available: false,
      message: 'The device did not return a valid response.',
    };
  }

  return {
    available: false,
    message: `Device is offline. ${formatUnknownError(result.error)}`,
  };
};
