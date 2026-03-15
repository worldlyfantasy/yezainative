const staticConfig = require("../../config/static-config");

function callStatic(methodName) {
  return Promise.resolve(staticConfig[methodName]());
}

function getHowItWorksPageConfig() {
  return callStatic("getHowItWorksPageConfig");
}

function getCheckoutPageConfig() {
  return callStatic("getCheckoutPageConfig");
}

function getServiceDetailPageConfig() {
  return callStatic("getServiceDetailPageConfig");
}

function getPaymentResultPageConfig() {
  return callStatic("getPaymentResultPageConfig");
}

function getOrderDetailPageConfig() {
  return callStatic("getOrderDetailPageConfig");
}

function getFavoritesPageConfig() {
  return callStatic("getFavoritesPageConfig");
}

module.exports = {
  getHowItWorksPageConfig,
  getCheckoutPageConfig,
  getServiceDetailPageConfig,
  getPaymentResultPageConfig,
  getOrderDetailPageConfig,
  getFavoritesPageConfig
};
