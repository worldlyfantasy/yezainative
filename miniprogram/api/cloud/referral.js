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
      // ignore duplicated init
    }
    cloudInitialized = true;
  }
  return true;
}

function callReferralGateway(action, payload) {
  return new Promise((resolve, reject) => {
    if (!ensureCloudReady()) {
      reject(new Error("wx.cloud.callFunction is unavailable"));
      return;
    }

    wx.cloud.callFunction({
      name: "referralGateway",
      data: {
        action,
        payload: payload || {}
      },
      success: (result) => {
        const gatewayResult = result && result.result ? result.result : null;
        if (!gatewayResult || gatewayResult.ok !== true) {
          reject(new Error(gatewayResult && gatewayResult.error ? gatewayResult.error : "Referral gateway failed"));
          return;
        }

        resolve(gatewayResult.data || null);
      },
      fail: reject
    });
  });
}

function bootstrapParticipation(payload) {
  return callReferralGateway("bootstrapParticipation", payload);
}

function ensureDirectRegistrationBenefits() {
  return callReferralGateway("ensureDirectRegistrationBenefits", {});
}

function getAssetOverview() {
  return callReferralGateway("getAssetOverview", {});
}

function getShareReferralEntryStatus() {
  return callReferralGateway("getShareReferralEntryStatus", {});
}

function getPayoutAccount() {
  return callReferralGateway("getPayoutAccount", {});
}

function savePayoutAccount(payload) {
  return callReferralGateway("savePayoutAccount", payload || {});
}

function markCashRewardGiftOpened(payload) {
  return callReferralGateway("markCashRewardGiftOpened", payload || {});
}

module.exports = {
  bootstrapParticipation,
  ensureDirectRegistrationBenefits,
  getAssetOverview,
  getShareReferralEntryStatus,
  getPayoutAccount,
  markCashRewardGiftOpened,
  savePayoutAccount
};
