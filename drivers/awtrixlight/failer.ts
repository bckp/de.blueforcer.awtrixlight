export interface DeviceFailer {
  failsReset(): void;
  failsAdd(): void;
  failsExceeded(): boolean;
  failsCritical(value: boolean): void;
}
