const CLOUD_ENV_ID = "yezai-3gr73wd48057512e-10f17b581";
let cloudInitialized = false;

function ensureCloudReady() {
  if (!wx.cloud || typeof wx.cloud.callFunction !== "function") {
    return false;
  }
  if (!cloudInitialized) {
    try {
      wx.cloud.init({
        env: CLOUD_ENV_ID,
        traceUser: true
      });
    } catch (error) {
      // ignore duplicated init in page-level fallback
    }
    cloudInitialized = true;
  }
  return true;
}

function callConfigGateway(action) {
  return new Promise((resolve, reject) => {
    if (!ensureCloudReady()) {
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

function getProfilePageConfig() {
  return callConfigGateway("getProfilePageConfig");
}

function getFavoritesPageConfig() {
  return callConfigGateway("getFavoritesPageConfig");
}

function getArticleBridgePageConfig() {
  return callConfigGateway("getArticleBridgePageConfig");
}

module.exports = {
  getHowItWorksPageConfig,
  getCheckoutPageConfig,
  getServiceDetailPageConfig,
  getPaymentResultPageConfig,
  getOrderDetailPageConfig,
  getProfilePageConfig,
  getFavoritesPageConfig,
  getArticleBridgePageConfig
};
