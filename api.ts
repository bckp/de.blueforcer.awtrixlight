interface AppApiContext {
  homey: {
    drivers: {
      getDriver(id: string): {
        handleButtonCallback(input: { uid: unknown; token: unknown; body: unknown }): Promise<boolean>;
        handleMessage(input: { uid: unknown; body: unknown }): Promise<void>;
      };
    };
  };
  params?: { uid?: unknown; token?: unknown };
  body?: unknown;
}

const awtrixNgButtonCallback = async ({ homey, params, body }: AppApiContext): Promise<{ ok: boolean }> => ({
  ok: await homey.drivers.getDriver('awtrixng').handleButtonCallback({
    uid: params?.uid,
    token: params?.token,
    body,
  }),
});

const awtrixNgMessage = async ({ homey, params, body }: AppApiContext): Promise<{ ok: true }> => {
  await homey.drivers.getDriver('awtrixng').handleMessage({ uid: params?.uid, body });
  return { ok: true };
};

module.exports = { awtrixNgButtonCallback, awtrixNgMessage };
