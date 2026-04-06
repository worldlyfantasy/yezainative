const cloudConfigApi = require("../api/cloud/config");
const {
  mapHowItWorksPageConfig,
  mapCheckoutPageConfig,
  mapServiceDetailPageConfig,
  mapPaymentResultPageConfig,
  mapOrderDetailPageConfig,
  mapFavoritesPageConfig,
  mapArticleBridgePageConfig
} = require("../mappers/config");
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;
const responseCache = new Map();

function getCachedValue(methodName) {
  const cached = responseCache.get(methodName);
  if (!cached) {
    return undefined;
  }

  if (cached.expiresAt <= Date.now()) {
    responseCache.delete(methodName);
    return undefined;
  }

  return cached.value;
}

async function invoke(methodName, mapper) {
  const cachedValue = getCachedValue(methodName);
  if (cachedValue !== undefined) {
    return cachedValue;
  }

  const payload = await cloudConfigApi[methodName].apply(cloudConfigApi);
  const mapped = mapper(payload);
  responseCache.set(methodName, {
    expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
    value: mapped
  });
  return mapped;
}

function getHowItWorksPageConfig() {
  return invoke("getHowItWorksPageConfig", mapHowItWorksPageConfig);
}

function getCheckoutPageConfig() {
  return invoke("getCheckoutPageConfig", mapCheckoutPageConfig);
}

function getServiceDetailPageConfig() {
  return invoke("getServiceDetailPageConfig", mapServiceDetailPageConfig);
}

function getPaymentResultPageConfig() {
  return invoke("getPaymentResultPageConfig", mapPaymentResultPageConfig);
}

function getOrderDetailPageConfig() {
  return invoke("getOrderDetailPageConfig", mapOrderDetailPageConfig);
}

function getFavoritesPageConfig() {
  return invoke("getFavoritesPageConfig", mapFavoritesPageConfig);
}

function getArticleBridgePageConfig() {
  return invoke("getArticleBridgePageConfig", mapArticleBridgePageConfig);
}

module.exports = {
  getHowItWorksPageConfig,
  getCheckoutPageConfig,
  getServiceDetailPageConfig,
  getPaymentResultPageConfig,
  getOrderDetailPageConfig,
  getFavoritesPageConfig,
  getArticleBridgePageConfig
};
