const { getRecentOrders } = require("./orders");

const USER_KEY = "yezai_user_profile";

function getStoredUser() {
  return wx.getStorageSync(USER_KEY) || null;
}

function simulateWechatLogin() {
  const profile = {
    avatarUrl: "https://picsum.photos/seed/yezai-user-avatar/240/240",
    nickname: "野哉旅人",
    memberLabel: "在场会员"
  };

  wx.setStorageSync(USER_KEY, profile);
  return profile;
}

function logout() {
  wx.removeStorageSync(USER_KEY);
}

function getMyPageData() {
  const user = getStoredUser();
  const loggedIn = Boolean(user);

  return {
    loggedIn,
    user,
    shortcuts: [
      { key: "orders", label: "我的订单" },
      { key: "favorites", label: "我的收藏" },
      { key: "reviews", label: "我的评价" },
      { key: "travelers", label: "常用出行人" }
    ],
    recentOrders: loggedIn ? getRecentOrders(2) : [],
    activeTrips: loggedIn ? getRecentOrders(1).filter((order) => order.status === "paid" || order.status === "traveling") : []
  };
}

module.exports = {
  getStoredUser,
  simulateWechatLogin,
  logout,
  getMyPageData
};
