const { DATA_SOURCE_TYPES, getConfigDataSource } = require("../constants/data-source");
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

function getRepository() {
  return getConfigDataSource() === DATA_SOURCE_TYPES.CLOUD ? cloudConfigApi : legacyConfigRepository;
}

async function invoke(methodName, mapper) {
  const repository = getRepository();
  let payload;

  try {
    payload = await repository[methodName].apply(repository);
  } catch (error) {
    if (repository !== legacyConfigRepository) {
      payload = await legacyConfigRepository[methodName].apply(legacyConfigRepository);
    } else {
      throw error;
    }
  }

  return mapper(payload);
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
