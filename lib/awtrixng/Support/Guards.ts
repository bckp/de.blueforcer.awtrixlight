/**
 * Shared type guards for the AWTRIX NG lib layer.
 *
 * Only `lib/awtrixng` and `drivers/awtrixng` may import from here. The AWTRIX 3
 * layer and the shared driver layer (`app.ts`, `drivers/shared-flow-actions.ts`)
 * keep their own copies on purpose - see the layer separation rules in AGENTS.md.
 *
 * Two distinct record semantics exist and must not be conflated:
 * - `isRecord` accepts arrays (used where an array is still a usable object,
 *   for example mDNS TXT records, fetch headers, API error envelopes).
 * - `isPlainObject` rejects arrays and objects with a custom prototype (used
 *   where the value must be a JSON object, for example payload transforms).
 */

/** Any non-null object, including arrays. */
export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** A plain object: not null, not an array, and without a custom prototype. */
export const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
};

/**
 * Coerces a value to a valid TCP port number, or `undefined` when it is not one.
 * Callers that need a hard failure wrap this and throw themselves.
 */
export const toValidTcpPort = (value: unknown): number | undefined => {
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return undefined;
  }

  return port;
};
