const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const USERS_COLLECTION = "users";
const CONFIG_COLLECTION = "app_configs";
const REFERRAL_CODES_COLLECTION = "referral_codes";
const REFERRAL_SCAN_EVENTS_COLLECTION = "referral_scan_events";
const REFERRAL_RELATIONS_COLLECTION = "referral_relations";
const COUPON_ASSETS_COLLECTION = "user_coupon_assets";
const CASH_REWARD_LEDGERS_COLLECTION = "cash_reward_ledgers";
const PAYOUT_ACCOUNTS_COLLECTION = "payout_accounts";
const DEFAULT_MEMBER_LABEL = "野哉会员";
const DEFAULT_NICKNAME = "旅人";
const CAMPAIGN_CONFIG_KEY = "shareReferralCampaign";
const REFERRAL_CODE_LENGTH = 8;
const REFERRAL_CODE_RETRY_LIMIT = 8;
const ACTIVE_RELATION_STATUS = "active";
const BACKFILL_BATCH_SIZE = 100;
const SHARE_REFERRAL_PAGE = "pkg/activity/share-referral/index";
const REFERRAL_QR_CODE_PREFIX = "share-referral/qrcodes";

const DEFAULT_CAMPAIGN_CONFIG = {
  campaignKey: "yezai_share_referral",
  campaignName: "野哉分享家",
  phase: "phase1",
  status: "active",
  couponThreshold: 1000,
  couponExpireDays: 365,
  cashRewardAmount: 100,
  monthlySettlementDay: 20,
  testingRollout: {
    allowExistingUsersAsNew: true
  },
  phase1: {
    welcomeAmount: 150
  },
  phase2: {
    directWelcomeAmount: 100,
    scanBonusAmount: 50
  },
  copywriting: {
    invalidSelf: "不能扫描自己的分享码",
    duplicateJoin: "你已参与过本次活动",
    duplicateJoinDesc: "你已参与过本次活动过，本次扫码没有新增优惠券",
    duplicateMax: "你已经拿到最高新人优惠券金额了～",
    invalidOldUser: "本活动仅限新用户领取",
    invalidCode: "这个分享码暂时不可用，请换一个试试",
    awarded: "新人券已存入券包",
    firstAwardIntro: "恭喜获得150元优惠券，可以在价格超过1000元的路线上叠加使用！",
    phase2DirectAwardIntro: "恭喜获得100元优惠券，可以在价格超过1000元的路线上使用！",
    bonusUpgradeIntro: "恭喜获得额外50元的优惠券，可以在价格超过1000元的路线上使用！",
    idle: "欢迎来到野哉分享家"
  }
};

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isPlainObject(value) {
  return Boolean(value) && Object.prototype.toString.call(value) === "[object Object]";
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

function formatDate(ts) {
  const targetTs = normalizeNumber(ts, 0);
  if (!targetTs) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(targetTs)).replace(/\//g, "-");
}

function formatDateTime(ts) {
  const targetTs = normalizeNumber(ts, 0);
  if (!targetTs) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(targetTs)).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function maskName(value) {
  const source = normalizeText(value);
  if (!source) {
    return "";
  }
  if (source.length <= 1) {
    return `${source}*`;
  }
  return `${source.slice(0, 1)}${"*".repeat(Math.max(1, source.length - 1))}`;
}

function maskPhone(value) {
  const source = normalizeText(value).replace(/\s+/g, "");
  if (!source) {
    return "";
  }
  if (/^1\d{10}$/.test(source)) {
    return `${source.slice(0, 3)}****${source.slice(-4)}`;
  }
  if (source.length <= 4) {
    return `${source.slice(0, 1)}***`;
  }
  return `${source.slice(0, 2)}****${source.slice(-2)}`;
}

function maskBankAccount(value) {
  const source = normalizeText(value).replace(/\s+/g, "");
  if (!source) {
    return "";
  }
  const suffix = source.slice(-4);
  return `${"*".repeat(Math.max(0, source.length - suffix.length))}${suffix}`;
}

async function getStoredCampaignConfig() {
  try {
    const result = await db.collection(CONFIG_COLLECTION).where({ key: CAMPAIGN_CONFIG_KEY }).limit(1).get();
    const doc = result && result.data && result.data.length ? result.data[0] : null;
    if (!doc) {
      return DEFAULT_CAMPAIGN_CONFIG;
    }
    const value = doc.value && isPlainObject(doc.value) ? doc.value : doc;
    return deepMerge(DEFAULT_CAMPAIGN_CONFIG, value || {});
  } catch (error) {
    console.error("Failed to load share referral campaign config", error);
    return DEFAULT_CAMPAIGN_CONFIG;
  }
}

function mapUserForClient(doc) {
  if (!doc) {
    return null;
  }

  return {
    id: normalizeText(doc._id),
    nickname: normalizeText(doc.nickname) || DEFAULT_NICKNAME,
    avatarUrl: normalizeText(doc.avatarUrl),
    memberLabel: normalizeText(doc.memberLabel) || DEFAULT_MEMBER_LABEL,
    role: normalizeText(doc.role) || "user",
    profileConfigured: Boolean(doc.profileConfigured),
    travelerCount: Number(doc.travelerCount) || 0,
    effectiveOrderCount: Number(doc.effectiveOrderCount) || 0,
    effectiveRouteCount: Number(doc.effectiveRouteCount) || 0,
    lastTravelAt: Number(doc.lastTravelAt) || 0
  };
}

async function findUserByOpenId(openid) {
  const result = await db.collection(USERS_COLLECTION).where({ openid }).limit(1).get();
  return result && result.data && result.data.length ? result.data[0] : null;
}

async function findUserById(userId) {
  const normalizedUserId = normalizeText(userId);
  if (!normalizedUserId) {
    return null;
  }

  const result = await db.collection(USERS_COLLECTION).where({ _id: normalizedUserId }).limit(1).get();
  return result && result.data && result.data.length ? result.data[0] : null;
}

async function ensureCurrentUserDoc() {
  const { OPENID } = cloud.getWXContext();
  let user = await findUserByOpenId(OPENID);

  if (user) {
    return user;
  }

  const now = Date.now();
  const createResult = await db.collection(USERS_COLLECTION).add({
    data: {
      openid: OPENID,
      role: "user",
      nickname: DEFAULT_NICKNAME,
      avatarUrl: "",
      memberLabel: DEFAULT_MEMBER_LABEL,
      profileConfigured: false,
      profileCompletedAt: null,
      travelerCount: 0,
      effectiveOrderCount: 0,
      effectiveRouteCount: 0,
      lastTravelAt: 0,
      createdAt: now,
      updatedAt: now
    }
  });

  user = await findUserByOpenId(OPENID);
  if (user) {
    return user;
  }

  return {
    _id: createResult && createResult._id ? createResult._id : "",
    openid: OPENID,
    role: "user",
    nickname: DEFAULT_NICKNAME,
    avatarUrl: "",
    memberLabel: DEFAULT_MEMBER_LABEL,
    profileConfigured: false,
    profileCompletedAt: null,
    travelerCount: 0,
    effectiveOrderCount: 0,
    effectiveRouteCount: 0,
    lastTravelAt: 0,
    createdAt: now,
    updatedAt: now
  };
}

function createReferralCode() {
  return Math.random().toString(36).slice(2, 2 + REFERRAL_CODE_LENGTH).toUpperCase();
}

function buildShareScene(referralCode) {
  const code = normalizeText(referralCode).toUpperCase();
  return code ? `ref=${code}` : "";
}

function buildSharePath(referralCode) {
  const code = normalizeText(referralCode).toUpperCase();
  return code ? `/${SHARE_REFERRAL_PAGE}?ref=${encodeURIComponent(code)}` : `/${SHARE_REFERRAL_PAGE}`;
}

function normalizeCloudPathSegment(value) {
  return normalizeText(value).replace(/[^a-zA-Z0-9_-]+/g, "_") || "unknown";
}

function buildReferralQrCodeCloudPath(codeDoc, referralCode) {
  const code = normalizeText(referralCode).toUpperCase();
  const owner = normalizeCloudPathSegment(
    codeDoc && (codeDoc.userId || codeDoc.userOpenid || codeDoc._id || code)
  );
  return `${REFERRAL_QR_CODE_PREFIX}/${owner}-${normalizeCloudPathSegment(code)}.jpg`;
}

function buildSharePayload(referralCode, qrCodeInfo) {
  const code = normalizeText(referralCode).toUpperCase();
  const qrInfo = qrCodeInfo && typeof qrCodeInfo === "object" ? qrCodeInfo : {};
  return {
    ownReferralCode: code,
    shareScene: buildShareScene(code),
    sharePath: buildSharePath(code),
    shareQrCodeFileID: normalizeText(qrInfo.fileID || qrInfo.qrCodeFileID),
    shareQrCodeCloudPath: normalizeText(qrInfo.cloudPath || qrInfo.qrCodeCloudPath),
    shareQrCodeUpdatedAt: normalizeNumber(qrInfo.updatedAt || qrInfo.qrCodeUpdatedAt, 0)
  };
}

async function ensureReferralQrCodeForCodeDoc(codeDoc) {
  const referralCode = normalizeText(codeDoc && codeDoc.referralCode).toUpperCase();
  if (!referralCode) {
    return buildSharePayload("", {});
  }

  const scene = buildShareScene(referralCode);
  const cachedFileID = normalizeText(codeDoc && codeDoc.qrCodeFileID);
  if (cachedFileID && normalizeText(codeDoc && codeDoc.qrCodeScene) === scene) {
    return buildSharePayload(referralCode, {
      fileID: cachedFileID,
      cloudPath: normalizeText(codeDoc && codeDoc.qrCodeCloudPath),
      updatedAt: normalizeNumber(codeDoc && codeDoc.qrCodeUpdatedAt, 0)
    });
  }

  if (
    !cloud.openapi
    || !cloud.openapi.wxacode
    || typeof cloud.openapi.wxacode.getUnlimited !== "function"
    || typeof cloud.uploadFile !== "function"
  ) {
    return buildSharePayload(referralCode, {});
  }

  const cloudPath = buildReferralQrCodeCloudPath(codeDoc, referralCode);
  const wxacodeResult = await cloud.openapi.wxacode.getUnlimited({
    scene,
    page: SHARE_REFERRAL_PAGE,
    checkPath: false,
    envVersion: "trial"
  });
  const fileContent = wxacodeResult && wxacodeResult.buffer ? wxacodeResult.buffer : wxacodeResult;
  if (!fileContent) {
    throw new Error("生成分享二维码失败");
  }

  const uploadResult = await cloud.uploadFile({
    cloudPath,
    fileContent
  });
  const fileID = normalizeText(uploadResult && uploadResult.fileID);
  if (!fileID) {
    throw new Error("保存分享二维码失败");
  }

  const updatedAt = Date.now();
  if (normalizeText(codeDoc && codeDoc._id)) {
    await db.collection(REFERRAL_CODES_COLLECTION).doc(codeDoc._id).update({
      data: {
        qrCodeFileID: fileID,
        qrCodeCloudPath: cloudPath,
        qrCodeScene: scene,
        qrCodePage: SHARE_REFERRAL_PAGE,
        qrCodeUpdatedAt: updatedAt,
        updatedAt
      }
    });
  }

  return buildSharePayload(referralCode, {
    fileID,
    cloudPath,
    updatedAt
  });
}

async function findReferralCodeDocByCode(referralCode) {
  const code = normalizeText(referralCode).toUpperCase();
  if (!code) {
    return null;
  }
  const result = await db.collection(REFERRAL_CODES_COLLECTION).where({ referralCode: code, status: "active" }).limit(1).get();
  return result && result.data && result.data.length ? result.data[0] : null;
}

async function ensureReferralCodeForUser(user) {
  const userId = normalizeText(user && user._id);
  if (!userId) {
    throw new Error("User record missing");
  }

  const existing = await db.collection(REFERRAL_CODES_COLLECTION).where({ userId, status: "active" }).limit(1).get();
  const existingDoc = existing && existing.data && existing.data.length ? existing.data[0] : null;
  if (existingDoc) {
    return existingDoc;
  }

  for (let attempt = 0; attempt < REFERRAL_CODE_RETRY_LIMIT; attempt += 1) {
    const referralCode = createReferralCode();
    const collisionDoc = await findReferralCodeDocByCode(referralCode);
    if (collisionDoc) {
      continue;
    }

    const now = Date.now();
    const createResult = await db.collection(REFERRAL_CODES_COLLECTION).add({
      data: {
        userId,
        userOpenid: normalizeText(user.openid),
        referralCode,
        status: "active",
        createdAt: now,
        updatedAt: now
      }
    });

    return {
      _id: createResult && createResult._id ? createResult._id : "",
      userId,
      userOpenid: normalizeText(user.openid),
      referralCode,
      status: "active",
      createdAt: now,
      updatedAt: now
    };
  }

  throw new Error("Failed to generate referral code");
}

function parseSceneValue(rawValue) {
  const source = decodeURIComponent(normalizeText(rawValue));
  if (!source) {
    return {};
  }

  const pairs = source.split("&");
  const result = {};
  pairs.forEach((entry) => {
    const [rawKey, ...rest] = entry.split("=");
    const key = normalizeText(rawKey);
    const value = normalizeText(rest.join("="));
    if (key) {
      result[key] = value;
    }
  });

  if (Object.keys(result).length) {
    return result;
  }

  return {
    ref: source
  };
}

function resolveReferralCode(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const directCode = normalizeText(
    source.referralCode
    || source.ref
    || source.code
    || source.inviteCode
  );

  if (directCode) {
    return directCode.toUpperCase();
  }

  const scenePayload = parseSceneValue(source.scene);
  return normalizeText(
    scenePayload.referralCode
    || scenePayload.ref
    || scenePayload.code
    || scenePayload.inviteCode
  ).toUpperCase();
}

async function listCouponAssetsForUser(userId, campaignKey) {
  const result = await db.collection(COUPON_ASSETS_COLLECTION)
    .where({
      userId,
      campaignKey,
      status: db.command.neq("revoked")
    })
    .limit(20)
    .get();
  return result && result.data ? result.data : [];
}

async function listRewardLedgersForInviter(inviterUserId, campaignKey) {
  const result = await db.collection(CASH_REWARD_LEDGERS_COLLECTION)
    .where({
      inviterUserId,
      campaignKey,
      status: db.command.neq("revoked")
    })
    .limit(50)
    .get();
  return result && result.data ? result.data : [];
}

async function findPayoutAccountByUserId(userId, campaignKey) {
  const result = await db.collection(PAYOUT_ACCOUNTS_COLLECTION)
    .where({
      userId,
      campaignKey
    })
    .limit(1)
    .get();
  return result && result.data && result.data.length ? result.data[0] : null;
}

function calculateGrantedCouponAmount(assets) {
  return (Array.isArray(assets) ? assets : []).reduce((total, item) => {
    const amount = Number(item && item.amount);
    return total + (Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0);
}

function resolveCouponStatus(asset, now = Date.now()) {
  const status = normalizeText(asset && asset.status).toLowerCase();
  const expiresAt = normalizeNumber(asset && asset.expiresAt, 0);

  if (status === "used") {
    return "used";
  }

  if (status === "revoked") {
    return "revoked";
  }

  if (status === "expired" || (expiresAt && expiresAt < now)) {
    return "expired";
  }

  return "active";
}

function getCouponStatusLabel(status) {
  if (status === "used") {
    return "已使用";
  }
  if (status === "expired") {
    return "已过期";
  }
  if (status === "revoked") {
    return "已失效";
  }
  return "待使用";
}

function mapCouponAssetForClient(asset, now = Date.now()) {
  const resolvedStatus = resolveCouponStatus(asset, now);
  return {
    id: normalizeText(asset && asset._id),
    couponType: normalizeText(asset && asset.couponType),
    title: normalizeText(asset && asset.title) || "野哉分享家活动券",
    amount: normalizeNumber(asset && asset.amount, 0),
    threshold: normalizeNumber(asset && asset.threshold, 0),
    status: resolvedStatus,
    statusLabel: getCouponStatusLabel(resolvedStatus),
    grantedAt: normalizeNumber(asset && asset.grantedAt, 0),
    grantedAtText: formatDate(asset && asset.grantedAt),
    expiresAt: normalizeNumber(asset && asset.expiresAt, 0),
    expiresAtText: formatDate(asset && asset.expiresAt)
  };
}

function summarizeCouponAssets(assets, now = Date.now()) {
  const mappedAssets = (Array.isArray(assets) ? assets : []).map((item) => mapCouponAssetForClient(item, now));
  const summary = mappedAssets.reduce((result, item) => {
    if (item.status === "active") {
      result.activeCount += 1;
    } else if (item.status === "used") {
      result.usedCount += 1;
    } else if (item.status === "expired") {
      result.expiredCount += 1;
    }
    result.totalAmount += item.amount;
    return result;
  }, {
    activeCount: 0,
    usedCount: 0,
    expiredCount: 0,
    totalAmount: 0
  });

  return Object.assign(summary, {
    summaryText: summary.activeCount ? `${summary.activeCount} 张可用券` : "暂无可用券",
    items: mappedAssets.sort((left, right) => normalizeNumber(right.grantedAt, 0) - normalizeNumber(left.grantedAt, 0))
  });
}

function getRewardStatusLabel(status) {
  switch (normalizeText(status).toLowerCase()) {
    case "earned":
      return "已记账";
    case "under_review":
    case "payable":
      return "待打款";
    case "batched":
      return "批次已锁定";
    case "paid":
      return "已发放";
    case "failed":
      return "发放失败";
    case "reversed":
      return "已冲正";
    case "awaiting_account":
    default:
      return "待补收款信息";
  }
}

function getPayoutAccountStatusLabel(status) {
  switch (normalizeText(status).toLowerCase()) {
    case "under_review":
    case "payable":
      return "可打款";
    case "rejected":
      return "已退回";
    case "batched":
      return "批次已锁定";
    case "paid":
      return "已打款";
    case "failed":
      return "待修正";
    case "awaiting_account":
    default:
      return "待补收款信息";
  }
}

function normalizePayoutAccountStatus(status) {
  const normalized = normalizeText(status).toLowerCase();
  if (normalized === "under_review") {
    return "payable";
  }
  return normalized || "awaiting_account";
}

function mapPayoutAccountSummaryForClient(item) {
  if (!item) {
    return null;
  }

  const status = normalizePayoutAccountStatus(item.status);
  return {
    accountId: normalizeText(item._id),
    status,
    statusLabel: getPayoutAccountStatusLabel(status),
    accountNameMasked: maskName(item.accountName),
    phoneMasked: maskPhone(item.phone),
    bankName: normalizeText(item.bankName),
    bankAccountMasked: maskBankAccount(item.bankAccountNo),
    rejectionReason: normalizeText(item.rejectionReason),
    submittedAt: normalizeNumber(item.submittedAt, 0),
    submittedAtText: formatDate(item.submittedAt),
    updatedAt: normalizeNumber(item.updatedAt, 0),
    updatedAtText: formatDate(item.updatedAt)
  };
}

function mapPayoutAccountDetailForOwner(item) {
  if (!item) {
    return null;
  }

  const status = normalizePayoutAccountStatus(item.status);
  return {
    accountId: normalizeText(item._id),
    status,
    statusLabel: getPayoutAccountStatusLabel(status),
    accountName: normalizeText(item.accountName),
    phone: normalizeText(item.phone),
    bankName: normalizeText(item.bankName),
    bankAccountNo: normalizeText(item.bankAccountNo),
    idNumberLast4: normalizeText(item.idNumberLast4),
    rejectionReason: normalizeText(item.rejectionReason),
    submittedAt: normalizeNumber(item.submittedAt, 0),
    submittedAtText: formatDate(item.submittedAt),
    reviewedAt: normalizeNumber(item.reviewedAt, 0),
    reviewedAtText: formatDate(item.reviewedAt),
    updatedAt: normalizeNumber(item.updatedAt, 0),
    updatedAtText: formatDate(item.updatedAt),
    bankAccountMasked: maskBankAccount(item.bankAccountNo),
    phoneMasked: maskPhone(item.phone)
  };
}

function normalizePayoutAccountPayload(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  return {
    accountName: normalizeText(source.accountName),
    phone: normalizeText(source.phone).replace(/\s+/g, ""),
    bankName: normalizeText(source.bankName),
    bankAccountNo: normalizeText(source.bankAccountNo).replace(/\s+/g, ""),
    idNumberLast4: normalizeText(source.idNumberLast4).toUpperCase()
  };
}

function validatePayoutAccountPayload(payload) {
  const normalized = normalizePayoutAccountPayload(payload);
  if (!normalized.accountName) {
    throw new Error("请填写收款人姓名");
  }
  if (!/^1\d{10}$/.test(normalized.phone)) {
    throw new Error("请填写 11 位收款手机号");
  }
  if (!normalized.bankName) {
    throw new Error("请填写收款银行");
  }
  if (!/^\d{10,30}$/.test(normalized.bankAccountNo)) {
    throw new Error("请填写正确的银行卡号");
  }
  if (normalized.idNumberLast4 && !/^[0-9A-Z]{4}$/.test(normalized.idNumberLast4)) {
    throw new Error("证件后四位格式不正确");
  }
  return normalized;
}

function isPendingRewardStatus(status) {
  return ["awaiting_account", "earned", "under_review", "payable", "batched"].includes(normalizeText(status).toLowerCase());
}

function mapRewardLedgerForClient(item) {
  const status = normalizeText(item && item.status).toLowerCase() || "awaiting_account";
  const rewardAmount = normalizeNumber(item && (item.rewardAmount || item.netAmount), 0);
  return {
    id: normalizeText(item && item._id),
    status,
    statusLabel: getRewardStatusLabel(status),
    rewardAmount,
    sourceOrderNo: normalizeText(item && item.sourceOrderNo),
    serviceName: normalizeText(item && item.serviceName),
    settlementMonth: normalizeText(item && item.settlementMonth),
    earnedAt: normalizeNumber(item && item.earnedAt, 0),
    earnedAtText: formatDate(item && item.earnedAt),
    giftOpenedAt: normalizeNumber(item && item.giftOpenedAt, 0)
  };
}

function summarizeRewardLedgers(items) {
  const mappedItems = (Array.isArray(items) ? items : []).map((item) => mapRewardLedgerForClient(item));
  const summary = mappedItems.reduce((result, item) => {
    result.totalAmount += item.rewardAmount;
    if (isPendingRewardStatus(item.status)) {
      result.pendingCount += 1;
    }
    if (item.status === "paid") {
      result.paidCount += 1;
    }
    return result;
  }, {
    totalAmount: 0,
    pendingCount: 0,
    paidCount: 0
  });

  return Object.assign(summary, {
    summaryText: summary.totalAmount
      ? `累计 ${summary.totalAmount} 元 · ${summary.pendingCount} 笔待处理`
      : "尚无现金奖励",
    items: mappedItems.sort((left, right) => normalizeNumber(right.earnedAt, 0) - normalizeNumber(left.earnedAt, 0))
  });
}

function isRewardGiftOpenable(item) {
  const status = normalizeText(item && item.status).toLowerCase();
  return Boolean(
    item
    && normalizeText(item.id)
    && normalizeNumber(item.rewardAmount, 0) > 0
    && !normalizeNumber(item.giftOpenedAt, 0)
    && isPendingRewardStatus(status)
  );
}

function buildRewardGiftSummary(rewardItems) {
  const unopenedItems = (Array.isArray(rewardItems) ? rewardItems : []).filter(isRewardGiftOpenable);
  const totalAmount = unopenedItems.reduce((total, item) => total + normalizeNumber(item.rewardAmount, 0), 0);
  return {
    shouldOpen: unopenedItems.length > 0 && totalAmount > 0,
    rewardIds: unopenedItems.map((item) => normalizeText(item.id)).filter(Boolean),
    rewardCount: unopenedItems.length,
    totalAmount,
    title: totalAmount ? `获得 ¥${totalAmount} 现金奖励` : "",
    desc: unopenedItems.length > 1
      ? `${unopenedItems.length} 笔邀请奖励已记入你的分享家资产。`
      : "被邀请人已完成首次旅行，现金奖励已记入你的分享家资产。",
    rewards: unopenedItems
  };
}

function buildAssetOverview(campaignConfig, ownReferralCode, couponAssets, rewardLedgers, payoutAccountOrNow, maybeNow) {
  const payoutAccount = typeof payoutAccountOrNow === "number" ? null : (payoutAccountOrNow || null);
  const now = typeof payoutAccountOrNow === "number"
    ? payoutAccountOrNow
    : normalizeNumber(maybeNow, Date.now());
  const couponSummary = summarizeCouponAssets(couponAssets, now);
  const rewardSummary = summarizeRewardLedgers(rewardLedgers);
  const rewardGift = buildRewardGiftSummary(rewardSummary.items);
  const payoutAccountSummary = mapPayoutAccountSummaryForClient(payoutAccount);

  return {
    campaign: {
      campaignKey: normalizeText(campaignConfig && campaignConfig.campaignKey),
      campaignName: normalizeText(campaignConfig && campaignConfig.campaignName),
      phase: normalizeText(campaignConfig && campaignConfig.phase)
    },
    ownReferralCode: normalizeText(ownReferralCode),
    shareScene: buildShareScene(ownReferralCode),
    sharePath: buildSharePath(ownReferralCode),
    couponSummary: {
      activeCount: couponSummary.activeCount,
      usedCount: couponSummary.usedCount,
      expiredCount: couponSummary.expiredCount,
      totalAmount: couponSummary.totalAmount,
      summaryText: couponSummary.summaryText
    },
    rewardSummary: {
      totalAmount: rewardSummary.totalAmount,
      pendingCount: rewardSummary.pendingCount,
      paidCount: rewardSummary.paidCount,
      summaryText: rewardSummary.summaryText,
      payoutAccountStatus: normalizeText(payoutAccountSummary && payoutAccountSummary.status) || "awaiting_account",
      payoutAccountStatusLabel: normalizeText(payoutAccountSummary && payoutAccountSummary.statusLabel) || getPayoutAccountStatusLabel("awaiting_account"),
      payoutAccount: payoutAccountSummary
    },
    coupons: couponSummary.items,
    rewards: rewardSummary.items,
    rewardGift
  };
}

async function updateRewardLedgerStatusesForInviter(inviterUserId, campaignKey, currentStatuses, nextStatus, rejectionReason = "") {
  const ledgers = await listRewardLedgersForInviter(inviterUserId, campaignKey);
  const now = Date.now();
  const targetItems = (Array.isArray(ledgers) ? ledgers : []).filter((item) => {
    const status = normalizeText(item && item.status).toLowerCase();
    return Array.isArray(currentStatuses) && currentStatuses.includes(status);
  });

  await Promise.all(targetItems.map((item) => db.collection(CASH_REWARD_LEDGERS_COLLECTION).doc(item._id).update({
    data: {
      status: nextStatus,
      rejectionReason: nextStatus === "awaiting_account" ? normalizeText(rejectionReason) : "",
      updatedAt: now
    }
  })));

  return targetItems.length;
}

async function normalizeLegacyPayoutAccountForNoReview(account, userId, campaignKey) {
  if (!account || normalizeText(account.status).toLowerCase() !== "under_review") {
    return account;
  }

  const now = Date.now();
  const updateData = {
    status: "payable",
    rejectionReason: "",
    reviewedAt: normalizeNumber(account.reviewedAt, 0) || now,
    updatedAt: now
  };
  const accountId = normalizeText(account._id);
  if (accountId) {
    await db.collection(PAYOUT_ACCOUNTS_COLLECTION).doc(accountId).update({
      data: updateData
    });
  }
  await updateRewardLedgerStatusesForInviter(userId, campaignKey, ["under_review"], "payable");

  return Object.assign({}, account, updateData);
}

function isEligibleNewUser(user) {
  return (Number(user && user.effectiveOrderCount) || 0) <= 0 && (Number(user && user.lastTravelAt) || 0) <= 0;
}

function buildAwardAssets(config, existingAssets) {
  const phase = normalizeText(config && config.phase).toLowerCase() || "phase2";
  const campaignKey = normalizeText(config && config.campaignKey) || DEFAULT_CAMPAIGN_CONFIG.campaignKey;
  const totalGranted = calculateGrantedCouponAmount(existingAssets);
  const expireAt = Date.now() + (Number(config && config.couponExpireDays) || 365) * 24 * 60 * 60 * 1000;

  if (phase === "phase1") {
    if (totalGranted >= Number(config.phase1 && config.phase1.welcomeAmount || 150)) {
      return [];
    }

    return [
      {
        campaignKey,
        couponType: "share_referral_phase1_welcome_150",
        title: "野哉分享家新人券",
        amount: Number(config.phase1 && config.phase1.welcomeAmount) || 150,
        threshold: Number(config.couponThreshold) || 1000,
        stackGroup: "share_referral_phase1",
        expiresAt: expireAt
      }
    ];
  }

  if (totalGranted >= 150) {
    return [];
  }

  if (totalGranted >= 100) {
    return [
      {
        campaignKey,
        couponType: "share_referral_bonus_50",
        title: "野哉分享家加码券",
        amount: Number(config.phase2 && config.phase2.scanBonusAmount) || 50,
        threshold: Number(config.couponThreshold) || 1000,
        stackGroup: "share_referral_phase2",
        expiresAt: expireAt
      }
    ];
  }

  return [
    {
      campaignKey,
      couponType: "share_referral_welcome_100",
      title: "野哉分享家新人券",
      amount: Number(config.phase2 && config.phase2.directWelcomeAmount) || 100,
      threshold: Number(config.couponThreshold) || 1000,
      stackGroup: "share_referral_phase2",
      expiresAt: expireAt
    },
    {
      campaignKey,
      couponType: "share_referral_bonus_50",
      title: "野哉分享家加码券",
      amount: Number(config.phase2 && config.phase2.scanBonusAmount) || 50,
      threshold: Number(config.couponThreshold) || 1000,
      stackGroup: "share_referral_phase2",
      expiresAt: expireAt
    }
  ];
}

function buildDirectRegistrationAwardAssets(config, existingAssets) {
  const phase = normalizeText(config && config.phase).toLowerCase() || "phase2";
  const campaignKey = normalizeText(config && config.campaignKey) || DEFAULT_CAMPAIGN_CONFIG.campaignKey;
  const totalGranted = calculateGrantedCouponAmount(existingAssets);
  const expireAt = Date.now() + (Number(config && config.couponExpireDays) || 365) * 24 * 60 * 60 * 1000;

  if (phase === "phase1") {
    const welcomeAmount = Number(config && config.phase1 && config.phase1.welcomeAmount) || 150;
    if (totalGranted >= welcomeAmount) {
      return [];
    }

    return [
      {
        campaignKey,
        couponType: "share_referral_phase1_welcome_150",
        title: "野哉分享家新人券",
        amount: welcomeAmount,
        threshold: Number(config && config.couponThreshold) || 1000,
        stackGroup: "share_referral_phase1",
        expiresAt: expireAt
      }
    ];
  }

  const directWelcomeAmount = Number(config && config.phase2 && config.phase2.directWelcomeAmount) || 100;
  if (totalGranted >= directWelcomeAmount) {
    return [];
  }

  return [
    {
      campaignKey,
      couponType: "share_referral_welcome_100",
      title: "野哉分享家新人券",
      amount: directWelcomeAmount,
      threshold: Number(config && config.couponThreshold) || 1000,
      stackGroup: "share_referral_phase2",
      expiresAt: expireAt
    }
  ];
}

async function saveAwardAssets(user, assetPayloads) {
  const userId = normalizeText(user && user._id);
  const now = Date.now();

  return Promise.all(
    (Array.isArray(assetPayloads) ? assetPayloads : []).map(async (item) => {
      const doc = {
        userId,
        userOpenid: normalizeText(user && user.openid),
        campaignKey: normalizeText(item.campaignKey),
        couponType: normalizeText(item.couponType),
        title: normalizeText(item.title),
        amount: Number(item.amount) || 0,
        threshold: Number(item.threshold) || 1000,
        stackGroup: normalizeText(item.stackGroup),
        status: "active",
        grantedAt: now,
        expiresAt: Number(item.expiresAt) || now,
        updatedAt: now
      };
      const createResult = await db.collection(COUPON_ASSETS_COLLECTION).add({ data: doc });
      return Object.assign({ _id: createResult && createResult._id ? createResult._id : "" }, doc);
    })
  );
}

function isActiveRelationDoc(relation) {
  const status = normalizeText(relation && relation.status).toLowerCase();
  return !status || status === ACTIVE_RELATION_STATUS;
}

function getRelationReferralCode(relation) {
  return normalizeText(relation && (relation.firstValidScanCode || relation.referralCode)).toUpperCase();
}

function getRelationFirstScanTime(relation) {
  return normalizeNumber(relation && relation.firstValidScanAt, 0)
    || normalizeNumber(relation && relation.createdAt, 0)
    || normalizeNumber(relation && relation.updatedAt, 0);
}

function pickFirstActiveRelation(relations, matcher) {
  const list = (Array.isArray(relations) ? relations : [])
    .filter((relation) => isActiveRelationDoc(relation) && (!matcher || matcher(relation)));

  return list.sort((left, right) => {
    const leftTime = getRelationFirstScanTime(left);
    const rightTime = getRelationFirstScanTime(right);
    if (leftTime && rightTime && leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    if (leftTime && !rightTime) {
      return -1;
    }
    if (!leftTime && rightTime) {
      return 1;
    }
    return 0;
  })[0] || null;
}

async function listRelationsByInviteeUserId(inviteeUserId) {
  const normalizedInviteeUserId = normalizeText(inviteeUserId);
  if (!normalizedInviteeUserId) {
    return [];
  }

  const result = await db.collection(REFERRAL_RELATIONS_COLLECTION)
    .where({ inviteeUserId: normalizedInviteeUserId })
    .limit(50)
    .get();
  return result && Array.isArray(result.data) ? result.data : [];
}

function findFirstActiveRelationByInvitee(relations) {
  return pickFirstActiveRelation(relations);
}

function findMatchingActiveRelation(relations, inviterUserId, referralCode) {
  const normalizedInviterUserId = normalizeText(inviterUserId);
  const normalizedReferralCode = normalizeText(referralCode).toUpperCase();

  return pickFirstActiveRelation(relations, (relation) => (
    normalizeText(relation && relation.inviterUserId) === normalizedInviterUserId
    && getRelationReferralCode(relation) === normalizedReferralCode
  ));
}

async function appendScanEvent(event) {
  const now = Date.now();
  const data = Object.assign(
    {
      referralCode: "",
      inviterUserId: "",
      inviteeUserId: "",
      resultCode: "",
      resultMessage: "",
      campaignPhase: "",
      sourceScene: "",
      createdAt: now,
      updatedAt: now
    },
    event || {}
  );
  await db.collection(REFERRAL_SCAN_EVENTS_COLLECTION).add({ data });
}

async function createActiveRelation(inviterUserId, inviteeUserId, scanMeta) {
  const now = Date.now();
  const doc = {
    inviterUserId,
    inviteeUserId,
    firstValidScanAt: now,
    firstValidScanCode: normalizeText(scanMeta && scanMeta.referralCode),
    firstValidScanScene: normalizeText(scanMeta && scanMeta.sourceScene),
    status: ACTIVE_RELATION_STATUS,
    createdAt: now,
    updatedAt: now
  };
  const createResult = await db.collection(REFERRAL_RELATIONS_COLLECTION).add({ data: doc });
  return Object.assign({ _id: createResult && createResult._id ? createResult._id : "" }, doc);
}

function sumCouponResponseAmount(items) {
  return (Array.isArray(items) ? items : []).reduce((total, item) => total + (Number(item && item.amount) || 0), 0);
}

function buildCouponAwardSummary(awardedCouponAssets, totalAmountAfter) {
  const list = Array.isArray(awardedCouponAssets) ? awardedCouponAssets : [];
  return {
    awardedAmount: sumCouponResponseAmount(list),
    awardedCount: list.length,
    awardedTypes: list.map((item) => normalizeText(item && item.couponType)).filter(Boolean),
    totalAmountAfter: normalizeNumber(totalAmountAfter, 0)
  };
}

function buildInviterDisplayName(user) {
  const nickname = normalizeText(user && user.nickname);
  const memberLabel = normalizeText(user && user.memberLabel);
  if (nickname && memberLabel && memberLabel !== DEFAULT_MEMBER_LABEL) {
    return `${memberLabel}（${nickname}）`;
  }
  return memberLabel && memberLabel !== DEFAULT_MEMBER_LABEL ? memberLabel : (nickname || "野哉分享家");
}

function resolveRelationStatusText(status) {
  return normalizeText(status) === ACTIVE_RELATION_STATUS ? "已确认" : "已记录";
}

function buildDuplicateScanRecord(relation, inviterUser, existingAssets) {
  const couponAmount = calculateGrantedCouponAmount(existingAssets);
  const firstValidScanAt = normalizeNumber(relation && relation.firstValidScanAt, 0)
    || normalizeNumber(relation && relation.createdAt, 0);
  const firstValidScanAtText = formatDateTime(firstValidScanAt);
  const couponStatusText = couponAmount ? `¥${couponAmount} 已存入券包` : "已存入券包";
  const relationStatusText = resolveRelationStatusText(relation && relation.status);

  return {
    relationId: normalizeText(relation && relation._id),
    firstValidScanAt,
    firstValidScanAtText: firstValidScanAtText || "已记录",
    firstInviterName: buildInviterDisplayName(inviterUser),
    firstReferralCode: normalizeText(relation && relation.firstValidScanCode),
    couponAmount,
    couponStatusText,
    relationStatusText,
    timeline: [
      {
        key: "first_scan",
        title: "首次有效扫码",
        desc: firstValidScanAtText || "已完成"
      },
      {
        key: "coupon_awarded",
        title: "券包入账",
        desc: couponStatusText
      }
    ]
  };
}

function buildResultPayload(status, message, currentUser, ownCodeDoc, campaignConfig, extras) {
  const referralCode = normalizeText(ownCodeDoc && ownCodeDoc.referralCode);
  const sharePayload = buildSharePayload(referralCode, extras && extras.shareQrCode ? extras.shareQrCode : {});
  const awardSummary = extras && extras.couponAwardSummary
    ? extras.couponAwardSummary
    : buildCouponAwardSummary(extras && extras.awardedCouponAssets, 0);
  return Object.assign(
    {
      status,
      message,
      resultScenario: normalizeText(extras && extras.resultScenario) || "idle",
      resultReason: normalizeText(extras && extras.resultReason),
      couponAwardSummary: awardSummary,
      currentUser: mapUserForClient(currentUser),
      ownReferralCode: sharePayload.ownReferralCode,
      shareScene: sharePayload.shareScene,
      sharePath: sharePayload.sharePath,
      shareQrCodeFileID: sharePayload.shareQrCodeFileID,
      shareQrCodeCloudPath: sharePayload.shareQrCodeCloudPath,
      shareQrCodeUpdatedAt: sharePayload.shareQrCodeUpdatedAt,
      campaign: {
        campaignKey: normalizeText(campaignConfig && campaignConfig.campaignKey),
        campaignName: normalizeText(campaignConfig && campaignConfig.campaignName),
        phase: normalizeText(campaignConfig && campaignConfig.phase),
        couponThreshold: Number(campaignConfig && campaignConfig.couponThreshold) || 1000,
        copywriting: {
          firstAwardIntro: normalizeText(campaignConfig && campaignConfig.copywriting && campaignConfig.copywriting.firstAwardIntro)
            || DEFAULT_CAMPAIGN_CONFIG.copywriting.firstAwardIntro,
          phase2DirectAwardIntro: normalizeText(campaignConfig && campaignConfig.copywriting && campaignConfig.copywriting.phase2DirectAwardIntro)
            || DEFAULT_CAMPAIGN_CONFIG.copywriting.phase2DirectAwardIntro,
          bonusUpgradeIntro: normalizeText(campaignConfig && campaignConfig.copywriting && campaignConfig.copywriting.bonusUpgradeIntro)
            || DEFAULT_CAMPAIGN_CONFIG.copywriting.bonusUpgradeIntro,
          duplicateJoin: normalizeText(campaignConfig && campaignConfig.copywriting && campaignConfig.copywriting.duplicateJoin)
            || DEFAULT_CAMPAIGN_CONFIG.copywriting.duplicateJoin,
          duplicateJoinDesc: normalizeText(campaignConfig && campaignConfig.copywriting && campaignConfig.copywriting.duplicateJoinDesc)
            || DEFAULT_CAMPAIGN_CONFIG.copywriting.duplicateJoinDesc
        }
      }
    },
    extras || {}
  );
}

function mapAwardedCouponAssetForResponse(item) {
  return {
    couponType: normalizeText(item && item.couponType),
    title: normalizeText(item && item.title),
    amount: Number(item && item.amount) || 0,
    threshold: Number(item && item.threshold) || 0,
    expiresAt: Number(item && item.expiresAt) || 0
  };
}

function isTestingRolloutEnabled(campaignConfig) {
  const phase = normalizeText(campaignConfig && campaignConfig.phase).toLowerCase();
  return Boolean(
    campaignConfig
    && phase === "phase1"
    && campaignConfig.testingRollout
    && campaignConfig.testingRollout.allowExistingUsersAsNew
  );
}

function isEligibleForDirectRegistrationBenefits(user, campaignConfig) {
  return isEligibleNewUser(user) || isTestingRolloutEnabled(campaignConfig);
}

async function ensureDirectRegistrationBenefitsForUser(currentUser, campaignConfig) {
  const ownCodeDoc = await ensureReferralCodeForUser(currentUser);
  const existingAssets = await listCouponAssetsForUser(
    normalizeText(currentUser && currentUser._id),
    normalizeText(campaignConfig && campaignConfig.campaignKey)
  );
  const eligible = isEligibleForDirectRegistrationBenefits(currentUser, campaignConfig);
  const directAwardAssets = eligible ? buildDirectRegistrationAwardAssets(campaignConfig, existingAssets) : [];
  const createdAssets = directAwardAssets.length ? await saveAwardAssets(currentUser, directAwardAssets) : [];

  return {
    ownCodeDoc,
    existingAssets: createdAssets.length ? existingAssets.concat(createdAssets) : existingAssets,
    createdAssets,
    eligible
  };
}

async function ensureDirectRegistrationBenefits() {
  const campaignConfig = await getStoredCampaignConfig();
  const currentUser = await ensureCurrentUserDoc();
  const directBenefits = await ensureDirectRegistrationBenefitsForUser(currentUser, campaignConfig);
  const awardedCouponAssets = directBenefits.createdAssets.map(mapAwardedCouponAssetForResponse);
  const totalAmountAfter = calculateGrantedCouponAmount(directBenefits.existingAssets);

  return buildResultPayload(
    awardedCouponAssets.length ? "awarded" : "ready",
    awardedCouponAssets.length
      ? (normalizeText(campaignConfig.copywriting && campaignConfig.copywriting.awarded) || DEFAULT_CAMPAIGN_CONFIG.copywriting.awarded)
      : (normalizeText(campaignConfig.copywriting && campaignConfig.copywriting.idle) || DEFAULT_CAMPAIGN_CONFIG.copywriting.idle),
    currentUser,
    directBenefits.ownCodeDoc,
    campaignConfig,
    {
      resultScenario: awardedCouponAssets.length ? "success_first_award" : "idle",
      resultReason: "",
      couponAwardSummary: buildCouponAwardSummary(awardedCouponAssets, totalAmountAfter),
      awardedCouponAssets
    }
  );
}

async function listUsersBatch(offset, limit) {
  const query = db.collection(USERS_COLLECTION)
    .skip(offset)
    .limit(limit);
  const result = await query.get();
  return result && Array.isArray(result.data) ? result.data : [];
}

async function backfillPhase1Benefits(payload) {
  const campaignConfig = await getStoredCampaignConfig();
  const phase = normalizeText(campaignConfig && campaignConfig.phase).toLowerCase();
  if (phase !== "phase1") {
    throw new Error("Phase1 补券仅允许在 Phase1 配置下执行");
  }

  const dryRun = Boolean(payload && payload.dryRun);
  const requestedLimit = normalizeNumber(payload && payload.limit, 0);
  const maxUsers = requestedLimit > 0 ? requestedLimit : 0;
  let offset = Math.max(0, normalizeNumber(payload && payload.offset, 0));
  let scanned = 0;
  let eligible = 0;
  let awarded = 0;
  let codeCreated = 0;
  const samples = [];

  while (!maxUsers || scanned < maxUsers) {
    const batchLimit = maxUsers ? Math.min(BACKFILL_BATCH_SIZE, maxUsers - scanned) : BACKFILL_BATCH_SIZE;
    const users = await listUsersBatch(offset, batchLimit);
    if (!users.length) {
      break;
    }

    for (const user of users) {
      scanned += 1;
      const existingCode = await db.collection(REFERRAL_CODES_COLLECTION)
        .where({ userId: normalizeText(user && user._id), status: "active" })
        .limit(1)
        .get();
      const hadCode = Boolean(existingCode && existingCode.data && existingCode.data.length);
      const existingAssets = await listCouponAssetsForUser(
        normalizeText(user && user._id),
        normalizeText(campaignConfig && campaignConfig.campaignKey)
      );
      const awardAssets = buildDirectRegistrationAwardAssets(campaignConfig, existingAssets);
      if (isEligibleForDirectRegistrationBenefits(user, campaignConfig)) {
        eligible += 1;
      }
      if (!dryRun) {
        await ensureReferralCodeForUser(user);
        if (!hadCode) {
          codeCreated += 1;
        }
        if (awardAssets.length) {
          const createdAssets = await saveAwardAssets(user, awardAssets);
          awarded += createdAssets.length;
        }
      } else if (awardAssets.length) {
        awarded += awardAssets.length;
      }
      if (samples.length < 10 && awardAssets.length) {
        samples.push({
          userId: normalizeText(user && user._id),
          openid: normalizeText(user && user.openid),
          awardAmount: awardAssets.reduce((total, item) => total + (Number(item.amount) || 0), 0)
        });
      }
    }

    offset += users.length;
    if (users.length < batchLimit) {
      break;
    }
  }

  return {
    dryRun,
    scanned,
    eligible,
    awarded,
    codeCreated: dryRun ? 0 : codeCreated,
    samples
  };
}

async function getAssetOverview() {
  const campaignConfig = await getStoredCampaignConfig();
  const currentUser = await ensureCurrentUserDoc();
  const ownCodeDoc = await ensureReferralCodeForUser(currentUser);
  const existingAssets = await listCouponAssetsForUser(
    normalizeText(currentUser && currentUser._id),
    normalizeText(campaignConfig && campaignConfig.campaignKey)
  );
  let sharePayload = buildSharePayload(ownCodeDoc && ownCodeDoc.referralCode, {});
  try {
    sharePayload = await ensureReferralQrCodeForCodeDoc(ownCodeDoc);
  } catch (error) {
    console.error("Failed to generate share referral qr code", error);
  }
  let [rewardLedgers, payoutAccount] = await Promise.all([
    listRewardLedgersForInviter(normalizeText(currentUser._id), normalizeText(campaignConfig.campaignKey)),
    findPayoutAccountByUserId(normalizeText(currentUser._id), normalizeText(campaignConfig.campaignKey))
  ]);
  payoutAccount = await normalizeLegacyPayoutAccountForNoReview(
    payoutAccount,
    normalizeText(currentUser._id),
    normalizeText(campaignConfig.campaignKey)
  );
  if (payoutAccount && normalizeText(payoutAccount.status).toLowerCase() === "payable") {
    rewardLedgers = (Array.isArray(rewardLedgers) ? rewardLedgers : []).map((item) => (
      normalizeText(item && item.status).toLowerCase() === "under_review"
        ? Object.assign({}, item, { status: "payable" })
        : item
    ));
  }

  return Object.assign(
    {
      currentUser: mapUserForClient(currentUser)
    },
    buildAssetOverview(
      campaignConfig,
      normalizeText(ownCodeDoc && ownCodeDoc.referralCode),
      existingAssets,
      rewardLedgers,
      payoutAccount
    ),
    sharePayload
  );
}

async function getShareReferralEntryStatus() {
  const campaignConfig = await getStoredCampaignConfig();
  const currentUser = await ensureCurrentUserDoc();
  const existingAssets = await listCouponAssetsForUser(
    normalizeText(currentUser && currentUser._id),
    normalizeText(campaignConfig && campaignConfig.campaignKey)
  );
  const couponSummary = summarizeCouponAssets(existingAssets);
  const hasCoupon = Boolean(couponSummary.items.length || couponSummary.totalAmount > 0);

  return {
    currentUser: mapUserForClient(currentUser),
    campaign: {
      campaignKey: normalizeText(campaignConfig && campaignConfig.campaignKey),
      campaignName: normalizeText(campaignConfig && campaignConfig.campaignName),
      phase: normalizeText(campaignConfig && campaignConfig.phase)
    },
    hasCoupon,
    shouldOpenAssets: hasCoupon,
    couponCount: couponSummary.items.length,
    couponTotalAmount: couponSummary.totalAmount,
    eligibleForDirectAward: isEligibleForDirectRegistrationBenefits(currentUser, campaignConfig)
  };
}

async function getPayoutAccount() {
  const campaignConfig = await getStoredCampaignConfig();
  const currentUser = await ensureCurrentUserDoc();
  let payoutAccount = await findPayoutAccountByUserId(normalizeText(currentUser._id), normalizeText(campaignConfig.campaignKey));
  payoutAccount = await normalizeLegacyPayoutAccountForNoReview(
    payoutAccount,
    normalizeText(currentUser._id),
    normalizeText(campaignConfig.campaignKey)
  );

  return {
    currentUser: mapUserForClient(currentUser),
    payoutAccount: mapPayoutAccountDetailForOwner(payoutAccount)
  };
}

async function savePayoutAccount(payload) {
  const campaignConfig = await getStoredCampaignConfig();
  const currentUser = await ensureCurrentUserDoc();
  const now = Date.now();
  const normalizedPayload = validatePayoutAccountPayload(payload);
  const userId = normalizeText(currentUser && currentUser._id);
  const campaignKey = normalizeText(campaignConfig && campaignConfig.campaignKey);
  const existing = await findPayoutAccountByUserId(userId, campaignKey);

  const nextDoc = {
    userId,
    userOpenid: normalizeText(currentUser && currentUser.openid),
    campaignKey,
    accountName: normalizedPayload.accountName,
    phone: normalizedPayload.phone,
    bankName: normalizedPayload.bankName,
    bankAccountNo: normalizedPayload.bankAccountNo,
    idNumberLast4: normalizedPayload.idNumberLast4,
    status: "payable",
    rejectionReason: "",
    submittedAt: now,
    reviewedAt: now,
    updatedAt: now
  };

  let accountId = normalizeText(existing && existing._id);
  if (accountId) {
    await db.collection(PAYOUT_ACCOUNTS_COLLECTION).doc(accountId).update({
      data: nextDoc
    });
  } else {
    const createResult = await db.collection(PAYOUT_ACCOUNTS_COLLECTION).add({
      data: nextDoc
    });
    accountId = normalizeText(createResult && createResult._id);
  }

  await updateRewardLedgerStatusesForInviter(userId, campaignKey, ["awaiting_account", "earned", "under_review"], "payable");

  return mapPayoutAccountDetailForOwner(Object.assign({ _id: accountId }, nextDoc));
}

async function markCashRewardGiftOpened(payload) {
  const currentUser = await ensureCurrentUserDoc();
  const userId = normalizeText(currentUser && currentUser._id);
  const rewardIds = (Array.isArray(payload && payload.rewardIds) ? payload.rewardIds : [])
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .slice(0, 20);
  const now = Date.now();
  const updatedIds = [];

  for (const rewardId of rewardIds) {
    const result = await db.collection(CASH_REWARD_LEDGERS_COLLECTION)
      .where({
        _id: rewardId,
        inviterUserId: userId
      })
      .limit(1)
      .get();
    const ledger = result && result.data && result.data.length ? result.data[0] : null;
    if (!ledger || normalizeNumber(ledger.giftOpenedAt, 0)) {
      continue;
    }
    await db.collection(CASH_REWARD_LEDGERS_COLLECTION).doc(rewardId).update({
      data: {
        giftOpenedAt: now,
        updatedAt: now
      }
    });
    updatedIds.push(rewardId);
  }

  return {
    updatedIds,
    updatedCount: updatedIds.length,
    giftOpenedAt: now
  };
}

async function bootstrapParticipation(payload) {
  const campaignConfig = await getStoredCampaignConfig();
  const currentUser = await ensureCurrentUserDoc();
  const directBenefits = await ensureDirectRegistrationBenefitsForUser(currentUser, campaignConfig);
  const ownCodeDoc = directBenefits.ownCodeDoc;
  const directAwardedCouponAssets = directBenefits.createdAssets.map(mapAwardedCouponAssetForResponse);
  const referralCode = resolveReferralCode(payload);
  const sourceScene = normalizeText(payload && payload.scene);
  const directTotalAmountAfter = calculateGrantedCouponAmount(directBenefits.existingAssets);

  if (!referralCode) {
    return buildResultPayload(
      directAwardedCouponAssets.length ? "awarded" : "idle",
      directAwardedCouponAssets.length
        ? (normalizeText(campaignConfig.copywriting && campaignConfig.copywriting.awarded) || DEFAULT_CAMPAIGN_CONFIG.copywriting.awarded)
        : (normalizeText(campaignConfig.copywriting && campaignConfig.copywriting.idle) || DEFAULT_CAMPAIGN_CONFIG.copywriting.idle),
      currentUser,
      ownCodeDoc,
      campaignConfig,
      {
        resultScenario: directAwardedCouponAssets.length ? "success_first_award" : "idle",
        resultReason: "",
        couponAwardSummary: buildCouponAwardSummary(directAwardedCouponAssets, directTotalAmountAfter),
        awardedCouponAssets: directAwardedCouponAssets
      }
    );
  }

  if (referralCode === normalizeText(ownCodeDoc.referralCode)) {
    await appendScanEvent({
      referralCode,
      inviterUserId: normalizeText(currentUser._id),
      inviteeUserId: normalizeText(currentUser._id),
      resultCode: "invalid_self",
      resultMessage: normalizeText(campaignConfig.copywriting && campaignConfig.copywriting.invalidSelf),
      campaignPhase: normalizeText(campaignConfig.phase),
      sourceScene
    });

    return buildResultPayload(
      "invalid_self",
      normalizeText(campaignConfig.copywriting && campaignConfig.copywriting.invalidSelf) || DEFAULT_CAMPAIGN_CONFIG.copywriting.invalidSelf,
      currentUser,
      ownCodeDoc,
      campaignConfig,
      {
        resultScenario: "failed_ineligible",
        resultReason: "self_scan",
        couponAwardSummary: buildCouponAwardSummary([], directTotalAmountAfter),
        awardedCouponAssets: []
      }
    );
  }

  const inviterCodeDoc = await findReferralCodeDocByCode(referralCode);
  if (!inviterCodeDoc) {
    await appendScanEvent({
      referralCode,
      inviterUserId: "",
      inviteeUserId: normalizeText(currentUser._id),
      resultCode: "invalid_code",
      resultMessage: normalizeText(campaignConfig.copywriting && campaignConfig.copywriting.invalidCode),
      campaignPhase: normalizeText(campaignConfig.phase),
      sourceScene
    });

    return buildResultPayload(
      "invalid_code",
      normalizeText(campaignConfig.copywriting && campaignConfig.copywriting.invalidCode) || DEFAULT_CAMPAIGN_CONFIG.copywriting.invalidCode,
      currentUser,
      ownCodeDoc,
      campaignConfig,
      {
        resultScenario: "failed_ineligible",
        resultReason: "invalid_code",
        couponAwardSummary: buildCouponAwardSummary([], directTotalAmountAfter),
        awardedCouponAssets: []
      }
    );
  }

  if (!isEligibleForDirectRegistrationBenefits(currentUser, campaignConfig)) {
    await appendScanEvent({
      referralCode,
      inviterUserId: normalizeText(inviterCodeDoc.userId),
      inviteeUserId: normalizeText(currentUser._id),
      resultCode: "invalid_old_user",
      resultMessage: normalizeText(campaignConfig.copywriting && campaignConfig.copywriting.invalidOldUser),
      campaignPhase: normalizeText(campaignConfig.phase),
      sourceScene
    });

    return buildResultPayload(
      "invalid_old_user",
      normalizeText(campaignConfig.copywriting && campaignConfig.copywriting.invalidOldUser) || DEFAULT_CAMPAIGN_CONFIG.copywriting.invalidOldUser,
      currentUser,
      ownCodeDoc,
      campaignConfig,
      {
        resultScenario: "failed_ineligible",
        resultReason: "old_user",
        couponAwardSummary: buildCouponAwardSummary([], directTotalAmountAfter),
        awardedCouponAssets: []
      }
    );
  }

  const existingRelations = await listRelationsByInviteeUserId(normalizeText(currentUser._id));
  const existingRelation = findMatchingActiveRelation(
    existingRelations,
    normalizeText(inviterCodeDoc.userId),
    referralCode
  ) || findFirstActiveRelationByInvitee(existingRelations);
  const existingAssets = directBenefits.existingAssets;
  const awardedAssets = buildAwardAssets(campaignConfig, existingAssets);

  if (existingRelation) {
    const duplicateMessage = awardedAssets.length
      ? normalizeText(campaignConfig.copywriting && campaignConfig.copywriting.duplicateJoin)
      : normalizeText(campaignConfig.copywriting && campaignConfig.copywriting.duplicateMax);
    const existingInviterUser = await findUserById(existingRelation.inviterUserId);
    const duplicateRecord = buildDuplicateScanRecord(existingRelation, existingInviterUser, existingAssets);

    await appendScanEvent({
      referralCode,
      inviterUserId: normalizeText(existingRelation.inviterUserId),
      inviteeUserId: normalizeText(currentUser._id),
      resultCode: awardedAssets.length ? "duplicate_join" : "duplicate_max",
      resultMessage: duplicateMessage,
      campaignPhase: normalizeText(campaignConfig.phase),
      sourceScene
    });

    return buildResultPayload(
      directAwardedCouponAssets.length ? "awarded" : (awardedAssets.length ? "duplicate_join" : "duplicate_max"),
      directAwardedCouponAssets.length
        ? (normalizeText(campaignConfig.copywriting && campaignConfig.copywriting.awarded) || DEFAULT_CAMPAIGN_CONFIG.copywriting.awarded)
        : (duplicateMessage || DEFAULT_CAMPAIGN_CONFIG.copywriting.duplicateJoin),
      currentUser,
      ownCodeDoc,
      campaignConfig,
      {
        resultScenario: directAwardedCouponAssets.length ? "success_first_award" : "duplicate_bound",
        resultReason: awardedAssets.length ? "duplicate_join" : "duplicate_max",
        couponAwardSummary: buildCouponAwardSummary(directAwardedCouponAssets, directTotalAmountAfter),
        awardedCouponAssets: directAwardedCouponAssets,
        duplicateRecord,
        relationId: normalizeText(existingRelation._id)
      }
    );
  }

  if (!directAwardedCouponAssets.length && !awardedAssets.length) {
    const duplicateMessage = normalizeText(campaignConfig.copywriting && campaignConfig.copywriting.duplicateMax)
      || DEFAULT_CAMPAIGN_CONFIG.copywriting.duplicateMax;

    await appendScanEvent({
      referralCode,
      inviterUserId: normalizeText(inviterCodeDoc.userId),
      inviteeUserId: normalizeText(currentUser._id),
      resultCode: "duplicate_max",
      resultMessage: duplicateMessage,
      campaignPhase: normalizeText(campaignConfig.phase),
      sourceScene
    });

    return buildResultPayload(
      "duplicate_max",
      duplicateMessage,
      currentUser,
      ownCodeDoc,
      campaignConfig,
      {
        resultScenario: "failed_ineligible",
        resultReason: "duplicate_max",
        couponAwardSummary: buildCouponAwardSummary([], directTotalAmountAfter),
        awardedCouponAssets: []
      }
    );
  }

  const relation = await createActiveRelation(normalizeText(inviterCodeDoc.userId), normalizeText(currentUser._id), {
    referralCode,
    sourceScene
  });
  const createdAssets = await saveAwardAssets(currentUser, awardedAssets);
  await appendScanEvent({
    referralCode,
    inviterUserId: normalizeText(inviterCodeDoc.userId),
    inviteeUserId: normalizeText(currentUser._id),
    resultCode: "awarded",
    resultMessage: normalizeText(campaignConfig.copywriting && campaignConfig.copywriting.awarded),
    campaignPhase: normalizeText(campaignConfig.phase),
    sourceScene
  });
  const awardedCouponAssets = directAwardedCouponAssets.concat(createdAssets.map(mapAwardedCouponAssetForResponse));
  const existingAmountBeforeScanAward = calculateGrantedCouponAmount(existingAssets) - sumCouponResponseAmount(directAwardedCouponAssets);
  const totalAmountAfter = calculateGrantedCouponAmount(existingAssets.concat(createdAssets));
  const phase = normalizeText(campaignConfig && campaignConfig.phase).toLowerCase();
  const resultScenario = phase === "phase2"
    && !directAwardedCouponAssets.length
    && sumCouponResponseAmount(createdAssets) > 0
    && existingAmountBeforeScanAward > 0
    ? "phase2_bonus"
    : "success_first_award";

  return buildResultPayload(
    "awarded",
    normalizeText(campaignConfig.copywriting && campaignConfig.copywriting.awarded) || DEFAULT_CAMPAIGN_CONFIG.copywriting.awarded,
    currentUser,
    ownCodeDoc,
    campaignConfig,
    {
      resultScenario,
      resultReason: "",
      couponAwardSummary: buildCouponAwardSummary(awardedCouponAssets, totalAmountAfter),
      relationId: normalizeText(relation && relation._id),
      awardedCouponAssets
    }
  );
}

const handlers = {
  ensureDirectRegistrationBenefits: () => ensureDirectRegistrationBenefits(),
  backfillPhase1Benefits: (payload) => backfillPhase1Benefits(payload),
  bootstrapParticipation: (payload) => bootstrapParticipation(payload),
  getAssetOverview: () => getAssetOverview(),
  getShareReferralEntryStatus: () => getShareReferralEntryStatus(),
  getPayoutAccount: () => getPayoutAccount(),
  markCashRewardGiftOpened: (payload) => markCashRewardGiftOpened(payload),
  savePayoutAccount: (payload) => savePayoutAccount(payload)
};

exports.main = async (event) => {
  const action = normalizeText(event && event.action);
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
    console.error("referralGateway failed", {
      action,
      error
    });
    return {
      ok: false,
      error: error && error.message ? error.message : "Referral gateway error"
    };
  }
};

exports.__test__ = {
  buildAssetOverview,
  buildAwardAssets,
  getCouponStatusLabel,
  getPayoutAccountStatusLabel,
  getRewardStatusLabel,
  mapCouponAssetForClient,
  mapPayoutAccountDetailForOwner,
  mapPayoutAccountSummaryForClient,
  mapRewardLedgerForClient,
  buildRewardGiftSummary,
  buildSharePayload,
  normalizePayoutAccountPayload,
  summarizeCouponAssets,
  summarizeRewardLedgers
};
