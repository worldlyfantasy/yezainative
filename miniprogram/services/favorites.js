const FAVORITES_KEY = "yezai_favorites";
const DEFAULT_FAVORITE_STATE = {
  destinations: {},
  creators: {},
  services: {},
  ideas: {}
};

function getFavoriteState() {
  const stored = wx.getStorageSync(FAVORITES_KEY) || {};

  return {
    destinations: Object.assign({}, DEFAULT_FAVORITE_STATE.destinations, stored.destinations || {}),
    creators: Object.assign({}, DEFAULT_FAVORITE_STATE.creators, stored.creators || {}),
    services: Object.assign({}, DEFAULT_FAVORITE_STATE.services, stored.services || {}),
    ideas: Object.assign({}, DEFAULT_FAVORITE_STATE.ideas, stored.ideas || {})
  };
}

function saveFavoriteState(state) {
  wx.setStorageSync(FAVORITES_KEY, state);
}

function isFavorited(type, slug) {
  const state = getFavoriteState();
  return Boolean(state[type] && state[type][slug]);
}

function toggleFavorite(type, slug) {
  const state = getFavoriteState();
  if (!state[type]) {
    state[type] = {};
  }

  state[type][slug] = !state[type][slug];
  saveFavoriteState(state);
  return Boolean(state[type][slug]);
}

module.exports = {
  getFavoriteState,
  isFavorited,
  toggleFavorite
};
