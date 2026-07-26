import { UnsupportedReason } from '../Errors/Capability';

export {
  AwtrixNgApiError,
  AwtrixNgApiErrorCode,
  AwtrixNgApiErrorOptions,
  AwtrixNgErrorCode,
  AwtrixNgErrorEnvelope,
  isAwtrixNgErrorEnvelope,
  parseAwtrixNgApiError,
} from './ApiError';
export { AwtrixProtocol, AwtrixProtocolError, AwtrixProtocolErrorOptions } from '../Errors/ProtocolError';

export interface UnsupportedCapabilityErrorOptions {
  capability: string;
  reason: UnsupportedReason;
  details?: string;
}

export class UnsupportedCapabilityError extends Error {

  readonly capability: string;

  readonly reason: UnsupportedReason;

  readonly details?: string;

  constructor(options: UnsupportedCapabilityErrorOptions) {
    super(UnsupportedCapabilityError.formatMessage(options));
    this.name = 'UnsupportedCapabilityError';
    this.capability = options.capability;
    this.reason = options.reason;
    this.details = options.details;

    Object.setPrototypeOf(this, UnsupportedCapabilityError.prototype);
  }

  private static formatMessage(options: UnsupportedCapabilityErrorOptions): string {
    const baseMessage = `Capability "${options.capability}" is not supported: ${options.reason}`;

    if (!options.details) {
      return baseMessage;
    }

    return `${baseMessage}. ${options.details}`;
  }

}
