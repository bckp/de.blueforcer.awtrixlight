export type AwtrixNgButton = 'left' | 'middle' | 'right';

export interface AwtrixNgButtonCallbackEvent {
  button: AwtrixNgButton;
  pressed: boolean;
  uid: string;
}

export type AwtrixNgKnobCallbackEvent = {
  button: 'knob';
  uid: string;
} & ({ pressed: boolean; turn?: never } | { turn: number; pressed?: never });

type CallbackValues = Record<string, unknown>;

const isPlainObject = (value: unknown): value is CallbackValues => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
);

const parseRawBody = (body: string | Buffer): CallbackValues | undefined => {
  try {
    const value: unknown = JSON.parse(body.toString());
    return isPlainObject(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Firmware 1.1.1 sends JSON with a boolean state. Homey documents JSON body
 * parsing; raw JSON string/Buffer are accepted for testability and router variance.
 */
export const parseAwtrixNgButtonCallback = (body: unknown): AwtrixNgButtonCallbackEvent | AwtrixNgKnobCallbackEvent | undefined => {
  let values: CallbackValues | undefined;

  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    values = parseRawBody(body);
  } else if (isPlainObject(body)) {
    values = body;
  }

  if (values === undefined
    || typeof values.uid !== 'string'
    || values.uid.length === 0) {
    return undefined;
  }

  if (values.button === 'knob') {
    if (typeof values.state === 'boolean' && values.turn === undefined) {
      return { button: 'knob', pressed: values.state, uid: values.uid };
    }
    if (values.state === undefined && typeof values.turn === 'number'
      && Number.isSafeInteger(values.turn) && values.turn !== 0) {
      return { button: 'knob', turn: values.turn, uid: values.uid };
    }
    return undefined;
  }

  if ((values.button !== 'left' && values.button !== 'middle' && values.button !== 'right')
    || typeof values.state !== 'boolean' || values.turn !== undefined) {
    return undefined;
  }

  return {
    button: values.button,
    pressed: values.state,
    uid: values.uid,
  };
};
