const { buildOrderCard } = require("../constants/transaction-meta");

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensureObject(value) {
  return value && typeof value === "object" ? value : {};
}

function mapOrders(payload) {
  return ensureArray(payload).map(buildOrderCard);
}

function mapOrder(payload) {
  if (!payload) {
    return null;
  }

  return buildOrderCard(payload);
}

function mapFavoriteState(payload) {
  const source = ensureObject(payload);
  return {
    destinations: ensureObject(source.destinations),
    creators: ensureObject(source.creators),
    services: ensureObject(source.services),
    ideas: ensureObject(source.ideas)
  };
}

function mapFavoriteStatus(payload) {
  const source = ensureObject(payload);
  return Boolean(source.favorited);
}

function mapFavoritesPageData(payload) {
  const source = ensureObject(payload);
  return {
    favoriteDestinations: ensureArray(source.favoriteDestinations),
    favoriteCreators: ensureArray(source.favoriteCreators),
    favoriteServices: ensureArray(source.favoriteServices),
    favoriteIdeas: ensureArray(source.favoriteIdeas)
  };
}

module.exports = {
  mapOrders,
  mapOrder,
  mapFavoriteState,
  mapFavoriteStatus,
  mapFavoritesPageData
};
