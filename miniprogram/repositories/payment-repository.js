const cloudPaymentApi = require("../api/cloud/payment");
const userSessionStore = require("./local/user-session-store");

function hasActiveUserSession() {
  return userSessionStore.isSessionActive();
}

function ensureActiveSession() {
  if (!hasActiveUserSession()) {
    return Promise.reject(new Error("User session inactive"));
  }
  return null;
}

function normalizePaymentParams(params) {
  const source = params && typeof params === "object" ? params : {};
  return {
    timeStamp: String(source.timeStamp || source.timestamp || ""),
    nonceStr: String(source.nonceStr || source.noncestr || ""),
    package: String(source.package || source.packageValue || ""),
    signType: String(source.signType || source.signtype || "RSA"),
    paySign: String(source.paySign || source.paysign || "")
  };
}

function requestWechatPayment(params) {
  const paymentParams = normalizePaymentParams(params);
  return new Promise((resolve, reject) => {
    if (typeof wx.requestPayment !== "function") {
      reject(new Error("wx.requestPayment is unavailable"));
      return;
    }
    if (!paymentParams.timeStamp || !paymentParams.nonceStr || !paymentParams.package || !paymentParams.paySign) {
      reject(new Error("微信支付参数不完整"));
      return;
    }

    wx.requestPayment(Object.assign({}, paymentParams, {
      success: resolve,
      fail: reject
    }));
  });
}

function createOrderPayment(orderId) {
  const sessionError = ensureActiveSession();
  if (sessionError) {
    return sessionError;
  }
  return cloudPaymentApi.createMiniProgramOrderPayment(orderId);
}

function confirmOrderPayment(orderId, txnSeqno) {
  const sessionError = ensureActiveSession();
  if (sessionError) {
    return sessionError;
  }
  return cloudPaymentApi.confirmMiniProgramOrderPayment(orderId, txnSeqno);
}

async function payOrderWithWechat(orderId) {
  const payment = await createOrderPayment(orderId);
  try {
    await requestWechatPayment(payment.paymentParams || {});
  } catch (error) {
    error.paymentStage = "request";
    error.payment = payment;
    throw error;
  }

  let confirmation;
  try {
    confirmation = await confirmOrderPayment(orderId, payment.txnSeqno);
  } catch (error) {
    error.paymentStage = "confirm";
    error.payment = payment;
    throw error;
  }

  return {
    payment,
    confirmation
  };
}

module.exports = {
  createOrderPayment,
  confirmOrderPayment,
  payOrderWithWechat,
  requestWechatPayment
};
