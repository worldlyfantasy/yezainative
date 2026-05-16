const cloud = require("wx-server-sdk");
const cloudbase = require("@cloudbase/node-sdk");
const {
  normalizeEmergencyContact,
  normalizeOrderContact,
  normalizeTravelerRecord,
  normalizeTravelerSource,
  normalizeTravelers,
  validateOrderParticipants
} = require("./order-validation");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const sqlApp = cloudbase.init({
  env: process.env.TCB_ENV || cloud.DYNAMIC_CURRENT_ENV
});
const runSQL = (sqlApp.models && (sqlApp.models.$runSQL || sqlApp.models.runSQL)) || null;
const rdb = typeof sqlApp.rdb === "function" ? sqlApp.rdb() : null;
const FAVORITES_COLLECTION = "favorites";
const ORDER_EVENTS_COLLECTION = "order_events";
const CONFIG_COLLECTION = "app_configs";
const REFERRAL_RELATIONS_COLLECTION = "referral_relations";
const CASH_REWARD_LEDGERS_COLLECTION = "cash_reward_ledgers";
const COUPON_ASSETS_COLLECTION = "user_coupon_assets";
const QUERY_BATCH_SIZE = 100;
const MODEL_QUERY_BATCH_SIZE = 100;
const SERVICE_PERIOD_UPDATE_RETRY_LIMIT = 5;
const ORDER_STATUS_UPDATE_RETRY_LIMIT = 3;
const MAX_ORDER_PEOPLE_COUNT = 2;
const ORDER_PAYMENT_EXPIRE_MS = 30 * 60 * 1000;
const ORDER_MODEL_NAME = "TravelOrder";
const SERVICE_PERIOD_MODEL_NAME = "ServicePeriod";
const ENABLE_CLIENT_PAY_ORDER = process.env.ENABLE_CLIENT_PAY_ORDER === "true";
const CONTENT_COLLECTIONS = {
  creators: "creators",
  destinations: "destinations",
  services: "services",
  ideas: "ideas"
};
const COLLECTIONS = {
  users: "users"
};
const SERVICE_PERIOD_SQL_FIELDS = "`serviceSlug`, `periodCode`, `dateStart`, `dateEnd`, `price`";
const SUPPORTED_COUPON_RULES = {};
const DEFAULT_SHARE_REFERRAL_CONFIG = {
  campaignKey: "yezai_share_referral",
  campaignName: "野哉分享家",
  cashRewardAmount: 100,
  monthlySettlementDay: 20
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

function createSqlRecordId(prefix) {
  const normalizedPrefix = String(prefix || "").replace(/[^a-zA-Z0-9]+/g, "").toLowerCase() || "rec";
  return `${normalizedPrefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function formatDateTime(timestamp) {
  return new Date(timestamp).toLocaleString("zh-CN", {
    hour12: false,
    timeZone: "Asia/Shanghai"
  });
}

function getShanghaiTodayDateString() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function getSQLRows(result) {
  const data = result && result.data ? result.data : {};
  return Array.isArray(data.executeResultList) ? data.executeResultList : [];
}

function normalizeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function isPlainObject(value) {
  return Boolean(value) && Object.prototype.toString.call(value) === "[object Object]";
}

function formatSettlementMonth(ts) {
  const targetTs = normalizeNumber(ts, 0);
  if (!targetTs) {
    return "";
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit"
  });
  const parts = formatter.formatToParts(new Date(targetTs));
  const year = parts.find((item) => item.type === "year");
  const month = parts.find((item) => item.type === "month");
  if (!year || !month) {
    return "";
  }
  return `${year.value}-${month.value}`;
}

function deepMerge(base, override) {
  if (Array.isArray(base)) {
    return Array.isArray(override) ? override : base.slice();
  }

  if (!isPlainObject(base)) {
    return override == null ? base : override;
  }

  const result = Object.assign({}, base);
  Object.keys(override || {}).forEach((key) => {
    const prevValue = result[key];
    const nextValue = override[key];
    if (isPlainObject(prevValue) && isPlainObject(nextValue)) {
      result[key] = deepMerge(prevValue, nextValue);
      return;
    }
    result[key] = nextValue;
  });
  return result;
}

function pickImageRef(value) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return pickImageRef(value[0]);
  }

  if (!isPlainObject(value)) {
    return "";
  }

  const candidates = [
    value.card,
    value.detail,
    value.original,
    value.url,
    value.src,
    value.image,
    value.cover,
    value.coverImage,
    value.avatar,
    value.fileID,
    value.cloudFileID,
    value.path
  ];

  for (let index = 0; index < candidates.length; index += 1) {
    if (typeof candidates[index] === "string" && candidates[index].trim()) {
      return candidates[index].trim();
    }
  }

  return "";
}

function normalizePositiveInteger(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeRoomingMode(value) {
  const normalized = String(value || "").trim();
  if (normalized === "withRoommate" || normalized === "singleRoomRequest") {
    return normalized;
  }
  return "random";
}

function normalizeRoomType(value) {
  return String(value || "").trim() === "king" ? "king" : "twin";
}

function normalizeCouponId(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(SUPPORTED_COUPON_RULES, normalized) ? normalized : "";
}

function normalizeCouponSelectionId(value) {
  return String(value || "").trim();
}

function splitCouponSelectionIds(value) {
  return normalizeCouponSelectionId(value)
    .split(/[,+|]/)
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .slice(0, 4);
}

function normalizeCouponSnapshot(value) {
  const source = value && typeof value === "object" ? value : {};
  const id = normalizeCouponSelectionId(source.id || source.couponId);
  if (!id) {
    return {};
  }

  return {
    id,
    title: truncateString(source.title, 32),
    threshold: normalizeNumber(source.threshold, 0),
    amountOff: normalizeNumber(source.amountOff, 0)
  };
}

function buildOrderExtras(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const roomingMode = normalizeRoomingMode(source.roomingMode);
  let roomType = normalizeRoomType(source.roomType);
  if (roomingMode === "random") {
    roomType = "twin";
  }
  const singleRoomRequested = roomingMode === "singleRoomRequest";
  return {
    emergencyContactName: truncateString(source.emergencyContactName, 32),
    emergencyContactPhone: truncateString(source.emergencyContactPhone, 32),
    roomingMode,
    roommateName: truncateString(source.roommateName, 32),
    roomType,
    singleRoomPrice: singleRoomRequested ? Math.max(0, normalizeNumber(source.singleRoomPrice, 0)) : 0,
    singleRoomStatus: singleRoomRequested ? "pending" : "",
    singleRoomNotice: singleRoomRequested ? truncateString(source.singleRoomNotice, 120) : "",
    allergyNotes: truncateString(source.allergyNotes, 256),
    couponId: normalizeCouponSelectionId(source.couponId),
    couponSnapshot: normalizeCouponSnapshot(source.couponSnapshot)
  };
}

async function appendOrderStatusEvent(event) {
  const orderNo = String(event && event.orderNo ? event.orderNo : "").trim();
  const status = String(event && event.status ? event.status : "").trim();
  if (!orderNo || !status) {
    return;
  }

  const occurredAtTs = normalizeNumber(event && event.occurredAtTs, Date.now());
  const data = {
    orderNo,
    userOpenid: String(event && event.userOpenid ? event.userOpenid : "").trim(),
    status,
    fromStatus: String(event && event.fromStatus ? event.fromStatus : "").trim(),
    source: String(event && event.source ? event.source : "system").trim(),
    occurredAtTs,
    occurredAtText: formatDateTime(occurredAtTs),
    createdAt: occurredAtTs,
    updatedAt: occurredAtTs
  };

  try {
    await db.collection(ORDER_EVENTS_COLLECTION).add({ data });
  } catch (error) {
    console.error("Failed to append order status event", {
      orderNo,
      status,
      error
    });
  }
}

async function readConfig(key) {
  const result = await db.collection(CONFIG_COLLECTION).where({ key: normalizeText(key) }).limit(1).get();
  return result && result.data && result.data.length ? result.data[0] : null;
}

async function getShareReferralCampaignConfig() {
  try {
    const configDoc = await readConfig("shareReferralCampaign");
    const value = configDoc && isPlainObject(configDoc.value) ? configDoc.value : {};
    return deepMerge(DEFAULT_SHARE_REFERRAL_CONFIG, value);
  } catch (error) {
    console.error("Failed to load share referral campaign config in transactionGateway", error);
    return DEFAULT_SHARE_REFERRAL_CONFIG;
  }
}

async function findUserDocByOpenid(openid) {
  const normalizedOpenid = normalizeText(openid);
  if (!normalizedOpenid) {
    return null;
  }

  const result = await db.collection(COLLECTIONS.users).where({ openid: normalizedOpenid }).limit(1).get();
  return result && result.data && result.data.length ? result.data[0] : null;
}

async function updateCompletedTravelStatsForUser(user, occurredAt = Date.now()) {
  const userId = normalizeText(user && user._id);
  if (!userId) {
    return;
  }

  const currentCount = Math.max(0, normalizeNumber(user && user.effectiveOrderCount, 0));
  const currentLastTravelAt = Math.max(0, normalizeNumber(user && user.lastTravelAt, 0));
  const completedAt = Math.max(currentLastTravelAt, normalizeNumber(occurredAt, Date.now()));

  try {
    await db.collection(COLLECTIONS.users).doc(userId).update({
      data: {
        effectiveOrderCount: Math.max(1, currentCount),
        effectiveRouteCount: Math.max(1, normalizeNumber(user && user.effectiveRouteCount, 0)),
        lastTravelAt: completedAt,
        updatedAt: Date.now()
      }
    });
  } catch (error) {
    console.error("Failed to update completed travel stats for user", {
      userId,
      error
    });
  }
}

async function findActiveReferralRelationByInviteeUserId(inviteeUserId) {
  const normalizedUserId = normalizeText(inviteeUserId);
  if (!normalizedUserId) {
    return null;
  }

  const result = await db.collection(REFERRAL_RELATIONS_COLLECTION)
    .where({ inviteeUserId: normalizedUserId, status: "active" })
    .limit(1)
    .get();
  return result && result.data && result.data.length ? result.data[0] : null;
}

async function findRewardLedgerByOrderNo(orderNo, campaignKey) {
  const normalizedOrderNo = normalizeText(orderNo);
  if (!normalizedOrderNo) {
    return null;
  }

  const result = await db.collection(CASH_REWARD_LEDGERS_COLLECTION)
    .where({
      sourceOrderNo: normalizedOrderNo,
      campaignKey: normalizeText(campaignKey)
    })
    .limit(1)
    .get();
  return result && result.data && result.data.length ? result.data[0] : null;
}

async function findRewardLedgerByRelationId(relationId, campaignKey) {
  const normalizedRelationId = normalizeText(relationId);
  if (!normalizedRelationId) {
    return null;
  }

  const result = await db.collection(CASH_REWARD_LEDGERS_COLLECTION)
    .where({
      relationId: normalizedRelationId,
      campaignKey: normalizeText(campaignKey)
    })
    .limit(1)
    .get();
  return result && result.data && result.data.length ? result.data[0] : null;
}

function buildShareReferralRewardLedger(orderRecord, relation, config, now = Date.now()) {
  const normalizedNow = normalizeNumber(now, Date.now());
  const rewardAmount = Math.max(0, normalizeNumber(config && config.cashRewardAmount, DEFAULT_SHARE_REFERRAL_CONFIG.cashRewardAmount));
  const inviteeOpenid = normalizeText(orderRecord && (orderRecord.userOpenid || orderRecord.openid));
  const travelDateStart = normalizeText(orderRecord && (orderRecord.travelDateStart || (orderRecord.travelPeriod && orderRecord.travelPeriod.dateStart)));
  const travelDateEnd = normalizeText(orderRecord && (orderRecord.travelDateEnd || (orderRecord.travelPeriod && orderRecord.travelPeriod.dateEnd)));

  return {
    campaignKey: normalizeText(config && config.campaignKey) || DEFAULT_SHARE_REFERRAL_CONFIG.campaignKey,
    campaignName: normalizeText(config && config.campaignName) || DEFAULT_SHARE_REFERRAL_CONFIG.campaignName,
    inviterUserId: normalizeText(relation && relation.inviterUserId),
    inviteeUserId: normalizeText(relation && relation.inviteeUserId),
    relationId: normalizeText(relation && relation._id),
    inviteeOpenid,
    sourceOrderNo: normalizeText(orderRecord && orderRecord.orderNo),
    sourceServiceSlug: normalizeText(orderRecord && orderRecord.serviceSlug),
    serviceName: normalizeText(orderRecord && orderRecord.serviceName),
    travelDateStart,
    travelDateEnd,
    rewardAmount,
    grossAmount: rewardAmount,
    netAmount: rewardAmount,
    status: "awaiting_account",
    settlementMonth: formatSettlementMonth(normalizedNow),
    settlementPlannedDay: Math.max(1, Math.min(28, normalizePositiveInteger(config && config.monthlySettlementDay) || DEFAULT_SHARE_REFERRAL_CONFIG.monthlySettlementDay)),
    earnedAt: normalizedNow,
    updatedAt: normalizedNow
  };
}

async function syncShareReferralRewardForCompletedOrder(orderRecord) {
  const normalizedOrder = orderRecord && typeof orderRecord === "object" ? orderRecord : null;
  const inviteeOpenid = normalizeText(normalizedOrder && (normalizedOrder.userOpenid || normalizedOrder.openid));
  if (!normalizedOrder || !normalizeText(normalizedOrder.orderNo) || !inviteeOpenid) {
    return null;
  }

  const inviteeUser = await findUserDocByOpenid(inviteeOpenid);
  if (!inviteeUser || !normalizeText(inviteeUser._id)) {
    return null;
  }

  await updateCompletedTravelStatsForUser(inviteeUser, Date.now());

  const relation = await findActiveReferralRelationByInviteeUserId(normalizeText(inviteeUser._id));
  if (!relation) {
    return null;
  }

  const campaignConfig = await getShareReferralCampaignConfig();
  const existingLedger = await findRewardLedgerByOrderNo(normalizeText(normalizedOrder.orderNo), normalizeText(campaignConfig.campaignKey));
  if (existingLedger) {
    return existingLedger;
  }
  const existingRelationLedger = await findRewardLedgerByRelationId(normalizeText(relation._id), normalizeText(campaignConfig.campaignKey));
  if (existingRelationLedger) {
    return existingRelationLedger;
  }

  const rewardLedger = buildShareReferralRewardLedger(normalizedOrder, relation, campaignConfig, Date.now());
  const createResult = await db.collection(CASH_REWARD_LEDGERS_COLLECTION).add({
    data: rewardLedger
  });

  return Object.assign({
    _id: createResult && createResult._id ? createResult._id : ""
  }, rewardLedger);
}

async function listAllSqlServicePeriods() {
  try {
    if (typeof runSQL !== "function") {
      throw new Error("models.$runSQL unavailable");
    }

    const result = await runSQL(
      `SELECT ${SERVICE_PERIOD_SQL_FIELDS} FROM \`ServicePeriod\` ORDER BY \`serviceSlug\` ASC, \`dateStart\` ASC`
    );
    return getSQLRows(result);
  } catch (error) {
    console.error("Failed to list all SQL service periods in transactionGateway", error);
    return [];
  }
}

