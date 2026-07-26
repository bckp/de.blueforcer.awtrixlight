export type AwtrixProtocol = 'awtrix3' | 'awtrix-ng';

export interface AwtrixProtocolErrorOptions {
  protocol: AwtrixProtocol;
  message: string;
}

export class AwtrixProtocolError extends Error {

  readonly protocol: AwtrixProtocol;

  constructor(options: AwtrixProtocolErrorOptions) {
    super(options.message);
    this.name = 'AwtrixProtocolError';
    this.protocol = options.protocol;

    Object.setPrototypeOf(this, AwtrixProtocolError.prototype);
  }

}
