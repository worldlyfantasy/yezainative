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

function getCurrentUser() {
  if (!isSessionActive()) {
    return Promise.resolve(null);
  }

  return Promise.resolve(getCachedUser());
}

function login() {
  const profile = {
    id: "local-user",
    avatarUrl: "https://picsum.photos/seed/yezai-user-avatar/240/240",
    nickname: "旅人",
    memberLabel: "野哉会员",
    role: "user",
    profileConfigured: true
  };

  setCachedUser(profile);
  setSessionActive(true);
  return Promise.resolve(profile);
}

function updateProfile(profile) {
  const currentUser = getCachedUser() || {};
  const nextUser = Object.assign({}, currentUser, {
    nickname: profile && profile.nickname ? profile.nickname : currentUser.nickname || "旅人",
    avatarUrl: profile && profile.avatarUrl ? profile.avatarUrl : currentUser.avatarUrl || "",
    memberLabel: currentUser.memberLabel || "野哉会员",
    role: currentUser.role || "user",
    profileConfigured: true
  });

  setCachedUser(nextUser);
  return Promise.resolve(nextUser);
}

function logout() {
  setSessionActive(false);
  setCachedUser(null);
  return Promise.resolve();
}

module.exports = {
  getCurrentUser,
  login,
  updateProfile,
  logout,
  getCachedUser,
  setCachedUser,
  isSessionActive,
  setSessionActive
};
