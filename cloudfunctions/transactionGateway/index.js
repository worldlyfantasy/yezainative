const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const ORDERS_COLLECTION = "orders";
const FAVORITES_COLLECTION = "favorites";
const CONTENT_COLLECTIONS = {
  creators: "creators",
  destinations: "destinations",
  services: "services",
  ideas: "ideas"
};

function createFavoriteState() {
  return {
    destinations: {},
    creators: {},
    services: {},
    ideas: {}
  };
}

function createOrderNo(timestamp) {
  return `yz${timestamp}`;
}

function formatDateTime(timestamp) {
  return new Date(timestamp).toLocaleString("zh-CN", { hour12: false });
}

async function listCollection(name) {
  try {
    const result = await db.collection(name).limit(100).get();
    return result.data || [];
  } catch (error) {
    return [];
  }
}

async function getOpenId() {
  const context = cloud.getWXContext();
  if (!context || !context.OPENID) {
    throw new Error("OPENID is unavailable");
  }

  return context.OPENID;
}

function filterOrdersByStatus(orders, statusKey) {
  if (!statusKey || statusKey === "all") {
    return orders;
  }

  if (statusKey === "pending") {
    return orders.filter((order) => order.status === "pending");
  }

  if (statusKey === "not_departed") {
    return orders.filter((order) => order.status === "paid" || order.status === "traveling");
  }

  if (statusKey === "completed") {
    return orders.filter((order) => order.status === "completed");
  }

  if (statusKey === "canceled") {
    return orders.filter((order) => order.status === "canceled");
  }

  return orders.filter((order) => order.status === statusKey);
}

async function queryOrders(openid) {
  try {
    const result = await db.collection(ORDERS_COLLECTION).where({ openid }).limit(100).get();
    return (result.data || []).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  } catch (error) {
    return [];
  }
}

async function getOrders(statusKey) {
  const openid = await getOpenId();
  return filterOrdersByStatus(await queryOrders(openid), statusKey);
}

async function getRecentOrders(limit) {
  const openid = await getOpenId();
  return (await queryOrders(openid)).slice(0, limit || 2);
}

async function getOrderById(orderId) {
  const openid = await getOpenId();
  const orders = await queryOrders(openid);
  return orders.find((order) => order.id === orderId) || null;
}

async function createOrder(payload) {
  const openid = await getOpenId();
  const timestamp = Date.now();
  const orderNo = createOrderNo(timestamp);
  const snapshot = payload.serviceSnapshot || {};
  const order = {
    id: orderNo,
    orderNo,
    shortId: String(orderNo).slice(-4),
    openid,
    serviceSlug: payload.serviceSlug,
    serviceName: snapshot.serviceName || payload.serviceName || "",
    cover: snapshot.cover || payload.cover || "",
    serviceType: snapshot.serviceType || payload.serviceType || "",
    amount: payload.amount,
    discount: payload.discount || 0,
    payable: payload.amount,
    peopleCount: payload.peopleCount,
    travelDate: payload.travelDate,
    traveler: payload.traveler || null,
    travelers: Array.isArray(payload.travelers) ? payload.travelers : [],
    note: payload.note || "",
    status: "pending",
    createdAt: timestamp,
    createdAtText: formatDateTime(timestamp)
  };

  await db.collection(ORDERS_COLLECTION).add({
    data: order
  });

  return order;
}

async function updateOrderStatus(orderId, nextStatus) {
  const openid = await getOpenId();
  const result = await db.collection(ORDERS_COLLECTION).where({ openid, id: orderId }).limit(1).get();
  if (!result.data || !result.data.length) {
    return null;
  }

  const target = result.data[0];
  await db.collection(ORDERS_COLLECTION).doc(target._id).update({
    data: {
      status: nextStatus
    }
  });

  return Object.assign({}, target, {
    status: nextStatus
  });
}

async function getFavoriteDocs(openid) {
  try {
    const result = await db.collection(FAVORITES_COLLECTION).where({ openid }).limit(200).get();
    return result.data || [];
  } catch (error) {
    return [];
  }
}

async function getFavoriteState() {
  const openid = await getOpenId();
  const favoriteDocs = await getFavoriteDocs(openid);
  return favoriteDocs.reduce((state, item) => {
    if (!state[item.targetType]) {
      state[item.targetType] = {};
    }
    state[item.targetType][item.targetSlug] = true;
    return state;
  }, createFavoriteState());
}

async function isFavorited(type, slug) {
  const state = await getFavoriteState();
  return {
    favorited: Boolean(state[type] && state[type][slug])
  };
}

async function toggleFavorite(type, slug) {
  const openid = await getOpenId();
  const result = await db.collection(FAVORITES_COLLECTION).where({
    openid,
    targetType: type,
    targetSlug: slug
  }).limit(1).get();

  if (result.data && result.data.length) {
    await db.collection(FAVORITES_COLLECTION).doc(result.data[0]._id).remove();
    return {
      favorited: false
    };
  }

  await db.collection(FAVORITES_COLLECTION).add({
    data: {
      openid,
      targetType: type,
      targetSlug: slug,
      createdAt: Date.now()
    }
  });

  return {
    favorited: true
  };
}

async function getFavoritesPageData() {
  const state = await getFavoriteState();
  const [creators, destinations, services, ideas] = await Promise.all([
    listCollection(CONTENT_COLLECTIONS.creators),
    listCollection(CONTENT_COLLECTIONS.destinations),
    listCollection(CONTENT_COLLECTIONS.services),
    listCollection(CONTENT_COLLECTIONS.ideas)
  ]);

  return {
    favoriteDestinations: destinations.filter((item) => state.destinations[item.slug]),
    favoriteCreators: creators.filter((item) => state.creators[item.slug]),
    favoriteServices: services
      .filter((item) => state.services[item.slug])
      .map((service) => {
        const creator = creators.find((item) => item.id === service.creatorId);
        return Object.assign({}, service, {
          creatorName: creator ? creator.name : ""
        });
      }),
    favoriteIdeas: ideas
      .filter((item) => state.ideas[item.slug])
      .map((idea) => {
        const author = creators.find((creator) => creator.id === idea.authorId);
        return Object.assign({}, idea, {
          authorName: author ? author.name : ""
        });
      })
  };
}

const handlers = {
  getOrders: (payload) => getOrders(payload.statusKey),
  getRecentOrders: (payload) => getRecentOrders(payload.limit),
  getOrderById: (payload) => getOrderById(payload.orderId),
  createOrder: (payload) => createOrder(payload),
  cancelOrder: (payload) => updateOrderStatus(payload.orderId, "canceled"),
  payOrder: (payload) => updateOrderStatus(payload.orderId, "paid"),
  getFavoriteState: () => getFavoriteState(),
  isFavorited: (payload) => isFavorited(payload.type, payload.slug),
  toggleFavorite: (payload) => toggleFavorite(payload.type, payload.slug),
  getFavoritesPageData: () => getFavoritesPageData()
};

exports.main = async (event) => {
  const action = event && event.action;
  const payload = event && event.payload ? event.payload : {};
  const handler = handlers[action];

  if (!handler) {
    return {
      ok: false,
      error: `Unsupported action: ${action || ""}`
    };
  }

  try {
    const data = await handler(payload);
    return {
      ok: true,
      data
    };
  } catch (error) {
    return {
      ok: false,
      error: error && error.message ? error.message : "Transaction gateway error"
    };
  }
};
