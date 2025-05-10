export type Color = string;
export type PushIcon = 0 | 1 | 2;
export type TextCase = 0 | 1 | 2;
export type LifetimeMode = 0 | 1;
export type IndicatorEffect = 'fade' | 'blink';
export type ColorPaletteBuildIn = 'Cloud' | 'Lava' | 'Ocean' | 'Forest' | 'Stripe' | 'Party' | 'Heat' | 'Rainbow';
export type ColorPaletteColors = [Color, Color, Color, Color, Color, Color, Color, Color, Color, Color, Color, Color, Color, Color, Color, Color];
export type ColorPalette = ColorPaletteBuildIn | ColorPaletteColors;
export type Overlay = "clear"| "snow" | "rain" | "drizzle" | "storm" | "thunder" | "frost";
export type TransitionEffect = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type BarLineValues = 
| [number]
| [number, number]
| [number, number, number]
| [number, number, number, number]
| [number, number, number, number, number]
| [number, number, number, number, number, number]
| [number, number, number, number, number, number, number]
| [number, number, number, number, number, number, number, number]
| [number, number, number, number, number, number, number, number, number]
| [number, number, number, number, number, number, number, number, number, number]
| [number, number, number, number, number, number, number, number, number, number, number]
| [number, number, number, number, number, number, number, number, number, number, number, number]
| [number, number, number, number, number, number, number, number, number, number, number, number, number]
| [number, number, number, number, number, number, number, number, number, number, number, number, number, number]
| [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]
| [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];

export type IndicatorOptions = {
  color: Color;
  blink?: number;
  fade?: number;
}

export type PowerOptions = {
  power: boolean;
}

export type AwtrixImage = {
  type: string,
  size: number,
  name: string,
}

export type AwtrixStats = {
  bat: number,
  lux: number,
  ram: number,
  bri: number,
  temp: number,
  hum: number,
  uptime: number,
  // eslint-disable-next-line camelcase
  wifi_signal: number,
  messages: number,
  version: string,
  indicator1: boolean,
  indicator2: boolean,
  indicator3: boolean,
  app: string,
  uid: string,
  matrix: boolean,
}

export type HomeyAwtrixIcon = {
  name: string,
  id: string,
  description?: string,
}

export type EffectSettings = {
  speed: number,
  palette: ColorPalette,
  blend: boolean,
}

export type TextFragment = {
  t: string; // The text to display.
  c: Color; // The text color.
}

type Base = {
  text?: string|TextFragment[]; // The text to display.
  textCase?: TextCase; // Changes the Uppercase setting. 0=global setting, 1=forces uppercase; 2=shows as it sent.
  topText?: boolean; // Draw the text on top.
  textOffset?: number; // Sets an offset for the x position of a starting text.
  center?: boolean; // Centers a short, non-scrollable text.
  color?: Color; // The text, bar or line color.
  gradient?: [Color, Color]; // Colorizes the text in a gradient of two given colors
  blinkText?: number; // Blinks the text in an given interval, not compatible with gradient or rainbow
  fadeText?: number; // Fades the text on and off in an given interval, not compatible with gradient or rainbow
  background?: Color; // Sets a background color.
  rainbow?: boolean; // Fades each letter in the text differently through the entire RGB spectrum.
  icon?: string; // The icon ID or filename (without extension) to display on the app.
  pushIcon?: PushIcon; // 0 = Icon doesn't move. 1 = Icon moves with text and will not appear again. 2 = Icon moves with text but appears again when the text starts to scroll again.
  repeat?: number; // Sets how many times the text should be scrolled through the matrix before the app ends.
  duration?: number; // Sets how long the app or notification should be displayed.
  bar?: BarLineValues ; //Draws a bargraph. Without icon maximum 16 values, with icon 11 values.
  line?: BarLineValues; //Draws a linechart. Without icon maximum 16 values, with icon 11 values.
  barBC?: Color; // Backgroundcolor of the bars.
  autoscale?: boolean; //Enables or disables autoscaling for bar and linechart.
  progress?: number; // Shows a progress bar. Value can be 0-100.
  progressC?: Color; // The color of the progress bar.
  progressBC?: Color; // The color of the progress bar background.
  noScroll?: boolean; // Disables the text scrolling.
  scrollSpeed?: number; // Modifies the scroll speed. Enter a percentage value of the original scroll speed.
  effect?: string; // Shows an effect as background.
  effectSettings?: EffectSettings; //Changes color and speed of the effect.
  overlay?: Overlay; // Shows an overlay effect.
}

type OnlyNotify = {
  hold?: boolean; // Set it to true, to hold your notification on top until you press the middle button or dismiss it via HomeAssistant. This key only belongs to notification.
  rtttl?: string; // Allows to send the RTTTL sound string with the json.
  loopSound?: boolean; // Loops the sound or rtttl as long as the notification is running.
  stack?: boolean; // Defines if the notification will be stacked. false will immediately replace the current notification.
  wakeup?: boolean; // If the Matrix is off, the notification will wake it up for the time of the notification.
  clients?: string[]; // Allows forwarding a notification to other awtrix devices. Use the IP addresses.
}

type OnlyApp = {
  lifetime?: number; // Removes the custom app when there is no update after the given time in seconds.
  lifetimeMode?: LifetimeMode; // 0 = deletes the app, 1 = marks it as staled with a red rectangle around the app
  pos?: number; // Sets position of the app, starting from 0
}

export type BaseOptions = Base;
export type NotifyOptions = Base & OnlyNotify;
export type AppOptions = Base & OnlyApp;
export type SettingOptions = {
  TIM?: boolean;
  DAT?: boolean;
  HUM?: boolean;
  TEMP?: boolean;
  BAT?: boolean;
  ABRI?: boolean;
  ATRANS?: boolean;
  BLOCKN?: boolean;
  UPPERCASE?: boolean;
  TEFF?: number;
};
