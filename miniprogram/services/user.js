const { getCurrentUser, getSessionSnapshot, login, updateProfile, logout, activateSession } = require("../repositories/user-repository");
const { goTopLevel, TOP_LEVEL_ROUTES } = require("./navigation");
const { CUSTOM_TRIP_ENTRY_IMAGE } = require("../config/profile-page");

function buildProfileShortcuts(user) {
  return [
    {
      key: "orders",
      label: "我的订单",
      cardClassName: "profile-entry-card--strong",
      desc: "全部订单",
      glyphSrc:
        "cloud://yezai-3gr73wd48057512e-10f17b581.7965-yezai-3gr73wd48057512e-10f17b581-1407224025/brandasset/野（扣底圆体）.png"
    },
    {
      key: "assets",
      label: "野哉分享家",
      cardClassName: "profile-entry-card--glyph-soft",
      desc: "券与奖励",
      glyphSrc:
        "cloud://yezai-3gr73wd48057512e-10f17b581.7965-yezai-3gr73wd48057512e-10f17b581-1407224025/brandasset/野（扣底圆体）.png"
    },
    {
      key: "favorites",
      label: "我的收藏",
      cardClassName: "profile-entry-card--glyph-soft",
      desc: "人物与旅程",
      glyphSrc:
        "cloud://yezai-3gr73wd48057512e-10f17b581.7965-yezai-3gr73wd48057512e-10f17b581-1407224025/brandasset/哉（扣底圆体）.png"
    },
    {
      key: "travelers",
      label: "出行人档案",
      cardClassName: "profile-entry-card--glyph-soft",
      desc: "常用出行人",
      glyphSrc:
        "cloud://yezai-3gr73wd48057512e-10f17b581.7965-yezai-3gr73wd48057512e-10f17b581-1407224025/brandasset/哉（扣底圆体）.png"
    }
  ];
}

async function getMyPageData() {
  const user = await getCurrentUser();
  const loggedIn = Boolean(user);

  return {
    loggedIn,
    user,
    shortcuts: buildProfileShortcuts(user),
    customTripEntryImage: CUSTOM_TRIP_ENTRY_IMAGE
  };
}

function getMyPageInitialState() {
  const snapshot = getSessionSnapshot();

  return {
    loggedIn: snapshot.loggedIn,
    user: snapshot.user,
    shortcuts: buildProfileShortcuts(snapshot.user),
    customTripEntryImage: CUSTOM_TRIP_ENTRY_IMAGE
  };
}

async function ensureLoggedIn(options) {
  const config = Object.assign(
    {
      toastTitle: "请先登录",
      redirectToProfile: true
    },
    options || {}
  );
  const user = await getCurrentUser();

  if (user) {
    return user;
  }

  if (config.toastTitle) {
    wx.showToast({
      title: config.toastTitle,
      icon: "none"
    });
  }

  if (config.redirectToProfile) {
    setTimeout(() => {
      goTopLevel(TOP_LEVEL_ROUTES.profile);
    }, 120);
  }

  return null;
}

module.exports = {
  getCurrentUser,
  getMyPageInitialState,
  login,
  updateProfile,
  logout,
  getMyPageData,
  activateSession,
  ensureLoggedIn
};
