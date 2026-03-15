const { getOrderTabsMeta } = require("../constants/transaction-meta");
const { DATA_SOURCE_TYPES, getTransactionDataSource } = require("../constants/data-source");
const cloudTransactionApi = require("../api/cloud/transaction");
const legacyTransactionRepository = require("./legacy/transaction-repository");
const {
  mapOrders,
  mapOrder,
  mapFavoriteState,
  mapFavoriteStatus,
  mapFavoritesPageData
} = require("../mappers/transaction");

function getRepository() {
  return getTransactionDataSource() === DATA_SOURCE_TYPES.CLOUD ? cloudTransactionApi : legacyTransactionRepository;
}

async function invoke(methodName, mapper, args) {
  const repository = getRepository();
  let payload;

  try {
    payload = await repository[methodName].apply(repository, args || []);
  } catch (error) {
    if (repository !== legacyTransactionRepository) {
      payload = await legacyTransactionRepository[methodName].apply(legacyTransactionRepository, args || []);
    } else {
      throw error;
    }
  }

  return mapper(payload);
}

function getOrderStatusTabs() {
  return getOrderTabsMeta();
}

function getOrders(statusKey) {
  return invoke("getOrders", mapOrders, [statusKey]);
}

function getRecentOrders(limit) {
  return invoke("getRecentOrders", mapOrders, [limit]);
}

function getOrderById(orderId) {
  return invoke("getOrderById", mapOrder, [orderId]);
}

function createOrder(payload) {
  return invoke("createOrder", mapOrder, [payload]);
}

function cancelOrder(orderId) {
  return invoke("cancelOrder", mapOrder, [orderId]);
}

function payOrder(orderId) {
  return invoke("payOrder", mapOrder, [orderId]);
}

function getFavoriteState() {
  return invoke("getFavoriteState", mapFavoriteState);
}

function isFavorited(type, slug) {
  return invoke("isFavorited", mapFavoriteStatus, [type, slug]);
}

function toggleFavorite(type, slug) {
  return invoke("toggleFavorite", mapFavoriteStatus, [type, slug]);
}

function getFavoritesPageData() {
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
