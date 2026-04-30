const cloudReferralApi = require("../../../api/cloud/referral");

function getAssetOverview() {
  return cloudReferralApi.getAssetOverview();
}

function bootstrapParticipation(payload) {
  return cloudReferralApi.bootstrapParticipation(payload || {});
}

function getPayoutAccount() {
  return cloudReferralApi.getPayoutAccount();
}

function savePayoutAccount(payload) {
  return cloudReferralApi.savePayoutAccount(payload || {});
}

function markCashRewardGiftOpened(payload) {
  return cloudReferralApi.markCashRewardGiftOpened(payload || {});
}

module.exports = {
  bootstrapParticipation,
  getAssetOverview,
  getPayoutAccount,
  markCashRewardGiftOpened,
  savePayoutAccount
};
