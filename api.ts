interface AppApiContext {
  homey: {
    drivers: {
      getDriver(id: string): {
        handleButtonCallback(input: { uid: unknown; token: unknown; body: unknown }): Promise<boolean>;
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

module.exports = { awtrixNgButtonCallback };
