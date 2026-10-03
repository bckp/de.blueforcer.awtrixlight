import { setTimeout as delay } from 'node:timers/promises';
import {
  AwtrixNgApiAudioResponse,
  AwtrixNgApiCapabilitiesResponse,
  AwtrixNgApiNotificationPayload,
  AwtrixNgApiSound,
  AwtrixNgApiSoundObject,
} from '../Api/Types';
import { AwtrixNgInvalidResponseError } from '../Api/InvalidResponseError';
import { isPlainObject } from '../Support/Guards';

export const AwtrixNgMixerFields = ['volume', 'alertVolume', 'appVolume', 'radioVolume'] as const;
export type AwtrixNgMixerField = typeof AwtrixNgMixerFields[number];
export type AwtrixNgMixerLevels = Record<AwtrixNgMixerField, number>;
export type AwtrixNgAudioGroup = 'alert' | 'app' | 'radio' | 'all';
export interface AwtrixNgRadioStation { name: string; url: string }
export const AwtrixNgMaxClipBytes = 2 * 1024 * 1024;

/** 1.1.6 publishes this new audio schema; older NG publishes synth/buzzer instead. */
export const usesAwtrixNgSoundObjects = (caps: AwtrixNgApiCapabilitiesResponse): boolean => (
  typeof caps.audio?.song === 'boolean' && typeof caps.audio?.rtttl === 'boolean'
);

export const validateAwtrixNgMp3Url = (value: string): string => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError('MP3 URL must be an absolute HTTP(S) address.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new TypeError('MP3 URL must use HTTP(S), without credentials or a fragment.');
  }
  return url.href;
};

export function validateAwtrixNgStation(value: unknown): string | number {
  if (Number.isInteger(value) && Number(value) >= 0) return value as number;
  if (typeof value !== 'string' || value.length === 0) throw new TypeError('Radio station must be a name, index or HTTP(S) URL.');
  return /^https?:\/\//i.test(value) ? validateAwtrixNgMp3Url(value) : value;
}

export function assertAwtrixNgSound(value: unknown): asserts value is AwtrixNgApiSound {
  const entries = Array.isArray(value) ? value : [value];
  if (entries.length < 1 || entries.length > 4) throw new TypeError('Sound must have 1 to 4 entries.');
  for (const entry of entries) {
    if (typeof entry === 'string' && entry.length > 0) continue;
    if (!isPlainObject(entry)) throw new TypeError('Sound must be a name, sound object or list.');
    const sources = ['file', 'rtttl', 'song', 'speech', 'track', 'station'].filter((key) => entry[key] !== undefined);
    if (sources.length !== 1 || Object.keys(entry).some((key) => ![...sources, 'loop', 'nextBar'].includes(key))) {
      throw new TypeError('Sound needs exactly one supported source key.');
    }
    const source = sources[0];
    if (source === 'station') {
      validateAwtrixNgStation(entry.station);
      if (Array.isArray(value) || entry.loop !== undefined || entry.nextBar !== undefined) throw new TypeError('Radio station cannot be in a fallback list or have loop/nextBar options.');
    } else if (source === 'track') {
      if (!Number.isInteger(entry.track) || Number(entry.track) < 1 || Number(entry.track) > 2999) throw new TypeError('Sound track must be 1..2999.');
    } else if (typeof entry[source] !== 'string' || entry[source].length === 0) {
      throw new TypeError(`Sound ${source} must be non-empty text.`);
    }
    if (source === 'speech' && Buffer.byteLength(entry.speech as string) > 512) throw new RangeError('Speech must be 1..512 bytes.');
    if (entry.loop !== undefined && typeof entry.loop !== 'boolean') throw new TypeError('Sound loop must be a boolean.');
    if (entry.nextBar !== undefined && (typeof entry.nextBar !== 'boolean' || source !== 'song' || entry.loop !== true)) {
      throw new TypeError('Sound nextBar is only supported with a looping song.');
    }
  }
}

/** Explicit legacy notification adaptation, confined to the NG audio boundary. */
export const toAwtrixNgSoundObjectNotification = (payload: AwtrixNgApiNotificationPayload): AwtrixNgApiNotificationPayload => {
  const {
    sound, soundRtttl, soundLoop, ...rest
  } = payload;
  if (sound !== undefined && soundRtttl !== undefined) throw new TypeError('Choose sound or soundRtttl, not both.');
  let result: AwtrixNgApiSound | undefined;
  if (soundRtttl !== undefined) result = { rtttl: soundRtttl };
  else if (typeof sound === 'number') result = { track: sound };
  else result = sound;
  if (soundLoop !== undefined) {
    if (result === undefined || Array.isArray(result)) throw new TypeError('soundLoop requires one sound.');
    if (typeof result === 'object' && result.loop !== undefined && result.loop !== soundLoop) {
      throw new TypeError('soundLoop conflicts with sound.loop.');
    }
    result = { ...(typeof result === 'string' ? { file: result } : result), loop: soundLoop } as AwtrixNgApiSoundObject;
  }
  if (result !== undefined) assertAwtrixNgSound(result);
  return { ...rest, ...(result === undefined ? {} : { sound: result }) };
};

export class AwtrixNgAudioPlaybackError extends Error {

  readonly field: string;

  readonly httpStatus?: number;

  readonly timedOut: boolean;

  constructor(message: string, timedOut = false, field = 'alert.error') {
    super(message);
    this.name = 'AwtrixNgAudioPlaybackError';
    this.field = field;
    this.timedOut = timedOut;
    const match = /^HTTP (\d{3})$/.exec(message);
    if (match) this.httpStatus = Number(match[1]);
  }

}

export interface AwtrixNgAudioMonitor {
  getAudio(): Promise<AwtrixNgApiAudioResponse>;
}

