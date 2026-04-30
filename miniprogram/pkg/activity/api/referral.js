const cloudReferralApi = require("../../../api/cloud/referral");

function bootstrapParticipation(payload) {
  return cloudReferralApi.bootstrapParticipation(payload || {});
}

module.exports = {
  bootstrapParticipation
};
