import baseConfig from "./playwright.config";

const noWebServerConfig = {
  ...baseConfig,
  use: {
    ...baseConfig.use,
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL ?? "http://localhost:3000",
  },
  webServer: undefined,
};

export default noWebServerConfig;