/** Wait for completion: playing=true also covers downloading, so it cannot prove success. */
export const waitForAwtrixNgUrlSound = async (
  client: AwtrixNgAudioMonitor,
  url: string,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> => {
  const deadline = Date.now() + (options.timeoutMs ?? 120000);
  while (Date.now() < deadline) {
    const state = await client.getAudio();
    if (!isPlainObject(state) || !isPlainObject(state.alert)
      || typeof state.alert.playing !== 'boolean' || typeof state.alert.name !== 'string'
      || typeof state.alert.error !== 'string') {
      throw new AwtrixNgInvalidResponseError({ endpoint: '/api/v1/audio', expectedShape: 'an alert playback group', actualValue: state });
    }
    if (state.alert.name !== url) throw new Error('MP3 playback was replaced by another alert.');
    if (state.alert.error) throw new AwtrixNgAudioPlaybackError(state.alert.error);
    if (!state.alert.playing) return;
    await delay(options.intervalMs ?? 250);
  }
  throw new AwtrixNgAudioPlaybackError('MP3 playback did not finish within 120 seconds.', true);
};

export const hasAwtrixNgGroupAudio = (caps: AwtrixNgApiCapabilitiesResponse): boolean => (
  usesAwtrixNgSoundObjects(caps) && ['mp3', 'rtttl', 'song', 'speech', 'track', 'radio'].some((key) => (
    caps.audio?.[key as keyof NonNullable<AwtrixNgApiCapabilitiesResponse['audio']>] === true
  ))
);

export const assertAwtrixNgMixerLevel = (field: unknown, value: unknown): void => {
  if (!AwtrixNgMixerFields.includes(field as AwtrixNgMixerField)) throw new TypeError('Unknown audio mixer group.');
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 100) throw new RangeError('Audio volume must be an integer from 0 to 100.');
};

export const readAwtrixNgMixerLevels = (settings: unknown): AwtrixNgMixerLevels => {
  if (!isPlainObject(settings) || !AwtrixNgMixerFields.every((key) => Number.isInteger(settings[key]) && Number(settings[key]) >= 0 && Number(settings[key]) <= 100)) {
    throw new AwtrixNgInvalidResponseError({ endpoint: '/api/v1/settings', expectedShape: 'four mixer levels from 0 to 100', actualValue: settings });
  }
  return Object.fromEntries(AwtrixNgMixerFields.map((key) => [key, settings[key]])) as AwtrixNgMixerLevels;
};

export const readAwtrixNgRadioStations = (state: unknown): AwtrixNgRadioStation[] => {
  if (!isPlainObject(state) || !Array.isArray(state.stations) || state.stations.length > 32
    || !state.stations.every((station) => isPlainObject(station) && typeof station.name === 'string' && typeof station.url === 'string')) {
    throw new AwtrixNgInvalidResponseError({ endpoint: '/api/v1/audio', expectedShape: 'a radio station list', actualValue: state });
  }
  return state.stations.map((station) => ({ name: station.name, url: station.url }));
};

/** Single sources must work on this hardware; fallback lists intentionally let the clock choose. */
export const findAwtrixNgUnsupportedSoundSource = (sound: AwtrixNgApiSound, caps: AwtrixNgApiCapabilitiesResponse): string | undefined => {
  if (Array.isArray(sound)) return undefined;
  const source = typeof sound === 'string' ? { file: sound } : sound;
  if ('file' in source) {
    if (/^https?:\/\//i.test(source.file)) return caps.audio?.url === true && caps.audio.mp3 === true ? undefined : 'file';
    return caps.audio?.mp3 === true || caps.audio?.rtttl === true ? undefined : 'file';
  }
  const key = Object.keys(source).find((field) => ['rtttl', 'song', 'speech', 'track', 'station'].includes(field));
  const flag = key === 'station' ? 'radio' : key;
  return flag !== undefined && caps.audio?.[flag as keyof NonNullable<AwtrixNgApiCapabilitiesResponse['audio']>] === true ? undefined : key;
};

/** The clock receives a transient clip, never a filesystem path or stored asset. */
export const assertAwtrixNgClip = (body: Uint8Array): void => {
  if (!(body instanceof Uint8Array) || body.byteLength === 0 || body.byteLength > AwtrixNgMaxClipBytes) {
    throw new RangeError('Audio clip must contain 1 byte to 2 MiB.');
  }
};

/** Bounded download for Flow URLs. Firmware validates the WAV/MP3 encoding itself. */
export const downloadAwtrixNgClip = async (value: string, signal?: AbortSignal): Promise<Uint8Array> => {
  const url = validateAwtrixNgMp3Url(value);
  const timeout = AbortSignal.timeout(30000);
  const response = await fetch(url, { signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]) });
  if (!response.ok) {
    await response.body?.cancel();
    throw new AwtrixNgAudioPlaybackError(`HTTP ${response.status}`);
  }
  if (Number(response.headers.get('content-length')) > AwtrixNgMaxClipBytes) {
    await response.body?.cancel();
    throw new RangeError('Audio clip exceeds 2 MiB.');
  }
  const reader = response.body?.getReader();
  if (reader === undefined) throw new TypeError('Audio URL returned no file.');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    let finished = false;
    while (!finished) {
      const { done, value: chunk } = await reader.read();
      if (done) {
        finished = true; continue;
      }
      bytes += chunk.byteLength;
      if (bytes > AwtrixNgMaxClipBytes) throw new RangeError('Audio clip exceeds 2 MiB.');
      chunks.push(chunk);
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  } finally {
    reader.releaseLock();
  }
  const body = Buffer.concat(chunks, bytes);
  assertAwtrixNgClip(body);
  return body;
};
