const { getCurrentUser, getSessionSnapshot, login, updateProfile, logout, activateSession } = require("../repositories/user-repository");
const { getRecentOrders } = require("../repositories/transaction-repository");
const { buildTripDateRange, getTripPhaseKey } = require("../constants/transaction-meta");
const { getServiceCreatorRoles, getServiceCreatorRoleText } = require("./service-roles");
const { goTopLevel, TOP_LEVEL_ROUTES } = require("./navigation");
const { EMPTY_TRIP_STATE_IMAGE } = require("../config/profile-page");

function isPlainObject(value) {
  return Boolean(value) && Object.prototype.toString.call(value) === "[object Object]";
}

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
      cardClassName: "",
      desc: "券与奖励",
      glyphSrc:
        "cloud://yezai-3gr73wd48057512e-10f17b581.7965-yezai-3gr73wd48057512e-10f17b581-1407224025/brandasset/野（扣底圆体）.png"
    },
    {
      key: "favorites",
      label: "我的收藏",
      cardClassName: "",
      desc: "人物与旅程",
      glyphSrc:
        "cloud://yezai-3gr73wd48057512e-10f17b581.7965-yezai-3gr73wd48057512e-10f17b581-1407224025/brandasset/哉（扣底圆体）.png"
    },
    {
      key: "travelers",
      label: "出行人档案",
      cardClassName: "",
      desc: "常用出行人",
      glyphSrc:
        "cloud://yezai-3gr73wd48057512e-10f17b581.7965-yezai-3gr73wd48057512e-10f17b581-1407224025/brandasset/哉（扣底圆体）.png"
    }
  ];
}

const TRIP_PHASE_LABELS = {
  upcoming: "待出发",
  ongoing: "在进行",
  completed: "已完成"
};

function getOrderServiceSnapshot(order) {
  return isPlainObject(order && order.serviceSnapshot) ? order.serviceSnapshot : {};
}

function getOrderCreatorSnapshot(order) {
  return isPlainObject(order && order.creatorSnapshot) ? order.creatorSnapshot : {};
}

function buildActiveTrips(orders) {
  return orders
    .filter((order) => order.status === "paid" || order.status === "traveling")
    .map((order) => {
      const serviceSnapshot = getOrderServiceSnapshot(order);
      const creatorSnapshot = getOrderCreatorSnapshot(order);
      const tripPhaseKey = getTripPhaseKey(order);
      const creatorRoleSource = {
        type: serviceSnapshot.serviceType || order.serviceType || "",
        creatorRoles: Array.isArray(serviceSnapshot.creatorRoles) ? serviceSnapshot.creatorRoles : []
      };

      return Object.assign({}, order, {
        serviceSlug: order.serviceSlug,
        tripDateRange: buildTripDateRange(order),
        tripPhaseKey,
        tripPhaseLabel: TRIP_PHASE_LABELS[tripPhaseKey] || TRIP_PHASE_LABELS.upcoming,
        serviceName: serviceSnapshot.serviceName || order.serviceName || "",
        serviceCover: serviceSnapshot.cover || order.cover || "",
        creatorName: creatorSnapshot.name || order.creatorName || "野哉创作者",
        creatorSlug: creatorSnapshot.slug || "",
        creatorAvatar: creatorSnapshot.avatar || "",
        creatorRoles: getServiceCreatorRoles(creatorRoleSource),
        creatorRoleText: getServiceCreatorRoleText(creatorRoleSource),
        creatorStance: creatorSnapshot.stance || ""
      });
    })
    .filter((order) => order.tripPhaseKey === "upcoming" || order.tripPhaseKey === "ongoing");
}

async function getMyPageData() {
  const user = await getCurrentUser();
  const loggedIn = Boolean(user);
  const recentOrderCandidates = loggedIn ? await getRecentOrders(8) : [];

  return {
    loggedIn,
    user,
    shortcuts: buildProfileShortcuts(user),
    recentOrders: recentOrderCandidates.slice(0, 2),
    activeTrips: loggedIn ? buildActiveTrips(recentOrderCandidates) : [],
    emptyTripStateImage: EMPTY_TRIP_STATE_IMAGE
  };
}

function getMyPageInitialState() {
  const snapshot = getSessionSnapshot();

  return {
    loggedIn: snapshot.loggedIn,
    user: snapshot.user,
    shortcuts: buildProfileShortcuts(snapshot.user),
    recentOrders: [],
    activeTrips: [],
    emptyTripStateImage: EMPTY_TRIP_STATE_IMAGE
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
