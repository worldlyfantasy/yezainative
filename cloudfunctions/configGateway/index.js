const cloud = require("wx-server-sdk");
const { defaultConfigs, editableConfigKeys } = require("./config-definitions");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const CONFIG_COLLECTION = "app_configs";

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

async function getStoredConfig(key) {
  try {
    const result = await db.collection(CONFIG_COLLECTION).where({ key }).limit(1).get();
    if (!result.data || !result.data.length) {
      return null;
    }

    const doc = result.data[0];
    return doc.value && isPlainObject(doc.value) ? doc.value : doc;
  } catch (error) {
    return null;
  }
}

async function readConfig(key) {
  const defaults = defaultConfigs[key];
  const stored = await getStoredConfig(key);
  return deepMerge(defaults || {}, stored || {});
}

async function getEditableConfigs() {
  const pairs = await Promise.all(
    editableConfigKeys.map(async (key) => [key, await readConfig(key)])
  );

  return pairs.reduce((result, pair) => {
    result[pair[0]] = pair[1];
    return result;
  }, {});
}

const handlers = {
  getConfigByKey: (payload) => readConfig(payload && payload.key),
  getEditableConfigs: () => getEditableConfigs(),
  getHowItWorksPageConfig: () => readConfig("howItWorksPage"),
  getCheckoutPageConfig: () => readConfig("checkoutPage"),
  getServiceDetailPageConfig: () => readConfig("serviceDetailPage"),
  getPaymentResultPageConfig: () => readConfig("paymentResultPage"),
  getOrderDetailPageConfig: () => readConfig("orderDetailPage"),
  getFavoritesPageConfig: () => readConfig("favoritesPage")
};

exports.main = async (event) => {
  const action = event && event.action;
  const handler = handlers[action];

  if (!handler) {
    return {
      ok: false,
      error: `Unsupported action: ${action || ""}`
    };
  }

  try {
    const data = await handler();
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
