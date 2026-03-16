const { DATA_SOURCE_TYPES, getConfigDataSource, isCloudFallbackEnabled } = require("../constants/data-source");
const cloudConfigApi = require("../api/cloud/config");
const legacyConfigRepository = require("./legacy/config-repository");
const {
  mapHowItWorksPageConfig,
  mapCheckoutPageConfig,
  mapServiceDetailPageConfig,
  mapPaymentResultPageConfig,
  mapOrderDetailPageConfig,
  mapFavoritesPageConfig
} = require("../mappers/config");
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;
const responseCache = new Map();

function getRepository() {
  return getConfigDataSource() === DATA_SOURCE_TYPES.CLOUD ? cloudConfigApi : legacyConfigRepository;
}

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

  const repository = getRepository();
  let payload;

  try {
    payload = await repository[methodName].apply(repository);
  } catch (error) {
    if (repository !== legacyConfigRepository && isCloudFallbackEnabled()) {
      payload = await legacyConfigRepository[methodName].apply(legacyConfigRepository);
    } else {
      throw error;
    }
  }

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

module.exports = {
  getHowItWorksPageConfig,
  getCheckoutPageConfig,
  getServiceDetailPageConfig,
  getPaymentResultPageConfig,
  getOrderDetailPageConfig,
  getFavoritesPageConfig
};
