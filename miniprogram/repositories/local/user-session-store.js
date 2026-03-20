const USER_KEY = "yezai_user_profile";
const USER_SESSION_KEY = "yezai_user_session";

function getCachedUser() {
  return wx.getStorageSync(USER_KEY) || null;
}

function setCachedUser(user) {
  if (!user) {
    wx.removeStorageSync(USER_KEY);
    return;
  }

  wx.setStorageSync(USER_KEY, user);
}

function isSessionActive() {
  return Boolean(wx.getStorageSync(USER_SESSION_KEY));
}

function setSessionActive(active) {
  if (active) {
    wx.setStorageSync(USER_SESSION_KEY, true);
    return;
  }

  wx.removeStorageSync(USER_SESSION_KEY);
}

module.exports = {
  getCachedUser,
  setCachedUser,
  isSessionActive,
  setSessionActive
};
