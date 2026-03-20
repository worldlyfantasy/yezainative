const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const ORDERS_COLLECTION = "orders";
const FAVORITES_COLLECTION = "favorites";
const QUERY_BATCH_SIZE = 100;
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
    const rows = [];
    let offset = 0;

    while (true) {
      const result = await db.collection(name).skip(offset).limit(QUERY_BATCH_SIZE).get();
      const batch = result.data || [];
      rows.push(...batch);

      if (batch.length < QUERY_BATCH_SIZE) {
        break;
      }

      offset += batch.length;
    }

    return rows;
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
    const orders = [];
    let offset = 0;

    while (true) {
      const result = await db.collection(ORDERS_COLLECTION).where({ openid }).skip(offset).limit(QUERY_BATCH_SIZE).get();
      const batch = result.data || [];
      orders.push(...batch);

      if (batch.length < QUERY_BATCH_SIZE) {
        break;
      }

      offset += batch.length;
    }

    return orders.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
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
  payload = payload || {};
  const openid = await getOpenId();
  const clientRequestId = String(payload.clientRequestId || "").trim();

  if (!payload || !payload.serviceSlug) {
    throw new Error("serviceSlug is required");
  }

  if (!payload.travelDate) {
    throw new Error("travelDate is required");
  }

  if (!Number.isFinite(Number(payload.amount)) || Number(payload.amount) <= 0) {
    throw new Error("amount must be a positive number");
  }

  if (!Number.isInteger(Number(payload.peopleCount)) || Number(payload.peopleCount) <= 0) {
    throw new Error("peopleCount must be a positive integer");
  }

  if (clientRequestId) {
    const existingResult = await db.collection(ORDERS_COLLECTION).where({
      openid,
      clientRequestId
    }).limit(1).get();

    if (existingResult.data && existingResult.data.length) {
      return existingResult.data[0];
    }
  }

  const timestamp = Date.now();
  const orderNo = createOrderNo(timestamp);
  const snapshot = payload.serviceSnapshot || {};
  const creatorSnapshot = payload.creatorSnapshot || {};
  const travelPeriod = payload.travelPeriod || {};
  const order = {
    id: orderNo,
    orderNo,
    shortId: String(orderNo).slice(-4),
    openid,
    clientRequestId,
    serviceSlug: payload.serviceSlug,
    serviceName: snapshot.serviceName || payload.serviceName || "",
    cover: snapshot.cover || payload.cover || "",
    serviceType: snapshot.serviceType || payload.serviceType || "",
    serviceSnapshot: {
      serviceName: snapshot.serviceName || payload.serviceName || "",
      serviceType: snapshot.serviceType || payload.serviceType || "",
      cover: snapshot.cover || payload.cover || "",
      creatorRoles: Array.isArray(snapshot.creatorRoles) ? snapshot.creatorRoles : []
    },
    creatorSnapshot: {
      id: creatorSnapshot.id || "",
      slug: creatorSnapshot.slug || "",
      name: creatorSnapshot.name || "",
      avatar: creatorSnapshot.avatar || "",
      stance: creatorSnapshot.stance || ""
    },
    amount: payload.amount,
    discount: payload.discount || 0,
    payable: payload.amount,
    peopleCount: payload.peopleCount,
    travelDate: payload.travelDate,
    travelPeriod: {
      dateStart: travelPeriod.dateStart || payload.travelDate,
      dateEnd: travelPeriod.dateEnd || travelPeriod.dateStart || payload.travelDate
    },
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
    const rows = [];
    let offset = 0;

    while (true) {
      const result = await db.collection(FAVORITES_COLLECTION).where({ openid }).skip(offset).limit(QUERY_BATCH_SIZE).get();
      const batch = result.data || [];
      rows.push(...batch);

      if (batch.length < QUERY_BATCH_SIZE) {
        break;
      }

      offset += batch.length;
    }

    return rows;
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
