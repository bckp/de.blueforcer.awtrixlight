export enum Status {
  Ok,
  AuthRequired,
  AuthFailed,
  NotFound,
  Error,
}

export interface Response {
  status: Status;
  data?: any;
  message?: string;
}
