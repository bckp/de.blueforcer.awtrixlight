import Poll from "../../lib/Poll";

export interface DeviceFailer {
  failsReset(): void;
  failsAdd(): void;
  failsExceeded(): boolean;
  failsCritical(value: boolean): void;
}

export interface DevicePoll {
  poll: Poll;
}
