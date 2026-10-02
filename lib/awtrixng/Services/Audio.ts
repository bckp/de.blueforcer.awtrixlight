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

export function assertAwtrixNgSound(value: unknown): asserts value is AwtrixNgApiSound {
  const entries = Array.isArray(value) ? value : [value];
  if (entries.length < 1 || entries.length > 4) throw new TypeError('Sound must have 1 to 4 entries.');
  for (const entry of entries) {
    if (typeof entry === 'string' && entry.length > 0) continue;
    if (!isPlainObject(entry)) throw new TypeError('Sound must be a name, sound object or list.');
    const sources = ['file', 'rtttl', 'song', 'speech', 'track'].filter((key) => entry[key] !== undefined);
    if (sources.length !== 1 || Object.keys(entry).some((key) => ![...sources, 'loop', 'nextBar'].includes(key))) {
      throw new TypeError('Sound needs exactly one supported source key.');
    }
    const source = sources[0];
    if (source === 'track') {
      if (!Number.isInteger(entry.track) || Number(entry.track) < 1 || Number(entry.track) > 2999) throw new TypeError('Sound track must be 1..2999.');
    } else if (typeof entry[source] !== 'string' || entry[source].length === 0) {
      throw new TypeError(`Sound ${source} must be non-empty text.`);
    }
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

  readonly field = 'alert.error';

  readonly httpStatus?: number;

  readonly timedOut: boolean;

  constructor(message: string, timedOut = false) {
    super(message);
    this.name = 'AwtrixNgAudioPlaybackError';
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
