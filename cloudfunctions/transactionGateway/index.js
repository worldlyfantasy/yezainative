const cloud = require("wx-server-sdk");
const cloudbase = require("@cloudbase/node-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const sqlApp = cloudbase.init({
  env: process.env.TCB_ENV || "yezai-3gr73wd48057512e"
});
const FAVORITES_COLLECTION = "favorites";
const QUERY_BATCH_SIZE = 100;
const MODEL_QUERY_BATCH_SIZE = 100;
const SERVICE_PERIOD_UPDATE_RETRY_LIMIT = 5;
const ORDER_STATUS_UPDATE_RETRY_LIMIT = 3;
const ORDER_MODEL_NAME = "TravelOrder";
const SERVICE_PERIOD_MODEL_NAME = "ServicePeriod";
const CONTENT_COLLECTIONS = {
  creators: "creators",
  destinations: "destinations",
  services: "services",
  ideas: "ideas"
};

function getOrderModel() {
  const model = sqlApp.models && sqlApp.models[ORDER_MODEL_NAME];
  if (!model) {
    throw new Error("TravelOrder model unavailable");
  }
  return model;
}

function getServicePeriodModel() {
  const model = sqlApp.models && sqlApp.models[SERVICE_PERIOD_MODEL_NAME];
  if (!model) {
    throw new Error("ServicePeriod model unavailable");
  }
  return model;
}

function createFavoriteState() {
  return {
    destinations: {},
    creators: {},
    services: {},
    ideas: {}
  };
}

function createOrderNo(timestamp) {
  return `yz${timestamp}${Math.random().toString(36).slice(2, 6)}`;
}

function formatDateTime(timestamp) {
  return new Date(timestamp).toLocaleString("zh-CN", {
    hour12: false,
    timeZone: "Asia/Shanghai"
  });
}

function normalizeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePositiveInteger(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function getMutationCount(result) {
  const count = result && result.data ? result.data.count : result && result.count;
  return normalizePositiveInteger(count);
}

function isDuplicateKeyError(error) {
  const message = String(error && error.message ? error.message : "").toLowerCase();
  return message.includes("duplicate") || message.includes("unique");
}

function parseJsonText(value, fallback) {
  if (value == null || value === "") {
    return fallback;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function stringifyJson(value) {
  if (value == null) {
    return "";
  }

  try {
    return JSON.stringify(value);
  } catch (error) {
    return "";
  }
}

function listCreatorRefCandidates(creator) {
  const candidates = [];
  const creatorId = String(creator && creator.id ? creator.id : "").trim();
  const creatorSlug = String(creator && creator.slug ? creator.slug : "").trim();

  if (creatorId) {
    candidates.push(creatorId);
  }
  if (creatorSlug) {
    candidates.push(creatorSlug);
    const slugRef = `creator-${creatorSlug}`;
    if (!candidates.includes(slugRef)) {
      candidates.push(slugRef);
    }
  }

  return candidates;
}

function matchesCreatorRef(creator, ref) {
  const normalizedRef = String(ref || "").trim();
  return normalizedRef ? listCreatorRefCandidates(creator).includes(normalizedRef) : false;
}

function findCreatorByRef(creators, ref) {
  return (creators || []).find((creator) => matchesCreatorRef(creator, ref)) || null;
}

function normalizeTravelerRecord(traveler) {
  const source = traveler && typeof traveler === "object" ? traveler : {};
  return {
    name: String(source.name || "").trim(),
    idCard: String(source.idCard || "").trim(),
    phone: String(source.phone || "").trim(),
    wechat: String(source.wechat || "").trim(),
    note: String(source.note || "").trim()
  };
}

function hasTravelerContent(traveler) {
  return Boolean(
    traveler &&
      (traveler.name || traveler.idCard || traveler.phone || traveler.wechat || traveler.note)
  );
}

function normalizeTravelers(travelers, fallbackTraveler) {
  const normalized = (Array.isArray(travelers) ? travelers : [])
    .map(normalizeTravelerRecord)
    .filter(hasTravelerContent);

  if (normalized.length) {
    return normalized;
  }

  const fallback = normalizeTravelerRecord(fallbackTraveler);
  return hasTravelerContent(fallback) ? [fallback] : [];
}

function normalizeContact(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const contact = source.contact && typeof source.contact === "object" ? source.contact : {};
  const legacyTraveler = source.traveler && typeof source.traveler === "object" ? source.traveler : {};

  return {
    name: String(source.contactName || contact.name || legacyTraveler.name || "").trim(),
    phone: String(source.contactPhone || contact.phone || legacyTraveler.phone || "").trim()
  };
}

function normalizeTravelPeriod(period) {
  const dateStart = String(period && period.dateStart ? period.dateStart : "").trim();
  const dateEnd = String(
    period && (period.dateEnd || period.dateStart)
      ? (period.dateEnd || period.dateStart)
      : ""
  ).trim();

  return {
    dateStart,
    dateEnd: dateEnd || dateStart
  };
}

function getTravelPeriod(record, serviceSnapshot) {
  const snapshotPeriod = normalizeTravelPeriod(
    serviceSnapshot && typeof serviceSnapshot === "object" ? serviceSnapshot.travelPeriod : null
  );
  if (snapshotPeriod.dateStart) {
    return snapshotPeriod;
  }

  const legacyPeriod = normalizeTravelPeriod({
    dateStart:
      record && (record.travelDateStartDate || record.travelDateStart)
        ? (record.travelDateStartDate || record.travelDateStart)
        : "",
    dateEnd:
      record && (record.travelDateEndDate || record.travelDateEnd || record.travelDateStartDate || record.travelDateStart)
        ? (record.travelDateEndDate || record.travelDateEnd || record.travelDateStartDate || record.travelDateStart)
        : ""
  });
  return legacyPeriod;
}

function buildServiceSnapshot(record) {
  const serviceSnapshot = parseJsonText(record && record.serviceSnapshotJson, {}) || {};
  if (!serviceSnapshot.serviceSlug) {
    serviceSnapshot.serviceSlug = String(record && record.serviceSlug ? record.serviceSlug : "").trim();
  }
  if (!serviceSnapshot.serviceName) {
    serviceSnapshot.serviceName = String(record && record.serviceName ? record.serviceName : "").trim();
  }
  if (!serviceSnapshot.serviceType) {
    serviceSnapshot.serviceType = String(record && record.serviceType ? record.serviceType : "").trim();
  }
  if (!serviceSnapshot.cover) {
    serviceSnapshot.cover = String(record && record.serviceCover ? record.serviceCover : "").trim();
  }
  if (!serviceSnapshot.versionName) {
    serviceSnapshot.versionName = String(record && record.versionName ? record.versionName : "").trim();
  }
  if (!serviceSnapshot.travelPeriod || typeof serviceSnapshot.travelPeriod !== "object") {
    const travelPeriod = getTravelPeriod(record, null);
    if (travelPeriod.dateStart) {
      serviceSnapshot.travelPeriod = travelPeriod;
    }
  }
  if (!Array.isArray(serviceSnapshot.creatorRoles)) {
    serviceSnapshot.creatorRoles = [];
  }
  return serviceSnapshot;
}

function mapSqlOrder(record) {
  if (!record) {
    return null;
  }

  const serviceSnapshot = buildServiceSnapshot(record);
  const creatorSnapshot = parseJsonText(record.creatorSnapshotJson, {}) || {};
  const travelers = normalizeTravelers(parseJsonText(record.travelersJson, []), null);
  const primaryTraveler = travelers[0] || normalizeTravelerRecord(null);
  const travelPeriod = getTravelPeriod(record, serviceSnapshot);
  const amount = normalizeNumber(record.amountDec != null ? record.amountDec : record.amount, 0);
  const discount = normalizeNumber(record.discountDec != null ? record.discountDec : record.discount, 0);
  const payable = normalizeNumber(record.payableDec != null ? record.payableDec : record.payable, amount - discount);
  const createdAtTs = normalizeNumber(record.createdAtTs || record.createdAt, Date.now());

  return {
    _id: record._id || "",
    id: record.orderNo || "",
    orderNo: record.orderNo || "",
    openid: record.userOpenid || "",
    clientRequestId: record.clientRequestId || "",
    serviceSlug: serviceSnapshot.serviceSlug || record.serviceSlug || "",
    serviceName: serviceSnapshot.serviceName || record.serviceName || "",
    cover: serviceSnapshot.cover || record.serviceCover || "",
    serviceType: serviceSnapshot.serviceType || record.serviceType || "",
    serviceSnapshot,
    creatorSnapshot,
    amount,
    discount,
    payable,
    peopleCount: normalizePositiveInteger(record.peopleCountInt != null ? record.peopleCountInt : record.peopleCount),
    travelPeriod,
    contactName: record.travelerName || "",
    contactPhone: record.travelerPhone || "",
    contact: {
      name: record.travelerName || "",
      phone: record.travelerPhone || ""
    },
    traveler: primaryTraveler,
    primaryTraveler,
    travelers,
    status: record.status || "pending",
    createdAt: formatDateTime(createdAtTs),
    versionName: serviceSnapshot.versionName || record.versionName || "",
    servicePeriodCode: record.servicePeriodCode || ""
  };
}

async function listModelRecords(model, filter, limit) {
  const records = [];
  let pageNumber = 1;

  while (true) {
    const pageSize = Number.isInteger(limit) && limit > 0
      ? Math.min(limit - records.length, MODEL_QUERY_BATCH_SIZE)
      : MODEL_QUERY_BATCH_SIZE;

    if (pageSize <= 0) {
      break;
    }

    const result = await model.list({
      filter,
      pageSize,
      pageNumber
    });
    const data = result && result.data ? result.data : {};
    const batch = Array.isArray(data.records) ? data.records : [];
    records.push(...batch);

    if (batch.length < pageSize) {
      break;
    }

    pageNumber += 1;
  }

  return Number.isInteger(limit) && limit > 0 ? records.slice(0, limit) : records;
}

async function findSingleRecord(model, filter) {
  const records = await listModelRecords(model, filter, 1);
  return records[0] || null;
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
  const records = await listModelRecords(
    getOrderModel(),
    {
      where: {
        userOpenid: {
          $eq: openid
        }
      },
      orderBy: [
        {
          createdAtTs: "desc"
        }
      ]
    }
  );

  return records.map(mapSqlOrder);
}

async function findOrderRecordByWhere(where) {
  return findSingleRecord(
    getOrderModel(),
    {
      where,
      orderBy: [
        {
          createdAtTs: "desc"
        }
      ]
    }
  );
}

async function findServicePeriodByPayload(payload) {
  if (payload.periodCode) {
    return findSingleRecord(getServicePeriodModel(), {
      where: {
        periodCode: {
          $eq: String(payload.periodCode).trim()
        }
      }
    });
  }

  const travelDateStart = String(
    payload.travelDateStart ||
      (payload.travelPeriod && payload.travelPeriod.dateStart) ||
      payload.travelDate ||
      ""
  ).trim();
  const where = {
    serviceSlug: {
      $eq: String(payload.serviceSlug || "").trim()
    },
    dateStart: {
      $eq: travelDateStart
    }
  };

  if (payload.versionName) {
    where.versionName = {
      $eq: String(payload.versionName).trim()
    };
  }

  return findSingleRecord(getServicePeriodModel(), {
    where,
    orderBy: [
      {
        dateStart: "asc"
      }
    ]
  });
}

async function findServicePeriodById(periodId) {
  return findSingleRecord(getServicePeriodModel(), {
    where: {
      _id: {
        $eq: String(periodId || "").trim()
      }
    }
  });
}

function resolvePeriodStatus(currentStatus, remainingSeats) {
  if (remainingSeats <= 0) {
    return "soldout";
  }

  if (currentStatus === "closed") {
    return "closed";
  }

  if (currentStatus === "confirmed") {
    return "confirmed";
  }

  return "available";
}

async function reserveServicePeriodSeats(periodId, peopleCount) {
  for (let attempt = 0; attempt < SERVICE_PERIOD_UPDATE_RETRY_LIMIT; attempt += 1) {
    const periodRecord = await findServicePeriodById(periodId);
    if (!periodRecord) {
      throw new Error("service period not found");
    }

    if (periodRecord.status === "closed") {
      throw new Error("service period is closed");
    }

    const currentRemainingSeats = normalizeNumber(periodRecord.remainingSeats, 0);
    if (currentRemainingSeats < peopleCount) {
      throw new Error("remaining seats are insufficient");
    }

    const nextRemainingSeats = currentRemainingSeats - peopleCount;
    const result = await getServicePeriodModel().update({
      data: {
        remainingSeats: nextRemainingSeats,
        status: resolvePeriodStatus(periodRecord.status, nextRemainingSeats)
      },
      filter: {
        where: {
          _id: {
            $eq: periodRecord._id
          },
          remainingSeats: {
            $eq: currentRemainingSeats
          },
          status: {
            $eq: periodRecord.status || ""
          }
        }
      }
    });

    if (getMutationCount(result) > 0) {
      return Object.assign({}, periodRecord, {
        remainingSeats: nextRemainingSeats,
        status: resolvePeriodStatus(periodRecord.status, nextRemainingSeats)
      });
    }
  }

  throw new Error("service period changed too frequently, please retry");
}

async function restoreServicePeriodSeats(periodId, peopleCount) {
  for (let attempt = 0; attempt < SERVICE_PERIOD_UPDATE_RETRY_LIMIT; attempt += 1) {
    const periodRecord = await findServicePeriodById(periodId);
    if (!periodRecord) {
      throw new Error("service period not found");
    }

    const currentRemainingSeats = normalizeNumber(periodRecord.remainingSeats, 0);
    const nextRemainingSeats = currentRemainingSeats + peopleCount;
    const result = await getServicePeriodModel().update({
      data: {
        remainingSeats: nextRemainingSeats,
        status: resolvePeriodStatus(periodRecord.status, nextRemainingSeats)
      },
      filter: {
        where: {
          _id: {
            $eq: periodRecord._id
          },
          remainingSeats: {
            $eq: currentRemainingSeats
          },
          status: {
            $eq: periodRecord.status || ""
          }
        }
      }
    });

    if (getMutationCount(result) > 0) {
      return Object.assign({}, periodRecord, {
        remainingSeats: nextRemainingSeats,
        status: resolvePeriodStatus(periodRecord.status, nextRemainingSeats)
      });
    }
  }

  throw new Error("service period changed too frequently, please retry");
}

function buildOrderStatusUpdateData(nextStatus) {
  const updateData = {
    status: nextStatus
  };

  if (nextStatus === "paid") {
    updateData.paidAtTs = Date.now();
  }

  if (nextStatus === "canceled") {
    updateData.canceledAtTs = Date.now();
  }

  return updateData;
}

function shouldRestoreSeatsForOrderStatus(status) {
  return status === "pending" || status === "paid" || status === "traveling";
}

async function rollbackCanceledOrderStatus(orderRecord) {
  try {
    await getOrderModel().update({
      data: {
        status: orderRecord.status,
        canceledAtTs: 0
      },
      filter: {
        where: {
          _id: {
            $eq: orderRecord._id
          },
          status: {
            $eq: "canceled"
          }
        }
      }
    });
  } catch (error) {
    console.error("Failed to rollback canceled order status", error);
  }
}

async function transitionOrderStatus(orderRecord, nextStatus) {
  for (let attempt = 0; attempt < ORDER_STATUS_UPDATE_RETRY_LIMIT; attempt += 1) {
    const currentRecord = attempt === 0 ? orderRecord : await findOrderRecordByWhere({
      _id: {
        $eq: orderRecord._id
      }
    });

    if (!currentRecord) {
      return null;
    }

    if (currentRecord.status === nextStatus) {
      return mapSqlOrder(currentRecord);
    }

    const updateData = buildOrderStatusUpdateData(nextStatus);
    const result = await getOrderModel().update({
      data: updateData,
      filter: {
        where: {
          _id: {
            $eq: currentRecord._id
          },
          status: {
            $eq: currentRecord.status || ""
          }
        }
      }
    });

    if (getMutationCount(result) > 0) {
      return mapSqlOrder(Object.assign({}, currentRecord, updateData));
    }
  }

  throw new Error("order status changed too frequently, please retry");
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
  const record = await findOrderRecordByWhere({
    userOpenid: {
      $eq: openid
    },
    orderNo: {
      $eq: String(orderId || "").trim()
    }
  });

  return mapSqlOrder(record);
}

async function createOrder(payload) {
  payload = payload || {};
  const openid = await getOpenId();
  const clientRequestId = String(payload.clientRequestId || "").trim();
  const requestedTravelPeriod = normalizeTravelPeriod(
    payload.travelPeriod || {
      dateStart: payload.travelDateStart || payload.travelDate,
      dateEnd: payload.travelDateEnd || payload.travelDateStart || payload.travelDate
    }
  );

  if (!payload.serviceSlug) {
    throw new Error("serviceSlug is required");
  }

  if (!payload.periodCode && !requestedTravelPeriod.dateStart) {
    throw new Error("travelDateStart is required");
  }

  const peopleCount = normalizePositiveInteger(payload.peopleCount);
  if (!peopleCount) {
    throw new Error("peopleCount must be a positive integer");
  }

  if (clientRequestId) {
    const existingRecord = await findOrderRecordByWhere({
      userOpenid: {
        $eq: openid
      },
      clientRequestId: {
        $eq: clientRequestId
      }
    });

    if (existingRecord) {
      return mapSqlOrder(existingRecord);
    }
  }

  const periodRecord = await findServicePeriodByPayload(payload);
  if (!periodRecord) {
    throw new Error("service period not found");
  }

  const unitPrice = normalizeNumber(periodRecord.price, 0);
  if (unitPrice <= 0) {
    throw new Error("service period price is invalid");
  }

  const amount = unitPrice * peopleCount;
  const discount = Math.max(0, Math.min(normalizeNumber(payload.discount, 0), amount));
  const payable = amount - discount;
  const timestamp = Date.now();
  const orderNo = createOrderNo(timestamp);
  const shortId = String(orderNo).slice(-4);
  const createdAtText = formatDateTime(timestamp);
  const serviceSnapshot = payload.serviceSnapshot || {};
  const creatorSnapshot = payload.creatorSnapshot || {};
  const travelDateStart = periodRecord.dateStart || requestedTravelPeriod.dateStart;
  const travelDateEnd = periodRecord.dateEnd || requestedTravelPeriod.dateEnd || travelDateStart;
  const contact = normalizeContact(payload);
  const travelers = normalizeTravelers(payload.travelers, payload.traveler);
  const orderServiceSnapshot = {
    serviceSlug: payload.serviceSlug,
    serviceName: periodRecord.serviceName || serviceSnapshot.serviceName || payload.serviceName || "",
    serviceType: serviceSnapshot.serviceType || payload.serviceType || "",
    cover: serviceSnapshot.cover || payload.cover || "",
    versionName: periodRecord.versionName || payload.versionName || "",
    travelPeriod: {
      dateStart: travelDateStart,
      dateEnd: travelDateEnd
    },
    creatorRoles: Array.isArray(serviceSnapshot.creatorRoles) ? serviceSnapshot.creatorRoles : []
  };
  const orderData = {
    orderNo,
    shortId,
    userOpenid: openid,
    clientRequestId,
    serviceSlug: orderServiceSnapshot.serviceSlug,
    serviceName: orderServiceSnapshot.serviceName,
    serviceType: orderServiceSnapshot.serviceType,
    serviceCover: orderServiceSnapshot.cover,
    servicePeriodCode: periodRecord.periodCode || payload.periodCode || "",
    versionName: orderServiceSnapshot.versionName,
    travelDate: travelDateStart,
    travelDateStart,
    travelDateEnd,
    travelDateStartDate: travelDateStart,
    travelDateEndDate: travelDateEnd,
    peopleCount,
    peopleCountInt: peopleCount,
    amount,
    amountDec: amount,
    discount,
    discountDec: discount,
    payable,
    payableDec: payable,
    // Keep legacy model fields for compatibility until the CloudBase model is updated.
    travelerName: String(contact.name || "").trim(),
    travelerPhone: String(contact.phone || "").trim(),
    travelersJson: stringifyJson(travelers),
    serviceSnapshotJson: stringifyJson(orderServiceSnapshot),
    creatorSnapshotJson: stringifyJson({
      id: creatorSnapshot.id || "",
      slug: creatorSnapshot.slug || "",
      name: creatorSnapshot.name || "",
      avatar: creatorSnapshot.avatar || "",
      stance: creatorSnapshot.stance || ""
    }),
    status: "pending",
    createdAtText,
    createdAtTs: timestamp
  };

  await reserveServicePeriodSeats(periodRecord._id, peopleCount);

  try {
    await getOrderModel().create({
      data: orderData
    });
  } catch (error) {
    let restoreSucceeded = false;

    try {
      await restoreServicePeriodSeats(periodRecord._id, peopleCount);
      restoreSucceeded = true;
    } catch (restoreError) {
      console.error("Failed to restore service period seats", restoreError);
    }

    if (restoreSucceeded && clientRequestId && isDuplicateKeyError(error)) {
      const existingRecord = await findOrderRecordByWhere({
        userOpenid: {
          $eq: openid
        },
        clientRequestId: {
          $eq: clientRequestId
        }
      });

      if (existingRecord) {
        return mapSqlOrder(existingRecord);
      }
    }

    throw error;
  }

  return mapSqlOrder(
    Object.assign(
      {
        _id: ""
      },
      orderData
    )
  );
}

async function updateOrderStatus(orderId, nextStatus) {
  const openid = await getOpenId();
  const targetRecord = await findOrderRecordByWhere({
    userOpenid: {
      $eq: openid
    },
    orderNo: {
      $eq: String(orderId || "").trim()
    }
  });

  if (!targetRecord) {
    return null;
  }

  if (targetRecord.status === nextStatus) {
    return mapSqlOrder(targetRecord);
  }

  const updatedOrder = await transitionOrderStatus(targetRecord, nextStatus);
  if (!updatedOrder) {
    return null;
  }

  if (
    nextStatus === "canceled" &&
    targetRecord.servicePeriodCode &&
    shouldRestoreSeatsForOrderStatus(targetRecord.status)
  ) {
    const periodRecord = await findSingleRecord(getServicePeriodModel(), {
      where: {
        periodCode: {
          $eq: targetRecord.servicePeriodCode
        }
      }
    });

    if (!periodRecord) {
      await rollbackCanceledOrderStatus(targetRecord);
      throw new Error("service period not found");
    }

    try {
      await restoreServicePeriodSeats(periodRecord._id, normalizePositiveInteger(targetRecord.peopleCount));
    } catch (error) {
      await rollbackCanceledOrderStatus(targetRecord);
      throw error;
    }
  }

  return updatedOrder;
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
        const creator = findCreatorByRef(creators, service.creatorId);
        return Object.assign({}, service, {
          creatorName: creator ? creator.name : ""
        });
      }),
    favoriteIdeas: ideas
      .filter((item) => state.ideas[item.slug])
      .map((idea) => {
        const author = findCreatorByRef(creators, idea.authorId);
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
    console.error("Transaction gateway error", {
      action,
      error
    });
    return {
      ok: false,
      error: error && error.message ? error.message : "Transaction gateway error"
    };
  }
};
