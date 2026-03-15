const ordersService = require("../../services/orders");
const favoritesService = require("../../services/favorites");
const { creators, destinations, services, ideas } = require("../../mock/index");

function getOrders(statusKey) {
  return Promise.resolve(ordersService.getOrders(statusKey));
}

function getRecentOrders(limit) {
  return Promise.resolve(ordersService.getRecentOrders(limit));
}

function getOrderById(orderId) {
  return Promise.resolve(ordersService.getOrderById(orderId));
}

function createOrder(payload) {
  return Promise.resolve(ordersService.createOrder(payload));
}

function cancelOrder(orderId) {
  return Promise.resolve(ordersService.cancelOrder(orderId));
}

function payOrder(orderId) {
  return Promise.resolve(ordersService.payOrder(orderId));
}

function getFavoriteState() {
  return Promise.resolve(favoritesService.getFavoriteState());
}

function isFavorited(type, slug) {
  return Promise.resolve({
    favorited: favoritesService.isFavorited(type, slug)
  });
}

function toggleFavorite(type, slug) {
  return Promise.resolve({
    favorited: favoritesService.toggleFavorite(type, slug)
  });
}

function getFavoritesPageData() {
  const favoriteState = favoritesService.getFavoriteState();

  return Promise.resolve({
    favoriteDestinations: destinations.filter((destination) => favoriteState.destinations[destination.slug]),
    favoriteCreators: creators.filter((creator) => favoriteState.creators[creator.slug]),
    favoriteServices: services
      .filter((service) => favoriteState.services[service.slug])
      .map((service) => {
        const creator = creators.find((item) => item.id === service.creatorId);
        return Object.assign({}, service, {
          creatorName: creator ? creator.name : ""
        });
      }),
    favoriteIdeas: ideas
      .filter((idea) => favoriteState.ideas[idea.slug])
      .map((idea) => {
        const author = creators.find((creator) => creator.id === idea.authorId);
        return Object.assign({}, idea, {
          authorName: author ? author.name : ""
        });
      })
  });
}

module.exports = {
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
