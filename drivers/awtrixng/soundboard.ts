interface SoundboardApi {
  getInstalled(): Promise<boolean>;
  get(path: string): Promise<unknown>;
}

export interface SoundboardSound {
  id: string;
  name: string;
  path: string;
  type: string;
}

export const SoundboardAppId = 'com.athom.soundboard';

const isSound = (value: unknown): value is SoundboardSound => {
  if (value === null || typeof value !== 'object') return false;
  const sound = value as Record<string, unknown>;
  return typeof sound.id === 'string' && /^[a-f0-9]{24}$/.test(sound.id)
    && typeof sound.name === 'string' && typeof sound.path === 'string' && typeof sound.type === 'string';
};

export const getSoundboardAudioFiles = async (api: SoundboardApi): Promise<SoundboardSound[]> => {
  if (!await api.getInstalled()) throw new Error('Install Soundboard on Homey before using this action.');
  const sounds = await api.get('/');
  if (!Array.isArray(sounds) || !sounds.every(isSound)) throw new Error('Soundboard returned an invalid sound list.');
  return sounds.filter((sound) => ['audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/wave'].includes(sound.type));
};

const soundboardFileUrl = (sound: SoundboardSound, address: string, extensions: string[]): string => {
  const path = sound.path.replace(/^\//, '');
  if (!extensions.some((extension) => path === `userdata/${sound.id}.${extension}`)) throw new Error('Soundboard returned an unsupported MP3 file path.');
  const base = new URL(address.includes('://') ? address : `http://${address}`);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('Homey returned an invalid local address.');
  }
  return new URL(`/app/${SoundboardAppId}/${path}`, base).href;
};

export const getSoundboardMp3s = async (api: SoundboardApi): Promise<SoundboardSound[]> => {
  return (await getSoundboardAudioFiles(api)).filter((sound) => ['audio/mp3', 'audio/mpeg'].includes(sound.type));
};

/** Re-resolve the current path by ID for every run; never trust saved autocomplete metadata. */
export const resolveSoundboardMp3Url = async (api: SoundboardApi, address: string, id: string): Promise<string> => {
  const sound = (await getSoundboardMp3s(api)).find((item) => item.id === id);
  if (sound === undefined) throw new Error('This Soundboard MP3 no longer exists. Select the sound again in the Flow.');
  return soundboardFileUrl(sound, address, ['mp3']);
};

export const resolveSoundboardClipUrl = async (api: SoundboardApi, address: string, id: string): Promise<string> => {
  const sound = (await getSoundboardAudioFiles(api)).find((item) => item.id === id);
  if (sound === undefined) throw new Error('This Soundboard file no longer exists. Select the sound again in the Flow.');
  return soundboardFileUrl(sound, address, ['mp3', 'wav']);
};