function groupSqlPeriodsByServiceSlug(periods) {
  return (periods || []).reduce((result, period) => {
    const serviceSlug = String(period && period.serviceSlug ? period.serviceSlug : "").trim();
    if (!serviceSlug) {
      return result;
    }

    if (!result[serviceSlug]) {
      result[serviceSlug] = [];
    }

    result[serviceSlug].push(period);
    return result;
  }, {});
}

function calcDurationDays(dateStart, dateEnd) {
  if (!dateStart || !dateEnd) {
    return 0;
  }

  const start = new Date(dateStart);
  const end = new Date(dateEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  const diff = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  return Number.isFinite(diff) && diff > 0 ? diff : 0;
}

function buildDurationLabelFromPeriods(periods) {
  const uniqueDays = Array.from(
    new Set(
      (periods || [])
        .map((period) => calcDurationDays(period.dateStart, period.dateEnd))
        .filter((value) => value > 0)
    )
  ).sort((a, b) => a - b);

  if (!uniqueDays.length) {
    return "";
  }

  if (uniqueDays.length === 1) {
    return `${uniqueDays[0]}天`;
  }

  return `${uniqueDays.join("/")}天`;
}

function formatMoneyValue(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return "";
  }

  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/\.?0+$/, "");
}

function buildPriceLabelFromPeriods(periods) {
  const prices = (periods || [])
    .map((period) => Number(period && period.price))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (!prices.length) {
    return "";
  }

  return `¥${formatMoneyValue(Math.min(...prices))} 起`;
}

