const { getOrderTabsMeta, filterOrdersByDisplayStatus } = require("../constants/transaction-meta");
const cloudTransactionApi = require("../api/cloud/transaction");
const userSessionStore = require("./local/user-session-store");
const {
  mapOrders,
  mapOrder,
  mapFavoriteState,
  mapFavoriteStatus,
  mapFavoritesPageData
} = require("../mappers/transaction");

function hasActiveUserSession() {
  return userSessionStore.isSessionActive();
}

async function invoke(methodName, mapper, args) {
  const payload = await cloudTransactionApi[methodName].apply(cloudTransactionApi, args || []);
  return mapper(payload);
}

function getOrderStatusTabs() {
  return getOrderTabsMeta();
}

function getOrders(statusKey) {
  if (!hasActiveUserSession()) {
    return Promise.resolve([]);
  }
  return invoke("getOrders", mapOrders, ["all"]).then((orders) => filterOrdersByDisplayStatus(orders, statusKey));
}

function getRecentOrders(limit) {
  if (!hasActiveUserSession()) {
    return Promise.resolve([]);
  }
  return invoke("getRecentOrders", mapOrders, [limit]);
}

function getOrderById(orderId) {
  if (!hasActiveUserSession()) {
    return Promise.resolve(null);
  }
  return invoke("getOrderById", mapOrder, [orderId]);
}

function createOrder(payload) {
  if (!hasActiveUserSession()) {
    return Promise.reject(new Error("User session inactive"));
  }
  return invoke("createOrder", mapOrder, [payload]);
}

function cancelOrder(orderId) {
  if (!hasActiveUserSession()) {
    return Promise.reject(new Error("User session inactive"));
  }
  return invoke("cancelOrder", mapOrder, [orderId]);
}

function payOrder(orderId) {
  if (!hasActiveUserSession()) {
    return Promise.reject(new Error("User session inactive"));
  }
  return invoke("payOrder", mapOrder, [orderId]);
}

function getFavoriteState() {
  if (!hasActiveUserSession()) {
    return Promise.resolve(mapFavoriteState(null));
  }
  return invoke("getFavoriteState", mapFavoriteState);
}

function isFavorited(type, slug) {
  if (!hasActiveUserSession()) {
    return Promise.resolve(false);
  }

  return invoke("isFavorited", mapFavoriteStatus, [type, slug]).catch((error) => {
    console.error("Failed to resolve favorite status", error);
    return false;
  });
}

function toggleFavorite(type, slug) {
  if (!hasActiveUserSession()) {
    return Promise.reject(new Error("User session inactive"));
  }
  return invoke("toggleFavorite", mapFavoriteStatus, [type, slug]);
}

function getFavoritesPageData() {
  if (!hasActiveUserSession()) {
    return Promise.resolve(mapFavoritesPageData(null));
  }
  return invoke("getFavoritesPageData", mapFavoritesPageData);
}

module.exports = {
  getOrderStatusTabs,
  getOrders,
  getRecentOrders,
  getOrderById,
  createOrder,
  cancelOrder,
  payOrder,
  getFavoriteState,
  isFavorited,
  toggleFavorite,
  getFavoritesPageData
};
