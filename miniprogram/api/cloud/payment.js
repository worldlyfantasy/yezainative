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

function callPaymentGateway(action, payload) {
  return new Promise((resolve, reject) => {
    if (!ensureCloudReady()) {
      reject(new Error("wx.cloud.callFunction is unavailable"));
      return;
    }

    wx.cloud.callFunction({
      name: "paymentGateway",
      data: {
        action,
        payload: payload || {}
      },
      success: (result) => {
        const gatewayResult = result && result.result ? result.result : null;
        if (!gatewayResult || gatewayResult.ok !== true) {
          reject(new Error(gatewayResult && gatewayResult.error ? gatewayResult.error : "Payment gateway failed"));
          return;
        }

        resolve(gatewayResult.data || null);
      },
      fail: reject
    });
  });
}

function createMiniProgramOrderPayment(orderId) {
  return callPaymentGateway("createMiniProgramOrderPayment", { orderId });
}

function confirmMiniProgramOrderPayment(orderId, txnSeqno) {
  return callPaymentGateway("confirmMiniProgramOrderPayment", { orderId, txnSeqno });
}

module.exports = {
  createMiniProgramOrderPayment,
  confirmMiniProgramOrderPayment
};
