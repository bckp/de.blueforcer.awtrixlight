import {
  AwtrixNgApiAppsResponse, AwtrixNgApiScriptConfig, AwtrixNgApiScriptSetting,
  AwtrixNgApiScriptAppError, AwtrixNgApiSharedScriptValue,
} from '../Api/Types';
import { AwtrixNgInvalidResponseError } from '../Api/InvalidResponseError';
import AwtrixNgScriptRestartError from './ScriptRestartError';
import { isPlainObject } from '../Support/Guards';

export class AwtrixNgScriptValueError extends TypeError {

  readonly field: string;

  constructor(field: string, message: string) {
    super(`${field}: ${message}`);
    this.name = 'AwtrixNgScriptValueError';
    this.field = field;
  }

}

export const assertAwtrixNgScriptName = (name: string): void => {
  if (typeof name !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(name)) throw new AwtrixNgScriptValueError('name', 'Invalid script name.');
};

export const getAwtrixNgManageableScripts = (apps: AwtrixNgApiAppsResponse): AwtrixNgApiAppsResponse => {
  if (!Array.isArray(apps) || apps.some((app) => !isPlainObject(app) || typeof app.name !== 'string')) {
    throw new AwtrixNgInvalidResponseError({ endpoint: '/api/v1/apps', expectedShape: 'an array of named apps', actualValue: apps });
  }
  // Disabled, headless and broken scripts can be configured; modules and built-ins use other semantics.
  return apps.filter((app) => app.origin === 'script' && app.present !== false);
};

const isScriptSetting = (field: unknown): field is AwtrixNgApiScriptSetting => {
  if (!isPlainObject(field) || typeof field.key !== 'string' || field.key.length === 0
    || !Object.hasOwn(field, 'value') || (field.label !== undefined && typeof field.label !== 'string')) return false;
  if (['min', 'max'].some((key) => field[key] !== undefined && (typeof field[key] !== 'number' || !Number.isFinite(field[key])))) return false;
  if (field.maxlen !== undefined && (!Number.isInteger(field.maxlen) || Number(field.maxlen) < 0)) return false;
  if (field.type === 'bool') return typeof field.value === 'boolean';
  if (field.type === 'text') return typeof field.value === 'string';
  if (field.type === 'select') {
    return typeof field.value === 'string' && Array.isArray(field.options)
    && field.options.every((option) => typeof option === 'string') && field.options.includes(field.value);
  }
  if (field.type === 'color') return Number.isInteger(field.value) && Number(field.value) >= 0 && Number(field.value) <= 16777215;
  if (field.type === 'number' || field.type === 'slider') return typeof field.value === 'number' && Number.isFinite(field.value);
  return false;
};

export function assertAwtrixNgScriptConfig(value: unknown, name: string): asserts value is AwtrixNgApiScriptConfig {
  if (!isPlainObject(value) || value.name !== name || !Array.isArray(value.fields)
    || !Array.isArray(value.warnings) || value.fields.some((field: unknown) => !isScriptSetting(field))) {
    throw new AwtrixNgInvalidResponseError({ endpoint: `/api/v1/apps/${name}/config`, expectedShape: 'a named script config with typed fields and warnings', actualValue: value });
  }
}

export const parseAwtrixNgScriptSettingValue = (field: AwtrixNgApiScriptSetting, source: string): unknown => {
  const invalid = (message: string): never => {
    throw new AwtrixNgScriptValueError(field.key, message);
  };
  if (typeof source !== 'string') return invalid('Expected a text input.');
  if (field.type === 'text') {
    // TC002 1.2.0 applies maxlen to UTF-8 bytes, including diacritics and emoji.
    if (field.maxlen !== undefined && Buffer.byteLength(source, 'utf8') > field.maxlen) return invalid('Text exceeds the declared maximum length in UTF-8 bytes.');
    return source;
  }
  if (field.type === 'select') {
    if (!Array.isArray(field.options) || !field.options.includes(source)) return invalid('Value is not one of the declared options.');
    return source;
  }
  if (field.type === 'color' && /^#[0-9a-f]{6}$/i.test(source)) return source;
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return invalid('Expected a number, true/false, or #RRGGBB for a color.');
  }
  if (field.type === 'bool') {
    if (typeof value !== 'boolean') return invalid('Expected true or false.');
  } else if (field.type === 'color') {
    if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 16777215) return invalid('Expected #RRGGBB or an integer color from 0 to 16777215.');
  } else if (typeof value !== 'number' || !Number.isFinite(value)
    || (field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max)) {
    return invalid('Expected a number within the declared bounds.');
  }
  return value;
};

export const parseAwtrixNgScriptDataPatch = (source: string): Record<string, unknown> => {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new AwtrixNgScriptValueError('data', 'Expected a JSON object.');
  }
  if (!isPlainObject(value) || Object.keys(value).length === 0) throw new AwtrixNgScriptValueError('data', 'Expected a non-empty JSON object; null removes an individual key.');
  return value;
};

export const assertAwtrixNgScriptWriteResult = (value: unknown, name: string, endpoint: string): void => {
  if (!isPlainObject(value) || value.ok !== true || value.name !== name || !Object.hasOwn(value, 'error')
    || (value.error !== null && (!isPlainObject(value.error) || typeof value.error.message !== 'string'
      || (value.error.line !== undefined && (!Number.isInteger(value.error.line) || Number(value.error.line) < 1))
      || (value.error.hook !== undefined && typeof value.error.hook !== 'string')))) {
    throw new AwtrixNgInvalidResponseError({ endpoint, expectedShape: 'a named script save result with error null or a script error', actualValue: value });
  }
  if (value.error !== null) throw new AwtrixNgScriptRestartError(value.error as unknown as AwtrixNgApiScriptAppError);
};

export function assertAwtrixNgSharedScriptValues(value: unknown): asserts value is AwtrixNgApiSharedScriptValue[] {
  if (!Array.isArray(value) || value.some((item: unknown) => {
    if (!isPlainObject(item) || typeof item.owner !== 'string' || typeof item.key !== 'string'
      || !Number.isInteger(item.ageMs) || Number(item.ageMs) < 0) return true;
    if (!['int', 'real', 'bool', 'string'].includes(String(item.type))) return true;
    if (item.value === null) return item.type !== 'int' && item.type !== 'real';
    if (item.type === 'bool') return typeof item.value !== 'boolean';
    if (item.type === 'string') return typeof item.value !== 'string';
    return typeof item.value !== 'number' || !Number.isFinite(item.value) || (item.type === 'int' && !Number.isInteger(item.value));
  })) {
    throw new AwtrixNgInvalidResponseError({ endpoint: '/api/v1/scripts/shared', expectedShape: 'an array of typed shared values and ages', actualValue: value });
  }
}

export const toAwtrixNgScriptValueToken = (value: unknown): { value: string } => {
  const token = typeof value === 'string' ? value : JSON.stringify(value);
  if (token === undefined) throw new AwtrixNgScriptValueError('value', 'Script value is not JSON data.');
  return { value: token };
};
