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

function callUserGateway(action, payload) {
  return new Promise((resolve, reject) => {
    if (!ensureCloudReady()) {
      reject(new Error("wx.cloud.callFunction is unavailable"));
      return;
    }

    wx.cloud.callFunction({
      name: "userGateway",
      data: {
        action,
        payload: payload || {}
      },
      success: (result) => {
        const gatewayResult = result && result.result ? result.result : null;
        if (!gatewayResult || gatewayResult.ok !== true) {
          reject(new Error(gatewayResult && gatewayResult.error ? gatewayResult.error : "User gateway failed"));
          return;
        }

        resolve(gatewayResult.data || null);
      },
      fail: reject
    });
  });
}

function getCurrentUser() {
  return callUserGateway("getCurrentUser");
}

function login(profile) {
  return callUserGateway("login", {
    profile: profile || {}
  });
}

function updateProfile(profile) {
  return callUserGateway("updateProfile", {
    profile: profile || {}
  });
}

function listTravelerProfiles() {
  return callUserGateway("listTravelerProfiles");
}

function upsertTravelerProfile(profile) {
  return callUserGateway("upsertTravelerProfile", {
    profile: profile || {}
  });
}

function deleteTravelerProfile(profileId) {
  return callUserGateway("deleteTravelerProfile", {
    profileId: String(profileId || "").trim()
  });
}

module.exports = {
  getCurrentUser,
  login,
  updateProfile,
  listTravelerProfiles,
  upsertTravelerProfile,
  deleteTravelerProfile
};
