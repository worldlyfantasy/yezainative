const { getCurrentUser, getSessionSnapshot, login, updateProfile, logout } = require("../repositories/user-repository");
const { getRecentOrders } = require("../repositories/transaction-repository");
const { getServiceCreatorRoles, getServiceCreatorRoleText } = require("./service-roles");
const { goTopLevel, TOP_LEVEL_ROUTES } = require("./navigation");
const { services = [] } = require("../mock/services");
const { creators = [] } = require("../mock/creators");

const PROFILE_SHORTCUTS = [
  {
    key: "orders",
    label: "我的订单",
    cardClassName: "profile-entry-card--strong",
    eyebrow: "旅程归档",
    desc: "查看全部订单",
    glyphSrc:
      "cloud://yezai-3gr73wd48057512e.7965-yezai-3gr73wd48057512e-1407224025/brandasset/野（扣底圆体）.png"
  },
  {
    key: "favorites",
    label: "我的收藏",
    cardClassName: "",
    eyebrow: "心意收藏",
    desc: "回看喜欢的故事",
    glyphSrc:
      "cloud://yezai-3gr73wd48057512e.7965-yezai-3gr73wd48057512e-1407224025/brandasset/哉（扣底圆体）.png"
  }
];

function getServiceBySlug(slug) {
  return services.find((item) => item.slug === slug) || null;
}

function getCreatorById(creatorId) {
  return creators.find((item) => item.id === creatorId) || null;
}

function findServicePeriod(service, travelDate) {
  if (!service || !Array.isArray(service.groupPeriods) || !travelDate) {
    return null;
  }

  return service.groupPeriods.find((period) => String(period.dateStart || "") === String(travelDate));
}

function buildTripDateRange(order, service) {
  const period = findServicePeriod(service, order && order.travelDate);
  const startDate = String(period && period.dateStart ? period.dateStart : order && order.travelDate ? order.travelDate : "").trim();
  const endDate = String(period && period.dateEnd ? period.dateEnd : startDate).trim();

  if (!startDate) {
    return "出行时间待确认";
  }

  if (!endDate || endDate === startDate) {
    return startDate;
  }

  return `${startDate} ～ ${endDate}`;
}

function parseDateOnly(dateValue) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateValue || "").trim());
  if (!match) {
    return null;
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function getTripPhaseMeta(order, service) {
  const period = findServicePeriod(service, order && order.travelDate);
  const startDate = parseDateOnly(period && period.dateStart ? period.dateStart : order && order.travelDate);
  const endDate = parseDateOnly(period && period.dateEnd ? period.dateEnd : period && period.dateStart ? period.dateStart : order && order.travelDate);
  const today = new Date();
  const currentDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (!startDate || !endDate) {
    return {
      key: "upcoming",
      label: "待出发"
    };
  }

  if (currentDate < startDate) {
    return {
      key: "upcoming",
      label: "待出发"
    };
  }

  if (currentDate > endDate) {
    return {
      key: "completed",
      label: "已完成"
    };
  }

  return {
    key: "ongoing",
    label: "在进行"
  };
}

function buildActiveTrips(orders) {
  return orders
    .filter((order) => order.status === "paid")
    .map((order) => {
      const service = getServiceBySlug(order.serviceSlug);
      const creator = service ? getCreatorById(service.creatorId) : null;
      const tripPhase = getTripPhaseMeta(order, service);

      return Object.assign({}, order, {
        serviceSlug: service ? service.slug : order.serviceSlug,
        tripDateRange: buildTripDateRange(order, service),
        tripPhaseKey: tripPhase.key,
        tripPhaseLabel: tripPhase.label,
        serviceCover: service ? service.cover : order.cover,
        creatorName: creator ? creator.name : "野哉创作者",
        creatorSlug: creator ? creator.slug : "",
        creatorAvatar: creator ? creator.avatar : "",
        creatorRoles: service ? getServiceCreatorRoles(service) : ["创作者"],
        creatorRoleText: service ? getServiceCreatorRoleText(service) : "创作者",
        creatorStance: creator ? creator.stance : ""
      });
    })
    .filter((order) => order.tripPhaseKey === "upcoming" || order.tripPhaseKey === "ongoing");
}

async function getMyPageData() {
  const user = await getCurrentUser();
  const loggedIn = Boolean(user);
  const recentOrders = loggedIn ? await getRecentOrders(2) : [];
  const activeTripCandidates = loggedIn ? await getRecentOrders(8) : [];

  return {
    loggedIn,
    user,
    shortcuts: PROFILE_SHORTCUTS,
    recentOrders,
    activeTrips: loggedIn ? buildActiveTrips(activeTripCandidates) : []
  };
}

function getMyPageInitialState() {
  const snapshot = getSessionSnapshot();

  return {
    loggedIn: snapshot.loggedIn,
    user: snapshot.user,
    shortcuts: PROFILE_SHORTCUTS,
    recentOrders: [],
    activeTrips: []
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
  ensureLoggedIn
};
