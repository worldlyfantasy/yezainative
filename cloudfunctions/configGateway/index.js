const cloud = require("wx-server-sdk");
const { defaultConfigs } = require("./config-definitions");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const CONFIG_COLLECTION = "app_configs";
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;
const configCache = new Map();

function isPlainObject(value) {
  return Boolean(value) && Object.prototype.toString.call(value) === "[object Object]";
}

function deepMerge(base, override) {
  if (Array.isArray(base)) {
    return Array.isArray(override) ? override : base;
  }

  if (!isPlainObject(base)) {
    return override == null ? base : override;
  }

  const result = Object.assign({}, base);
  Object.keys(override || {}).forEach((key) => {
    const nextValue = override[key];
    const prevValue = result[key];
    if (isPlainObject(prevValue) && isPlainObject(nextValue)) {
      result[key] = deepMerge(prevValue, nextValue);
    } else {
      result[key] = nextValue;
    }
  });
  return result;
}

async function queryStoredConfig(key) {
  const result = await db.collection(CONFIG_COLLECTION).where({ key }).limit(1).get();
  if (!result.data || !result.data.length) {
    return null;
  }

  const doc = result.data[0];
  return doc.value && isPlainObject(doc.value) ? doc.value : doc;
}

async function getStoredConfig(key, options) {
  const settings = Object.assign(
    {
      cache: true
    },
    options || {}
  );

  if (!settings.cache) {
    try {
      return await queryStoredConfig(key);
    } catch (error) {
      return null;
    }
  }

  const cached = configCache.get(key);
  if (cached) {
    if (cached.expiresAt > Date.now()) {
      return cached.value;
    }

    if (cached.promise) {
      return cached.promise;
    }
  }

  const loadPromise = (async () => {
    try {
      const value = await queryStoredConfig(key);
      if (!value) {
        configCache.set(key, {
          expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
          value: null
        });
        return null;
      }

      configCache.set(key, {
        expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
        value
      });
      return value;
    } catch (error) {
      configCache.delete(key);
      return null;
    }
  })();

  configCache.set(key, {
    expiresAt: 0,
    promise: loadPromise
  });

  try {
    return await loadPromise;
  } catch (error) {
    return null;
  }
}

async function readConfig(key, options) {
  const defaults = defaultConfigs[key];
  const stored = await getStoredConfig(key, options);
  return deepMerge(defaults || {}, stored || {});
}

const handlers = {
  getHowItWorksPageConfig: () => readConfig("howItWorksPage"),
  getCheckoutPageConfig: () => readConfig("checkoutPage"),
  getServiceDetailPageConfig: () => readConfig("serviceDetailPage"),
  getPaymentResultPageConfig: () => readConfig("paymentResultPage"),
  getOrderDetailPageConfig: () => readConfig("orderDetailPage"),
  getProfilePageConfig: () => readConfig("profilePage", { cache: false }),
  getFavoritesPageConfig: () => readConfig("favoritesPage"),
  getArticleBridgePageConfig: () => readConfig("articleBridgePage")
};

exports.main = async (event) => {
  const action = event && event.action;
  const payload = event && event.payload ? event.payload : {};
  const handler = handlers[action];

  if (!handler) {
    return {
      ok: false,
      error: `Unsupported action: ${action || ""}`
    };
  }

  try {
    const data = await handler(payload);
    return {
      ok: true,
      data
    };
  } catch (error) {
    return {
      ok: false,
      error: error && error.message ? error.message : "Config gateway error"
    };
  }
};
