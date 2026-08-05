import AwtrixNgClient from '../Api/Client';
import { AwtrixNgApiError } from '../Api/ErrorParser';
import { AwtrixNgApiDeviceStateResponse, AwtrixNgApiIndicatorState } from '../Api/Types';

export const AwtrixNgMdnsServiceName = '_awtrixng._tcp';
export const AwtrixNgMdnsName = 'awtrixng';
export const AwtrixNgMdnsProtocol = 'tcp';
export const AwtrixNgMdnsTxtType = 'awtrixng';

export interface AwtrixNgMdnsCandidate {
  serviceName?: string;
  name?: string;
  protocol?: string;
  txt?: Record<string, unknown>;
}

export interface AwtrixNgBaseUrlInput {
  protocol?: 'http' | 'https';
  address: string;
  port: number;
}

export interface AwtrixNgDeviceProbeClient {
  getDevice(): Promise<unknown>;
}

export type AwtrixNgDeviceProbeResult =
  | {
    status: 'detected';
    device: AwtrixNgApiDeviceStateResponse;
  }
  | {
    status: 'auth-required';
    error: AwtrixNgApiError;
  }
  | {
    status: 'offline';
    error: unknown;
  }
  | {
    status: 'rejected';
    reason: 'wrong-shape';
    rawResponse: unknown;
  };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const hasStringField = (value: Record<string, unknown>, field: string): boolean => typeof value[field] === 'string';

const hasNumberField = (value: Record<string, unknown>, field: string): boolean => typeof value[field] === 'number';

const hasBooleanField = (value: Record<string, unknown>, field: string): boolean => typeof value[field] === 'boolean';

const hasOptionalNumberField = (value: Record<string, unknown>, field: string): boolean => (
  value[field] === undefined || typeof value[field] === 'number'
);

const hasOptionalBooleanField = (value: Record<string, unknown>, field: string): boolean => (
  value[field] === undefined || typeof value[field] === 'boolean'
);

const isAwtrixNgIndicatorState = (value: unknown): value is AwtrixNgApiIndicatorState => {
  if (!isRecord(value)) {
    return false;
  }

  return hasBooleanField(value, 'on')
    && hasStringField(value, 'color')
    && hasNumberField(value, 'blinkMs')
    && hasNumberField(value, 'fadeMs');
};

const hasAwtrixNgDeviceSignature = (value: Record<string, unknown>): boolean => (
  hasStringField(value, 'uid')
  && hasStringField(value, 'version')
  && hasStringField(value, 'boardType')
  && hasStringField(value, 'ipAddress')
  && hasBooleanField(value, 'matrixPower')
  && hasStringField(value, 'currentApp')
  && Array.isArray(value.indicators)
  && value.indicators.every(isAwtrixNgIndicatorState)
);

const hasValidOptionalSensorFields = (value: Record<string, unknown>): boolean => (
  hasOptionalNumberField(value, 'batteryPercent')
  && hasOptionalNumberField(value, 'batteryVoltage')
  && hasOptionalNumberField(value, 'batteryPinMillivolts')
  && hasOptionalBooleanField(value, 'lowBattery')
  && hasOptionalNumberField(value, 'temperature')
  && hasOptionalNumberField(value, 'humidity')
  && hasOptionalNumberField(value, 'pressureHpa')
);

// R6-2: physical-device verification returned 401 for both missing and invalid credentials.
// HTTP 403 is not an authentication signal and remains classified as offline.
const isUnauthorizedError = (error: AwtrixNgApiError): boolean => error.httpStatus === 401;

const normalizeAddressForUrl = (address: string): string => {
  if (address.includes(':') && !address.startsWith('[') && !address.endsWith(']')) {
    return `[${address}]`;
  }

  return address;
};

export const isAwtrixNgMdnsCandidate = (candidate: AwtrixNgMdnsCandidate): boolean => {
  const serviceNameMatches = candidate.serviceName === AwtrixNgMdnsServiceName;
  const nameAndProtocolMatch = candidate.name === AwtrixNgMdnsName && candidate.protocol === AwtrixNgMdnsProtocol;

  return (serviceNameMatches || nameAndProtocolMatch) && candidate.txt?.type === AwtrixNgMdnsTxtType;
};

export const toAwtrixNgBaseUrl = (input: AwtrixNgBaseUrlInput): string => {
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    throw new RangeError('Device base URL requires a valid TCP port.');
  }

  const protocol = input.protocol || 'http';
  const address = normalizeAddressForUrl(input.address);

  return `${protocol}://${address}:${input.port}`;
};

export const isAwtrixNgDeviceStateResponse = (value: unknown): value is AwtrixNgApiDeviceStateResponse => {
  if (!isRecord(value)) {
    return false;
  }

  return hasAwtrixNgDeviceSignature(value) && hasValidOptionalSensorFields(value);
};

export const probeAwtrixNgDevice = async (client: AwtrixNgDeviceProbeClient | AwtrixNgClient): Promise<AwtrixNgDeviceProbeResult> => {
  try {
    const response = await client.getDevice();

    if (isAwtrixNgDeviceStateResponse(response)) {
      return {
        status: 'detected',
        device: response,
      };
    }

    return {
      status: 'rejected',
      reason: 'wrong-shape',
      rawResponse: response,
    };
  } catch (error: unknown) {
    if (error instanceof AwtrixNgApiError && isUnauthorizedError(error)) {
      return {
        status: 'auth-required',
        error,
      };
    }

    return {
      status: 'offline',
      error,
    };
  }
};
