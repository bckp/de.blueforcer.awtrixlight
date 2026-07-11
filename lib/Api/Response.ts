// ESLint 7's base rule incorrectly treats TypeScript enum members as unused variables.
/* eslint-disable no-unused-vars */
export enum Status {
  Ok,
  AuthRequired,
  AuthFailed,
  NotFound,
  Error,
}
/* eslint-enable no-unused-vars */

export interface Response {
  status: Status;
  data?: any;
  message?: string;
}
