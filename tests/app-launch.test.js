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

test("app launch initializes cloud and global data without logo prefetch", () => {
  const calls = [];
  const realSetTimeout = global.setTimeout;
  global.setTimeout = (callback, delay) => {
    calls.push({ type: "setTimeout", delay, callback });
    return {
      unref() {
        calls.push({ type: "timer.unref" });
      }
    };
  };

  global.wx = {
    cloud: {
      init(options) {
        calls.push({ type: "cloud.init", options });
      }
    },
    loadFontFace(options) {
      calls.push({ type: "loadFontFace", options });
    }
  };

  try {
    const appConfig = loadAppConfig();
    const appInstance = {};

    assert.doesNotThrow(() => {
      appConfig.onLaunch.call(appInstance);
    });

    assert.equal(calls[0].type, "cloud.init");
    assert.equal(calls[1].type, "setTimeout");
    assert.equal(calls[1].delay, 2500);
    assert.equal(calls[2].type, "timer.unref");
    assert.equal(calls.some((call) => call.type === "loadFontFace"), false);
    assert.equal(typeof appInstance.globalData, "object");
  } finally {
    global.setTimeout = realSetTimeout;
    cleanupGlobals();
  }
});
