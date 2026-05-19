const test = require("node:test");
const assert = require("node:assert/strict");

const splashModulePath = require.resolve("../miniprogram/pages/splash/splash");
const STORAGE_KEY = "yezai:lastSplashDate";
const HOME_PATH = "/pages/home/home";

function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function loadSplashPage() {
  let pageConfig = null;
  global.Page = (config) => {
    pageConfig = config;
  };

  delete require.cache[splashModulePath];
  require("../miniprogram/pages/splash/splash");

  assert.ok(pageConfig, "expected splash page to be registered");
  return pageConfig;
}

function cleanupGlobals() {
  delete require.cache[splashModulePath];
  delete global.Page;
  delete global.wx;
}

function createPageInstance(pageConfig) {
  return {
    ...pageConfig,
    data: pageConfig.data,
    setData(update) {
      this.data = {
        ...this.data,
        ...update
      };
    }
  };
}

test("splash records today's date and starts entry animation on first launch of the day", () => {
  const calls = [];
  const storage = {};
  const realSetTimeout = global.setTimeout;
  global.setTimeout = (callback, delay) => {
    calls.push({ type: "setTimeout", delay, callback });
    return 1;
  };

  global.wx = {
    getStorageSync(key) {
      calls.push({ type: "getStorageSync", key });
      return storage[key] || "";
    },
    setStorageSync(key, value) {
      calls.push({ type: "setStorageSync", key, value });
      storage[key] = value;
    },
    redirectTo(options) {
      calls.push({ type: "redirectTo", options });
    }
  };

  try {
    const pageConfig = loadSplashPage();
    const page = createPageInstance(pageConfig);

    pageConfig.onLoad.call(page);

    assert.equal(storage[STORAGE_KEY], getLocalDateKey(new Date()));
    assert.equal(calls.some((call) => call.type === "redirectTo"), false);
    assert.deepEqual(
      calls.filter((call) => call.type === "setTimeout").map((call) => call.delay),
      [1000]
    );
  } finally {
    global.setTimeout = realSetTimeout;
    cleanupGlobals();
  }
});

test("splash redirects home immediately when already shown today", () => {
  const calls = [];
  const today = getLocalDateKey(new Date());
  const storage = {
    [STORAGE_KEY]: today
  };
  const realSetTimeout = global.setTimeout;
  global.setTimeout = (callback, delay) => {
    calls.push({ type: "setTimeout", delay, callback });
    return 1;
  };

  global.wx = {
    getStorageSync(key) {
      calls.push({ type: "getStorageSync", key });
      return storage[key] || "";
    },
    setStorageSync(key, value) {
      calls.push({ type: "setStorageSync", key, value });
      storage[key] = value;
    },
    redirectTo(options) {
      calls.push({ type: "redirectTo", options });
    },
    reLaunch(options) {
      calls.push({ type: "reLaunch", options });
    }
  };

  try {
    const pageConfig = loadSplashPage();
    const page = createPageInstance(pageConfig);

    pageConfig.onLoad.call(page);

    assert.equal(calls.some((call) => call.type === "setTimeout"), false);
    assert.equal(calls.some((call) => call.type === "setStorageSync"), false);
    assert.equal(calls.filter((call) => call.type === "redirectTo").length, 1);
    assert.equal(calls.find((call) => call.type === "redirectTo").options.url, HOME_PATH);
  } finally {
    global.setTimeout = realSetTimeout;
    cleanupGlobals();
  }
});
