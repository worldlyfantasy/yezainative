function callConfigGateway(action) {
  return new Promise((resolve, reject) => {
    if (!wx.cloud || typeof wx.cloud.callFunction !== "function") {
      reject(new Error("wx.cloud.callFunction is unavailable"));
      return;
    }

    wx.cloud.callFunction({
      name: "configGateway",
      data: {
        action
      },
      success: (result) => {
        const payload = result && result.result ? result.result : null;
        if (!payload || payload.ok !== true) {
          reject(new Error(payload && payload.error ? payload.error : "Config gateway failed"));
          return;
        }

        resolve(payload.data || null);
      },
      fail: reject
    });
  });
}

function getHowItWorksPageConfig() {
  return callConfigGateway("getHowItWorksPageConfig");
}

function getCheckoutPageConfig() {
  return callConfigGateway("getCheckoutPageConfig");
}

function getServiceDetailPageConfig() {
  return callConfigGateway("getServiceDetailPageConfig");
}

function getPaymentResultPageConfig() {
  return callConfigGateway("getPaymentResultPageConfig");
}

function getOrderDetailPageConfig() {
  return callConfigGateway("getOrderDetailPageConfig");
}

function getFavoritesPageConfig() {
  return callConfigGateway("getFavoritesPageConfig");
}

module.exports = {
  getHowItWorksPageConfig,
  getCheckoutPageConfig,
  getServiceDetailPageConfig,
  getPaymentResultPageConfig,
  getOrderDetailPageConfig,
  getFavoritesPageConfig
};