function attachServicePeriodSummary(service, periodMap) {
  const source = service && typeof service === "object" ? service : {};
  const serviceSlug = String(source.slug || "").trim();
  const groupPeriods = periodMap[serviceSlug] || [];
  const durationTag = buildDurationLabelFromPeriods(groupPeriods);
  const priceLabel = buildPriceLabelFromPeriods(groupPeriods);

  return Object.assign({}, source, {
    durationTag: durationTag || String(source.durationTag || "").trim(),
    priceLabel: priceLabel || String(source.priceLabel || "").trim()
  });
}

function getMutationCount(result) {
  const count = result && result.data ? result.data.count : result && result.count;
  return normalizePositiveInteger(count);
}

function isDuplicateKeyError(error) {
  const message = String(error && error.message ? error.message : "").toLowerCase();
  return message.includes("duplicate") || message.includes("unique");
}

function getErrorMessage(error) {
  if (!error) {
    return "";
  }
  return String(error.message || error.errMsg || error.error || "").trim();
}

function extractMissingColumnFromInsertError(error) {
  const message = getErrorMessage(error);
  if (!message) {
    return "";
  }

  const match = message.match(/column\s+([`"'A-Za-z0-9_]+)\s+not\s+found/i);
  if (!match || !match[1]) {
    return "";
  }

  return String(match[1]).replace(/[`'"]/g, "").trim();
}

async function insertOrderRecordWithCompatibility(orderData) {
  if (!rdb) {
    throw new Error("rdb unavailable");
  }

  const nextOrderData = { ...(orderData || {}) };
  const removedColumns = [];
  let lastError = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { error } = await rdb.from(ORDER_MODEL_NAME).insert(nextOrderData);
    if (!error) {
      return {
        insertedData: nextOrderData,
        removedColumns
      };
    }

    lastError = error;
    const missingColumn = extractMissingColumnFromInsertError(error);
    if (!missingColumn || !Object.prototype.hasOwnProperty.call(nextOrderData, missingColumn)) {
      throw error;
    }

    delete nextOrderData[missingColumn];
    removedColumns.push(missingColumn);
  }

  throw lastError || new Error("order insert failed");
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

function truncateString(value, maxLength) {
  const text = String(value == null ? "" : value).trim();
  if (!maxLength || text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength);
}

function stringifyJsonWithMaxLength(value, maxLength) {
  const serialized = stringifyJson(value);
  if (!serialized) {
    return "";
  }
  if (!maxLength || serialized.length <= maxLength) {
    return serialized;
  }
  return serialized.slice(0, maxLength);
}

function resolvePersistedTravelerSource(value, hasProfileLink) {
  const normalized = normalizeTravelerSource(value);
  if (normalized) {
    return normalized;
  }
  return hasProfileLink ? "traveler_profile" : "manual";
}

function buildPersistedTravelers(travelers, maxLength) {
  const compactTravelers = (Array.isArray(travelers) ? travelers : []).map((traveler) => {
    const source = traveler && typeof traveler === "object" ? traveler : {};
    const rawDocs = Array.isArray(source.documents) ? source.documents : [];
    const docPairs = rawDocs
      .filter((d) => String(d && d.documentType ? d.documentType : "").trim())
      .filter((d) => String(d && (d.documentNumber || d.idCard) ? d.documentNumber || d.idCard : "").trim())
      .slice(0, 6)
      .map((d) => ({
        t: truncateString(d.documentType, 24),
        i: truncateString(d.documentNumber || d.idCard || d.idNo || "", 32)
      }));
    const first = docPairs[0] || {
      t: truncateString(source.documentType, 24),
      i: truncateString(source.documentNumber || source.idCard || source.idNo || "", 32)
    };
    const compact = {
      n: truncateString(source.name, 32),
      t: first.t,
      i: first.i,
      p: truncateString(source.phone, 32)
    };
    const profileId = truncateString(source.profileId, 64);
    const travelerRecordId = truncateString(source.travelerRecordId, 64);
    const travelerSource = resolvePersistedTravelerSource(
      source.source,
      Boolean(profileId || travelerRecordId)
    );

    if (docPairs.length > 1) {
      compact.ds = docPairs;
    }
    if (profileId) {
      compact.pid = profileId;
    }
    if (travelerRecordId) {
      compact.rid = travelerRecordId;
    }
    if (travelerSource) {
      compact.src = travelerSource;
    }

    if (source.gender) {
      compact.g = truncateString(source.gender, 8);
    }
    if (source.birthday) {
      compact.b = truncateString(source.birthday, 16);
    }
    if (source.wechat) {
      compact.w = truncateString(source.wechat, 32);
    }
    if (source.email) {
      compact.e = truncateString(source.email, 48);
    }
    if (source.note) {
      compact.o = truncateString(source.note, 32);
    }

    return compact;
  });

  const serialized = stringifyJson(compactTravelers);
  if (!serialized) {
    return "";
  }
  if (!maxLength || serialized.length <= maxLength) {
    return serialized;
  }

  const compactWithoutOptionalFields = compactTravelers.map((traveler) => ({
    n: traveler.n,
    t: traveler.t,
    i: traveler.i,
    p: traveler.p,
    pid: traveler.pid,
    rid: traveler.rid,
    src: traveler.src
  }));
  return stringifyJsonWithMaxLength(compactWithoutOptionalFields, maxLength);
}

function buildPersistedServiceSnapshot(snapshot) {
  const source = snapshot && typeof snapshot === "object" ? snapshot : {};
  const period = source.travelPeriod && typeof source.travelPeriod === "object" ? source.travelPeriod : {};
  const singleRoom = source.singleRoom && typeof source.singleRoom === "object" ? source.singleRoom : {};
  return {
    serviceSlug: truncateString(source.serviceSlug, 64),
    serviceName: truncateString(source.serviceName, 48),
    versionName: truncateString(source.versionName, 32),
    travelPeriod: {
      dateStart: truncateString(period.dateStart, 32),
      dateEnd: truncateString(period.dateEnd, 32)
    },
    singleRoom: {
      requested: Boolean(singleRoom.requested),
      price: Math.max(0, normalizeNumber(singleRoom.price, 0)),
      status: truncateString(singleRoom.status, 24),
      notice: truncateString(singleRoom.notice, 60)
    }
  };
}

function buildPersistedCreatorSnapshot(snapshot) {
  const source = snapshot && typeof snapshot === "object" ? snapshot : {};
  return {
    id: truncateString(source.id, 48),
    slug: truncateString(source.slug, 48),
    name: truncateString(source.name, 32)
  };
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

function buildFavoriteCreator(creator) {
  const source = creator && typeof creator === "object" ? creator : {};

  return Object.assign({}, source, {
    avatar: pickImageRef(source.avatar)
  });
}

function buildFavoriteDestination(destination, creators, services) {
  const source = destination && typeof destination === "object" ? destination : {};
  const destinationSlug = String(source.slug || "").trim();
  const relatedServices = (services || []).filter((service) =>
    Array.isArray(service && service.destinationSlugs) && service.destinationSlugs.includes(destinationSlug)
  );
  const relatedCreators = (creators || []).filter((creator) =>
    Array.isArray(creator && creator.destinationSlugs) && creator.destinationSlugs.includes(destinationSlug)
  );

  return Object.assign({}, source, {
    cover: pickImageRef(source.cover),
    creatorCount: relatedCreators.length,
    routeCount: relatedServices.length
  });
}

function buildFavoriteService(service, creators, periodMap) {
  const source = attachServicePeriodSummary(service, periodMap);
  const creator = findCreatorByRef(creators, source.creatorId);

  return Object.assign({}, source, {
    cover: pickImageRef(source.cover),
    creatorName: creator ? creator.name : ""
  });
}

function buildFavoriteIdea(idea, creators) {
  const source = idea && typeof idea === "object" ? idea : {};
  const author = findCreatorByRef(creators, source.authorId);

  return Object.assign({}, source, {
    cover: pickImageRef(source.cover),
    authorName: author ? author.name : ""
  });
}

function buildOrderServiceSnapshot({
  payload,
  periodRecord,
  requestedTravelPeriod,
  serviceSnapshot,
  contact,
  travelers,
  orderExtras
}) {
  const travelDateStart = periodRecord.dateStart || requestedTravelPeriod.dateStart;
  const travelDateEnd = periodRecord.dateEnd || requestedTravelPeriod.dateEnd || travelDateStart;

  return {
    serviceSlug: payload.serviceSlug,
    serviceName: periodRecord.serviceName || serviceSnapshot.serviceName || payload.serviceName || "",
    serviceType: serviceSnapshot.serviceType || payload.serviceType || "",
    cover: pickImageRef(serviceSnapshot.cover) || pickImageRef(payload.cover) || "",
    versionName: periodRecord.versionName || payload.versionName || "",
    travelPeriod: {
      dateStart: travelDateStart,
      dateEnd: travelDateEnd
    },
    creatorRoles: Array.isArray(serviceSnapshot.creatorRoles) ? serviceSnapshot.creatorRoles : [],
    contact: {
      name: String(contact && contact.name ? contact.name : "").trim(),
      phone: String(contact && contact.phone ? contact.phone : "").trim()
    },
    travelers: normalizeTravelers(travelers, null),
    roomingMode: normalizeRoomingMode(orderExtras && orderExtras.roomingMode),
    roommateName: String(orderExtras && orderExtras.roommateName ? orderExtras.roommateName : "").trim(),
    roomType: normalizeRoomType(orderExtras && orderExtras.roomType),
    singleRoom: {
      requested: normalizeRoomingMode(orderExtras && orderExtras.roomingMode) === "singleRoomRequest",
      price: Math.max(0, normalizeNumber(orderExtras && orderExtras.singleRoomPrice, 0)),
      status: String(orderExtras && orderExtras.singleRoomStatus ? orderExtras.singleRoomStatus : "").trim(),
      notice: String(orderExtras && orderExtras.singleRoomNotice ? orderExtras.singleRoomNotice : "").trim()
    },
    allergyNotes: String(orderExtras && orderExtras.allergyNotes ? orderExtras.allergyNotes : "").trim(),
    couponId: String(orderExtras && orderExtras.couponId ? orderExtras.couponId : "").trim()
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

function normalizeDateOnlyText(value) {
  const text = String(value || "").trim();
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  return match ? match[1] : "";
}

function hasTravelPeriodOverlap(left, right) {
  const leftStart = normalizeDateOnlyText(left && left.dateStart);
  const leftEnd = normalizeDateOnlyText((left && left.dateEnd) || leftStart);
  const rightStart = normalizeDateOnlyText(right && right.dateStart);
  const rightEnd = normalizeDateOnlyText((right && right.dateEnd) || rightStart);

  if (!leftStart || !leftEnd || !rightStart || !rightEnd) {
    return false;
  }

  return leftStart <= rightEnd && rightStart <= leftEnd;
}

function normalizeTravelerDocumentNumber(value) {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

function getTravelerAvailabilityKeys(traveler) {
  const source = traveler && typeof traveler === "object" ? traveler : {};
  const documents = Array.isArray(source.documents) && source.documents.length
    ? source.documents
    : [
        {
          documentType: source.documentType || source.t,
          documentNumber: source.documentNumber || source.idCard || source.idNo || source.i
        }
      ];

  const keys = new Set();
  documents.forEach((document) => {
    const documentNumber = normalizeTravelerDocumentNumber(
      document && (document.documentNumber || document.idCard || document.idNo || document.i)
    );
    if (!documentNumber) {
      return;
    }

    const documentType = normalizeText(document && (document.documentType || document.t));
    if (documentType) {
      keys.add(`${documentType}:${documentNumber}`);
    }
    keys.add(documentNumber);
  });

  return keys;
}

function getOrderTravelersForAvailability(record) {
  const travelers = normalizeTravelers(parseJsonText(record && record.travelersJson, []), null);
  const legacyTravelerIdCard = normalizeTravelerDocumentNumber(record && record.travelerIdCard);
  if (!legacyTravelerIdCard) {
    return travelers;
  }

  return travelers.concat(normalizeTravelers([], {
    name: record && (record.travelerName || record.orderContactName),
    idCard: legacyTravelerIdCard,
    phone: record && (record.travelerPhone || record.orderContactPhone)
  }));
}

function findTravelerAvailabilityConflictFromRecords(records, travelers, targetTravelPeriod) {
  const targetTravelers = Array.isArray(travelers) ? travelers : [];
  const targetEntries = targetTravelers
    .map((traveler) => ({
      traveler,
      keys: getTravelerAvailabilityKeys(traveler)
    }))
    .filter((entry) => entry.keys.size > 0);

  if (!targetEntries.length) {
    return null;
  }

  const paidStatuses = new Set(["paid", "traveling", "completed"]);
  const targetPeriod = normalizeTravelPeriod(targetTravelPeriod);

  for (const record of (Array.isArray(records) ? records : [])) {
    if (!paidStatuses.has(String(record && record.status ? record.status : "").trim())) {
      continue;
    }

    const existingPeriod = getTravelPeriod(record, buildServiceSnapshot(record));
    if (!hasTravelPeriodOverlap(targetPeriod, existingPeriod)) {
      continue;
    }

    const existingTravelers = getOrderTravelersForAvailability(record);
    for (const existingTraveler of existingTravelers) {
      const existingKeys = getTravelerAvailabilityKeys(existingTraveler);
      for (const targetEntry of targetEntries) {
        const hasMatchedKey = Array.from(targetEntry.keys).some((key) => existingKeys.has(key));
        if (hasMatchedKey) {
          return {
            traveler: targetEntry.traveler,
            order: record,
            travelPeriod: existingPeriod
          };
        }
      }
    }
  }

  return null;
}

async function listPaidOrderRecordsForAvailability() {
  const statuses = ["paid", "traveling", "completed"];
  const groups = await Promise.all(statuses.map((status) => listModelRecords(
    getOrderModel(),
    {
      where: {
        status: {
          $eq: status
        }
      },
      orderBy: [
        {
          createdAtTs: "desc"
        }
      ]
    }
  )));

  return groups.reduce((rows, group) => rows.concat(group), []);
}

async function assertTravelersAvailableForPeriod(travelers, targetTravelPeriod) {
  const records = await listPaidOrderRecordsForAvailability();
  const conflict = findTravelerAvailabilityConflictFromRecords(records, travelers, targetTravelPeriod);
  if (!conflict) {
    return;
  }

  const travelerName = normalizeText(conflict.traveler && conflict.traveler.name) || "该出行人";
  throw new Error(`${travelerName}在该时间段已经有下单的旅程，该订单无法提交`);
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
  const singleRoomSnapshot =
    serviceSnapshot && serviceSnapshot.singleRoom && typeof serviceSnapshot.singleRoom === "object"
      ? serviceSnapshot.singleRoom
      : {};
  const creatorSnapshot = parseJsonText(record.creatorSnapshotJson, {}) || {};
  const travelers = normalizeTravelers(parseJsonText(record.travelersJson, []), null);
  const primaryTraveler = travelers[0] || normalizeTravelerRecord(null);
  const travelPeriod = getTravelPeriod(record, serviceSnapshot);
  const amount = normalizeNumber(record.amountDec != null ? record.amountDec : record.amount, 0);
  const discount = normalizeNumber(record.discountDec != null ? record.discountDec : record.discount, 0);
  const payable = normalizeNumber(record.payableDec != null ? record.payableDec : record.payable, amount - discount);
  const createdAtTs = normalizeNumber(record.createdAtTs || record.createdAt, Date.now());
  const payExpireAtTs = getOrderPaymentExpireAtTs(record);

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
    orderContactName: record.orderContactName || record.travelerName || "",
    orderContactPhone: record.orderContactPhone || record.travelerPhone || "",
    contactName: record.orderContactName || record.travelerName || "",
    contactPhone: record.orderContactPhone || record.travelerPhone || "",
    emergencyContactName: record.emergencyContactName || record.orderContactName || record.travelerName || "",
    emergencyContactPhone: record.emergencyContactPhone || record.orderContactPhone || record.travelerPhone || "",
    contact: {
      name: record.orderContactName || record.travelerName || "",
      phone: record.orderContactPhone || record.travelerPhone || "",
      emergencyName: record.emergencyContactName || record.orderContactName || record.travelerName || "",
      emergencyPhone: record.emergencyContactPhone || record.orderContactPhone || record.travelerPhone || ""
    },
    roomingMode:
      normalizeRoomingMode(record.roomingMode || (singleRoomSnapshot.requested ? "singleRoomRequest" : "random")),
    roommateName: String(record.roommateName || "").trim(),
    roomType: normalizeRoomType(record.roomType),
    singleRoomPrice: Math.max(0, normalizeNumber(record.singleRoomPriceDec != null ? record.singleRoomPriceDec : (record.singleRoomPrice || singleRoomSnapshot.price), 0)),
    singleRoomStatus: String(record.singleRoomStatus || singleRoomSnapshot.status || "").trim(),
    singleRoomNotice: String(record.singleRoomNotice || singleRoomSnapshot.notice || "").trim(),
    allergyNotes: String(record.allergyNotes || "").trim(),
    couponId: normalizeCouponId(record.couponId),
    couponSnapshot: parseJsonText(record.couponSnapshotJson, {}) || {},
    traveler: primaryTraveler,
    primaryTraveler,
    travelers,
    status: record.status || "pending",
    createdAt: formatDateTime(createdAtTs),
    createdAtTs,
    payExpireAtTs,
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

  const effectiveRecords = await Promise.all(records.map((record) =>
    autoCancelExpiredPendingOrder(record, "payment_expired", openid)
  ));

  return effectiveRecords.map(mapSqlOrder);
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
    const byPeriodCode = await findSingleRecord(getServicePeriodModel(), {
      where: {
        periodCode: {
          $eq: String(payload.periodCode).trim()
        }
      }
    });
    if (byPeriodCode) {
      return byPeriodCode;
    }
    // Some legacy clients may accidentally pass a non-periodCode identifier
    // (for example a document id). Fall through to date-based lookup.
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

function resolvePeriodStatus(periodRecord, remainingSeats) {
  const legacyStatus = typeof periodRecord === "string" ? periodRecord : "";
  const normalizedPeriodRecord = (
    periodRecord
    && typeof periodRecord === "object"
    && !Array.isArray(periodRecord)
  ) ? periodRecord : null;
  const currentStatus = String(
    normalizedPeriodRecord && normalizedPeriodRecord.status
      ? normalizedPeriodRecord.status
      : legacyStatus
  ).trim();
  const today = getShanghaiTodayDateString();
  const dateEnd = String(
    normalizedPeriodRecord && (normalizedPeriodRecord.dateEnd || normalizedPeriodRecord.dateStart)
      ? (normalizedPeriodRecord.dateEnd || normalizedPeriodRecord.dateStart)
      : ""
  ).trim();
  const dateStart = String(
    normalizedPeriodRecord && normalizedPeriodRecord.dateStart
      ? normalizedPeriodRecord.dateStart
      : ""
  ).trim();

  if (currentStatus === "inactive") {
    return "inactive";
  }

  if (dateEnd && today && dateEnd < today) {
    return "inactive";
  }

  if (remainingSeats <= 0) {
    return "soldout";
  }

  if ((dateStart && today && dateStart <= today) || currentStatus === "closed") {
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

    const currentStatus = resolvePeriodStatus(periodRecord, normalizeNumber(periodRecord.remainingSeats, 0));
    if (currentStatus === "inactive") {
      throw new Error("service period is inactive");
    }

    if (currentStatus === "closed") {
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
        status: resolvePeriodStatus(periodRecord, nextRemainingSeats)
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
        status: resolvePeriodStatus(periodRecord, nextRemainingSeats)
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
        status: resolvePeriodStatus(periodRecord, nextRemainingSeats)
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
        status: resolvePeriodStatus(periodRecord, nextRemainingSeats)
      });
    }
  }

  throw new Error("service period changed too frequently, please retry");
}

function buildOrderStatusUpdateData(nextStatus) {
  const now = Date.now();
  const updateData = {
    status: nextStatus,
    updatedAt: now
  };

  if (nextStatus === "paid") {
    updateData.paidAtTs = now;
  }

  if (nextStatus === "canceled") {
    updateData.canceledAtTs = now;
  }

  return updateData;
}

function isAllowedOrderTransition(currentStatus, nextStatus) {
  if (currentStatus === nextStatus) {
    return true;
  }

  if (nextStatus === "paid") {
    return currentStatus === "pending";
  }

  if (nextStatus === "canceled") {
    return ["pending", "paid", "traveling"].includes(currentStatus);
  }

  return true;
}

function resolveOrderSettlement(amount, settlementContext) {
  const normalizedAmount = Math.max(0, normalizeNumber(amount, 0));
  const context = settlementContext && typeof settlementContext === "object" ? settlementContext : {};
  const singleRoomPrice = Math.max(0, normalizeNumber(context.singleRoomPrice, 0));
  const totalAmount = normalizedAmount + singleRoomPrice;
  const couponId = normalizeCouponId(context.couponId);
  const couponRule = couponId ? SUPPORTED_COUPON_RULES[couponId] : null;
  let discount = 0;
  if (couponRule && totalAmount >= normalizeNumber(couponRule.threshold, 0)) {
    discount = Math.max(0, normalizeNumber(couponRule.amountOff, 0));
  }
  if (discount > totalAmount) {
    discount = totalAmount;
  }
  return {
    amount: totalAmount,
    discount,
    payable: totalAmount - discount,
    couponId
  };
}

async function findCouponAssetById(assetId) {
  const normalizedId = normalizeText(assetId);
  if (!normalizedId) {
    return null;
  }

  try {
    const result = await db.collection(COUPON_ASSETS_COLLECTION).doc(normalizedId).get();
    return result && result.data ? result.data : null;
  } catch (error) {
    return null;
  }
}

function isActivityCouponAssetUsable(asset, user, totalAmount, now = Date.now()) {
  if (!asset || !user) {
    return false;
  }
  const userId = normalizeText(user._id);
  const userOpenid = normalizeText(user.openid);
  const assetUserId = normalizeText(asset.userId);
  const assetOpenid = normalizeText(asset.userOpenid);
  const status = normalizeText(asset.status).toLowerCase();
  const expiresAt = normalizeNumber(asset.expiresAt, 0);
  const threshold = Math.max(0, normalizeNumber(asset.threshold, 0));

  return Boolean(
    status === "active"
    && (assetUserId === userId || assetOpenid === userOpenid)
    && (!expiresAt || expiresAt >= now)
    && totalAmount >= threshold
  );
}

function validateActivityCouponStack(assets) {
  const list = Array.isArray(assets) ? assets : [];
  if (!list.length) {
    return false;
  }
  if (list.length === 1) {
    return true;
  }
  if (list.length !== 2) {
    return false;
  }

  const stackGroups = new Set(list.map((item) => normalizeText(item && item.stackGroup)));
  const amounts = list.map((item) => Math.max(0, normalizeNumber(item && item.amount, 0))).sort((a, b) => a - b);
  return stackGroups.size === 1
    && stackGroups.has("share_referral_phase2")
    && amounts[0] === 50
    && amounts[1] === 100;
}

function buildActivityCouponStorageId(assets) {
  const list = Array.isArray(assets) ? assets : [];
  if (!list.length) {
    return "";
  }
  if (validateActivityCouponStack(list)) {
    return "share_referral_phase2_combo";
  }

  const couponType = normalizeText(list[0] && list[0].couponType);
  return truncateString(couponType || "share_referral_activity_coupon", 64);
}

function buildActivityCouponSnapshot(assets) {
  const list = Array.isArray(assets) ? assets : [];
  if (!list.length) {
    return {};
  }

  return {
    id: buildActivityCouponStorageId(list),
    title: list.length > 1 ? "野哉分享家新人券组合" : truncateString(list[0].title || "野哉分享家新人券", 32),
    threshold: Math.max(...list.map((item) => Math.max(0, normalizeNumber(item && item.threshold, 0)))),
    amountOff: list.reduce((total, item) => total + Math.max(0, normalizeNumber(item && item.amount, 0)), 0),
    couponTypes: list.map((item) => normalizeText(item && item.couponType)).filter(Boolean)
  };
}

async function resolveOrderSettlementForUser(amount, settlementContext) {
  const baseSettlement = resolveOrderSettlement(amount, settlementContext);
  const context = settlementContext && typeof settlementContext === "object" ? settlementContext : {};
  const rawCouponId = normalizeCouponSelectionId(context.couponId);
  if (!rawCouponId || baseSettlement.couponId) {
    return Object.assign({}, baseSettlement, {
      couponAssetIds: [],
      couponSnapshot: baseSettlement.couponId ? normalizeCouponSnapshot(context.couponSnapshot || { id: baseSettlement.couponId }) : {}
    });
  }

  const couponAssetIds = splitCouponSelectionIds(rawCouponId);
  if (!couponAssetIds.length) {
    return Object.assign({}, baseSettlement, {
      couponAssetIds: [],
      couponSnapshot: {}
    });
  }

  const user = await findUserDocByOpenid(context.userOpenid);
  if (!user) {
    throw new Error("请先登录后再使用活动券");
  }

  const assets = [];
  for (const assetId of couponAssetIds) {
    const asset = await findCouponAssetById(assetId);
    if (!asset) {
      throw new Error("优惠券不可用");
    }
    assets.push(asset);
  }

  const uniqueAssetIds = new Set(assets.map((item) => normalizeText(item && item._id)));
  if (uniqueAssetIds.size !== assets.length) {
    throw new Error("优惠券不可重复选择");
  }

  const now = Date.now();
  const usable = assets.every((asset) => isActivityCouponAssetUsable(asset, user, baseSettlement.amount, now));
  if (!usable) {
    throw new Error("优惠券不可用或未达到使用门槛");
  }
  if (!validateActivityCouponStack(assets)) {
    throw new Error("所选优惠券不可叠加使用");
  }

  const discount = Math.min(
    baseSettlement.amount,
    assets.reduce((total, item) => total + Math.max(0, normalizeNumber(item && item.amount, 0)), 0)
  );
  const couponSnapshot = buildActivityCouponSnapshot(assets);

  return {
    amount: baseSettlement.amount,
    discount,
    payable: baseSettlement.amount - discount,
    couponId: couponSnapshot.id,
    couponAssetIds: Array.from(uniqueAssetIds),
    couponSnapshot
  };
}

async function updateCouponAssetsUsage(couponAssetIds, orderNo, status) {
  const ids = Array.isArray(couponAssetIds) ? couponAssetIds.map(normalizeText).filter(Boolean) : [];
  if (!ids.length) {
    return;
  }

  const now = Date.now();
  await Promise.all(ids.map((id) => db.collection(COUPON_ASSETS_COLLECTION).doc(id).update({
    data: status === "used"
      ? {
          status: "used",
          usedOrderNo: normalizeText(orderNo),
          usedAt: now,
          updatedAt: now
        }
      : {
          status: "active",
          usedOrderNo: "",
          usedAt: 0,
          updatedAt: now
      }
  })));
}

async function findCouponAssetIdsByUsedOrderNo(orderNo) {
  const normalizedOrderNo = normalizeText(orderNo);
  if (!normalizedOrderNo) {
    return [];
  }

  try {
    const result = await db.collection(COUPON_ASSETS_COLLECTION)
      .where({ usedOrderNo: normalizedOrderNo })
      .limit(20)
      .get();
    return (result && Array.isArray(result.data) ? result.data : [])
      .map((item) => normalizeText(item && item._id))
      .filter(Boolean);
  } catch (error) {
    console.error("Failed to find coupon assets by used order", {
      orderNo: normalizedOrderNo,
      error
    });
    return [];
  }
}

function shouldRestoreSeatsForOrderStatus(status) {
  return status === "pending" || status === "paid" || status === "traveling";
}

function getOrderPaymentExpireAtTs(orderRecord) {
  const explicitExpireAt = normalizeNumber(orderRecord && orderRecord.payExpireAtTs, 0);
  if (explicitExpireAt > 0) {
    return explicitExpireAt;
  }

  const createdAtTs = normalizeNumber(
    orderRecord && (orderRecord.createdAtTs || orderRecord.createdAt),
    0
  );
  return createdAtTs > 0 ? createdAtTs + ORDER_PAYMENT_EXPIRE_MS : 0;
}

function isPendingOrderPaymentExpired(orderRecord, now = Date.now()) {
  if (!orderRecord || orderRecord.status !== "pending") {
    return false;
  }

  const expireAtTs = getOrderPaymentExpireAtTs(orderRecord);
  return expireAtTs > 0 && expireAtTs <= now;
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

async function restoreOrderResourcesAfterCancellation(orderRecord) {
  if (
    orderRecord.servicePeriodCode
    && shouldRestoreSeatsForOrderStatus(orderRecord.status)
  ) {
    const periodRecord = await findSingleRecord(getServicePeriodModel(), {
      where: {
        periodCode: {
          $eq: orderRecord.servicePeriodCode
        }
      }
    });

    if (!periodRecord) {
      throw new Error("service period not found");
    }

    await restoreServicePeriodSeats(periodRecord._id, normalizePositiveInteger(orderRecord.peopleCount));
  }

  try {
    const couponAssetIds = await findCouponAssetIdsByUsedOrderNo(orderRecord.orderNo);
    await updateCouponAssetsUsage(
      couponAssetIds.length ? couponAssetIds : splitCouponSelectionIds(orderRecord.couponId),
      orderRecord.orderNo,
      "active"
    );
  } catch (error) {
    console.error("Failed to restore coupon assets after order cancellation", {
      orderNo: orderRecord.orderNo,
      error
    });
  }
}

async function cancelOrderRecord(orderRecord, source, userOpenid) {
  const updatedOrder = await transitionOrderStatus(orderRecord, "canceled");
  if (!updatedOrder) {
    return null;
  }

  try {
    await restoreOrderResourcesAfterCancellation(orderRecord);
  } catch (error) {
    await rollbackCanceledOrderStatus(orderRecord);
    throw error;
  }

  await appendOrderStatusEvent({
    orderNo: updatedOrder.orderNo || orderRecord.orderNo,
    userOpenid: userOpenid || orderRecord.userOpenid,
    status: "canceled",
    fromStatus: orderRecord.status,
    source: source || "status_change"
  });

  return updatedOrder;
}

async function autoCancelExpiredPendingOrder(orderRecord, source, userOpenid) {
  if (!isPendingOrderPaymentExpired(orderRecord)) {
    return orderRecord;
  }

  const canceledOrder = await cancelOrderRecord(orderRecord, source || "payment_expired", userOpenid || orderRecord.userOpenid);
  return canceledOrder || Object.assign({}, orderRecord, { status: "canceled" });
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

  return mapSqlOrder(await autoCancelExpiredPendingOrder(record, "payment_expired", openid));
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
  if (peopleCount > MAX_ORDER_PEOPLE_COUNT) {
    throw new Error("peopleCount exceeds max allowed");
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

  const orderExtras = buildOrderExtras(payload);
  const orderContact = normalizeOrderContact(payload);
  const emergencyContact = normalizeEmergencyContact(payload);
  const travelers = normalizeTravelers(payload.travelers, payload.traveler, {
    inferDocumentType: false
  });
  const participantError = validateOrderParticipants({
    travelers,
    orderContact,
    emergencyContact,
    peopleCount
  });
  if (participantError) {
    throw new Error(participantError);
  }
  const targetTravelPeriod = normalizeTravelPeriod({
    dateStart: periodRecord.dateStart || requestedTravelPeriod.dateStart,
    dateEnd: periodRecord.dateEnd || requestedTravelPeriod.dateEnd || periodRecord.dateStart || requestedTravelPeriod.dateStart
  });
  await assertTravelersAvailableForPeriod(travelers, targetTravelPeriod);

  const settlement = await resolveOrderSettlementForUser(unitPrice * peopleCount, {
    couponId: orderExtras.couponId,
    couponSnapshot: orderExtras.couponSnapshot,
    singleRoomPrice: orderExtras.singleRoomPrice,
    peopleCount,
    userOpenid: openid
  });
  const amount = settlement.amount;
  const discount = settlement.discount;
  const payable = settlement.payable;
  const timestamp = Date.now();
  const payExpireAtTs = timestamp + ORDER_PAYMENT_EXPIRE_MS;
  const orderNo = createOrderNo(timestamp);
  const orderRecordId = createSqlRecordId("order");
  const shortId = String(orderNo).slice(-4);
  const createdAtText = formatDateTime(timestamp);
  const serviceSnapshot = payload.serviceSnapshot || {};
  const creatorSnapshot = payload.creatorSnapshot || {};
  const orderServiceSnapshot = buildOrderServiceSnapshot({
    payload,
    periodRecord,
    requestedTravelPeriod,
    serviceSnapshot,
    contact: orderContact,
    travelers,
    orderExtras
  });
  const travelDateStart = orderServiceSnapshot.travelPeriod.dateStart;
  const travelDateEnd = orderServiceSnapshot.travelPeriod.dateEnd;
  const orderData = {
    _id: orderRecordId,
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
    orderContactName: String(orderContact.name || "").trim(),
    orderContactPhone: String(orderContact.phone || "").trim(),
    travelerName: String(orderContact.name || "").trim(),
    travelerPhone: String(orderContact.phone || "").trim(),
    emergencyContactName: String(emergencyContact.name || orderExtras.emergencyContactName || "").trim(),
    emergencyContactPhone: String(emergencyContact.phone || orderExtras.emergencyContactPhone || "").trim(),
    roomingMode: normalizeRoomingMode(orderExtras.roomingMode),
    roommateName: String(orderExtras.roommateName || "").trim(),
    roomType: normalizeRoomType(orderExtras.roomType),
    singleRoomPrice: Math.max(0, normalizeNumber(orderExtras.singleRoomPrice, 0)),
    singleRoomPriceDec: Math.max(0, normalizeNumber(orderExtras.singleRoomPrice, 0)),
    singleRoomStatus: String(orderExtras.singleRoomStatus || "").trim(),
    singleRoomNotice: String(orderExtras.singleRoomNotice || "").trim(),
    allergyNotes: String(orderExtras.allergyNotes || "").trim(),
    couponId: settlement.couponId || "",
    couponSnapshotJson: stringifyJsonWithMaxLength(
      settlement.couponSnapshot && Object.keys(settlement.couponSnapshot).length
        ? settlement.couponSnapshot
        : {
            ...orderExtras.couponSnapshot,
            id: settlement.couponId || ""
          },
      240
    ),
    travelersJson: buildPersistedTravelers(travelers, 4096),
    serviceSnapshotJson: stringifyJsonWithMaxLength(buildPersistedServiceSnapshot(orderServiceSnapshot), 240),
    creatorSnapshotJson: stringifyJsonWithMaxLength(buildPersistedCreatorSnapshot(creatorSnapshot), 240),
    status: "pending",
    payExpireAtTs,
    createdAt: timestamp,
    createdAtText,
    createdAtTs: timestamp,
    updatedAt: timestamp,
    createBy: openid,
    updateBy: openid,
    owner: openid,
    _openid: openid
  };

  await reserveServicePeriodSeats(periodRecord._id, peopleCount);

  let persistedOrderData = orderData;
  try {
    await updateCouponAssetsUsage(settlement.couponAssetIds, orderNo, "used");
    const { insertedData, removedColumns } = await insertOrderRecordWithCompatibility(orderData);
    persistedOrderData = insertedData;
    if (removedColumns.length) {
      console.warn("Dropped unsupported TravelOrder columns during createOrder insert", {
        removedColumns
      });
    }
    await appendOrderStatusEvent({
      orderNo,
      userOpenid: openid,
      status: "pending",
      occurredAtTs: timestamp,
      source: "create"
    });
  } catch (error) {
    let restoreSucceeded = false;

    try {
      await restoreServicePeriodSeats(periodRecord._id, peopleCount);
      await updateCouponAssetsUsage(settlement.couponAssetIds, orderNo, "active");
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
      persistedOrderData
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

  const effectiveTargetRecord = await autoCancelExpiredPendingOrder(targetRecord, "payment_expired", openid);
  if (!effectiveTargetRecord || effectiveTargetRecord.status === "canceled") {
    return mapSqlOrder(effectiveTargetRecord);
  }

  if (effectiveTargetRecord.status === nextStatus) {
    return mapSqlOrder(effectiveTargetRecord);
  }

  if (!isAllowedOrderTransition(effectiveTargetRecord.status, nextStatus)) {
    throw new Error("current order status does not allow transition");
  }

  const updatedOrder = nextStatus === "canceled"
    ? await cancelOrderRecord(effectiveTargetRecord, "status_change", openid)
    : await transitionOrderStatus(effectiveTargetRecord, nextStatus);
  if (!updatedOrder) {
    return null;
  }

  if (nextStatus !== "canceled") {
    await appendOrderStatusEvent({
      orderNo: updatedOrder.orderNo || effectiveTargetRecord.orderNo,
      userOpenid: openid,
      status: nextStatus,
      fromStatus: effectiveTargetRecord.status,
      source: "status_change"
    });
  }

  if (nextStatus === "completed") {
    try {
      await syncShareReferralRewardForCompletedOrder(updatedOrder);
    } catch (error) {
      console.error("Failed to sync share referral reward after order completion", {
        orderNo: updatedOrder && updatedOrder.orderNo,
        error
      });
    }
  }

  return updatedOrder;
}

async function payOrder(orderId) {
  if (!ENABLE_CLIENT_PAY_ORDER) {
    throw new Error("payOrder is disabled");
  }

  return updateOrderStatus(orderId, "paid");
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
  const [rawCreators, rawDestinations, rawServices, rawIdeas, sqlPeriods] = await Promise.all([
    listCollection(CONTENT_COLLECTIONS.creators),
    listCollection(CONTENT_COLLECTIONS.destinations),
    listCollection(CONTENT_COLLECTIONS.services),
    listCollection(CONTENT_COLLECTIONS.ideas),
    listAllSqlServicePeriods()
  ]);
  const periodMap = groupSqlPeriodsByServiceSlug(sqlPeriods);
  const creators = rawCreators.map(buildFavoriteCreator);
  const services = rawServices.map((service) => buildFavoriteService(service, creators, periodMap));
  const destinations = rawDestinations.map((destination) => buildFavoriteDestination(destination, creators, services));
  const ideas = rawIdeas.map((idea) => buildFavoriteIdea(idea, creators));

  return {
    favoriteDestinations: destinations.filter((item) => state.destinations[item.slug]),
    favoriteCreators: creators.filter((item) => state.creators[item.slug]),
    favoriteServices: services.filter((item) => state.services[item.slug]),
    favoriteIdeas: ideas.filter((item) => state.ideas[item.slug])
  };
}

const handlers = {
  getOrders: (payload) => getOrders(payload.statusKey),
  getRecentOrders: (payload) => getRecentOrders(payload.limit),
  getOrderById: (payload) => getOrderById(payload.orderId),
  createOrder: (payload) => createOrder(payload),
  cancelOrder: (payload) => updateOrderStatus(payload.orderId, "canceled"),
  payOrder: (payload) => payOrder(payload.orderId),
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

exports.__test__ = {
  attachServicePeriodSummary,
  buildFavoriteCreator,
  buildFavoriteDestination,
  buildFavoriteIdea,
  buildFavoriteService,
  createOrder,
  buildOrderServiceSnapshot,
  buildOrderStatusUpdateData,
  buildPersistedTravelers,
  buildServiceSnapshot,
  createSqlRecordId,
  filterOrdersByStatus,
  getTravelPeriod,
  findTravelerAvailabilityConflictFromRecords,
  getTravelerAvailabilityKeys,
  hasTravelPeriodOverlap,
  mapSqlOrder,
  normalizeEmergencyContact,
  normalizeOrderContact,
  normalizeTravelers,
  isAllowedOrderTransition,
  resolveOrderSettlementForUser,
  resolveOrderSettlement,
  resolvePeriodStatus,
  buildActivityCouponStorageId,
  buildShareReferralRewardLedger,
  findCouponAssetIdsByUsedOrderNo,
  shouldRestoreSeatsForOrderStatus,
  syncShareReferralRewardForCompletedOrder,
  validateOrderParticipants
};
