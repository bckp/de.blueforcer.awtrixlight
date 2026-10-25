export interface AwtrixNgMessageTokens {
  event: string;
  data: string;
}

const MaxMessageBytes = 16 * 1024;
const MaxEventBytes = 128;

export const parseAwtrixNgMessage = (body: unknown): AwtrixNgMessageTokens => {
  let value = body;
  if (typeof value === 'string' || Buffer.isBuffer(value)) {
    if (Buffer.byteLength(value) > MaxMessageBytes) throw new RangeError('Message exceeds 16 KiB.');
    try {
      value = JSON.parse(value.toString());
    } catch {
      throw new TypeError('Message must be valid JSON.');
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError('Message must be a JSON object with event and data.');
  }
  const message = value as Record<string, unknown>;
  if (Object.keys(message).some((key) => key !== 'event' && key !== 'data')) {
    throw new TypeError('Message only accepts event and data.');
  }
  if (typeof message.event !== 'string' || message.event.trim().length === 0
    || Buffer.byteLength(message.event) > MaxEventBytes) {
    throw new TypeError('Event must contain non-empty text of at most 128 UTF-8 bytes.');
  }
  if (!Object.hasOwn(message, 'data')) throw new TypeError('Message data is required.');
  let data: string | undefined;
  let serialized: string;
  try {
    data = JSON.stringify(message.data);
    serialized = JSON.stringify(message);
  } catch {
    throw new TypeError('Message data must be JSON.');
  }
  if (data === undefined) throw new TypeError('Message data must be JSON.');
  if (Buffer.byteLength(serialized) > MaxMessageBytes) throw new RangeError('Message exceeds 16 KiB.');
  return { event: message.event, data };
};
