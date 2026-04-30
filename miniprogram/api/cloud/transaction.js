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

function callTransactionGateway(action, payload) {
  return new Promise((resolve, reject) => {
    if (!ensureCloudReady()) {
      reject(new Error("wx.cloud.callFunction is unavailable"));
      return;
    }

    wx.cloud.callFunction({
      name: "transactionGateway",
      data: {
        action,
        payload: payload || {}
      },
      success: (result) => {
        const gatewayResult = result && result.result ? result.result : null;
        if (!gatewayResult || gatewayResult.ok !== true) {
          reject(new Error(gatewayResult && gatewayResult.error ? gatewayResult.error : "Transaction gateway failed"));
          return;
        }

        resolve(gatewayResult.data || null);
      },
      fail: reject
    });
  });
}

function getOrders(statusKey) {
  return callTransactionGateway("getOrders", { statusKey: statusKey || "all" });
}

function getRecentOrders(limit) {
  return callTransactionGateway("getRecentOrders", { limit: limit || 2 });
}

function getOrderById(orderId) {
  return callTransactionGateway("getOrderById", { orderId });
}

function createOrder(payload) {
  return callTransactionGateway("createOrder", payload);
}

function cancelOrder(orderId) {
  return callTransactionGateway("cancelOrder", { orderId });
}

function payOrder(orderId) {
  return callTransactionGateway("payOrder", { orderId });
}

function getFavoriteState() {
  return callTransactionGateway("getFavoriteState");
}

function isFavorited(type, slug) {
  return callTransactionGateway("isFavorited", { type, slug });
}

function toggleFavorite(type, slug) {
  return callTransactionGateway("toggleFavorite", { type, slug });
}

function getFavoritesPageData() {
  return callTransactionGateway("getFavoritesPageData");
}

module.exports = {
  getOrders,
  getRecentOrders,
  getOrderById,
  createOrder,
  cancelOrder,
  payOrder,
  getFavoriteState,
  isFavorited,
  toggleFavorite,
  getFavoritesPageData
};
