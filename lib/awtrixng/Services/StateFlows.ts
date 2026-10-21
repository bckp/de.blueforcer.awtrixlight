import { AwtrixNgInvalidResponseError } from '../Api/InvalidResponseError';
import { isPlainObject } from '../Support/Guards';

export const AwtrixNgStateFlowCardIds = {
  application: 'awtrixng_app_changed',
  audio: 'awtrixng_audio_changed',
  radio: 'awtrixng_radio_changed',
  error: 'awtrixng_audio_error',
} as const;

export type AwtrixNgStateFlowSubscriptions = Record<keyof typeof AwtrixNgStateFlowCardIds, boolean>;
export interface AwtrixNgObservedAudioGroup { playing: boolean; name: string; error: string }
export interface AwtrixNgObservedRadio { playing: boolean; station: string; title: string; error: string }
export interface AwtrixNgStateFlowSnapshot {
  uid: string;
  uptime?: number;
  application?: string;
  audio?: { alert: AwtrixNgObservedAudioGroup; app: AwtrixNgObservedAudioGroup };
  radio?: AwtrixNgObservedRadio;
}
export interface AwtrixNgStateFlowEvent {
  card: keyof typeof AwtrixNgStateFlowCardIds;
  tokens: Record<string, string | boolean>;
}

export const readAwtrixNgObservedAudio = (
  value: unknown, includeAudio: boolean, includeRadio: boolean,
): Pick<AwtrixNgStateFlowSnapshot, 'audio' | 'radio'> => {
  const invalid = (): never => {
    throw new AwtrixNgInvalidResponseError({ endpoint: '/api/v1/audio', expectedShape: 'typed playback groups, names, radio metadata and error strings', actualValue: value });
  };
  if (!isPlainObject(value)) return invalid();
  const result: Pick<AwtrixNgStateFlowSnapshot, 'audio' | 'radio'> = {};
  if (includeAudio) {
    const groups = {} as NonNullable<AwtrixNgStateFlowSnapshot['audio']>;
    for (const key of ['alert', 'app'] as const) {
      const group = value[key];
      if (!isPlainObject(group) || typeof group.playing !== 'boolean' || typeof group.name !== 'string' || typeof group.error !== 'string') return invalid();
      groups[key] = { playing: group.playing, name: group.name, error: group.error };
    }
    result.audio = groups;
  }
  if (includeRadio) {
    const { radio } = value;
    if (!isPlainObject(radio) || typeof radio.playing !== 'boolean' || typeof radio.station !== 'string'
      || typeof radio.title !== 'string' || typeof radio.error !== 'string') return invalid();
    result.radio = {
      playing: radio.playing, station: radio.station, title: radio.title, error: radio.error,
    };
  }
  return result;
};

/** First observation, changed identity and a hardware reboot establish a baseline. */
export const createAwtrixNgStateFlowEvents = (
  previous: AwtrixNgStateFlowSnapshot | undefined,
  next: AwtrixNgStateFlowSnapshot,
  subscriptions: AwtrixNgStateFlowSubscriptions,
): AwtrixNgStateFlowEvent[] => {
  if (previous === undefined || previous.uid !== next.uid
    || (previous.uptime !== undefined && next.uptime !== undefined && next.uptime < previous.uptime)) return [];
  const events: AwtrixNgStateFlowEvent[] = [];
  if (subscriptions.application && previous.application !== undefined && next.application !== undefined
    && previous.application !== next.application) {
    events.push({ card: 'application', tokens: { application: next.application, previous: previous.application } });
  }
  for (const group of ['alert', 'app'] as const) {
    const before = previous.audio?.[group];
    const after = next.audio?.[group];
    if (before === undefined || after === undefined) continue;
    if (subscriptions.audio && (before.playing !== after.playing || before.name !== after.name)) {
      events.push({
        card: 'audio',
        tokens: {
          group, playing: after.playing, name: after.name, previous_playing: before.playing, previous_name: before.name,
        },
      });
    }
    if (subscriptions.error && after.error.length > 0 && before.error !== after.error) {
      events.push({ card: 'error', tokens: { group, error: after.error } });
    }
  }
  if (previous.radio !== undefined && next.radio !== undefined) {
    const before = previous.radio;
    const after = next.radio;
    if (subscriptions.radio && (before.playing !== after.playing || before.station !== after.station || before.title !== after.title)) {
      events.push({
        card: 'radio',
        tokens: {
          playing: after.playing, station: after.station, title: after.title, previous_playing: before.playing, previous_station: before.station,
        },
      });
    }
    if (subscriptions.error && after.error.length > 0 && before.error !== after.error) {
      events.push({ card: 'error', tokens: { group: 'radio', error: after.error } });
    }
  }
  return events;
};
