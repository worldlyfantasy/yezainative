function callUserGateway(action, payload) {
  return new Promise((resolve, reject) => {
    if (!wx.cloud || typeof wx.cloud.callFunction !== "function") {
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

module.exports = {
  getCurrentUser,
  login
};
