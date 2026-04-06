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
const FAVORITE_STATUS_CACHE_TTL_MS = 60 * 1000;
const favoriteStatusCache = new Map();

function buildFavoriteCacheKey(type, slug) {
  return `${String(type || "").trim()}:${String(slug || "").trim()}`;
}

function getCachedFavoriteStatus(type, slug) {
  const cacheKey = buildFavoriteCacheKey(type, slug);
  const cached = favoriteStatusCache.get(cacheKey);
  if (!cached) {
    return undefined;
  }

  if (cached.expiresAt <= Date.now()) {
    favoriteStatusCache.delete(cacheKey);
    return undefined;
  }

  return cached.value;
}

function setCachedFavoriteStatus(type, slug, value) {
  const cacheKey = buildFavoriteCacheKey(type, slug);
  if (!cacheKey || cacheKey === ":") {
    return;
  }

  favoriteStatusCache.set(cacheKey, {
    expiresAt: Date.now() + FAVORITE_STATUS_CACHE_TTL_MS,
    value: Boolean(value)
  });
}

function clearFavoriteStatusCache() {
  favoriteStatusCache.clear();
}

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
    clearFavoriteStatusCache();
    return Promise.resolve(mapFavoriteState(null));
  }
  return invoke("getFavoriteState", mapFavoriteState).then((favoriteState) => {
    ["destinations", "creators", "services", "ideas"].forEach((type) => {
      const slugMap = favoriteState && favoriteState[type] && typeof favoriteState[type] === "object"
        ? favoriteState[type]
        : {};
      Object.keys(slugMap).forEach((slug) => {
        setCachedFavoriteStatus(type, slug, slugMap[slug]);
      });
    });
    return favoriteState;
  });
}

function isFavorited(type, slug) {
  if (!hasActiveUserSession()) {
    clearFavoriteStatusCache();
    return Promise.resolve(false);
  }

  const cached = getCachedFavoriteStatus(type, slug);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }

  return invoke("isFavorited", mapFavoriteStatus, [type, slug])
    .then((favorited) => {
      setCachedFavoriteStatus(type, slug, favorited);
      return favorited;
    })
    .catch((error) => {
      console.error("Failed to resolve favorite status", error);
      return false;
    });
}

function toggleFavorite(type, slug) {
  if (!hasActiveUserSession()) {
    return Promise.reject(new Error("User session inactive"));
  }
  return invoke("toggleFavorite", mapFavoriteStatus, [type, slug]).then((favorited) => {
    setCachedFavoriteStatus(type, slug, favorited);
    return favorited;
  });
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
