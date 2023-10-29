export interface DeviceFailer {
  failsReset(): void;
  failsAdd(): void;
  failsExceeded(): boolean;
  failsCritical(value: boolean): void;
}

export interface DevicePoll {
  pollInit(): void;
  pollExec(): void;
  pollIsActive(): boolean;
  pollClear(): void;
}
