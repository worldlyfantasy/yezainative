const test = require("node:test");
const assert = require("node:assert/strict");

const appModulePath = require.resolve("../miniprogram/app");

function loadAppConfig() {
  let appConfig = null;
  global.App = (config) => {
    appConfig = config;
  };

  delete require.cache[appModulePath];
  require("../miniprogram/app");

  assert.ok(appConfig, "expected app config to be registered");
  return appConfig;
}

function cleanupGlobals() {
  delete require.cache[appModulePath];
  delete global.App;
  delete global.wx;
}

test("app launch does not crash when wx.getImageInfo is callback-based", () => {
  const calls = [];
  global.wx = {
    cloud: {
      init(options) {
        calls.push({ type: "cloud.init", options });
      }
    },
    getImageInfo(options) {
      calls.push({ type: "getImageInfo", options });
      return undefined;
    }
  };

  try {
    const appConfig = loadAppConfig();
    const appInstance = {};

    assert.doesNotThrow(() => {
      appConfig.onLaunch.call(appInstance);
    });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].type, "cloud.init");
    assert.equal(calls[1].type, "getImageInfo");
    assert.equal(typeof appInstance.globalData, "object");
  } finally {
    cleanupGlobals();
  }
});
