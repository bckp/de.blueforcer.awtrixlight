export type AwtrixDeviceType = 'awtrix3' | 'awtrixng';

export interface AwtrixTypedDevice<TDeviceType extends AwtrixDeviceType = AwtrixDeviceType> {
  getAwtrixDeviceType(): TDeviceType;
}
