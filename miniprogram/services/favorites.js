const FAVORITES_KEY = "yezai_favorites";

function getFavoriteState() {
  return (
    wx.getStorageSync(FAVORITES_KEY) || {
      destinations: {},
      ideas: {},
      services: {}
    }
  );
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
  isFavorited,
  toggleFavorite
};
