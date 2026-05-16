const cloud = require("wx-server-sdk");
const cloudbase = require("@cloudbase/node-sdk");
const crypto = require("crypto");
const https = require("https");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const app = cloudbase.init({
  env: process.env.TCB_ENV || cloud.DYNAMIC_CURRENT_ENV
});
const auth = app.auth();
const CODE_VERSION = "refund-cancel-on-success-20260513-01";
const LIANLIAN_ONBOARDING_COLLECTION = "lianlian_onboarding_records";
const LIANLIAN_PAYMENT_COLLECTION = "lianlian_payment_records";
const LIANLIAN_PROFIT_SHARING_COLLECTION = "lianlian_profit_sharing_records";
const LIANLIAN_REFUND_COLLECTION = "lianlian_refund_records";
const LIANLIAN_WITHDRAWAL_COLLECTION = "lianlian_withdrawal_records";
const ORDER_EVENTS_COLLECTION = "order_events";
const ADMIN_COLLECTION = "admin_accounts";
const ORDER_MODEL_NAME = "TravelOrder";
const DEFAULT_SUB_MERCHANT_USER_ID = "YEZAI_ENTERPRISE_MAIN";
const DEFAULT_SUB_MCHID = "402605060000097988";
const DEFAULT_ONBOARDING_NOTIFY_PATH = "/lianlian/onboarding/notify";
const DEFAULT_PAYMENT_NOTIFY_PATH = "/lianlian/payment/notify";
const DEFAULT_REFUND_NOTIFY_PATH = "/lianlian/refund/notify";
const DEFAULT_WITHDRAWAL_NOTIFY_PATH = "/lianlian/withdrawal/notify";
const DEFAULT_WECHAT_APPLET_PAY_TYPE = "WECHAT_APPLET";
const DEFAULT_WECHAT_APPLET_APPID = "wxc257583a047566a3";
const DEFAULT_AT_CHANNEL_TYPE = "WECHAT";
const DEFAULT_WECHAT_CHNL_NO = "878920858";
const DEFAULT_PAYMENT_BUSI_TYPE = "100099";
const DEFAULT_PAYMENT_EXPIRE_MINUTES = 30;
const ORDER_PAYMENT_EXPIRE_MS = 30 * 60 * 1000;
const PAYMENT_SUCCESS_STATUSES = ["SUCCESS", "PAY_SUCCESS", "TRADE_SUCCESS", "PAID", "FINISHED", "S", "2"];
const DEFAULT_PERSONAL_ACCOUNT_TYPE = "PERSONAL_PAYMENT_ACCOUNT";
const DEFAULT_PERSONAL_ACCOUNT_LEVEL = "V2";
const DEFAULT_PERSONAL_USER_TYPE = "INNERUSER";
const DEFAULT_PERSONAL_TRADE_SERIAL_TYPE = "OpenNormalUser";
const PAYMENT_GATEWAY_MAINTENANCE_TOKEN_ENV_KEY = "PAYMENT_GATEWAY_MAINTENANCE_TOKEN";
const ADMIN_ACCOUNT_TYPES = ["admin", "creator_portal"];
const ADMIN_ACCOUNT_STATUSES = ["active", "inactive"];
const ADMIN_ROLE_NAMES = ["admin", "super_admin", "yezai_admin", "ops_admin"];
const DEFAULT_WECHAT_PAY_CONFIG = {
  payType: "WECHAT_APPLET",
  rateLevel: "W1",
  rate: "0.60",
  downLimit: "0.01",
  upLimit: "999999.00"
};
const LIANLIAN_CREATEPAY_PATH = "/mch/v1/ipay/createpay";
const LIANLIAN_ORDERQUERY_PATH = "/mch/v1/ipay/orderquery";
const LIANLIAN_REFUND_PATH = "/mch/v1/ipay/refund";
const LIANLIAN_REFUND_QUERY_PATH = "/mch/v1/ipay/refundquery";
const LIANLIAN_AT_WECHAT_CONFIG_PATH = "/sp/v1/at/secmchconfig";
const LIANLIAN_PROFIT_SHARING_PATH = "/mch/v1/accp/txn/payment-profitsharing";
const LIANLIAN_WITHDRAWAL_PATH = "/mch/v1/accp/txn/withdrawal";
const LIANLIAN_WITHDRAWAL_CHECK_PATH = "/mch/v1/accp/txn/withdrawal-check";
const LIANLIAN_WITHDRAWAL_QUERY_PATH = "/query/mch/v1/accp/txn/withdrawal-query";
const DEFAULT_LIANLIAN_ACCP_API_BASE_URL = "https://accpapi.lianlianpay.com";
const LIANLIAN_ACCP_ACCOUNT_INFO_PATH = "/v1/acctmgr/query-acctinfo";
const LIANLIAN_ACCP_ACCOUNT_SERIAL_PATH = "/v1/acctmgr/query-acctserial";
const PROFIT_SHARING_READY_ORDER_STATUSES = ["paid", "traveling", "completed"];
const OUTBOUND_IP_ENDPOINTS = [
  "https://api.ipify.org?format=json",
  "https://ifconfig.me/all.json"
];

function normalizeText(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeIdentifier(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeStatus(value, allowedValues, fallback) {
  const normalized = normalizeText(value).toLowerCase();
  return allowedValues.indexOf(normalized) >= 0 ? normalized : fallback;
}

function normalizeBoolean(value, fallback) {
  if (value === true || value === "true") {
    return true;
  }
  if (value === false || value === "false") {
    return false;
  }
  return fallback;
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function pickReadableErrorMessage(response = {}, fallback = "接口异常") {
  const message = normalizeText(
    response.ret_msg
    || response.retMsg
    || response.error
    || response.err_msg
    || response.errMsg
    || response.message
  );

  return message && message.toLowerCase() !== "no message available" ? message : fallback;
}

function getOrderModel() {
  const model = app.models && app.models[ORDER_MODEL_NAME];
  assertCondition(model, "TravelOrder model unavailable");
  return model;
}

function getPayload(event) {
  return event && typeof event.payload === "object" && event.payload !== null ? event.payload : {};
}

function getPaymentGatewayMaintenanceToken() {
  return normalizeText(process.env[PAYMENT_GATEWAY_MAINTENANCE_TOKEN_ENV_KEY]);
}

function assertPaymentMaintenanceAccess(payload = {}) {
  const expectedToken = getPaymentGatewayMaintenanceToken();
  const accessToken = normalizeText(payload.accessToken || payload.maintenanceToken || payload.token);

  assertCondition(expectedToken, "支付维护令牌未配置");
  assertCondition(accessToken && accessToken === expectedToken, "支付维护令牌无效");
}

function collectRoles(userInfo) {
  const roleValues = []
    .concat(normalizeArray(userInfo && userInfo.roles))
    .concat(normalizeArray(userInfo && userInfo.role))
    .concat(normalizeArray(userInfo && userInfo.userRoles));

  return roleValues.map((role) => normalizeIdentifier(role)).filter(Boolean);
}

function mapAuthUser(callerInfo, userInfo) {
  const userMetadata = userInfo && userInfo.user_metadata ? userInfo.user_metadata : {};
  const id =
    normalizeText(userInfo && userInfo.id)
    || normalizeText(userInfo && userInfo.uid)
    || normalizeText(callerInfo && callerInfo.uid)
    || normalizeText(callerInfo && callerInfo.customUserId)
    || normalizeText(callerInfo && callerInfo.openId);
  const username =
    normalizeText(userInfo && userInfo.username)
    || normalizeText(userInfo && userInfo.userName)
    || normalizeText(userMetadata.username)
    || normalizeText(userMetadata.userName)
    || normalizeText(userInfo && userInfo.email)
    || normalizeText(userInfo && userInfo.phone)
    || id;

  return {
    id,
    uid: normalizeText(userInfo && userInfo.uid) || normalizeText(callerInfo && callerInfo.uid),
    customUserId:
      normalizeText(userInfo && userInfo.customUserId)
      || normalizeText(callerInfo && callerInfo.customUserId),
    username,
    email: normalizeText(userInfo && userInfo.email) || normalizeText(userInfo && userInfo.mail),
    phone: normalizeText(userInfo && userInfo.phone) || normalizeText(userInfo && userInfo.phoneNumber),
    roles: collectRoles(userInfo)
  };
}

function mapAdminAccountDoc(doc) {
  const accountType = normalizeStatus(doc && doc.accountType, ADMIN_ACCOUNT_TYPES, "admin");
  return {
    _id: normalizeText(doc && doc._id),
    uid: normalizeText(doc && doc.uid),
    customUserId: normalizeText(doc && doc.customUserId),
    username: normalizeText(doc && doc.username),
    email: normalizeText(doc && doc.email),
    phone: normalizeText(doc && doc.phone),
    accountType,
    boundCreatorId: accountType === "creator_portal" ? normalizeText(doc && doc.boundCreatorId) : "",
    status: normalizeStatus(doc && doc.status, ADMIN_ACCOUNT_STATUSES, "active"),
    updatedAt: Number(doc && doc.updatedAt) || 0
  };
}

function uniqueIdentifiers(values) {
  return Array.from(new Set(normalizeArray(values).map(normalizeIdentifier).filter(Boolean)));
}

function getAdminStrongIdentifiers(account) {
  return uniqueIdentifiers([
    account && account.uid,
    account && account.customUserId
  ]);
}

function getAdminWeakIdentifiers(account) {
  return uniqueIdentifiers([
    account && account.username,
    account && account.email,
    account && account.phone
  ]);
}

function findAdminAccountForUser(accounts, user) {
  const userStrongIdentifiers = new Set(uniqueIdentifiers([user && user.id, user && user.uid, user && user.customUserId]));
  const userWeakIdentifiers = new Set(uniqueIdentifiers([user && user.username, user && user.email, user && user.phone]));
  const strongMatch = normalizeArray(accounts).find((account) =>
    getAdminStrongIdentifiers(account).some((identifier) => userStrongIdentifiers.has(identifier))
  );

  if (strongMatch) {
    return strongMatch;
  }

  return normalizeArray(accounts).find((account) => {
    if (getAdminStrongIdentifiers(account).length) {
      return false;
    }

    return getAdminWeakIdentifiers(account).some((identifier) => userWeakIdentifiers.has(identifier));
  }) || null;
}

async function listActiveAdminAccounts() {
  const result = await db.collection(ADMIN_COLLECTION).limit(200).get();
  return normalizeArray(result && result.data)
    .map(mapAdminAccountDoc)
    .filter((account) => account.status === "active")
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

async function resolvePaymentGatewayAccess() {
  let callerInfo = {};
  let userInfo = null;

  try {
    callerInfo = typeof auth.getUserInfo === "function" ? auth.getUserInfo() : {};
  } catch (error) {
    callerInfo = {};
  }

  try {
    const result = await auth.getEndUserInfo();
    userInfo = result && result.userInfo ? result.userInfo : null;
  } catch (error) {
    userInfo = null;
  }

  const user = mapAuthUser(callerInfo, userInfo);
  const matchedAccount = findAdminAccountForUser(await listActiveAdminAccounts(), user);
  const hasAdminRole = normalizeArray(user.roles).some((role) => ADMIN_ROLE_NAMES.indexOf(role) >= 0);

  assertCondition(user.id && (matchedAccount || hasAdminRole), `payment access denied: uid=${normalizeText(user.uid || user.id) || "unknown"}`);

  const accountType = normalizeStatus(matchedAccount && matchedAccount.accountType, ADMIN_ACCOUNT_TYPES, "admin");
  const boundCreatorId = accountType === "creator_portal"
    ? normalizeText(matchedAccount && matchedAccount.boundCreatorId)
    : "";

  assertCondition(accountType !== "creator_portal" || boundCreatorId, `creator portal binding missing: uid=${normalizeText(user.uid || user.id) || "unknown"}`);

  return Object.assign({}, user, {
    accountType,
    boundCreatorId
  });
}

async function resolvePlatformPaymentAdminAccess() {
  const access = await resolvePaymentGatewayAccess();
  assertCondition(access.accountType !== "creator_portal", "仅平台后台账号可操作支付资金");
  return access;
}

function resolvePersonalOnboardingUserId(payload, access) {
  if (access && access.accountType === "creator_portal") {
    return normalizeText(access.boundCreatorId);
  }

  return normalizeText(payload.userId || payload.user_id);
}

function getLianlianConfig() {
  const baseUrl = normalizeText(process.env.LIANLIAN_BASE_URL).replace(/\/+$/, "");
  const accpApiBaseUrl = (
    normalizeText(process.env.LIANLIAN_ACCP_API_BASE_URL)
    || DEFAULT_LIANLIAN_ACCP_API_BASE_URL
  ).replace(/\/+$/, "");
  const mchId = normalizeText(process.env.LIANLIAN_MCH_ID);
  const spNo = normalizeText(process.env.LIANLIAN_SP_NO);
  const privateKey = normalizeText(process.env.LIANLIAN_PRIVATE_KEY_PKCS8);
  const publicKey = normalizeText(process.env.LIANLIAN_PUBLIC_KEY);

  assertCondition(baseUrl, "缺少 LIANLIAN_BASE_URL");
  assertCondition(accpApiBaseUrl, "缺少 LIANLIAN_ACCP_API_BASE_URL");
  assertCondition(mchId || spNo, "缺少 LIANLIAN_MCH_ID 或 LIANLIAN_SP_NO");
  assertCondition(privateKey, "缺少 LIANLIAN_PRIVATE_KEY_PKCS8");
  assertCondition(publicKey, "缺少 LIANLIAN_PUBLIC_KEY");

  return {
    baseUrl,
    accpApiBaseUrl,
    mchId,
    spNo,
    privateKey,
    publicKey
  };
}

function buildPkcs8PrivateKey(privateKey) {
  if (/BEGIN [A-Z ]*PRIVATE KEY/.test(privateKey)) {
    return privateKey;
  }

  return crypto.createPrivateKey({
    key: Buffer.from(privateKey.replace(/\s+/g, ""), "base64"),
    format: "der",
    type: "pkcs8"
  });
}

function buildSpkiPublicKey(publicKey) {
  if (/BEGIN PUBLIC KEY/.test(publicKey)) {
    return publicKey;
  }

  return crypto.createPublicKey({
    key: Buffer.from(publicKey.replace(/\s+/g, ""), "base64"),
    format: "der",
    type: "spki"
  });
}

function getPrivateKeyObject(privateKey) {
  const key = buildPkcs8PrivateKey(privateKey);
  return typeof key === "string" ? crypto.createPrivateKey(key) : key;
}

function getPublicKeyObject(publicKey) {
  const key = buildSpkiPublicKey(publicKey);
  return typeof key === "string" ? crypto.createPublicKey(key) : key;
}

function fingerprintPublicKeyObject(publicKeyObject) {
  return crypto
    .createHash("sha256")
    .update(publicKeyObject.export({ format: "der", type: "spki" }))
    .digest("hex");
}

function maskIdentifier(value) {
  const text = normalizeText(value);
  if (!text) {
    return "";
  }
  if (text.length <= 8) {
    return `${text.slice(0, 2)}***${text.slice(-2)}`;
  }
  return `${text.slice(0, 4)}***${text.slice(-4)}`;
}

function signLianlianBody(body, privateKey) {
  const digest = crypto.createHash("md5").update(body, "utf8").digest("hex");
  return crypto
    .createSign("RSA-MD5")
    .update(digest, "utf8")
    .sign(buildPkcs8PrivateKey(privateKey), "base64");
}

function verifyLianlianSignature(body, signature, publicKey) {
  if (!signature) {
    return false;
  }

  const digest = crypto.createHash("md5").update(body, "utf8").digest("hex");
  return crypto
    .createVerify("RSA-MD5")
    .update(digest, "utf8")
    .verify(buildSpkiPublicKey(publicKey), signature, "base64");
}

function encryptWithLianlianPublicKey(value, publicKey) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }

  return crypto.publicEncrypt(
    {
      key: buildSpkiPublicKey(publicKey),
      padding: crypto.constants.RSA_PKCS1_PADDING
    },
    Buffer.from(normalized, "utf8")
  ).toString("base64");
}

function formatLianlianTimestamp(date = new Date()) {
  const shanghaiTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return shanghaiTime.toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

function createTxnSeqno(prefix = "YZSM") {
  const timestamp = formatLianlianTimestamp();
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}${timestamp}${suffix}`;
}

function createPaymentTxnSeqno(prefix = "YZPAY") {
  return createTxnSeqno(prefix);
}

function createPersonalUserTxnSeqno(prefix = "YZPU") {
  return createTxnSeqno(prefix);
}

function createAtChannelTxnSeqno(prefix = "YZAT") {
  return createTxnSeqno(prefix);
}

function createProfitSharingTxnSeqno(prefix = "YZSHARE") {
  return createTxnSeqno(prefix);
}

function createRefundTxnSeqno(prefix = "YZREF") {
  return createTxnSeqno(prefix);
}

function createWithdrawalTxnSeqno(prefix = "YZWD") {
  return createTxnSeqno(prefix);
}

function safeParseJson(raw) {
  const text = normalizeText(raw);
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return {};
  }
}

function safeParseJsonValue(value) {
  if (value && typeof value === "object") {
    return value;
  }
  return safeParseJson(value);
}

function getMutationCount(result) {
  const count = result && result.data ? result.data.count : result && result.count;
  const parsed = Number(count);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

async function listModelRecords(model, filter, limit = 1) {
  const result = await model.list({
    filter,
    pageSize: limit,
    pageNumber: 1
  });
  const data = result && result.data ? result.data : {};
  return Array.isArray(data.records) ? data.records : [];
}

async function findSingleOrderRecord(where) {
  const records = await listModelRecords(
    getOrderModel(),
    {
      where,
      orderBy: [
        {
          createdAtTs: "desc"
        }
      ]
    },
    1
  );
  return records[0] || null;
}

function getHeaderValue(headers, name) {
  const normalizedName = name.toLowerCase();
  const source = headers || {};
  const matchedKey = Object.keys(source).find((key) => key.toLowerCase() === normalizedName);
  return matchedKey ? normalizeText(source[matchedKey]) : "";
}

function requestJson(url, options = {}) {
  if (!options.method) {
    return new Promise((resolve, reject) => {
      const req = https.get(url, { timeout: 5000 }, (res) => {
        let raw = "";

        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }

          try {
            resolve(JSON.parse(raw));
          } catch (err) {
            reject(err);
          }
        });
      });

      req.on("timeout", () => {
        req.destroy(new Error("Request timeout"));
      });
      req.on("error", reject);
    });
  }

  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: options.method,
        headers: options.headers || {},
        timeout: options.timeout || 15000
      },
      (res) => {
        let raw = "";

        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            raw,
            json: safeParseJson(raw)
          });
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error("Request timeout"));
    });
    req.on("error", reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function postLianlianJson(path, payload) {
  const config = getLianlianConfig();
  const body = JSON.stringify(payload);
  const signature = signLianlianBody(body, config.privateKey);
  const timestamp = formatLianlianTimestamp();
  const headers = {
    "Content-Type": "application/json;charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Signature-Type": "RSA",
    "Signature-Data": signature,
    timestamp,
    mch_id: config.mchId,
    sp_no: config.spNo || ""
  };
  const response = await requestJson(`${config.baseUrl}${path}`, {
    method: "POST",
    headers,
    body,
    timeout: 20000
  });
  const responseSignature = getHeaderValue(response.headers, "Signature-Data");

  return {
    request: {
      url: `${config.baseUrl}${path}`,
      headers: {
        "Signature-Type": headers["Signature-Type"],
        timestamp,
        mch_id: headers.mch_id,
        sp_no: headers.sp_no
      },
      body: payload
    },
    response: Object.assign({}, response, {
      signatureVerified: responseSignature
        ? verifyLianlianSignature(response.raw, responseSignature, config.publicKey)
        : false
    })
  };
}

async function postLianlianAccpJson(path, payload) {
  const config = getLianlianConfig();
  const body = JSON.stringify(payload);
  const signature = signLianlianBody(body, config.privateKey);
  const headers = {
    "Content-Type": "application/json;charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Signature-Type": "RSA",
    "Signature-Data": signature
  };
  const url = `${config.accpApiBaseUrl}${path}`;
  const response = await requestJson(url, {
    method: "POST",
    headers,
    body,
    timeout: 20000
  });
  const responseSignature = getHeaderValue(response.headers, "Signature-Data");

  return {
    request: {
      url,
      headers: {
        "Signature-Type": headers["Signature-Type"]
      },
      body: payload
    },
    response: Object.assign({}, response, {
      signatureVerified: responseSignature
        ? verifyLianlianSignature(response.raw, responseSignature, config.publicKey)
        : false
    })
  };
}

function buildNotifyUrl(payload) {
  const explicit = normalizeText(payload.notifyUrl || payload.notify_url);
  if (explicit) {
    return explicit;
  }

  const configured = normalizeText(process.env.LIANLIAN_ONBOARDING_NOTIFY_URL);
  assertCondition(
    configured,
    `缺少 notify_url，请传入完整 HTTPS URL 或配置 LIANLIAN_ONBOARDING_NOTIFY_URL（路径为 ${DEFAULT_ONBOARDING_NOTIFY_PATH}）`
  );
  return configured;
}

function buildCurrentEnvServiceUrl(path) {
  const envId = normalizeText(process.env.TCB_ENV || process.env.SCF_NAMESPACE);
  return envId ? `https://${envId}.service.tcloudbase.com${path}` : "";
}

function buildPaymentNotifyUrl(payload) {
  const explicit = normalizeText(payload.notifyUrl || payload.notify_url);
  if (explicit) {
    return explicit;
  }

  const configured = normalizeText(process.env.LIANLIAN_PAYMENT_NOTIFY_URL) || buildCurrentEnvServiceUrl(DEFAULT_PAYMENT_NOTIFY_PATH);
  assertCondition(
    configured,
    `缺少 notify_url，请传入完整 HTTPS URL 或配置 LIANLIAN_PAYMENT_NOTIFY_URL（路径为 ${DEFAULT_PAYMENT_NOTIFY_PATH}）`
  );
  return configured;
}

function buildRefundNotifyUrl(payload) {
  const explicit = normalizeText(payload.notifyUrl || payload.notify_url);
  if (explicit) {
    return explicit;
  }

  const configured = normalizeText(process.env.LIANLIAN_REFUND_NOTIFY_URL) || buildCurrentEnvServiceUrl(DEFAULT_REFUND_NOTIFY_PATH);
  assertCondition(
    configured,
    `缺少 notify_url，请传入完整 HTTPS URL 或配置 LIANLIAN_REFUND_NOTIFY_URL（路径为 ${DEFAULT_REFUND_NOTIFY_PATH}）`
  );
  return configured;
}

function buildWithdrawalNotifyUrl(payload) {
  const explicit = normalizeText(payload.notifyUrl || payload.notify_url);
  if (explicit) {
    return explicit;
  }

  const configured = normalizeText(process.env.LIANLIAN_WITHDRAWAL_NOTIFY_URL) || buildCurrentEnvServiceUrl(DEFAULT_WITHDRAWAL_NOTIFY_PATH);
  assertCondition(
    configured,
    `缺少 notify_url，请传入完整 HTTPS URL 或配置 LIANLIAN_WITHDRAWAL_NOTIFY_URL（路径为 ${DEFAULT_WITHDRAWAL_NOTIFY_PATH}）`
  );
  return configured;
}

function buildWechatPayProductInfo(payload) {
  const source = payload.wechatPay || payload.wechat_pay || {};
  const chnlNo = normalizeText(source.chnlNo || source.chnl_no || process.env.LIANLIAN_WECHAT_CHNL_NO || DEFAULT_WECHAT_CHNL_NO);
  const chnlName = normalizeText(source.chnlName || source.chnl_name || process.env.LIANLIAN_WECHAT_CHNL_NAME);
  const wechatPay = {
    order_flag: normalizeBoolean(source.orderFlag || source.order_flag, true),
    order_delivery_flag: normalizeBoolean(source.orderDeliveryFlag || source.order_delivery_flag, true),
    pay_type: normalizeText(source.payType || source.pay_type || process.env.LIANLIAN_WECHAT_PAY_TYPE) || DEFAULT_WECHAT_PAY_CONFIG.payType,
    charge_infos: [
      {
        rate_level: normalizeText(source.rateLevel || source.rate_level || process.env.LIANLIAN_WECHAT_RATE_LEVEL) || DEFAULT_WECHAT_PAY_CONFIG.rateLevel,
        rate: normalizeText(source.rate || process.env.LIANLIAN_WECHAT_RATE) || DEFAULT_WECHAT_PAY_CONFIG.rate,
        down_limit: normalizeText(source.downLimit || source.down_limit || process.env.LIANLIAN_WECHAT_DOWN_LIMIT) || DEFAULT_WECHAT_PAY_CONFIG.downLimit,
        up_limit: normalizeText(source.upLimit || source.up_limit || process.env.LIANLIAN_WECHAT_UP_LIMIT) || DEFAULT_WECHAT_PAY_CONFIG.upLimit
      }
    ]
  };

  if (chnlNo) {
    wechatPay.chnl_no = chnlNo;
  }
  if (chnlName) {
    wechatPay.chnl_name = chnlName;
  }

  return {
    wechat_pay: wechatPay
  };
}

function normalizeAtChannelType(value) {
  const channelType = normalizeText(value || process.env.LIANLIAN_AT_CHNL_TYPE || DEFAULT_AT_CHANNEL_TYPE).toUpperCase();

  assertCondition(["WECHAT", "ALIPAY"].indexOf(channelType) >= 0, "渠道类型仅支持 WECHAT 或 ALIPAY");
  return channelType;
}

function normalizeWechatSceneFlag(value) {
  const sceneFlag = normalizeText(value || process.env.LIANLIAN_WECHAT_SCENE_FLAG).toUpperCase();

  assertCondition(["W1", "W2", "W3", "W4", "W5", "W6"].indexOf(sceneFlag) >= 0, "微信报备需要 scene_flag，取值为 W1-W6");
  return sceneFlag;
}

function buildAtSubMerchantChannelRegisterBody(payload = {}) {
  const txnSeqno = normalizeText(payload.txnSeqno || payload.txn_seqno) || createAtChannelTxnSeqno();
  const subMchid = normalizeText(payload.subMchid || payload.sub_mchid || process.env.LIANLIAN_SUB_MCHID) || DEFAULT_SUB_MCHID;
  const chnlNo = normalizeText(payload.chnlNo || payload.chnl_no || process.env.LIANLIAN_WECHAT_CHNL_NO || DEFAULT_WECHAT_CHNL_NO);
  const chnlName = normalizeText(payload.chnlName || payload.chnl_name || process.env.LIANLIAN_WECHAT_CHNL_NAME);
  const chnlType = normalizeAtChannelType(payload.chnlType || payload.chnl_type);

  assertCondition(txnSeqno.length <= 32, "txn_seqno 不能超过 32 位");
  assertCondition(subMchid, "缺少二级商户号 sub_mchid");
  assertCondition(chnlNo, "缺少渠道商号 chnl_no");
  assertCondition(chnlName, "缺少渠道商名称 chnl_name");

  const requestBody = {
    txn_seqno: txnSeqno,
    sub_mchid: subMchid,
    chnl_no: chnlNo,
    chnl_name: chnlName,
    chnl_type: chnlType
  };

  if (chnlType === "WECHAT") {
    requestBody.scene_flag = normalizeWechatSceneFlag(payload.sceneFlag || payload.scene_flag);
  }

  return requestBody;
}

function buildAtSubMerchantWechatConfigBody(payload = {}) {
  const txnSeqno = normalizeText(payload.txnSeqno || payload.txn_seqno) || createAtChannelTxnSeqno("YZWX");
  const subMchid = normalizeText(payload.subMchid || payload.sub_mchid || process.env.LIANLIAN_SUB_MCHID) || DEFAULT_SUB_MCHID;
  const wechatSubMchId = normalizeText(
    payload.wechatSubMchId
    || payload.wechat_sub_mch_id
    || payload.wechatSubMchid
    || payload.wechat_sub_mchid
  );
  const appId = normalizeText(payload.appId || payload.app_id || payload.appid) || DEFAULT_WECHAT_APPLET_APPID;
  const jsapiPath = normalizeText(payload.jsapiPath || payload.jsapi_path);
  const payType = normalizeText(payload.payType || payload.pay_type) || DEFAULT_WECHAT_APPLET_PAY_TYPE;

  assertCondition(txnSeqno.length <= 32, "txn_seqno 不能超过 32 位");
  assertCondition(subMchid, "缺少二级商户号 sub_mchid");
  assertCondition(wechatSubMchId, "缺少微信子商户号 wechatSubMchId");
  assertCondition(appId || jsapiPath, "微信渠道参数配置需要 appId 或 jsapiPath");

  const wechatConfig = {
    pay_type: payType
  };

  if (appId) {
    wechatConfig.app_id = appId;
  }
  if (jsapiPath) {
    wechatConfig.jsapi_path = jsapiPath;
  }

  return {
    txn_seqno: txnSeqno,
    sub_mchid: subMchid,
    wechat_sub_mch_id: wechatSubMchId,
    wechat_config: wechatConfig
  };
}

async function insertOnboardingRecord(data) {
  const now = Date.now();
  const result = await db.collection(LIANLIAN_ONBOARDING_COLLECTION).add({
    data: Object.assign({}, data, {
      createdAt: now,
      updatedAt: now
    })
  });

  return normalizeText(result && result._id);
}

async function insertPaymentRecord(data) {
  const now = Date.now();
  const result = await db.collection(LIANLIAN_PAYMENT_COLLECTION).add({
    data: Object.assign({}, data, {
      createdAt: now,
      updatedAt: now
    })
  });

  return normalizeText(result && result._id);
}

async function updatePaymentRecord(recordId, data) {
  if (!recordId) {
    return;
  }

  await db.collection(LIANLIAN_PAYMENT_COLLECTION).doc(recordId).update({
    data: Object.assign({}, data, {
      updatedAt: Date.now()
    })
  });
}

async function insertProfitSharingRecord(data) {
  const now = Date.now();
  const result = await db.collection(LIANLIAN_PROFIT_SHARING_COLLECTION).add({
    data: Object.assign({}, data, {
      createdAt: now,
      updatedAt: now
    })
  });

  return normalizeText(result && result._id);
}

async function updateProfitSharingRecord(recordId, data) {
  if (!recordId) {
    return;
  }

  await db.collection(LIANLIAN_PROFIT_SHARING_COLLECTION).doc(recordId).update({
    data: Object.assign({}, data, {
      updatedAt: Date.now()
    })
  });
}

async function insertRefundRecord(data) {
  const now = Date.now();
  const result = await db.collection(LIANLIAN_REFUND_COLLECTION).add({
    data: Object.assign({}, data, {
      createdAt: now,
      updatedAt: now
    })
  });

  return normalizeText(result && result._id);
}

async function updateRefundRecord(recordId, data) {
  if (!recordId) {
    return;
  }

  await db.collection(LIANLIAN_REFUND_COLLECTION).doc(recordId).update({
    data: Object.assign({}, data, {
      updatedAt: Date.now()
    })
  });
}

async function insertWithdrawalRecord(data) {
  const now = Date.now();
  const result = await db.collection(LIANLIAN_WITHDRAWAL_COLLECTION).add({
    data: Object.assign({}, data, {
      createdAt: now,
      updatedAt: now
    })
  });

  return normalizeText(result && result._id);
}

async function updateWithdrawalRecord(recordId, data) {
  if (!recordId) {
    return;
  }

  await db.collection(LIANLIAN_WITHDRAWAL_COLLECTION).doc(recordId).update({
    data: Object.assign({}, data, {
      updatedAt: Date.now()
    })
  });
}

async function updateOnboardingRecord(recordId, data) {
  if (!recordId) {
    return;
  }

  await db.collection(LIANLIAN_ONBOARDING_COLLECTION).doc(recordId).update({
    data: Object.assign({}, data, {
      updatedAt: Date.now()
    })
  });
}

async function applySubMerchant(payload = {}) {
  const config = getLianlianConfig();
  const userId = normalizeText(payload.userId || payload.user_id) || DEFAULT_SUB_MERCHANT_USER_ID;
  const txnSeqno = normalizeText(payload.txnSeqno || payload.txn_seqno) || createTxnSeqno();
  const notifyUrl = buildNotifyUrl(payload);
  const licenseNumber = normalizeText(payload.licenseNumber || payload.license_number);
  const requestBody = {
    txn_seqno: txnSeqno,
    user_id: userId,
    notify_url: notifyUrl,
    product_info: buildWechatPayProductInfo(payload)
  };

  if (licenseNumber) {
    requestBody.license_number = encryptWithLianlianPublicKey(licenseNumber, config.publicKey);
  }

  const recordId = await insertOnboardingRecord({
    type: "sub_merchant_apply_page",
    userId,
    txnSeqno,
    notifyUrl,
    status: "REQUESTING",
    requestSnapshot: requestBody
  });

  try {
    const result = await postLianlianJson("/mch/v1/customer/access/productInfo", requestBody);
    const response = result.response.json || {};
    await updateOnboardingRecord(recordId, {
      status: normalizeText(response.status) || normalizeText(response.ret_code) || "RESPONDED",
      h5Url: normalizeText(response.url || response.h5_url),
      responseSnapshot: response,
      httpStatusCode: result.response.statusCode,
      responseSignatureVerified: result.response.signatureVerified
    });

    return {
      recordId,
      txnSeqno,
      userId,
      notifyUrl,
      requestSnapshot: requestBody,
      response
    };
  } catch (error) {
    await updateOnboardingRecord(recordId, {
      status: "FAILED",
      errorMessage: normalizeText(error && error.message)
    });
    throw error;
  }
}

async function querySubMerchantOnboarding(payload = {}) {
  const txnSeqno = normalizeText(payload.txnSeqno || payload.txn_seqno);
  assertCondition(txnSeqno, "缺少 txn_seqno");

  const requestBody = { txn_seqno: txnSeqno };
  const result = await postLianlianJson("/mch/v2/customer/access/query", requestBody);
  return {
    txnSeqno,
    response: result.response.json || {},
    httpStatusCode: result.response.statusCode,
    responseSignatureVerified: result.response.signatureVerified
  };
}

async function listSubMerchantOnboardingNotifications(payload = {}) {
  const txnSeqno = normalizeText(payload.txnSeqno || payload.txn_seqno);
  const limit = Math.min(Math.max(Number(payload.limit) || 10, 1), 50);

  assertCondition(txnSeqno, "缺少 txn_seqno");

  const result = await db
    .collection(LIANLIAN_ONBOARDING_COLLECTION)
    .where({
      type: "sub_merchant_notify",
      txnSeqno
    })
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return {
    txnSeqno,
    records: (result.data || []).map((record) => ({
      id: normalizeText(record._id),
      txnSeqno: normalizeText(record.txnSeqno),
      userId: normalizeText(record.userId),
      status: normalizeText(record.status),
      subMchid: normalizeText(record.subMchid),
      wxSubMchid: normalizeText(record.wxSubMchid),
      aliSubMchid: normalizeText(record.aliSubMchid),
      signatureVerified: Boolean(record.signatureVerified),
      notifySnapshot: record.notifySnapshot || {},
      rawBody: normalizeText(record.rawBody),
      createdAt: record.createdAt || 0,
      updatedAt: record.updatedAt || 0
    }))
  };
}

async function registerAtSubMerchantChannel(payload = {}) {
  const requestBody = buildAtSubMerchantChannelRegisterBody(payload);
  const recordId = await insertOnboardingRecord({
    type: "at_sub_merchant_channel_register",
    txnSeqno: requestBody.txn_seqno,
    subMchid: requestBody.sub_mchid,
    chnlNo: requestBody.chnl_no,
    chnlName: requestBody.chnl_name,
    chnlType: requestBody.chnl_type,
    sceneFlag: normalizeText(requestBody.scene_flag),
    status: "REQUESTING",
    requestSnapshot: requestBody
  });

  try {
    const result = await postLianlianJson("/sp/v1/customer/access/sub/channelRegister", requestBody);
    const response = result.response.json || {};
    await updateOnboardingRecord(recordId, {
      status: normalizeText(response.ret_code) === "0000" ? "REGISTERED" : "FAILED",
      aliSubMchid: normalizeText(response.ali_sub_mch_id),
      wechatSubMchid: normalizeText(response.wechat_sub_mch_id),
      responseSnapshot: response,
      httpStatusCode: result.response.statusCode,
      responseSignatureVerified: result.response.signatureVerified
    });

    return {
      recordId,
      txnSeqno: requestBody.txn_seqno,
      requestSnapshot: requestBody,
      response,
      httpStatusCode: result.response.statusCode,
      responseSignatureVerified: result.response.signatureVerified
    };
  } catch (error) {
    await updateOnboardingRecord(recordId, {
      status: "FAILED",
      errorMessage: normalizeText(error && error.message)
    });
    throw error;
  }
}

async function configureAtSubMerchantWechat(payload = {}) {
  const requestBody = buildAtSubMerchantWechatConfigBody(payload);
  const recordId = await insertOnboardingRecord({
    type: "at_sub_merchant_wechat_config",
    txnSeqno: requestBody.txn_seqno,
    subMchid: requestBody.sub_mchid,
    wechatSubMchId: requestBody.wechat_sub_mch_id,
    status: "REQUESTING",
    requestSnapshot: requestBody
  });

  try {
    const result = await postLianlianJson(LIANLIAN_AT_WECHAT_CONFIG_PATH, requestBody);
    const response = result.response.json || {};
    await updateOnboardingRecord(recordId, {
      status: normalizeText(response.ret_code) === "0000" ? "CONFIGURED" : "FAILED",
      responseSnapshot: response,
      httpStatusCode: result.response.statusCode,
      responseSignatureVerified: result.response.signatureVerified
    });

    return {
      recordId,
      txnSeqno: requestBody.txn_seqno,
      requestSnapshot: requestBody,
      response,
      httpStatusCode: result.response.statusCode,
      responseSignatureVerified: result.response.signatureVerified
    };
  } catch (error) {
    await updateOnboardingRecord(recordId, {
      status: "FAILED",
      errorMessage: normalizeText(error && error.message)
    });
    throw error;
  }
}

function appendQueryParameter(url, name, value) {
  const normalizedUrl = normalizeText(url);
  if (!normalizedUrl) {
    return "";
  }

  const separator = normalizedUrl.indexOf("?") >= 0 ? "&" : "?";
  return `${normalizedUrl}${separator}${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
}

function buildReturnUrl(payload = {}) {
  const explicit = normalizeText(payload.returnUrl || payload.return_url);
  if (explicit) {
    return explicit;
  }

  const configured = normalizeText(process.env.LIANLIAN_ACCOUNT_RETURN_URL);
  assertCondition(configured, "缺少 return_url，请传入页面返回地址或配置 LIANLIAN_ACCOUNT_RETURN_URL");
  return configured;
}

function normalizeJsonString(value) {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return normalizeText(value);
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return normalizeText(value);
}

function normalizeYesNoMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.keys(value).reduce((result, key) => {
    const normalizedKey = normalizeText(key);
    const normalizedValue = normalizeText(value[key]).toUpperCase();
    if (normalizedKey && ["Y", "N"].indexOf(normalizedValue) >= 0) {
      result[normalizedKey] = normalizedValue;
    }
    return result;
  }, {});
}

function buildSupportFunctions(payload = {}) {
  const source = payload.supportFunctions || payload.support_functions || {};
  const supportFunctions = {};
  const account = normalizeYesNoMap(source.ACCOUNT || source.account);
  const balance = normalizeYesNoMap(source.BALANCE || source.balance);
  const bankCard = normalizeYesNoMap(source.BANK_CARD || source.bankCard || source.bank_card);

  if (Object.keys(account).length) {
    supportFunctions.ACCOUNT = account;
  }
  if (Object.keys(balance).length) {
    supportFunctions.BALANCE = balance;
  }
  if (Object.keys(bankCard).length) {
    supportFunctions.BANK_CARD = bankCard;
  }

  return supportFunctions;
}

function buildDefaultRiskItem(userId, scene) {
  return JSON.stringify({
    user_id: userId,
    source: "yezai_admin",
    scene,
    timestamp: formatLianlianTimestamp()
  });
}

function buildPersonalBasicInfo(payload = {}, publicKey) {
  const source = payload.basicInfo || payload.basic_info || {};
  const basicInfo = {};
  const encryptedFields = {
    reg_phone: source.regPhone || source.reg_phone || payload.regPhone || payload.reg_phone,
    user_name: source.userName || source.user_name || payload.userName || payload.user_name,
    id_no: source.idNo || source.id_no || payload.idNo || payload.id_no
  };
  const plainFields = {
    id_type: source.idType || source.id_type || payload.idType || payload.id_type,
    id_exp: source.idExp || source.id_exp || payload.idExp || payload.id_exp,
    id_std: source.idStd || source.id_std || payload.idStd || payload.id_std,
    address: source.address || payload.address,
    reg_email: source.regEmail || source.reg_email || payload.regEmail || payload.reg_email,
    occupation: source.occupation || payload.occupation
  };

  Object.keys(encryptedFields).forEach((key) => {
    const value = normalizeText(encryptedFields[key]);
    if (value) {
      basicInfo[key] = encryptWithLianlianPublicKey(value, publicKey);
    }
  });

  Object.keys(plainFields).forEach((key) => {
    const value = normalizeText(plainFields[key]);
    if (value) {
      basicInfo[key] = value;
    }
  });

  if (!Object.keys(basicInfo).some((key) => key !== "id_type")) {
    return {};
  }

  if (basicInfo.id_no && !basicInfo.id_type) {
    basicInfo.id_type = "IDCARD";
  }

  return basicInfo;
}

function buildPersonalUserH5OpenAcctBody(payload = {}) {
  const config = getLianlianConfig();
  const userId = normalizeText(payload.userId || payload.user_id);
  const txnSeqno = normalizeText(payload.txnSeqno || payload.txn_seqno) || createPersonalUserTxnSeqno();
  const notifyUrl = buildNotifyUrl(payload);
  const returnUrl = normalizeText(payload.returnUrl || payload.return_url);
  const accountLevel = normalizeText(payload.accountLevel || payload.account_level) || DEFAULT_PERSONAL_ACCOUNT_LEVEL;
  const requestBody = {
    mch_id: config.mchId,
    user_id: userId,
    txn_seqno: txnSeqno,
    txn_time: normalizeText(payload.txnTime || payload.txn_time) || formatLianlianTimestamp(),
    notify_url: notifyUrl,
    user_type: DEFAULT_PERSONAL_USER_TYPE,
    cust_trade_serial_type: normalizeText(payload.custTradeSerialType || payload.cust_trade_serial_type) || DEFAULT_PERSONAL_TRADE_SERIAL_TYPE,
    account_info: {
      account_type: DEFAULT_PERSONAL_ACCOUNT_TYPE,
      account_level: accountLevel
    }
  };

  assertCondition(userId, "缺少个人用户 user_id");
  assertCondition(userId.length <= 40, "user_id 不能超过 40 位");
  assertCondition(txnSeqno.length <= 32, "txn_seqno 不能超过 32 位");
  assertCondition(["V1", "V2", "V3"].indexOf(accountLevel) >= 0, "account_level 仅支持 V1、V2、V3");

  if (returnUrl) {
    requestBody.return_url = returnUrl;
  }

  const unmodifiableField = normalizeText(payload.unmodifiableField || payload.un_modifiable_field);
  if (unmodifiableField) {
    requestBody.un_modifiable_field = unmodifiableField;
  }

  const syncOpenLzt = normalizeText(payload.syncOpenLzt || payload.sync_open_lzt).toUpperCase();
  if (syncOpenLzt) {
    assertCondition(["Y", "N"].indexOf(syncOpenLzt) >= 0, "sync_open_lzt 仅支持 Y 或 N");
    requestBody.sync_open_lzt = syncOpenLzt;
  }

  const basicInfo = buildPersonalBasicInfo(payload, config.publicKey);
  if (Object.keys(basicInfo).length) {
    requestBody.basic_info = basicInfo;
  }

  return {
    requestBody,
    txnSeqno,
    userId,
    notifyUrl
  };
}

async function applyPersonalUserH5OpenAcct(payload = {}, access = {}) {
  const effectivePayload = Object.assign({}, payload, {
    userId: resolvePersonalOnboardingUserId(payload, access)
  });
  const built = buildPersonalUserH5OpenAcctBody(effectivePayload);

  try {
    await assertPersonalUserOpened(built.userId);
    throw new Error("该用户已完成连连个人开户，无需重复开户");
  } catch (error) {
    if (normalizeText(error && error.message) !== "该用户尚未完成连连个人开户") {
      throw error;
    }
  }

  const recordId = await insertOnboardingRecord({
    type: "personal_user_h5_openacct_apply",
    userId: built.userId,
    txnSeqno: built.txnSeqno,
    notifyUrl: built.notifyUrl,
    status: "REQUESTING",
    requestSnapshot: built.requestBody
  });

  try {
    const result = await postLianlianJson("/mch/v1/accp/customer/h5-openacct-apply", built.requestBody);
    const response = result.response.json || {};
    const gatewayUrl = normalizeText(response.gateway_url || response.gatewayUrl);
    await updateOnboardingRecord(recordId, {
      status: normalizeText(response.ret_code) === "0000" ? "H5_READY" : "FAILED",
      platformTxno: normalizeText(response.platform_txno || response.platformTxno),
      gatewayUrl,
      gatewayUrlWithHeader: gatewayUrl ? appendQueryParameter(gatewayUrl, "header", "Y") : "",
      responseSnapshot: response,
      httpStatusCode: result.response.statusCode,
      responseSignatureVerified: result.response.signatureVerified
    });

    return {
      recordId,
      txnSeqno: built.txnSeqno,
      userId: built.userId,
      notifyUrl: built.notifyUrl,
      gatewayUrl,
      gatewayUrlWithHeader: gatewayUrl ? appendQueryParameter(gatewayUrl, "header", "Y") : "",
      requestSnapshot: built.requestBody,
      response,
      httpStatusCode: result.response.statusCode,
      responseSignatureVerified: result.response.signatureVerified
    };
  } catch (error) {
    await updateOnboardingRecord(recordId, {
      status: "FAILED",
      errorMessage: normalizeText(error && error.message)
    });
    throw error;
  }
}

async function assertPersonalUserOpened(userId) {
  const normalizedUserId = normalizeText(userId);
  assertCondition(normalizedUserId, "缺少个人用户 user_id");

  const result = await db
    .collection(LIANLIAN_ONBOARDING_COLLECTION)
    .where({
      type: "personal_user_notify",
      userId: normalizedUserId
    })
    .orderBy("createdAt", "desc")
    .limit(10)
    .get();

  const openedRecord = normalizeArray(result && result.data).find((record) => {
    const userStatus = normalizeText(record.userStatus || record.status).toUpperCase();
    return userStatus === "NORMAL";
  });

  assertCondition(
    openedRecord,
    "该用户尚未完成连连个人开户"
  );

  return openedRecord;
}

function buildPersonalUserH5AccountManageBody(payload = {}) {
  const config = getLianlianConfig();
  const userId = normalizeText(payload.userId || payload.user_id);
  const txnSeqno = normalizeText(payload.txnSeqno || payload.txn_seqno) || createPersonalUserTxnSeqno("YZACCT");
  const requestBody = {
    mch_id: config.mchId,
    user_id: userId,
    txn_seqno: txnSeqno,
    txn_time: normalizeText(payload.txnTime || payload.txn_time) || formatLianlianTimestamp(),
    return_url: buildReturnUrl(payload)
  };

  assertCondition(userId, "缺少个人用户 user_id");
  assertCondition(userId.length <= 40, "user_id 不能超过 40 位");
  assertCondition(txnSeqno.length <= 32, "txn_seqno 不能超过 32 位");

  const notifyUrl = normalizeText(payload.notifyUrl || payload.notify_url);
  if (notifyUrl) {
    requestBody.notify_url = notifyUrl;
  }

  const cancelNotifyUrl = normalizeText(payload.cancelNotifyUrl || payload.cancel_notify_url);
  if (cancelNotifyUrl) {
    requestBody.cancel_notify_url = cancelNotifyUrl;
  }

  const riskItem = normalizeJsonString(payload.riskItem || payload.risk_item);
  if (riskItem) {
    requestBody.risk_item = riskItem;
  }

  const withdrawalFeeAmount = normalizeText(payload.withdrawalFeeAmount || payload.withdrawal_fee_amount);
  if (withdrawalFeeAmount) {
    requestBody.withdrawal_fee_amount = withdrawalFeeAmount;
  }

  const extend = normalizeJsonString(payload.extend);
  if (extend) {
    requestBody.extend = extend;
  }

  const supportFunctions = buildSupportFunctions(payload);
  if (Object.keys(supportFunctions).length) {
    requestBody.support_functions = supportFunctions;
  }

  return {
    requestBody,
    txnSeqno,
    userId
  };
}

async function applyPersonalUserH5AccountManage(payload = {}, access = {}) {
  const effectivePayload = Object.assign({}, payload, {
    userId: resolvePersonalOnboardingUserId(payload, access)
  });
  const built = buildPersonalUserH5AccountManageBody(effectivePayload);
  await assertPersonalUserOpened(built.userId);
  const recordId = await insertOnboardingRecord({
    type: "personal_user_h5_acct_apply",
    userId: built.userId,
    txnSeqno: built.txnSeqno,
    status: "REQUESTING",
    requestSnapshot: built.requestBody
  });

  try {
    const result = await postLianlianJson("/mch/v1/accp/customer/h5-acct-apply", built.requestBody);
    const response = result.response.json || {};
    const gatewayUrl = normalizeText(response.gateway_url || response.gatewayUrl);
    await updateOnboardingRecord(recordId, {
      status: normalizeText(response.ret_code) === "0000" ? "H5_READY" : "FAILED",
      platformTxno: normalizeText(response.platform_txno || response.platformTxno),
      gatewayUrl,
      gatewayUrlWithHeader: gatewayUrl ? appendQueryParameter(gatewayUrl, "header", "Y") : "",
      responseSnapshot: response,
      httpStatusCode: result.response.statusCode,
      responseSignatureVerified: result.response.signatureVerified
    });

    return {
      recordId,
      txnSeqno: built.txnSeqno,
      userId: built.userId,
      gatewayUrl,
      gatewayUrlWithHeader: gatewayUrl ? appendQueryParameter(gatewayUrl, "header", "Y") : "",
      requestSnapshot: built.requestBody,
      response,
      httpStatusCode: result.response.statusCode,
      responseSignatureVerified: result.response.signatureVerified
    };
  } catch (error) {
    await updateOnboardingRecord(recordId, {
      status: "FAILED",
      errorMessage: normalizeText(error && error.message)
    });
    throw error;
  }
}

function buildPersonalUserBindCardH5Body(payload = {}) {
  const built = buildPersonalUserH5AccountManageBody(Object.assign({}, payload, {
    txnSeqno: normalizeText(payload.txnSeqno || payload.txn_seqno) || createPersonalUserTxnSeqno("YZCARD"),
    supportFunctions: {
      ACCOUNT: {
        MODIFY_REG_PHONE: "N",
        MODIFY_PWD: "N",
        PASSWORD_RECOVER: "N",
        ACCOUNT_CANCEL: "N",
        MODIFY_USER_BASE: "N"
      },
      BALANCE: {
        WITHDRAWAL: "N",
        ACCOUNT_SERIAL: "N"
      },
      BANK_CARD: {
        MODIFY_LINKED_PHONE: "N",
        BIND_CHANGE_CARD: "Y",
        UNBIND_CARD: "N"
      }
    }
  }));
  const notifyUrl = normalizeText(payload.notifyUrl || payload.notify_url);

  if (notifyUrl) {
    built.requestBody.notify_url = notifyUrl;
  }

  return Object.assign({}, built, {
    notifyUrl
  });
}

async function applyPersonalUserBindCardH5(payload = {}, access = {}) {
  const effectivePayload = Object.assign({}, payload, {
    userId: resolvePersonalOnboardingUserId(payload, access)
  });
  const built = buildPersonalUserBindCardH5Body(effectivePayload);
  await assertPersonalUserOpened(built.userId);
  const recordId = await insertOnboardingRecord({
    type: "personal_user_bindcard_h5_apply",
    userId: built.userId,
    txnSeqno: built.txnSeqno,
    notifyUrl: built.notifyUrl,
    status: "REQUESTING",
    requestSnapshot: built.requestBody
  });

  try {
    const result = await postLianlianJson("/mch/v1/accp/customer/h5-acct-apply", built.requestBody);
    const response = result.response.json || {};
    const gatewayUrl = normalizeText(response.gateway_url || response.gatewayUrl);
    await updateOnboardingRecord(recordId, {
      status: normalizeText(response.ret_code) === "0000" ? "H5_READY" : "FAILED",
      platformTxno: normalizeText(response.platform_txno || response.platformTxno),
      gatewayUrl,
      gatewayUrlWithHeader: gatewayUrl ? appendQueryParameter(gatewayUrl, "header", "Y") : "",
      responseSnapshot: response,
      httpStatusCode: result.response.statusCode,
      responseSignatureVerified: result.response.signatureVerified
    });

    return {
      recordId,
      txnSeqno: built.txnSeqno,
      userId: built.userId,
      notifyUrl: built.notifyUrl,
      gatewayUrl,
      gatewayUrlWithHeader: gatewayUrl ? appendQueryParameter(gatewayUrl, "header", "Y") : "",
      requestSnapshot: built.requestBody,
      response,
      httpStatusCode: result.response.statusCode,
      responseSignatureVerified: result.response.signatureVerified
    };
  } catch (error) {
    await updateOnboardingRecord(recordId, {
      status: "FAILED",
      errorMessage: normalizeText(error && error.message)
    });
    throw error;
  }
}

async function listPersonalUserOnboardingRecords(payload = {}) {
  const txnSeqno = normalizeText(payload.txnSeqno || payload.txn_seqno);
  const userId = normalizeText(payload.userId || payload.user_id);
  const limit = Math.min(Math.max(Number(payload.limit) || 20, 1), 50);
  const where = {};

  if (txnSeqno) {
    where.txnSeqno = txnSeqno;
  }
  if (userId) {
    where.userId = userId;
  }

  const result = await db
    .collection(LIANLIAN_ONBOARDING_COLLECTION)
    .where(where)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return {
    records: (result.data || [])
      .filter((record) => ["personal_user_h5_openacct_apply", "personal_user_notify"].indexOf(record.type) >= 0)
      .map((record) => ({
        id: normalizeText(record._id),
        type: normalizeText(record.type),
        txnSeqno: normalizeText(record.txnSeqno),
        userId: normalizeText(record.userId),
        platformTxno: normalizeText(record.platformTxno),
        oidUserno: normalizeText(record.oidUserno),
        userStatus: normalizeText(record.userStatus),
        status: normalizeText(record.status),
        remark: normalizeText(record.remark),
        openAccountWillUrl: normalizeText(record.openAccountWillUrl),
        willVerifyStatus: normalizeText(record.willVerifyStatus),
        willFailResult: normalizeText(record.willFailResult),
        gatewayUrl: normalizeText(record.gatewayUrl),
        gatewayUrlWithHeader: normalizeText(record.gatewayUrlWithHeader),
        requestSnapshot: record.requestSnapshot || {},
        responseSnapshot: record.responseSnapshot || {},
        notifySnapshot: record.notifySnapshot || {},
        rawBody: normalizeText(record.rawBody),
        signatureVerified: Boolean(record.signatureVerified || record.responseSignatureVerified),
        createdAt: record.createdAt || 0,
        updatedAt: record.updatedAt || 0
      }))
  };
}

async function listPersonalUserOnboardingRecordsForAccess(payload = {}, access = {}) {
  if (access && access.accountType === "creator_portal") {
    return listPersonalUserOnboardingRecords(Object.assign({}, payload, {
      userId: normalizeText(access.boundCreatorId),
      txnSeqno: normalizeText(payload.txnSeqno || payload.txn_seqno)
    }));
  }

  return listPersonalUserOnboardingRecords(payload);
}

async function listPersonalUserAccountH5Records(payload = {}) {
  const txnSeqno = normalizeText(payload.txnSeqno || payload.txn_seqno);
  const userId = normalizeText(payload.userId || payload.user_id);
  const limit = Math.min(Math.max(Number(payload.limit) || 20, 1), 50);
  const where = {};

  if (txnSeqno) {
    where.txnSeqno = txnSeqno;
  }
  if (userId) {
    where.userId = userId;
  }

  const result = await db
    .collection(LIANLIAN_ONBOARDING_COLLECTION)
    .where(where)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return {
    records: (result.data || [])
      .filter((record) => ["personal_user_h5_acct_apply", "personal_user_bindcard_h5_apply"].indexOf(record.type) >= 0)
      .map((record) => ({
        id: normalizeText(record._id),
        type: normalizeText(record.type),
        txnSeqno: normalizeText(record.txnSeqno),
        userId: normalizeText(record.userId),
        platformTxno: normalizeText(record.platformTxno),
        status: normalizeText(record.status),
        gatewayUrl: normalizeText(record.gatewayUrl),
        gatewayUrlWithHeader: normalizeText(record.gatewayUrlWithHeader),
        requestSnapshot: record.requestSnapshot || {},
        responseSnapshot: record.responseSnapshot || {},
        signatureVerified: Boolean(record.signatureVerified || record.responseSignatureVerified),
        createdAt: record.createdAt || 0,
        updatedAt: record.updatedAt || 0
      }))
  };
}

async function listPersonalUserAccountH5RecordsForAccess(payload = {}, access = {}) {
  if (access && access.accountType === "creator_portal") {
    return listPersonalUserAccountH5Records(Object.assign({}, payload, {
      userId: normalizeText(access.boundCreatorId),
      txnSeqno: normalizeText(payload.txnSeqno || payload.txn_seqno)
    }));
  }

  return listPersonalUserAccountH5Records(payload);
}

function normalizeAmount(value, fallback = "0.01") {
  const parsed = Number(value);
  assertCondition(Number.isFinite(parsed) && parsed > 0, "金额必须大于 0");
  return parsed.toFixed(2);
}

function normalizeOptionalAmount(value) {
  const text = normalizeText(value);
  if (!text) {
    return "";
  }
  const parsed = Number(text);
  assertCondition(Number.isFinite(parsed) && parsed >= 0, "金额不能小于 0");
  return parsed.toFixed(2);
}

function maskBankAccount(value) {
  const text = normalizeText(value);
  if (!text) {
    return "";
  }
  if (text.length <= 4) {
    return text;
  }
  return `${"*".repeat(Math.max(text.length - 4, 0))}${text.slice(-4)}`;
}

function parseJsonArrayEnv(name) {
  const raw = normalizeText(process.env[name]);
  if (!raw) {
    return [];
  }
  const parsed = safeParseJson(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function normalizePlatformWithdrawalAccount(item = {}, index = 0) {
  const id = normalizeText(item.id || item.accountId || item.account_id) || `account_${index + 1}`;
  const agreementNo = normalizeText(item.agreementNo || item.agreement_no);
  const linkedAcctno = normalizeText(item.linkedAcctno || item.linked_acctno || item.bankAcctno || item.bank_acctno);
  const bankName = normalizeText(item.bankName || item.bank_name);
  const accountName = normalizeText(item.accountName || item.account_name || item.bankAcctname || item.bank_acctname);
  const masked = normalizeText(item.masked || item.accountMasked || item.account_masked || item.bankAccountMasked || item.bank_account_masked)
    || maskBankAccount(linkedAcctno);
  const label = normalizeText(item.label) || [bankName, masked].filter(Boolean).join(" ") || id;

  return {
    id,
    label,
    bankName,
    accountName,
    masked,
    agreementNo,
    linkedAcctno,
    isDefault: item.isDefault === true || item.default === true
  };
}

function getConfiguredPlatformWithdrawalAccounts() {
  const list = parseJsonArrayEnv("LIANLIAN_PLATFORM_WITHDRAWAL_ACCOUNTS")
    .map(normalizePlatformWithdrawalAccount)
    .filter((item) => item.id && (item.agreementNo || item.linkedAcctno));

  if (list.length) {
    return list;
  }

  const fallback = normalizePlatformWithdrawalAccount({
    id: process.env.LIANLIAN_PLATFORM_WITHDRAWAL_ACCOUNT_ID || "default",
    label: process.env.LIANLIAN_PLATFORM_WITHDRAWAL_ACCOUNT_LABEL,
    bankName: process.env.LIANLIAN_PLATFORM_WITHDRAWAL_BANK_NAME,
    accountName: process.env.LIANLIAN_PLATFORM_WITHDRAWAL_ACCOUNT_NAME,
    agreementNo: process.env.LIANLIAN_PLATFORM_WITHDRAWAL_AGREEMENT_NO,
    linkedAcctno: process.env.LIANLIAN_PLATFORM_WITHDRAWAL_LINKED_ACCTNO || process.env.LIANLIAN_PLATFORM_WITHDRAWAL_BANK_ACCTNO,
    masked: process.env.LIANLIAN_PLATFORM_WITHDRAWAL_ACCOUNT_MASKED,
    isDefault: true
  });

  return fallback.agreementNo || fallback.linkedAcctno ? [fallback] : [];
}

function getPlatformWithdrawalAccountById(accountId) {
  const accounts = getConfiguredPlatformWithdrawalAccounts();
  const normalizedAccountId = normalizeText(accountId || process.env.LIANLIAN_PLATFORM_WITHDRAWAL_DEFAULT_ACCOUNT_ID);
  return accounts.find((item) => item.id === normalizedAccountId) || accounts.find((item) => item.isDefault) || accounts[0] || null;
}

function serializePlatformWithdrawalAccount(account = {}) {
  return {
    id: normalizeText(account.id),
    label: normalizeText(account.label),
    bankName: normalizeText(account.bankName),
    accountName: normalizeText(account.accountName),
    masked: normalizeText(account.masked),
    isDefault: Boolean(account.isDefault),
    hasAgreementNo: Boolean(account.agreementNo),
    hasLinkedAcctno: Boolean(account.linkedAcctno)
  };
}

function buildWechatAppletExtendInfo(payload = {}) {
  const appid = normalizeText(payload.appid || payload.appId || process.env.WECHAT_APPID || process.env.WECHAT_APP_ID || process.env.WX_APPID);
  const openid = normalizeText(payload.openid || payload.openId || payload.userOpenid);

  assertCondition(appid, "缺少微信小程序 appid");
  assertCondition(openid, "缺少微信用户 openid");

  const wxData = {
    appid,
    openid
  };
  const forbiddenCardType = normalizeText(payload.forbiddenCardType || payload.forbidden_card_type);
  if (forbiddenCardType) {
    wxData.forbidden_card_type = forbiddenCardType;
  }

  return JSON.stringify({ wx_data: wxData });
}

function buildPayeeInfos(payload = {}, amount) {
  const payeeUid = normalizeText(payload.payeeUid || payload.payee_uid || process.env.LIANLIAN_PAYEE_UID) || DEFAULT_SUB_MERCHANT_USER_ID;
  const payeeType = normalizeText(payload.payeeType || payload.payee_type || process.env.LIANLIAN_PAYEE_TYPE) || "USER";
  const payeeAcctType = normalizeText(payload.payeeAcctType || payload.payeeAccttype || payload.payee_accttype || process.env.LIANLIAN_PAYEE_ACCTTYPE) || "FUNDPROCESS";

  assertCondition(payeeUid, "缺少收款方用户 id");

  const payeeInfo = {
    payee_uid: payeeUid,
    payee_type: payeeType,
    payee_amount: amount,
    payee_memo: normalizeText(payload.payeeMemo || payload.payee_memo) || "野哉二级商户收款"
  };

  if (payeeType !== "MCH") {
    payeeInfo.payee_accttype = payeeAcctType;
  }

  return [payeeInfo];
}

function normalizeShareFlag(payload = {}) {
  const shareFlag = (normalizeText(payload.shareFlag || payload.share_flag) || "DELAY").toUpperCase();

  assertCondition(["IMMEDIATE", "DELAY"].indexOf(shareFlag) >= 0, "share_flag 仅支持 IMMEDIATE 或 DELAY");
  return shareFlag;
}

function buildPaymentGoodsInfo(payload = {}, amount) {
  const goodsId = normalizeText(
    payload.goodsId
    || payload.goods_id
    || payload.orderNo
    || payload.order_no
    || payload.serviceSlug
    || payload.service_slug
  ) || "yezai-travel-order";
  const goodsName = normalizeText(payload.goodsName || payload.goods_name || payload.orderInfo || payload.order_info) || "野哉旅行报名";
  const goodsCategory = normalizeText(payload.goodsCategory || payload.goods_category) || "旅行服务";
  const goodsQuantity = normalizeText(payload.goodsQuantity || payload.goods_quantity) || "1";
  const goodsBody = normalizeText(payload.goodsBody || payload.goods_body || payload.orderInfo || payload.order_info) || goodsName;

  return [
    {
      goods_id: goodsId,
      goods_name: goodsName,
      goods_category: goodsCategory,
      goods_quantity: goodsQuantity,
      goods_price: amount,
      goods_body: goodsBody
    }
  ];
}

function buildCreatePaymentBody(payload = {}) {
  const config = getLianlianConfig();
  const amount = normalizeAmount(payload.amount || payload.orderAmount || payload.order_amount);
  const txnSeqno = normalizeText(payload.txnSeqno || payload.txn_seqno) || createPaymentTxnSeqno();
  const payType = normalizeText(payload.payType || payload.pay_type) || DEFAULT_WECHAT_APPLET_PAY_TYPE;
  const subMchid = normalizeText(payload.subMchid || payload.sub_mchid || process.env.LIANLIAN_SUB_MCHID) || DEFAULT_SUB_MCHID;

  assertCondition(payType === DEFAULT_WECHAT_APPLET_PAY_TYPE, "当前测试链路仅支持 WECHAT_APPLET");

  return {
    mch_id: config.mchId,
    sub_mchid: subMchid,
    user_id: normalizeText(payload.userId || payload.user_id) || DEFAULT_SUB_MERCHANT_USER_ID,
    busi_type: normalizeText(payload.busiType || payload.busi_type) || DEFAULT_PAYMENT_BUSI_TYPE,
    txn_seqno: txnSeqno,
    txn_time: normalizeText(payload.txnTime || payload.txn_time) || formatLianlianTimestamp(),
    order_amount: amount,
    order_info: normalizeText(payload.orderInfo || payload.order_info) || "野哉测试支付",
    risk_item: normalizeJsonString(payload.riskItem || payload.risk_item),
    pay_expire: Number(payload.payExpire || payload.pay_expire || DEFAULT_PAYMENT_EXPIRE_MINUTES),
    notify_url: buildPaymentNotifyUrl(payload),
    share_flag: normalizeShareFlag(payload),
    goods_info: buildPaymentGoodsInfo(payload, amount),
    payee_infos: buildPayeeInfos(payload, amount),
    pay_method_infos: [
      {
        pay_type: payType,
        amount
      }
    ],
    extend_info: buildWechatAppletExtendInfo(payload)
  };
}

async function createTestPayment(payload = {}) {
  const requestBody = buildCreatePaymentBody(payload);
  const recordId = await insertPaymentRecord({
    type: "payment_create",
    txnSeqno: requestBody.txn_seqno,
    orderNo: normalizeText(payload.orderNo || payload.order_no),
    status: "REQUESTING",
    requestSnapshot: requestBody
  });

  try {
    const result = await postLianlianJson(LIANLIAN_CREATEPAY_PATH, requestBody);
    const response = result.response.json || {};
    await updatePaymentRecord(recordId, {
      status: normalizeText(response.ret_code) === "0000" ? "CREATED" : "FAILED",
      platformTxno: normalizeText(response.platform_txno),
      responseSnapshot: response,
      httpStatusCode: result.response.statusCode,
      responseSignatureVerified: result.response.signatureVerified
    });

    return {
      recordId,
      txnSeqno: requestBody.txn_seqno,
      platformTxno: normalizeText(response.platform_txno),
      requestSnapshot: requestBody,
      response,
      httpStatusCode: result.response.statusCode,
      responseSignatureVerified: result.response.signatureVerified
    };
  } catch (error) {
    await updatePaymentRecord(recordId, {
      status: "FAILED",
      errorMessage: normalizeText(error && error.message)
    });
    throw error;
  }
}

function getOpenId() {
  const context = cloud.getWXContext ? cloud.getWXContext() : {};
  const openid = normalizeText(context.OPENID || context.FROM_OPENID);
  assertCondition(openid, "缺少微信用户 openid");
  return openid;
}

function normalizeOrderAmount(orderRecord) {
  const amount = Number(orderRecord && (orderRecord.payableDec != null ? orderRecord.payableDec : orderRecord.payable));
  assertCondition(Number.isFinite(amount) && amount > 0, "订单应付金额无效");
  return amount.toFixed(2);
}

function getOrderPaymentExpireAtTs(orderRecord) {
  const explicitExpireAt = Number(orderRecord && orderRecord.payExpireAtTs);
  if (Number.isFinite(explicitExpireAt) && explicitExpireAt > 0) {
    return explicitExpireAt;
  }

  const createdAtTs = Number(orderRecord && (orderRecord.createdAtTs || orderRecord.createdAt));
  return Number.isFinite(createdAtTs) && createdAtTs > 0 ? createdAtTs + ORDER_PAYMENT_EXPIRE_MS : 0;
}

function assertOrderPaymentNotExpired(orderRecord) {
  const expireAtTs = getOrderPaymentExpireAtTs(orderRecord);
  assertCondition(!expireAtTs || expireAtTs > Date.now(), "订单待支付时间已过，请重新下单");
}

function buildOrderInfo(orderRecord) {
  const serviceName = normalizeText(orderRecord && (orderRecord.serviceName || orderRecord.serviceSlug));
  return serviceName ? `野哉-${serviceName}` : "野哉旅行报名";
}

function normalizeWechatPaymentPayload(response = {}) {
  const payload = safeParseJsonValue(response.payload || response.payLoad || response.payment_payload || {});
  const metadata = safeParseJsonValue(payload.metadata || payload.pay_info || payload.payInfo || payload);

  return {
    timeStamp: normalizeText(metadata.timeStamp || metadata.timestamp),
    nonceStr: normalizeText(metadata.nonceStr || metadata.noncestr),
    package: normalizeText(metadata.package || metadata.packageValue),
    signType: normalizeText(metadata.signType || metadata.signtype) || "RSA",
    paySign: normalizeText(metadata.paySign || metadata.paysign),
    appId: normalizeText(metadata.appId || metadata.appid),
    gatewayUrl: normalizeText(payload.gateway_url || payload.gatewayUrl || response.gateway_url || response.gatewayUrl),
    rawPayload: response.payload || payload
  };
}

function isPaymentSuccessPayload(payload = {}) {
  const status = normalizeText(
    payload.txn_status
    || payload.txnStatus
    || payload.pay_status
    || payload.payStatus
    || payload.status
    || payload.trade_status
    || payload.tradeStatus
  ).toUpperCase();

  if (PAYMENT_SUCCESS_STATUSES.indexOf(status) >= 0) {
    return true;
  }

  return normalizeText(payload.ret_code || payload.retCode) === "0000"
    && !status
    && normalizeText(payload.platform_txno || payload.platformTxno);
}

async function markOrderPaid(orderNo, source, payload = {}) {
  const normalizedOrderNo = normalizeText(orderNo);
  assertCondition(normalizedOrderNo, "缺少订单号");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const orderRecord = await findSingleOrderRecord({
      orderNo: {
        $eq: normalizedOrderNo
      }
    });

    if (!orderRecord) {
      throw new Error("订单不存在");
    }

    if (orderRecord.status === "paid") {
      return {
        orderNo: normalizedOrderNo,
        status: "paid",
        changed: false
      };
    }

    assertCondition(orderRecord.status === "pending", "当前订单状态不可确认支付");

    const now = Date.now();
    const updateData = {
      status: "paid",
      paidAtTs: now,
      updatedAt: now,
      updateBy: normalizeText(payload.userOpenid || payload.openid || orderRecord.userOpenid)
    };
    const result = await getOrderModel().update({
      data: updateData,
      filter: {
        where: {
          _id: {
            $eq: orderRecord._id
          },
          status: {
            $eq: "pending"
          }
        }
      }
    });

    if (getMutationCount(result) <= 0) {
      continue;
    }

    try {
      await db.collection(ORDER_EVENTS_COLLECTION).add({
        data: {
          orderNo: normalizedOrderNo,
          userOpenid: normalizeText(orderRecord.userOpenid),
          status: "paid",
          fromStatus: "pending",
          source: source || "payment",
          txnSeqno: normalizeText(payload.txnSeqno || payload.txn_seqno),
          platformTxno: normalizeText(payload.platformTxno || payload.platform_txno),
          occurredAtTs: now,
          createdAt: now
        }
      });
    } catch (error) {
      console.error("Failed to append paid order event", {
        orderNo: normalizedOrderNo,
        source,
        error
      });
    }

    return {
      orderNo: normalizedOrderNo,
      status: "paid",
      changed: true
    };
  }

  throw new Error("order status changed too frequently, please retry");
}

async function findPaymentCreateRecordByTxnSeqno(txnSeqno) {
  const normalizedTxnSeqno = normalizeText(txnSeqno);
  if (!normalizedTxnSeqno) {
    return null;
  }

  const result = await db
    .collection(LIANLIAN_PAYMENT_COLLECTION)
    .where({
      type: "payment_create",
      txnSeqno: normalizedTxnSeqno
    })
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();

  return result.data && result.data[0] ? result.data[0] : null;
}

async function createMiniProgramOrderPayment(payload = {}) {
  const openid = getOpenId();
  const orderNo = normalizeText(payload.orderId || payload.orderNo || payload.order_no);
  assertCondition(orderNo, "缺少订单号");

  const orderRecord = await findSingleOrderRecord({
    userOpenid: {
      $eq: openid
    },
    orderNo: {
      $eq: orderNo
    }
  });
  assertCondition(orderRecord, "订单不存在");
  assertCondition(orderRecord.status === "pending", "当前订单状态不可支付");
  assertOrderPaymentNotExpired(orderRecord);

  const amount = normalizeOrderAmount(orderRecord);
  const requestBody = buildCreatePaymentBody({
    amount,
    orderNo,
    orderInfo: buildOrderInfo(orderRecord),
    openid,
    userOpenid: openid,
    appid: normalizeText(payload.appid || payload.appId),
    payExpire: DEFAULT_PAYMENT_EXPIRE_MINUTES
  });
  const recordId = await insertPaymentRecord({
    type: "payment_create",
    txnSeqno: requestBody.txn_seqno,
    orderNo,
    userOpenid: openid,
    amount,
    status: "REQUESTING",
    requestSnapshot: requestBody
  });

  try {
    const result = await postLianlianJson(LIANLIAN_CREATEPAY_PATH, requestBody);
    const response = result.response.json || {};
    const isCreated = normalizeText(response.ret_code) === "0000";
    const paymentParams = normalizeWechatPaymentPayload(response);
    await updatePaymentRecord(recordId, {
      status: isCreated ? "CREATED" : "FAILED",
      platformTxno: normalizeText(response.platform_txno),
      responseSnapshot: response,
      httpStatusCode: result.response.statusCode,
      responseSignatureVerified: result.response.signatureVerified
    });

    return {
      recordId,
      orderNo,
      txnSeqno: requestBody.txn_seqno,
      platformTxno: normalizeText(response.platform_txno),
      paymentParams,
      response,
      httpStatusCode: result.response.statusCode,
      responseSignatureVerified: result.response.signatureVerified,
      payExpireMinutes: DEFAULT_PAYMENT_EXPIRE_MINUTES
    };
  } catch (error) {
    await updatePaymentRecord(recordId, {
      status: "FAILED",
      errorMessage: normalizeText(error && error.message)
    });
    throw error;
  }
}

async function queryPayment(payload = {}) {
  const config = getLianlianConfig();
  const txnSeqno = normalizeText(payload.txnSeqno || payload.txn_seqno);
  const platformTxno = normalizeText(payload.platformTxno || payload.platform_txno);
  const chnlTxno = normalizeText(payload.chnlTxno || payload.chnl_txno);
  const chnlReqSerialId = normalizeText(payload.chnlReqSerialId || payload.chnl_req_serialId);

  assertCondition(txnSeqno || platformTxno || chnlTxno || chnlReqSerialId, "缺少支付订单号");

  const requestBody = {
    mch_id: config.mchId
  };

  if (txnSeqno) {
    requestBody.txn_seqno = txnSeqno;
  }
  if (platformTxno) {
    requestBody.platform_txno = platformTxno;
  }
  if (chnlTxno) {
    requestBody.chnl_txno = chnlTxno;
  }
  if (chnlReqSerialId) {
    requestBody.chnl_req_serialId = chnlReqSerialId;
  }

  const txnDate = normalizeText(payload.txnDate || payload.txn_date);
  if (txnDate) {
    requestBody.txn_date = txnDate;
  }

  const result = await postLianlianJson(LIANLIAN_ORDERQUERY_PATH, requestBody);
  return {
    txnSeqno,
    platformTxno,
    response: result.response.json || {},
    httpStatusCode: result.response.statusCode,
    responseSignatureVerified: result.response.signatureVerified
  };
}

async function confirmMiniProgramOrderPayment(payload = {}) {
  const openid = getOpenId();
  const orderNo = normalizeText(payload.orderId || payload.orderNo || payload.order_no);
  const txnSeqno = normalizeText(payload.txnSeqno || payload.txn_seqno);
  assertCondition(orderNo, "缺少订单号");
  assertCondition(txnSeqno, "缺少支付流水号");

  const orderRecord = await findSingleOrderRecord({
    userOpenid: {
      $eq: openid
    },
    orderNo: {
      $eq: orderNo
    }
  });
  assertCondition(orderRecord, "订单不存在");

  const paymentRecord = await findPaymentCreateRecordByTxnSeqno(txnSeqno);
  assertCondition(paymentRecord && normalizeText(paymentRecord.orderNo) === orderNo, "支付流水与订单不匹配");

  const queryResult = await queryPayment({ txnSeqno });
  const response = queryResult.response || {};
  const paid = isPaymentSuccessPayload(response);
  let orderUpdate = null;

  await updatePaymentRecord(normalizeText(paymentRecord._id), {
    status: paid ? "PAID" : "QUERY_CONFIRMED",
    txnStatus: normalizeText(response.txn_status || response.txnStatus || response.status),
    platformTxno: normalizeText(response.platform_txno || response.platformTxno || paymentRecord.platformTxno),
    querySnapshot: response,
    responseSignatureVerified: queryResult.responseSignatureVerified
  });

  if (paid) {
    orderUpdate = await markOrderPaid(orderNo, "payment_query", {
      userOpenid: openid,
      txnSeqno,
      platformTxno: normalizeText(response.platform_txno || response.platformTxno)
    });
  }

  return {
    orderNo,
    txnSeqno,
    paid,
    orderStatus: paid ? "paid" : normalizeText(orderRecord.status),
    orderUpdate,
    response,
    responseSignatureVerified: queryResult.responseSignatureVerified
  };
}

async function listPaymentRecords(payload = {}) {
  const txnSeqno = normalizeText(payload.txnSeqno || payload.txn_seqno);
  const platformTxno = normalizeText(payload.platformTxno || payload.platform_txno);
  const limit = Math.min(Math.max(Number(payload.limit) || 10, 1), 50);
  const where = {};

  if (txnSeqno) {
    where.txnSeqno = txnSeqno;
  }
  if (platformTxno) {
    where.platformTxno = platformTxno;
  }

  const result = await db
    .collection(LIANLIAN_PAYMENT_COLLECTION)
    .where(where)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return {
    records: (result.data || []).map((record) => ({
      id: normalizeText(record._id),
      type: normalizeText(record.type),
      txnSeqno: normalizeText(record.txnSeqno),
      platformTxno: normalizeText(record.platformTxno),
      orderNo: normalizeText(record.orderNo),
      status: normalizeText(record.status),
      txnStatus: normalizeText(record.txnStatus),
      signatureVerified: Boolean(record.signatureVerified || record.responseSignatureVerified),
      requestSnapshot: record.requestSnapshot || {},
      responseSnapshot: record.responseSnapshot || {},
      notifySnapshot: record.notifySnapshot || {},
      rawBody: normalizeText(record.rawBody),
      createdAt: record.createdAt || 0,
      updatedAt: record.updatedAt || 0
    }))
  };
}

function toAmountCents(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function formatAmountFromCents(cents) {
  return (Math.max(0, Number(cents) || 0) / 100).toFixed(2);
}

function normalizeRefundStatus(response = {}) {
  const status = normalizeText(response.refund_status || response.refundStatus || response.status).toUpperCase();
  if (status) {
    return status;
  }
  return normalizeText(response.ret_code || response.retCode) === "0000" ? "PROCESSING" : "FAILURE";
}

function isRefundSuccessStatus(status) {
  return normalizeText(status).toUpperCase() === "SUCCESS";
}

function isRefundProcessingStatus(status) {
  const normalized = normalizeText(status).toUpperCase();
  return ["REQUESTING", "PROCESSING"].indexOf(normalized) >= 0;
}

function mapRefundRecord(record = {}) {
  return {
    id: normalizeText(record._id || record.id),
    type: normalizeText(record.type),
    orderNo: normalizeText(record.orderNo),
    txnSeqno: normalizeText(record.txnSeqno),
    platformTxno: normalizeText(record.platformTxno),
    refundSeqno: normalizeText(record.refundSeqno),
    platformRefundno: normalizeText(record.platformRefundno),
    refundAmount: normalizeText(record.refundAmount),
    actuallyAmount: normalizeText(record.actuallyAmount),
    refundReason: normalizeText(record.refundReason),
    refundType: normalizeText(record.refundType),
    cancelOrderOnRefundSuccess: Boolean(record.cancelOrderOnRefundSuccess),
    status: normalizeText(record.status),
    refundFailMsg: normalizeText(record.refundFailMsg || record.errorMessage),
    requestSnapshot: record.requestSnapshot || {},
    responseSnapshot: record.responseSnapshot || {},
    querySnapshot: record.querySnapshot || {},
    notifySnapshot: record.notifySnapshot || {},
    rawBody: normalizeText(record.rawBody),
    httpStatusCode: record.httpStatusCode || 0,
    signatureVerified: Boolean(record.signatureVerified || record.responseSignatureVerified),
    responseSignatureVerified: Boolean(record.responseSignatureVerified),
    createdBy: normalizeText(record.createdBy),
    createdAt: record.createdAt || 0,
    updatedAt: record.updatedAt || 0
  };
}

async function listRefundRecords(payload = {}) {
  const orderNo = normalizeText(payload.orderNo || payload.order_no);
  const orderNos = normalizeArray(payload.orderNos || payload.order_nos)
    .map(normalizeText)
    .filter(Boolean)
    .slice(0, 50);
  const refundSeqno = normalizeText(payload.refundSeqno || payload.refund_seqno);
  const platformRefundno = normalizeText(payload.platformRefundno || payload.platform_refundno);
  const limit = Math.min(Math.max(Number(payload.limit) || 50, 1), 200);
  const where = {};

  if (!orderNo && orderNos.length) {
    const resultSets = await Promise.all(orderNos.map((itemOrderNo) =>
      listRefundRecords(Object.assign({}, payload, {
        orderNo: itemOrderNo,
        orderNos: [],
        order_nos: []
      }))
    ));
    const records = resultSets
      .flatMap((result) => normalizeArray(result && result.records))
      .sort((left, right) => Number(right.createdAt || right.updatedAt || 0) - Number(left.createdAt || left.updatedAt || 0))
      .slice(0, limit);

    return { records };
  }

  if (orderNo) {
    where.orderNo = orderNo;
  }
  if (refundSeqno) {
    where.refundSeqno = refundSeqno;
  }
  if (platformRefundno) {
    where.platformRefundno = platformRefundno;
  }

  const result = await db
    .collection(LIANLIAN_REFUND_COLLECTION)
    .where(where)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return {
    records: (result.data || []).map(mapRefundRecord)
  };
}

async function assertCreatorCanAccessRefundOrder(orderNo, access = {}) {
  const orderRecord = await findOrderRecordByOrderNo(orderNo);
  const creator = resolveOrderCreator(orderRecord);

  assertCondition(
    normalizeArray(creator.creatorRefs).some((creatorRef) => creatorRefMatches(access.boundCreatorId, creatorRef)),
    "无权查看该订单退款记录"
  );

  return normalizeText(orderRecord.orderNo || orderNo);
}

async function listRefundRecordsForAccess(payload = {}, access = {}) {
  if (!access || access.accountType !== "creator_portal") {
    return listRefundRecords(payload);
  }

  const requestedOrderNos = []
    .concat(normalizeText(payload.orderNo || payload.order_no))
    .concat(normalizeArray(payload.orderNos || payload.order_nos).map(normalizeText))
    .map(normalizeText)
    .filter(Boolean);
  const uniqueOrderNos = Array.from(new Set(requestedOrderNos)).slice(0, 50);

  assertCondition(uniqueOrderNos.length > 0, "创作者查询退款记录需指定订单号");

  const allowedOrderNos = await Promise.all(uniqueOrderNos.map((orderNo) =>
    assertCreatorCanAccessRefundOrder(orderNo, access)
  ));

  return listRefundRecords(Object.assign({}, payload, {
    orderNo: "",
    order_no: "",
    orderNos: allowedOrderNos,
    order_nos: allowedOrderNos
  }));
}

async function findRefundRecordByRefundSeqno(refundSeqno) {
  const normalizedRefundSeqno = normalizeText(refundSeqno);
  if (!normalizedRefundSeqno) {
    return null;
  }

  const result = await db
    .collection(LIANLIAN_REFUND_COLLECTION)
    .where({
      type: "refund_create",
      refundSeqno: normalizedRefundSeqno
    })
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();

  return result.data && result.data[0] ? result.data[0] : null;
}

function normalizeWithdrawalStatus(source = {}) {
  const rawStatus = normalizeText(source.txn_status || source.txnStatus || source.status).toUpperCase();
  if (["SUCCESS", "FAILURE", "PROCESSING"].indexOf(rawStatus) >= 0) {
    return rawStatus;
  }
  if (["RETURN", "RETURNED", "REFUND", "REFUNDED", "CHARGEBACK"].indexOf(rawStatus) >= 0) {
    return "RETURNED";
  }

  const retCode = normalizeText(source.ret_code || source.retCode);
  if (retCode === "0000") {
    return "PROCESSING";
  }
  if (retCode === "8889") {
    return "WAIT_CHECK";
  }
  if (retCode === "8888") {
    return "WAIT_SMS";
  }
  return retCode ? "FAILURE" : "PROCESSING";
}

function mapWithdrawalRecord(record = {}) {
  return {
    id: normalizeText(record._id || record.id),
    type: normalizeText(record.type),
    txnSeqno: normalizeText(record.txnSeqno),
    platformTxno: normalizeText(record.platformTxno),
    orderAmount: normalizeText(record.orderAmount),
    feeAmount: normalizeText(record.feeAmount),
    payTimeType: normalizeText(record.payTimeType),
    checkFlag: normalizeText(record.checkFlag),
    checkResult: normalizeText(record.checkResult),
    status: normalizeText(record.status),
    txnStatus: normalizeText(record.txnStatus),
    failReason: normalizeText(record.failReason || record.errorMessage),
    accountDate: normalizeText(record.accountDate),
    requestSnapshot: record.requestSnapshot || {},
    responseSnapshot: record.responseSnapshot || {},
    querySnapshot: record.querySnapshot || {},
    notifySnapshot: record.notifySnapshot || {},
    rawBody: normalizeText(record.rawBody),
    httpStatusCode: record.httpStatusCode || 0,
    signatureVerified: Boolean(record.signatureVerified || record.responseSignatureVerified),
    responseSignatureVerified: Boolean(record.responseSignatureVerified),
    createdBy: normalizeText(record.createdBy),
    createdAt: record.createdAt || 0,
    updatedAt: record.updatedAt || 0
  };
}

async function listPlatformWithdrawalRecords(payload = {}) {
  const txnSeqno = normalizeText(payload.txnSeqno || payload.txn_seqno);
  const platformTxno = normalizeText(payload.platformTxno || payload.platform_txno);
  const limit = Math.min(Math.max(Number(payload.limit) || 50, 1), 200);
  const where = {};

  if (txnSeqno) {
    where.txnSeqno = txnSeqno;
  }
  if (platformTxno) {
    where.platformTxno = platformTxno;
  }

  const result = await db
    .collection(LIANLIAN_WITHDRAWAL_COLLECTION)
    .where(where)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return {
    records: (result.data || []).map(mapWithdrawalRecord)
  };
}

async function findWithdrawalApplyRecordByTxnSeqno(txnSeqno) {
  const normalizedTxnSeqno = normalizeText(txnSeqno);
  if (!normalizedTxnSeqno) {
    return null;
  }

  const result = await db
    .collection(LIANLIAN_WITHDRAWAL_COLLECTION)
    .where({
      type: "platform_withdrawal_apply",
      txnSeqno: normalizedTxnSeqno
    })
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();

  return result.data && result.data[0] ? result.data[0] : null;
}

async function findWithdrawalApplyRecordByPlatformTxno(platformTxno) {
  const normalizedPlatformTxno = normalizeText(platformTxno);
  if (!normalizedPlatformTxno) {
    return null;
  }

  const result = await db
    .collection(LIANLIAN_WITHDRAWAL_COLLECTION)
    .where({
      type: "platform_withdrawal_apply",
      platformTxno: normalizedPlatformTxno
    })
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();

  return result.data && result.data[0] ? result.data[0] : null;
}

async function findLatestPaymentCreateRecordByOrderNo(orderNo) {
  const normalizedOrderNo = normalizeText(orderNo);
  if (!normalizedOrderNo) {
    return null;
  }

  const result = await db
    .collection(LIANLIAN_PAYMENT_COLLECTION)
    .where({
      type: "payment_create",
      orderNo: normalizedOrderNo
    })
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();

  return result.data && result.data[0] ? result.data[0] : null;
}

function summarizeRefundRecords(records) {
  const seenRefundKeys = new Set();
  return normalizeArray(records).reduce((summary, rawRecord) => {
    const record = mapRefundRecord(rawRecord);
    const refundKey = normalizeText(record.refundSeqno) || normalizeText(record.id);
    if (refundKey && seenRefundKeys.has(refundKey)) {
      return summary;
    }
    if (refundKey) {
      seenRefundKeys.add(refundKey);
    }
    const amountCents = toAmountCents(record.actuallyAmount || record.refundAmount);
    if (isRefundSuccessStatus(record.status)) {
      summary.successAmountCents += amountCents;
      summary.successCount += 1;
    } else if (isRefundProcessingStatus(record.status)) {
      summary.processingAmountCents += amountCents;
      summary.processingCount += 1;
    } else if (normalizeText(record.status).toUpperCase() === "FAILURE") {
      summary.failureCount += 1;
    }
    return summary;
  }, {
    successAmountCents: 0,
    processingAmountCents: 0,
    successCount: 0,
    processingCount: 0,
    failureCount: 0
  });
}

function summarizeRefundByOrder(records) {
  const refundRecordsByOrder = normalizeArray(records).reduce((map, record) => {
    const orderNo = normalizeText(record && record.orderNo);
    if (!orderNo) {
      return map;
    }
    if (!map[orderNo]) {
      map[orderNo] = [];
    }
    map[orderNo].push(record);
    return map;
  }, {});

  return Object.keys(refundRecordsByOrder).reduce((map, orderNo) => {
    map[orderNo] = summarizeRefundRecords(refundRecordsByOrder[orderNo]);
    return map;
  }, {});
}

function normalizeRefundType(value) {
  const refundType = normalizeText(value).toLowerCase();
  return ["full", "partial", "after_sale", "coupon_correction"].indexOf(refundType) >= 0
    ? refundType
    : "partial";
}

function normalizeRefundReason(value) {
  const reason = normalizeText(value).slice(0, 1024);
  assertCondition(reason, "请填写退款原因");
  return reason;
}

function allocateRefundAmounts(sourceList, totalCents, sourceAmountKey, targetAmountKey) {
  const list = normalizeArray(sourceList).filter((item) => item && typeof item === "object");
  assertCondition(list.length > 0, "缺少原支付资金明细");

  if (list.length === 1) {
    return [
      Object.assign({}, list[0], {
        [targetAmountKey]: formatAmountFromCents(totalCents)
      })
    ];
  }

  const sourceTotalCents = list.reduce((sum, item) => sum + toAmountCents(item[sourceAmountKey]), 0);
  assertCondition(sourceTotalCents > 0, "原支付资金明细金额无效");

  let allocatedCents = 0;
  return list.map((item, index) => {
    const amountCents = index === list.length - 1
      ? Math.max(0, totalCents - allocatedCents)
      : Math.floor((toAmountCents(item[sourceAmountKey]) * totalCents) / sourceTotalCents);
    allocatedCents += amountCents;
    return Object.assign({}, item, {
      [targetAmountKey]: formatAmountFromCents(amountCents)
    });
  }).filter((item) => toAmountCents(item[targetAmountKey]) > 0);
}

function buildRefundMethodInfos(paymentRecord = {}, refundAmount) {
  const totalCents = toAmountCents(refundAmount);
  const requestSnapshot = paymentRecord.requestSnapshot || {};
  const sourceList = normalizeArray(requestSnapshot.pay_method_infos).length
    ? requestSnapshot.pay_method_infos
    : [
        {
          pay_type: DEFAULT_WECHAT_APPLET_PAY_TYPE,
          amount: requestSnapshot.order_amount || paymentRecord.amount || refundAmount
        }
      ];

  return allocateRefundAmounts(sourceList, totalCents, "amount", "amount").map((item) => ({
    pay_type: normalizeText(item.pay_type || item.payType),
    amount: normalizeAmount(item.amount)
  }));
}

function buildPayeeRefundInfos(paymentRecord = {}, refundAmount) {
  const totalCents = toAmountCents(refundAmount);
  const requestSnapshot = paymentRecord.requestSnapshot || {};
  const sourceList = normalizeArray(requestSnapshot.payee_infos);
  const allocated = allocateRefundAmounts(sourceList, totalCents, "payee_amount", "payee_amount");

  return allocated.map((item) => {
    const payeeInfo = {
      payee_uid: normalizeText(item.payee_uid || item.payeeUid),
      payee_accttype: normalizeText(item.payee_accttype || item.payeeAccttype || item.payeeAcctType),
      payee_type: normalizeText(item.payee_type || item.payeeType),
      payee_amount: normalizeAmount(item.payee_amount),
      payee_memo: normalizeText(item.payee_memo || item.payeeMemo)
    };

    assertCondition(payeeInfo.payee_uid, "缺少退款原收款方用户号");
    assertCondition(payeeInfo.payee_type, "缺少退款原收款方类型");
    assertCondition(payeeInfo.payee_accttype, "缺少退款原收款方账户类型");
    return payeeInfo;
  });
}

function buildRefundBody(payload = {}, preview = {}) {
  const config = getLianlianConfig();
  const paymentRecord = preview.paymentRecord || payload.paymentRecord || {};
  const requestSnapshot = paymentRecord.requestSnapshot || {};
  const refundAmount = normalizeAmount(payload.refundAmount || payload.refund_amount || preview.refundAmount || preview.availableRefundAmount);
  const refundSeqno = normalizeText(payload.refundSeqno || payload.refund_seqno) || createRefundTxnSeqno();
  const txnSeqno = normalizeText(payload.txnSeqno || payload.txn_seqno || preview.txnSeqno || paymentRecord.txnSeqno);
  const subMchid = normalizeText(payload.subMchid || payload.sub_mchid || requestSnapshot.sub_mchid || process.env.LIANLIAN_SUB_MCHID) || DEFAULT_SUB_MCHID;

  assertCondition(txnSeqno, "缺少原支付单号 txn_seqno");
  assertCondition(refundSeqno.length <= 32, "refund_seqno 不能超过 32 位");

  const requestBody = {
    mch_id: config.mchId,
    sub_mchid: subMchid,
    refund_seqno: refundSeqno,
    refund_time: normalizeText(payload.refundTime || payload.refund_time) || formatLianlianTimestamp(),
    txn_seqno: txnSeqno,
    refund_reason: normalizeRefundReason(payload.refundReason || payload.refund_reason),
    refund_amount: refundAmount,
    notify_url: buildRefundNotifyUrl(payload),
    refund_method_infos: buildRefundMethodInfos(paymentRecord, refundAmount),
    payee_refund_infos: buildPayeeRefundInfos(paymentRecord, refundAmount)
  };

  const txnDate = normalizeText(payload.txnDate || payload.txn_date);
  if (txnDate) {
    requestBody.txn_date = txnDate;
  }

  return requestBody;
}

function getPaidAmountCents(orderRecord = {}, paymentRecord = {}) {
  return toAmountCents(
    paymentRecord.amount
    || (paymentRecord.requestSnapshot && paymentRecord.requestSnapshot.order_amount)
    || orderRecord.payableDec
    || orderRecord.payable
  );
}

async function findOrderRecordByOrderNo(orderNo) {
  const normalizedOrderNo = normalizeText(orderNo);
  assertCondition(normalizedOrderNo, "缺少订单号");
  const orderRecord = await findSingleOrderRecord({
    orderNo: {
      $eq: normalizedOrderNo
    }
  });
  assertCondition(orderRecord, "订单不存在");
  return orderRecord;
}

async function hasSuccessfulProfitSharing(orderNo) {
  const result = await listProfitSharingRecords({ orderNo, limit: 50 });
  return result.records.some((record) => normalizeText(record.status).toUpperCase() === "SUCCESS");
}

async function previewRefundOrder(payload = {}) {
  const orderNo = normalizeText(payload.orderNo || payload.order_no);
  const orderRecord = await findOrderRecordByOrderNo(orderNo);
  const paymentRecord = await findLatestPaymentCreateRecordByOrderNo(orderNo);
  const refundResult = await listRefundRecords({ orderNo, limit: 100 });
  const refundSummary = summarizeRefundRecords(refundResult.records);
  const paidAmountCents = getPaidAmountCents(orderRecord, paymentRecord || {});
  const availableRefundCents = Math.max(0, paidAmountCents - refundSummary.successAmountCents - refundSummary.processingAmountCents);
  const requestedRefundCents = payload.refundAmount || payload.refund_amount
    ? toAmountCents(payload.refundAmount || payload.refund_amount)
    : availableRefundCents;
  const blockers = [];
  const orderStatus = normalizeText(orderRecord.status);
  const paymentStatus = normalizeText(paymentRecord && paymentRecord.status);
  const hasShared = await hasSuccessfulProfitSharing(orderNo);

  if (["paid", "traveling", "completed"].indexOf(orderStatus) < 0) {
    blockers.push(orderStatus === "pending" ? "订单未支付，无需退款" : "当前订单状态不支持退款");
  }
  if (!paymentRecord || !normalizeText(paymentRecord.txnSeqno)) {
    blockers.push("缺少连连支付流水");
  }
  if (paymentRecord && paymentStatus && ["PAID", "CREATED", "QUERY_CONFIRMED", "NOTIFIED"].indexOf(paymentStatus.toUpperCase()) < 0) {
    blockers.push("原支付流水状态不支持退款");
  }
  if (refundSummary.processingCount > 0) {
    blockers.push("已有退款处理中，请先查询结果");
  }
  if (availableRefundCents <= 0) {
    blockers.push("无剩余可退金额");
  }
  if (requestedRefundCents <= 0) {
    blockers.push("退款金额必须大于 0");
  }
  if (requestedRefundCents > availableRefundCents) {
    blockers.push("退款金额不能超过剩余可退金额");
  }
  if (hasShared) {
    blockers.push("订单已分账，第一版退款需转人工处理");
  }

  return {
    orderNo,
    orderStatus,
    txnSeqno: normalizeText(paymentRecord && paymentRecord.txnSeqno),
    platformTxno: normalizeText(paymentRecord && paymentRecord.platformTxno),
    paymentStatus,
    paidAmount: formatAmountFromCents(paidAmountCents),
    refundedAmount: formatAmountFromCents(refundSummary.successAmountCents),
    processingRefundAmount: formatAmountFromCents(refundSummary.processingAmountCents),
    availableRefundAmount: formatAmountFromCents(availableRefundCents),
    refundAmount: formatAmountFromCents(requestedRefundCents),
    refundType: normalizeRefundType(payload.refundType || payload.refund_type),
    eligible: blockers.length === 0,
    blockers,
    paymentRecord,
    refundRecords: refundResult.records
  };
}

async function appendRefundOrderEvent(orderRecord, refundRecord, status, fromStatus) {
  const now = Date.now();
  await db.collection(ORDER_EVENTS_COLLECTION).add({
    data: {
      orderNo: normalizeText(orderRecord.orderNo),
      userOpenid: normalizeText(orderRecord.userOpenid),
      status,
      fromStatus,
      source: "refund",
      refundSeqno: normalizeText(refundRecord.refundSeqno),
      platformRefundno: normalizeText(refundRecord.platformRefundno),
      note: `退款成功：${normalizeText(refundRecord.refundAmount)}`,
      occurredAtTs: now,
      createdAt: now
    }
  });
}

async function applyRefundOrderSideEffects(orderNo) {
  const orderRecord = await findOrderRecordByOrderNo(orderNo);
  if (normalizeText(orderRecord.status) !== "paid") {
    return null;
  }

  const refundResult = await listRefundRecords({ orderNo, limit: 100 });
  const cancelRefundRecord = refundResult.records.find((record) =>
    isRefundSuccessStatus(record.status) && Boolean(record.cancelOrderOnRefundSuccess)
  );

  if (!cancelRefundRecord) {
    return null;
  }

  const now = Date.now();
  const result = await getOrderModel().update({
    data: {
      status: "canceled",
      canceledAtTs: now,
      updatedAt: now
    },
    filter: {
      where: {
        _id: {
          $eq: orderRecord._id
        },
        status: {
          $eq: "paid"
        }
      }
    }
  });

  if (getMutationCount(result) > 0) {
    await appendRefundOrderEvent(orderRecord, cancelRefundRecord, "canceled", "paid");
    return {
      orderNo,
      status: "canceled",
      changed: true
    };
  }

  return null;
}

async function createRefundRequest(payload = {}, access = {}) {
  const preview = await previewRefundOrder(payload);
  assertCondition(preview.eligible, preview.blockers[0] || "当前订单不可退款");
  const cancelOrderOnRefundSuccess = normalizeBoolean(
    payload.cancelOrderOnRefundSuccess,
    normalizeBoolean(payload.cancel_order_on_refund_success, false)
  );
  assertCondition(!cancelOrderOnRefundSuccess || preview.orderStatus === "paid", "只有待出行订单支持退款成功后取消订单");

  const requestBody = buildRefundBody(payload, preview);
  const operatorId = normalizeText(access.uid || access.id || access.username || access.email) || "admin";
  const recordId = await insertRefundRecord({
    type: "refund_create",
    orderNo: preview.orderNo,
    txnSeqno: preview.txnSeqno,
    platformTxno: preview.platformTxno,
    refundSeqno: requestBody.refund_seqno,
    refundAmount: requestBody.refund_amount,
    refundReason: requestBody.refund_reason,
    refundType: preview.refundType,
    cancelOrderOnRefundSuccess,
    status: "REQUESTING",
    createdBy: operatorId,
    requestSnapshot: requestBody
  });

  try {
    const result = await postLianlianJson(LIANLIAN_REFUND_PATH, requestBody);
    const response = result.response.json || {};
    const status = normalizeRefundStatus(response);
    const platformRefundno = normalizeText(response.platform_refundno || response.platformRefundno);
    await updateRefundRecord(recordId, {
      status,
      platformRefundno,
      actuallyAmount: normalizeText(response.actually_amount || response.actuallyAmount),
      refundFailMsg: normalizeText(response.refund_fail_msg || response.refundFailMsg || (status === "FAILURE" ? response.ret_msg : "")),
      responseSnapshot: response,
      httpStatusCode: result.response.statusCode,
      responseSignatureVerified: result.response.signatureVerified
    });

    if (isRefundSuccessStatus(status)) {
      await applyRefundOrderSideEffects(preview.orderNo);
    }

    return {
      recordId,
      orderNo: preview.orderNo,
      txnSeqno: preview.txnSeqno,
      refundSeqno: requestBody.refund_seqno,
      platformRefundno,
      refundAmount: requestBody.refund_amount,
      cancelOrderOnRefundSuccess,
      status,
      requestSnapshot: requestBody,
      response,
      httpStatusCode: result.response.statusCode,
      responseSignatureVerified: result.response.signatureVerified
    };
  } catch (error) {
    await updateRefundRecord(recordId, {
      status: "FAILURE",
      errorMessage: normalizeText(error && error.message)
    });
    throw error;
  }
}

function buildRefundQueryBody(payload = {}, record = {}) {
  const config = getLianlianConfig();
  const requestSnapshot = record.requestSnapshot || {};
  const refundSeqno = normalizeText(payload.refundSeqno || payload.refund_seqno || record.refundSeqno);
  const platformRefundno = normalizeText(payload.platformRefundno || payload.platform_refundno || record.platformRefundno);
  const refundDate = normalizeText(payload.refundDate || payload.refund_date);
  const body = {
    mch_id: config.mchId
  };

  assertCondition(refundSeqno || platformRefundno, "缺少退款单号");

  const subMchid = normalizeText(payload.subMchid || payload.sub_mchid || requestSnapshot.sub_mchid);
  if (subMchid) {
    body.sub_mchid = subMchid;
  }
  if (refundSeqno) {
    body.refund_seqno = refundSeqno;
  }
  if (platformRefundno) {
    body.platform_refundno = platformRefundno;
  }
  if (refundDate) {
    body.refund_date = refundDate;
  }

  return body;
}

async function queryRefund(payload = {}) {
  const refundSeqno = normalizeText(payload.refundSeqno || payload.refund_seqno);
  const existingRecord = await findRefundRecordByRefundSeqno(refundSeqno);
  const requestBody = buildRefundQueryBody(payload, existingRecord || {});
  const result = await postLianlianJson(LIANLIAN_REFUND_QUERY_PATH, requestBody);
  const response = result.response.json || {};
  assertCondition(
    normalizeText(response.ret_code || response.retCode),
    response.message || `退款查询接口异常：HTTP ${result.response.statusCode}`
  );
  const status = normalizeRefundStatus(response);
  const recordId = normalizeText(existingRecord && existingRecord._id);
  const orderNo = normalizeText(existingRecord && existingRecord.orderNo);

  await updateRefundRecord(recordId, {
    status,
    platformRefundno: normalizeText(response.platform_refundno || response.platformRefundno || (existingRecord && existingRecord.platformRefundno)),
    actuallyAmount: normalizeText(response.actually_amount || response.actuallyAmount),
    refundFailMsg: normalizeText(response.refund_fail_msg || response.refundFailMsg),
    querySnapshot: response,
    httpStatusCode: result.response.statusCode,
    responseSignatureVerified: result.response.signatureVerified
  });

  if (orderNo && isRefundSuccessStatus(status)) {
    await applyRefundOrderSideEffects(orderNo);
  }

  return {
    orderNo,
    refundSeqno: normalizeText(response.refund_seqno || response.refundSeqno || refundSeqno),
    platformRefundno: normalizeText(response.platform_refundno || response.platformRefundno),
    refundAmount: normalizeText(response.refund_amount || response.refundAmount),
    status,
    response,
    httpStatusCode: result.response.statusCode,
    responseSignatureVerified: result.response.signatureVerified
  };
}

function normalizeWithdrawalPayTimeType(payload = {}) {
  const payTimeType = (normalizeText(payload.payTimeType || payload.pay_time_type) || "TRANS_THIS_TIME").toUpperCase();
  assertCondition(
    ["TRANS_THIS_TIME", "TRANS_NORMAL", "TRANS_NEXT_TIME"].indexOf(payTimeType) >= 0,
    "到账类型仅支持 TRANS_THIS_TIME、TRANS_NORMAL、TRANS_NEXT_TIME"
  );
  return payTimeType;
}

function buildPlatformWithdrawalBody(payload = {}) {
  const config = getLianlianConfig();
  const txnSeqno = normalizeText(payload.txnSeqno || payload.txn_seqno) || createWithdrawalTxnSeqno();
  const orderAmount = normalizeAmount(payload.orderAmount || payload.order_amount);
  const checkFlag = "N";
  const configuredAccount = getPlatformWithdrawalAccountById(payload.accountId || payload.account_id);
  const agreementNo = normalizeText(configuredAccount && configuredAccount.agreementNo);
  const linkedAcctno = normalizeText(configuredAccount && configuredAccount.linkedAcctno);
  const postscript = normalizeText(payload.postscript);
  const requestBody = {
    mch_id: config.mchId,
    txn_seqno: txnSeqno,
    txn_time: normalizeText(payload.txnTime || payload.txn_time) || formatLianlianTimestamp(),
    notify_url: buildWithdrawalNotifyUrl(payload),
    order_info: "野哉平台提现",
    order_amount: orderAmount,
    pay_time_type: "TRANS_THIS_TIME",
    risk_item: "{}",
    check_flag: checkFlag,
    payer_info: {
      payer_id: normalizeText(payload.payerId || payload.payer_id) || config.mchId,
      payer_type: "MCH",
      payer_accttype: getPlatformWithdrawalPayerAcctType(payload)
    },
    payee_info: {}
  };
  const payExpire = Number(payload.payExpire || payload.pay_expire || 0);
  const feeAmount = normalizeOptionalAmount(payload.feeAmount || payload.fee_amount);

  assertCondition(config.mchId, "缺少平台商户号");
  assertCondition(txnSeqno.length <= 32, "txn_seqno 不能超过 32 位");
  assertCondition(configuredAccount, "未配置平台提现收款账户，请配置 LIANLIAN_PLATFORM_WITHDRAWAL_ACCOUNTS 或 LIANLIAN_PLATFORM_WITHDRAWAL_LINKED_ACCTNO");
  assertCondition(agreementNo || linkedAcctno, "平台提现收款账户缺少协议号或已绑定银行账号");
  assertCondition(!postscript || postscript.length <= 16, "交易附言不能超过 16 个字符");
  if (Number(orderAmount) >= 50000) {
    assertCondition(postscript, "单笔提现金额大于等于 5 万时必须填写交易附言");
  }

  if (payExpire > 0) {
    requestBody.pay_expire = payExpire;
  }
  if (feeAmount) {
    requestBody.fee_amount = feeAmount;
  }
  if (agreementNo) {
    requestBody.payee_info.agreement_no = agreementNo;
  } else {
    requestBody.payee_info.linked_acctno = linkedAcctno;
  }
  if (postscript) {
    requestBody.payee_info.postscript = postscript;
  }

  return requestBody;
}

function listPlatformWithdrawalAccounts() {
  return {
    accounts: getConfiguredPlatformWithdrawalAccounts().map(serializePlatformWithdrawalAccount)
  };
}

function getPlatformAccountUserId() {
  return normalizeText(process.env.LIANLIAN_PLATFORM_ACCOUNT_USER_ID);
}

function getPlatformAccountUserType() {
  return normalizeText(process.env.LIANLIAN_PLATFORM_ACCOUNT_USER_TYPE) || "INNERMERCHANT";
}

function getPlatformWithdrawalPayerAcctType(payload = {}) {
  return normalizeText(
    payload.payerAcctType
    || payload.payer_accttype
    || process.env.LIANLIAN_PLATFORM_WITHDRAWAL_PAYER_ACCT_TYPE
    || "MCHOWN"
  );
}

function getPlatformAccountType(payload = {}) {
  return normalizeText(
    payload.acctType
    || payload.acct_type
    || process.env.LIANLIAN_PLATFORM_ACCOUNT_ACCT_TYPE
    || "MCHOWN_AVAILABLE"
  );
}

function buildPlatformAccountInfoBody(payload = {}) {
  const config = getLianlianConfig();
  const requestBody = {
    timestamp: normalizeText(payload.timestamp) || formatLianlianTimestamp(),
    oid_partner: config.mchId,
    user_type: normalizeText(payload.userType || payload.user_type) || getPlatformAccountUserType()
  };
  const userId = normalizeText(payload.userId || payload.user_id) || getPlatformAccountUserId();

  if (userId) {
    requestBody.user_id = userId;
  }

  return requestBody;
}

function normalizeAcctSerialDate(value, fallback, endOfDay = false) {
  const text = normalizeText(value);
  if (/^\d{14}$/.test(text)) {
    return text;
  }
  if (/^\d{8}$/.test(text)) {
    return `${text}${endOfDay ? "235959" : "000000"}`;
  }
  const dashed = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dashed) {
    return `${dashed[1]}${dashed[2]}${dashed[3]}${endOfDay ? "235959" : "000000"}`;
  }
  return fallback;
}

function buildDefaultAcctSerialStart() {
  return formatLianlianTimestamp(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)).slice(0, 8) + "000000";
}

function buildPlatformAccountSerialBody(payload = {}) {
  const infoBody = buildPlatformAccountInfoBody(payload);
  const pageSize = Math.min(Math.max(Number(payload.pageSize || payload.page_size || 20) || 20, 1), 50);
  const pageNo = Math.max(Number(payload.pageNo || payload.page_no || 1) || 1, 1);
  const requestBody = {
    timestamp: infoBody.timestamp,
    oid_partner: infoBody.oid_partner,
    user_type: infoBody.user_type,
    acct_type: getPlatformAccountType(payload),
    date_start: normalizeAcctSerialDate(payload.dateStart || payload.date_start, buildDefaultAcctSerialStart(), false),
    date_end: normalizeAcctSerialDate(payload.dateEnd || payload.date_end, formatLianlianTimestamp(), true),
    page_no: String(Math.floor(pageNo)),
    page_size: String(Math.floor(pageSize))
  };
  if (infoBody.user_id) {
    requestBody.user_id = infoBody.user_id;
  }
  const flagDc = normalizeText(payload.flagDc || payload.flag_dc).toUpperCase();
  const sortType = normalizeText(payload.sortType || payload.sort_type).toUpperCase();

  if (flagDc) {
    requestBody.flag_dc = flagDc;
  }
  if (sortType) {
    requestBody.sort_type = sortType;
  }

  return requestBody;
}

function pickFirstValue(source = {}, keys = []) {
  const matchedKey = keys.find((key) => source[key] != null && normalizeText(source[key]));
  return matchedKey ? normalizeText(source[matchedKey]) : "";
}

function pickAmount(source = {}, keys = []) {
  return pickFirstValue(source, keys);
}

function firstArrayValue(source = {}, keys = []) {
  const matchedKey = keys.find((key) => Array.isArray(source[key]));
  return matchedKey ? source[matchedKey] : [];
}

function serializePlatformAccountBalance(item = {}) {
  const accountNo = pickFirstValue(item, ["oid_acctno", "acct_no", "acctNo", "account_no", "accountNo"]);
  return {
    accountNoMasked: accountNo ? maskIdentifier(accountNo) : "",
    accountType: pickFirstValue(item, ["acct_type", "acctType", "account_type", "accountType"]),
    accountStatus: pickFirstValue(item, ["acct_state", "acctState", "acct_status", "acctStatus", "account_status", "accountStatus"]),
    balanceAmount: pickAmount(item, ["amt_balcur", "amtBalcur", "amt_bal", "acct_bal", "acctBal", "balance", "balance_amount", "balanceAmount"]),
    availableAmount: pickAmount(item, ["amt_balaval", "amtBalaval", "available_bal", "availableBal", "available_amount", "availableAmount", "amt_available"]),
    withdrawableAmount: pickAmount(item, ["amt_balaval", "amtBalaval", "withdrawable_amount", "withdrawableAmount", "cashout_amt", "cashoutAmt", "available_bal", "availableBal"]),
    frozenAmount: pickAmount(item, ["amt_balfrz", "amtBalfrz", "frozen_amount", "frozenAmount", "freeze_amt", "freezeAmt"]),
    pendingAmount: pickAmount(item, ["pending_amount", "pendingAmount", "settle_amount", "settleAmount"]),
    bankAccountMasked: maskBankAccount(pickFirstValue(item, ["bank_account", "bankAccount", "linked_acctno", "linkedAcctno"])),
    bankName: pickFirstValue(item, ["bank_name", "bankName", "linked_bank_name", "linkedBankName"])
  };
}

function serializePlatformAccountSerial(item = {}) {
  const accountNo = pickFirstValue(item, ["oid_acctno", "acct_no", "acctNo"]);
  return {
    id: pickFirstValue(item, ["jno_acct", "accp_txnno", "jno_cli"]) || `${pickFirstValue(item, ["txn_time"])}-${pickFirstValue(item, ["amt"])}`,
    accountDate: pickFirstValue(item, ["date_acct", "account_date", "accountDate"]),
    accountNoMasked: accountNo ? maskIdentifier(accountNo) : "",
    accountJournalNo: pickFirstValue(item, ["jno_acct", "account_journal_no", "accountJournalNo"]),
    accpTxnNo: pickFirstValue(item, ["accp_txnno", "accpTxnNo"]),
    clientJournalNo: pickFirstValue(item, ["jno_cli", "client_journal_no", "clientJournalNo"]),
    txnType: pickFirstValue(item, ["txn_type", "txnType"]),
    productCode: pickFirstValue(item, ["product_code", "productCode"]),
    txnTime: pickFirstValue(item, ["txn_time", "txnTime"]),
    direction: pickFirstValue(item, ["flag_dc", "flagDc"]).toUpperCase(),
    amount: pickAmount(item, ["amt", "amount"]),
    balanceAmount: pickAmount(item, ["amt_bal", "balanceAmount", "balance_amount"]),
    memo: pickFirstValue(item, ["memo", "remark", "summary"])
  };
}

function normalizePlatformAccountInfoResponse(response = {}) {
  const accountList = firstArrayValue(response, [
    "acctinfo_list",
    "acctinfoList",
    "acct_list",
    "acctList",
    "account_list",
    "accountList",
    "acctbal_list",
    "acctbalList"
  ]);
  return {
    retCode: normalizeText(response.ret_code || response.retCode),
    retMsg: normalizeText(response.ret_msg || response.retMsg),
    oidPartner: maskIdentifier(response.oid_partner || response.oidPartner),
    userIdMasked: maskIdentifier(response.user_id || response.userId),
    userType: normalizeText(response.user_type || response.userType),
    userStatus: normalizeText(response.user_status || response.userStatus),
    accounts: accountList.map((item) => serializePlatformAccountBalance(Object.assign({
      bank_account: response.bank_account || response.bankAccount
    }, item)))
  };
}

function normalizePlatformAccountSerialResponse(response = {}) {
  return {
    retCode: normalizeText(response.ret_code || response.retCode),
    retMsg: normalizeText(response.ret_msg || response.retMsg),
    pageNo: normalizeText(response.page_no || response.pageNo),
    totalOutAmount: normalizeText(response.total_out_amt || response.totalOutAmt),
    totalInAmount: normalizeText(response.total_in_amt || response.totalInAmt),
    totalNum: normalizeText(response.total_num || response.totalNum),
    totalPage: normalizeText(response.total_page || response.totalPage),
    records: firstArrayValue(response, ["acctbal_list", "acctbalList", "records"]).map(serializePlatformAccountSerial)
  };
}

async function queryPlatformAccountInfo(payload = {}) {
  const requestBody = buildPlatformAccountInfoBody(payload);
  const result = await postLianlianAccpJson(LIANLIAN_ACCP_ACCOUNT_INFO_PATH, requestBody);
  const response = result.response.json || {};
  return Object.assign(normalizePlatformAccountInfoResponse(response), {
    checkedAt: Date.now(),
    httpStatusCode: result.response.statusCode,
    responseSignatureVerified: result.response.signatureVerified
  });
}

async function listPlatformAccountSerials(payload = {}) {
  const requestBody = buildPlatformAccountSerialBody(payload);
  const result = await postLianlianAccpJson(LIANLIAN_ACCP_ACCOUNT_SERIAL_PATH, requestBody);
  const response = result.response.json || {};
  return Object.assign(normalizePlatformAccountSerialResponse(response), {
    dateStart: requestBody.date_start,
    dateEnd: requestBody.date_end,
    accountType: requestBody.acct_type,
    checkedAt: Date.now(),
    httpStatusCode: result.response.statusCode,
    responseSignatureVerified: result.response.signatureVerified
  });
}

async function applyPlatformWithdrawal(payload = {}, access = {}) {
  const requestBody = buildPlatformWithdrawalBody(payload);
  const operatorId = normalizeText(access.id || access.uid || payload.operatorId || payload.operator_id);
  const recordId = await insertWithdrawalRecord({
    type: "platform_withdrawal_apply",
    txnSeqno: requestBody.txn_seqno,
    orderAmount: requestBody.order_amount,
    feeAmount: normalizeText(requestBody.fee_amount),
    payTimeType: requestBody.pay_time_type,
    checkFlag: requestBody.check_flag,
    status: "REQUESTING",
    createdBy: operatorId,
    requestSnapshot: requestBody
  });

  try {
    const result = await postLianlianJson(LIANLIAN_WITHDRAWAL_PATH, requestBody);
    const response = result.response.json || {};
    const status = normalizeWithdrawalStatus(response);
    const platformTxno = normalizeText(response.platform_txno || response.platformTxno);

    await updateWithdrawalRecord(recordId, {
      status,
      txnStatus: normalizeText(response.txn_status || response.txnStatus),
      platformTxno,
      feeAmount: normalizeText(response.fee_amount || response.feeAmount || requestBody.fee_amount),
      responseSnapshot: response,
      httpStatusCode: result.response.statusCode,
      responseSignatureVerified: result.response.signatureVerified
    });

    return {
      recordId,
      txnSeqno: requestBody.txn_seqno,
      platformTxno,
      orderAmount: requestBody.order_amount,
      status,
      requestSnapshot: requestBody,
      response,
      httpStatusCode: result.response.statusCode,
      responseSignatureVerified: result.response.signatureVerified
    };
  } catch (error) {
    await updateWithdrawalRecord(recordId, {
      status: "FAILURE",
      errorMessage: normalizeText(error && error.message)
    });
    throw error;
  }
}

function buildPlatformWithdrawalCheckBody(payload = {}) {
  const config = getLianlianConfig();
  const txnSeqno = normalizeText(payload.txnSeqno || payload.txn_seqno);
  const checkResult = (normalizeText(payload.checkResult || payload.check_result) || "ACCEPT").toUpperCase();
  const checkReason = normalizeText(payload.checkReason || payload.check_reason);
  const checkUser = normalizeText(payload.checkUser || payload.check_user);
  const requestBody = {
    mch_id: config.mchId,
    txn_seqno: txnSeqno,
    check_info: {
      check_result: checkResult
    }
  };

  assertCondition(txnSeqno, "缺少提现单号 txn_seqno");
  assertCondition(["ACCEPT", "CANCEL"].indexOf(checkResult) >= 0, "check_result 仅支持 ACCEPT 或 CANCEL");

  if (checkReason) {
    requestBody.check_info.check_reason = checkReason.slice(0, 256);
  }
  if (checkUser) {
    requestBody.check_info.check_user = checkUser.slice(0, 64);
  }

  return requestBody;
}

async function confirmPlatformWithdrawal(payload = {}, access = {}) {
  const existingRecord = await findWithdrawalApplyRecordByTxnSeqno(payload.txnSeqno || payload.txn_seqno);
  const requestBody = buildPlatformWithdrawalCheckBody(payload);
  const result = await postLianlianJson(LIANLIAN_WITHDRAWAL_CHECK_PATH, requestBody);
  const response = result.response.json || {};
  const status = normalizeText(response.ret_code || response.retCode) === "0000"
    ? normalizeWithdrawalStatus(response)
    : "FAILURE";
  const platformTxno = normalizeText(response.platform_txno || response.platformTxno);
  const operatorId = normalizeText(access.id || access.uid || payload.operatorId || payload.operator_id);
  const recordId = await insertWithdrawalRecord({
    type: "platform_withdrawal_confirm",
    txnSeqno: requestBody.txn_seqno,
    platformTxno,
    orderAmount: normalizeText(response.order_amount || response.orderAmount || (existingRecord && existingRecord.orderAmount)),
    feeAmount: normalizeText(response.fee_amount || response.feeAmount || (existingRecord && existingRecord.feeAmount)),
    checkResult: requestBody.check_info.check_result,
    status,
    createdBy: operatorId,
    requestSnapshot: requestBody,
    responseSnapshot: response,
    httpStatusCode: result.response.statusCode,
    responseSignatureVerified: result.response.signatureVerified
  });

  if (existingRecord && existingRecord._id) {
    await updateWithdrawalRecord(existingRecord._id, {
      status,
      checkResult: requestBody.check_info.check_result,
      platformTxno: platformTxno || normalizeText(existingRecord.platformTxno),
      responseSnapshot: response,
      httpStatusCode: result.response.statusCode,
      responseSignatureVerified: result.response.signatureVerified
    });
  }

  return {
    recordId,
    txnSeqno: requestBody.txn_seqno,
    platformTxno,
    orderAmount: normalizeText(response.order_amount || response.orderAmount),
    feeAmount: normalizeText(response.fee_amount || response.feeAmount),
    status,
    requestSnapshot: requestBody,
    response,
    httpStatusCode: result.response.statusCode,
    responseSignatureVerified: result.response.signatureVerified
  };
}

function buildPlatformWithdrawalQueryBody(payload = {}, record = {}) {
  const config = getLianlianConfig();
  const txnSeqno = normalizeText(payload.txnSeqno || payload.txn_seqno || record.txnSeqno);
  const platformTxno = normalizeText(payload.platformTxno || payload.platform_txno || record.platformTxno);
  const body = {
    mch_id: config.mchId
  };

  assertCondition(txnSeqno || platformTxno, "缺少提现单号或连连平台订单号");

  if (txnSeqno) {
    body.txn_seqno = txnSeqno;
  }
  if (platformTxno) {
    body.platform_txno = platformTxno;
  }

  return body;
}

async function queryPlatformWithdrawal(payload = {}) {
  const existingRecord = await findWithdrawalApplyRecordByTxnSeqno(payload.txnSeqno || payload.txn_seqno)
    || await findWithdrawalApplyRecordByPlatformTxno(payload.platformTxno || payload.platform_txno);
  const requestBody = buildPlatformWithdrawalQueryBody(payload, existingRecord || {});
  const result = await postLianlianJson(LIANLIAN_WITHDRAWAL_QUERY_PATH, requestBody);
  const response = result.response.json || {};
  const responseSummary = result.response.raw
    ? `；返回：${result.response.raw.slice(0, 200)}`
    : "";
  assertCondition(
    normalizeText(response.ret_code || response.retCode),
    pickReadableErrorMessage(response, `提现查询接口异常：HTTP ${result.response.statusCode}${responseSummary}`)
  );

  const status = normalizeWithdrawalStatus(response);
  const recordId = normalizeText(existingRecord && existingRecord._id);
  const platformTxno = normalizeText(response.platform_txno || response.platformTxno || requestBody.platform_txno);
  const failReason = normalizeText(response.fail_reason || response.failReason);

  await updateWithdrawalRecord(recordId, {
    status,
    txnStatus: normalizeText(response.txn_status || response.txnStatus),
    platformTxno,
    orderAmount: normalizeText(response.order_amount || response.orderAmount || (existingRecord && existingRecord.orderAmount)),
    payTimeType: normalizeText(response.pay_time_type || response.payTimeType || (existingRecord && existingRecord.payTimeType)),
    failReason,
    accountDate: normalizeText(response.account_date || response.accountDate),
    querySnapshot: response,
    httpStatusCode: result.response.statusCode,
    responseSignatureVerified: result.response.signatureVerified
  });

  return {
    txnSeqno: normalizeText(response.txn_seqno || response.txnSeqno || requestBody.txn_seqno),
    platformTxno,
    orderAmount: normalizeText(response.order_amount || response.orderAmount),
    payTimeType: normalizeText(response.pay_time_type || response.payTimeType),
    status,
    failReason,
    accountDate: normalizeText(response.account_date || response.accountDate),
    response,
    httpStatusCode: result.response.statusCode,
    responseSignatureVerified: result.response.signatureVerified
  };
}

function sanitizeRefundPreview(preview = {}) {
  return {
    orderNo: normalizeText(preview.orderNo),
    orderStatus: normalizeText(preview.orderStatus),
    txnSeqno: normalizeText(preview.txnSeqno),
    platformTxno: normalizeText(preview.platformTxno),
    paymentStatus: normalizeText(preview.paymentStatus),
    paidAmount: normalizeText(preview.paidAmount),
    refundedAmount: normalizeText(preview.refundedAmount),
    processingRefundAmount: normalizeText(preview.processingRefundAmount),
    availableRefundAmount: normalizeText(preview.availableRefundAmount),
    refundAmount: normalizeText(preview.refundAmount),
    refundType: normalizeText(preview.refundType),
    eligible: Boolean(preview.eligible),
    blockers: normalizeArray(preview.blockers).map(normalizeText).filter(Boolean),
    refundRecords: normalizeArray(preview.refundRecords).map(mapRefundRecord)
  };
}

function isActiveProfitSharingStatus(status) {
  const normalized = normalizeText(status).toUpperCase();
  return ["REQUESTING", "PROCESSING", "SUCCESS"].indexOf(normalized) >= 0;
}

function normalizeProfitSharingStatus(response = {}) {
  const status = normalizeText(response.txn_status || response.txnStatus || response.status).toUpperCase();
  if (status) {
    return status;
  }
  return normalizeText(response.ret_code || response.retCode) === "0000" ? "PROCESSING" : "FAILURE";
}

function normalizeProfitSharingShareList(payload = {}, fallbackAmount = "") {
  const rawList = Array.isArray(payload.shareList)
    ? payload.shareList
    : Array.isArray(payload.share_list)
      ? payload.share_list
      : [];
  const sourceList = rawList.length
    ? rawList
    : [
        {
          shareUid: payload.shareUid || payload.share_uid,
          shareUtype: payload.shareUtype || payload.share_utype,
          shareAmount: payload.shareAmount || payload.share_amount || fallbackAmount,
          shareMemo: payload.shareMemo || payload.share_memo
        }
      ];

  assertCondition(sourceList.length >= 1 && sourceList.length <= 10, "分账接收方数量必须为 1-10 个");

  return sourceList.map((item) => {
    const shareUtype = normalizeText(item.shareUtype || item.share_utype || "USER").toUpperCase();
    const shareUid = normalizeText(item.shareUid || item.share_uid)
      || (shareUtype === "MCH"
        ? normalizeText(payload.platformShareUid || payload.platform_share_uid || process.env.LIANLIAN_PLATFORM_PROFIT_SHARE_MCH_ID)
          || getLianlianConfig().mchId
        : "");
    const shareAmount = normalizeAmount(item.shareAmount || item.share_amount, "0");
    const shareMemo = normalizeText(item.shareMemo || item.share_memo);

    assertCondition(shareUid, "缺少分账用户号 share_uid");
    assertCondition(["MCH", "USER"].indexOf(shareUtype) >= 0, "share_utype 仅支持 MCH 或 USER");
    assertCondition(toAmountCents(shareAmount) > 0, "分账金额必须大于 0");

    const row = {
      share_uid: shareUid,
      share_utype: shareUtype,
      share_amount: shareAmount
    };

    if (shareMemo) {
      row.share_memo = shareMemo.slice(0, 256);
    }

    return row;
  });
}

function sumShareListAmountCents(shareList) {
  return normalizeArray(shareList).reduce((sum, item) => sum + toAmountCents(item && (item.share_amount || item.shareAmount)), 0);
}

function buildProfitSharingBody(payload = {}, fallback = {}) {
  const config = getLianlianConfig();
  const txnSeqno = normalizeText(payload.txnSeqno || payload.txn_seqno || fallback.txnSeqno);
  const shareTxnSeqno = normalizeText(payload.shareTxnSeqno || payload.share_txn_seqno) || createProfitSharingTxnSeqno();
  const shareAmount = normalizeText(payload.shareAmount || payload.share_amount || fallback.availableAmount);
  const shareList = normalizeProfitSharingShareList(payload, shareAmount);
  const totalShareAmountCents = sumShareListAmountCents(shareList);
  const availableAmountCents = toAmountCents(payload.availableAmount || payload.available_amount || fallback.availableAmount);

  assertCondition(txnSeqno, "缺少原支付单号 txn_seqno");
  assertCondition(txnSeqno.length <= 32, "txn_seqno 不能超过 32 位");
  assertCondition(shareTxnSeqno.length <= 32, "share_txn_seqno 不能超过 32 位");
  assertCondition(totalShareAmountCents > 0, "分账总金额必须大于 0");
  assertCondition(!availableAmountCents || totalShareAmountCents <= availableAmountCents, "分账总金额不能超过可分账金额");

  const requestBody = {
    mch_id: config.mchId,
    txn_seqno: txnSeqno,
    share_txn_seqno: shareTxnSeqno,
    share_txn_time: normalizeText(payload.shareTxnTime || payload.share_txn_time) || formatLianlianTimestamp(),
    share_list: shareList
  };

  if (payload.unfreezeUnsplit === true || payload.unfreeze_unsplit === true) {
    requestBody.unfreeze_unsplit = true;
  }

  return requestBody;
}

function mapProfitSharingRecord(record = {}) {
  return {
    id: normalizeText(record._id),
    type: normalizeText(record.type),
    orderNo: normalizeText(record.orderNo),
    txnSeqno: normalizeText(record.txnSeqno),
    platformTxno: normalizeText(record.platformTxno),
    shareTxnSeqno: normalizeText(record.shareTxnSeqno),
    sharePlatformTxno: normalizeText(record.sharePlatformTxno),
    shareAmount: normalizeText(record.shareAmount),
    status: normalizeText(record.status),
    requestSnapshot: record.requestSnapshot || {},
    responseSnapshot: record.responseSnapshot || {},
    httpStatusCode: record.httpStatusCode || 0,
    responseSignatureVerified: Boolean(record.responseSignatureVerified),
    errorMessage: normalizeText(record.errorMessage),
    createdAt: record.createdAt || 0,
    updatedAt: record.updatedAt || 0
  };
}

async function listProfitSharingRecords(payload = {}) {
  const orderNo = normalizeText(payload.orderNo || payload.order_no);
  const txnSeqno = normalizeText(payload.txnSeqno || payload.txn_seqno);
  const shareTxnSeqno = normalizeText(payload.shareTxnSeqno || payload.share_txn_seqno);
  const limit = Math.min(Math.max(Number(payload.limit) || 50, 1), 200);
  const where = {};

  if (orderNo) {
    where.orderNo = orderNo;
  }
  if (txnSeqno) {
    where.txnSeqno = txnSeqno;
  }
  if (shareTxnSeqno) {
    where.shareTxnSeqno = shareTxnSeqno;
  }

  const result = await db
    .collection(LIANLIAN_PROFIT_SHARING_COLLECTION)
    .where(where)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return {
    records: (result.data || []).map(mapProfitSharingRecord)
  };
}

async function listOrdersForProfitSharing(limit) {
  const perStatusLimit = Math.min(Math.max(Number(limit) || 60, 1), 100);
  const resultSets = await Promise.all(PROFIT_SHARING_READY_ORDER_STATUSES.map((status) =>
    getOrderModel().list({
      filter: {
        where: {
          status: {
            $eq: status
          }
        },
        orderBy: [
          {
            updatedAt: "desc"
          }
        ]
      },
      pageSize: perStatusLimit,
      pageNumber: 1
    })
  ));

  return resultSets
    .flatMap((result) => {
      const data = result && result.data ? result.data : {};
      return Array.isArray(data.records) ? data.records : [];
    })
    .sort((left, right) => Number(right.updatedAt || right.paidAtTs || right.createdAtTs || 0) - Number(left.updatedAt || left.paidAtTs || left.createdAtTs || 0))
    .slice(0, perStatusLimit);
}

async function listRecentPaymentCreateRecords(limit) {
  const result = await db
    .collection(LIANLIAN_PAYMENT_COLLECTION)
    .where({
      type: "payment_create"
    })
    .orderBy("createdAt", "desc")
    .limit(Math.min(Math.max(Number(limit) || 200, 1), 200))
    .get();

  return result.data || [];
}

function resolveOrderCreator(order = {}) {
  const snapshot = safeParseJson(order.creatorSnapshotJson);
  const refs = getOrderCreatorRefs(order);
  return {
    creatorId: refs[0] || "",
    creatorRefs: refs,
    creatorName: normalizeText(snapshot.name)
  };
}

function getOrderCreatorRefs(order = {}) {
  const creatorSnapshot = safeParseJson(order.creatorSnapshotJson);
  const serviceSnapshot = safeParseJson(order.serviceSnapshotJson);
  return Array.from(new Set([
    normalizeText(order.creatorId),
    normalizeText(order.serviceCreatorId),
    normalizeText(creatorSnapshot.id),
    normalizeText(creatorSnapshot.creatorId),
    normalizeText(creatorSnapshot.slug),
    normalizeText(serviceSnapshot.creatorId),
    normalizeText(serviceSnapshot.creatorSlug)
  ].filter(Boolean)));
}

function isOrderReadyForProfitSharing(order = {}) {
  return PROFIT_SHARING_READY_ORDER_STATUSES.indexOf(normalizeText(order.status)) >= 0;
}

function mapLatestPaymentByOrder(records) {
  return normalizeArray(records).reduce((map, record) => {
    const orderNo = normalizeText(record.orderNo);
    if (!orderNo || map[orderNo]) {
      return map;
    }
    map[orderNo] = record;
    return map;
  }, {});
}

function summarizeProfitSharingByOrder(records) {
  return normalizeArray(records).reduce((map, rawRecord) => {
    const record = mapProfitSharingRecord(rawRecord);
    if (!record.orderNo) {
      return map;
    }
    if (!map[record.orderNo]) {
      map[record.orderNo] = {
        activeAmountCents: 0,
        latestStatus: "",
        latestShareTxnSeqno: "",
        records: []
      };
    }
    map[record.orderNo].records.push(record);
    if (!map[record.orderNo].latestStatus) {
      map[record.orderNo].latestStatus = record.status;
      map[record.orderNo].latestShareTxnSeqno = record.shareTxnSeqno;
      map[record.orderNo].latestShareAmount = record.shareAmount;
      map[record.orderNo].latestCreatedAt = record.createdAt;
      map[record.orderNo].latestUpdatedAt = record.updatedAt;
      map[record.orderNo].latestErrorMessage = record.errorMessage;
    }
    if (isActiveProfitSharingStatus(record.status)) {
      map[record.orderNo].activeAmountCents += toAmountCents(record.shareAmount);
    }
    return map;
  }, {});
}

function getCreatorShareAmountCents(record = {}, creatorId = "") {
  const shareList = normalizeArray(record.requestSnapshot && record.requestSnapshot.share_list);
  if (!shareList.length) {
    return toAmountCents(record.shareAmount);
  }

  return shareList.reduce((sum, item) => {
    const shareUid = normalizeText(item && (item.share_uid || item.shareUid));
    const shareUtype = normalizeText(item && (item.share_utype || item.shareUtype)).toUpperCase();
    if (shareUtype !== "USER" || !creatorRefMatches(creatorId, shareUid)) {
      return sum;
    }
    return sum + toAmountCents(item.share_amount || item.shareAmount);
  }, 0);
}

function summarizeCreatorProfitSharingByOrder(records, creatorId) {
  return normalizeArray(records).reduce((map, rawRecord) => {
    const record = mapProfitSharingRecord(rawRecord);
    const amountCents = getCreatorShareAmountCents(record, creatorId);
    if (!record.orderNo || amountCents <= 0) {
      return map;
    }
    if (!map[record.orderNo]) {
      map[record.orderNo] = {
        activeAmountCents: 0,
        latestStatus: "",
        latestShareTxnSeqno: "",
        records: []
      };
    }
    map[record.orderNo].records.push(record);
    if (!map[record.orderNo].latestStatus) {
      map[record.orderNo].latestStatus = record.status;
      map[record.orderNo].latestShareTxnSeqno = record.shareTxnSeqno;
      map[record.orderNo].latestShareAmount = formatAmountFromCents(amountCents);
      map[record.orderNo].latestCreatedAt = record.createdAt;
      map[record.orderNo].latestUpdatedAt = record.updatedAt;
      map[record.orderNo].latestErrorMessage = record.errorMessage;
    }
    if (isActiveProfitSharingStatus(record.status)) {
      map[record.orderNo].activeAmountCents += amountCents;
    }
    return map;
  }, {});
}

async function listProfitSharingCandidates(payload = {}) {
  const limit = Math.min(Math.max(Number(payload.limit) || 60, 1), 100);
  const onlyReady = payload.onlyReady === true || payload.only_ready === true;
  const [orders, paymentRecords, profitSharingResult, refundResult] = await Promise.all([
    listOrdersForProfitSharing(limit),
    listRecentPaymentCreateRecords(200),
    listProfitSharingRecords({ limit: 200 }),
    listRefundRecords({ limit: 200 })
  ]);
  const paymentByOrder = mapLatestPaymentByOrder(paymentRecords);
  const sharingByOrder = summarizeProfitSharingByOrder(profitSharingResult.records);
  const refundByOrder = summarizeRefundByOrder(refundResult.records);
  const candidates = orders.map((order) => {
    const orderNo = normalizeText(order.orderNo);
    const paymentRecord = paymentByOrder[orderNo] || {};
    const sharingSummary = sharingByOrder[orderNo] || {};
    const refundSummary = refundByOrder[orderNo] || {};
    const paidAmountCents = toAmountCents(
      paymentRecord.amount
      || (paymentRecord.requestSnapshot && paymentRecord.requestSnapshot.order_amount)
      || order.payableDec
      || order.payable
    );
    const refundedAmountCents = Number(refundSummary.successAmountCents) || 0;
    const processingRefundAmountCents = Number(refundSummary.processingAmountCents) || 0;
    const activeSharedAmountCents = Number(sharingSummary.activeAmountCents) || 0;
    const availableAmountCents = Math.max(0, paidAmountCents - refundedAmountCents - processingRefundAmountCents - activeSharedAmountCents);
    const creator = resolveOrderCreator(order);
    const blockers = [];

    if (!creator.creatorId) {
      blockers.push("缺少分账对象");
    }
    if (!paymentRecord.txnSeqno) {
      blockers.push("缺少连连支付流水");
    }
    if (!isOrderReadyForProfitSharing(order)) {
      blockers.push("订单未支付成功");
    }
    if (availableAmountCents <= 0) {
      blockers.push("无可分账余额");
    }
    if (processingRefundAmountCents > 0) {
      blockers.push("已有退款处理中");
    }
    if (isActiveProfitSharingStatus(sharingSummary.latestStatus) && normalizeText(sharingSummary.latestStatus).toUpperCase() !== "SUCCESS") {
      blockers.push("已有分账处理中");
    }

    return Object.assign({
      orderNo,
      serviceName: normalizeText(order.serviceName),
      serviceSlug: normalizeText(order.serviceSlug),
      servicePeriodCode: normalizeText(order.servicePeriodCode),
      travelDateStart: normalizeText(order.travelDateStart),
      travelDateEnd: normalizeText(order.travelDateEnd),
      orderStatus: normalizeText(order.status),
      paidAtTs: Number(order.paidAtTs) || 0,
      updatedAt: Number(order.updatedAt || order.createdAtTs) || 0,
      txnSeqno: normalizeText(paymentRecord.txnSeqno),
      platformTxno: normalizeText(paymentRecord.platformTxno),
      paymentStatus: normalizeText(paymentRecord.status),
      paymentTxnStatus: normalizeText(paymentRecord.txnStatus),
      paidAmount: formatAmountFromCents(paidAmountCents),
      refundedAmount: formatAmountFromCents(refundedAmountCents),
      processingRefundAmount: formatAmountFromCents(processingRefundAmountCents),
      activeSharedAmount: formatAmountFromCents(activeSharedAmountCents),
      availableAmount: formatAmountFromCents(availableAmountCents),
      profitSharingStatus: normalizeText(sharingSummary.latestStatus) || "UNSHARED",
      latestShareTxnSeqno: normalizeText(sharingSummary.latestShareTxnSeqno),
      latestShareAmount: normalizeText(sharingSummary.latestShareAmount),
      profitSharingCreatedAt: Number(sharingSummary.latestCreatedAt) || 0,
      profitSharingUpdatedAt: Number(sharingSummary.latestUpdatedAt) || 0,
      profitSharingErrorMessage: normalizeText(sharingSummary.latestErrorMessage),
      eligible: blockers.length === 0,
      blockers
    }, creator);
  });
  const filteredCandidates = onlyReady ? candidates.filter((item) => item.eligible) : candidates;
  const stats = filteredCandidates.reduce((summary, item) => {
    summary.total += 1;
    summary.availableAmountCents += toAmountCents(item.availableAmount);
    if (item.eligible) {
      summary.ready += 1;
      summary.readyAmountCents += toAmountCents(item.availableAmount);
    }
    return summary;
  }, {
    total: 0,
    ready: 0,
    availableAmountCents: 0,
    readyAmountCents: 0
  });

  return {
    items: filteredCandidates,
    stats: {
      total: stats.total,
      ready: stats.ready,
      availableAmount: formatAmountFromCents(stats.availableAmountCents),
      readyAmount: formatAmountFromCents(stats.readyAmountCents)
    }
  };
}

function creatorRefMatches(boundCreatorId, creatorId) {
  const bound = normalizeText(boundCreatorId);
  const creator = normalizeText(creatorId);

  if (!bound || !creator) {
    return false;
  }
  if (bound === creator) {
    return true;
  }
  if (bound.indexOf("creator-") === 0 && bound.slice("creator-".length) === creator) {
    return true;
  }
  if (creator.indexOf("creator-") === 0 && creator.slice("creator-".length) === bound) {
    return true;
  }
  return false;
}

async function listOwnedProfitSharingOrders(payload = {}, access) {
  assertCondition(access && access.accountType === "creator_portal", "仅创作者账号可查看我的分账");
  assertCondition(access.boundCreatorId, "创作者账号未绑定创作者");

  const result = await listProfitSharingCandidates({
    limit: payload.limit || 100,
    onlyReady: false
  });
  const profitSharingResult = await listProfitSharingRecords({ limit: 200 });
  const creatorSharingByOrder = summarizeCreatorProfitSharingByOrder(profitSharingResult.records, access.boundCreatorId);
  const status = normalizeText(payload.status).toUpperCase();
  const keyword = normalizeText(payload.keyword).toLowerCase();
  const ownedItems = result.items
    .filter((item) => creatorRefMatches(access.boundCreatorId, item.creatorId))
    .map((item) => {
      const sharingSummary = creatorSharingByOrder[item.orderNo] || {};
      if (!sharingSummary.latestStatus) {
        return item;
      }
      return Object.assign({}, item, {
        activeSharedAmount: formatAmountFromCents(Number(sharingSummary.activeAmountCents) || 0),
        latestShareAmount: normalizeText(sharingSummary.latestShareAmount),
        latestShareTxnSeqno: normalizeText(sharingSummary.latestShareTxnSeqno),
        profitSharingStatus: normalizeText(sharingSummary.latestStatus),
        profitSharingCreatedAt: Number(sharingSummary.latestCreatedAt) || 0,
        profitSharingUpdatedAt: Number(sharingSummary.latestUpdatedAt) || 0,
        profitSharingErrorMessage: normalizeText(sharingSummary.latestErrorMessage)
      });
    })
    .filter((item) => {
      if (!status || status === "ALL") {
        return true;
      }
      const currentStatus = normalizeText(item.profitSharingStatus).toUpperCase() || "UNSHARED";
      if (status === "DEFERRED") {
        return currentStatus === "UNSHARED" && !item.eligible;
      }
      if (status === "PAYABLE") {
        return currentStatus === "UNSHARED" && item.eligible;
      }
      if (status === "PENDING") {
        return currentStatus !== "SUCCESS" && currentStatus !== "FAILURE" && currentStatus !== "CLOSED" && currentStatus !== "CANCEL";
      }
      return currentStatus === status;
    })
    .filter((item) => {
      if (!keyword) {
        return true;
      }
      return [
        item.orderNo,
        item.serviceName,
        item.serviceSlug,
        item.servicePeriodCode
      ].some((value) => normalizeText(value).toLowerCase().indexOf(keyword) >= 0);
    });
  const stats = ownedItems.reduce((summary, item) => {
    const currentStatus = normalizeText(item.profitSharingStatus).toUpperCase() || "UNSHARED";
    const availableAmountCents = toAmountCents(item.availableAmount);
    const sharedAmountCents = toAmountCents(item.activeSharedAmount || item.latestShareAmount);

    if (currentStatus === "SUCCESS") {
      summary.successAmountCents += sharedAmountCents;
      summary.success += 1;
    } else if (currentStatus === "PROCESSING" || currentStatus === "REQUESTING") {
      summary.processingAmountCents += sharedAmountCents || availableAmountCents;
      summary.processing += 1;
    } else if (currentStatus === "FAILURE" || currentStatus === "CLOSED" || currentStatus === "CANCEL") {
      summary.failedAmountCents += sharedAmountCents || availableAmountCents;
      summary.failed += 1;
    } else if (item.eligible) {
      summary.payableAmountCents += availableAmountCents;
      summary.payable += 1;
    } else {
      summary.deferredAmountCents += availableAmountCents;
      summary.deferred += 1;
    }

    summary.total += 1;
    return summary;
  }, {
    total: 0,
    payable: 0,
    processing: 0,
    success: 0,
    failed: 0,
    deferred: 0,
    payableAmountCents: 0,
    processingAmountCents: 0,
    successAmountCents: 0,
    failedAmountCents: 0,
    deferredAmountCents: 0
  });

  return {
    creatorId: access.boundCreatorId,
    items: ownedItems,
    stats: {
      total: stats.total,
      payable: stats.payable,
      processing: stats.processing,
      success: stats.success,
      failed: stats.failed,
      deferred: stats.deferred,
      payableAmount: formatAmountFromCents(stats.payableAmountCents),
      processingAmount: formatAmountFromCents(stats.processingAmountCents),
      successAmount: formatAmountFromCents(stats.successAmountCents),
      failedAmount: formatAmountFromCents(stats.failedAmountCents),
      deferredAmount: formatAmountFromCents(stats.deferredAmountCents)
    }
  };
}

async function previewProfitSharing(payload = {}) {
  const fallback = {
    txnSeqno: normalizeText(payload.txnSeqno || payload.txn_seqno),
    availableAmount: normalizeText(payload.availableAmount || payload.available_amount || payload.shareAmount || payload.share_amount)
  };
  const requestBody = buildProfitSharingBody(payload, fallback);
  const totalAmount = formatAmountFromCents(sumShareListAmountCents(requestBody.share_list));

  return {
    orderNo: normalizeText(payload.orderNo || payload.order_no),
    txnSeqno: requestBody.txn_seqno,
    shareTxnSeqno: requestBody.share_txn_seqno,
    shareAmount: totalAmount,
    requestSnapshot: requestBody
  };
}

async function createProfitSharingRequest(payload = {}) {
  const preview = await previewProfitSharing(payload);
  const recordId = await insertProfitSharingRecord({
    type: "profit_sharing_create",
    orderNo: normalizeText(payload.orderNo || payload.order_no),
    txnSeqno: preview.txnSeqno,
    platformTxno: normalizeText(payload.platformTxno || payload.platform_txno),
    shareTxnSeqno: preview.shareTxnSeqno,
    shareAmount: preview.shareAmount,
    status: "REQUESTING",
    requestSnapshot: preview.requestSnapshot
  });

  try {
    const result = await postLianlianJson(LIANLIAN_PROFIT_SHARING_PATH, preview.requestSnapshot);
    const response = result.response.json || {};
    const status = normalizeProfitSharingStatus(response);
    await updateProfitSharingRecord(recordId, {
      status,
      sharePlatformTxno: normalizeText(response.share_platform_txno || response.sharePlatformTxno),
      responseSnapshot: response,
      httpStatusCode: result.response.statusCode,
      responseSignatureVerified: result.response.signatureVerified
    });

    return {
      recordId,
      orderNo: normalizeText(payload.orderNo || payload.order_no),
      txnSeqno: preview.txnSeqno,
      shareTxnSeqno: preview.shareTxnSeqno,
      shareAmount: preview.shareAmount,
      status,
      requestSnapshot: preview.requestSnapshot,
      response,
      httpStatusCode: result.response.statusCode,
      responseSignatureVerified: result.response.signatureVerified
    };
  } catch (error) {
    await updateProfitSharingRecord(recordId, {
      status: "FAILURE",
      errorMessage: normalizeText(error && error.message)
    });
    throw error;
  }
}

function diagnoseLianlianConfig(payload = {}) {
  const config = getLianlianConfig();
  const expectedMchId = normalizeText(payload.expectedMchId || payload.expected_mch_id);
  const privateKeyObject = getPrivateKeyObject(config.privateKey);
  const merchantPublicKeyObject = crypto.createPublicKey(privateKeyObject);
  const lianlianPublicKeyObject = getPublicKeyObject(config.publicKey);
  const sampleBody = JSON.stringify({
    txn_seqno: "DIAGNOSTIC",
    user_id: DEFAULT_SUB_MERCHANT_USER_ID
  });
  const digest = crypto.createHash("md5").update(sampleBody, "utf8").digest("hex");
  const signature = signLianlianBody(sampleBody, config.privateKey);
  const selfVerify = crypto
    .createVerify("RSA-MD5")
    .update(digest, "utf8")
    .verify(merchantPublicKeyObject, signature, "base64");

  return {
    codeVersion: CODE_VERSION,
    baseUrl: config.baseUrl,
    mchIdMasked: maskIdentifier(config.mchId),
    mchIdLength: config.mchId.length,
    expectedMchIdMasked: maskIdentifier(expectedMchId),
    expectedMchIdLength: expectedMchId.length,
    mchIdMatchesExpected: expectedMchId ? config.mchId === expectedMchId : null,
    spNoMasked: maskIdentifier(config.spNo),
    hasSpNo: Boolean(config.spNo),
    privateKeyFormat: /BEGIN [A-Z ]*PRIVATE KEY/.test(config.privateKey) ? "pem" : "base64",
    privateModulusLength: privateKeyObject.asymmetricKeyDetails
      ? privateKeyObject.asymmetricKeyDetails.modulusLength
      : null,
    merchantPublicFingerprint: fingerprintPublicKeyObject(merchantPublicKeyObject),
    lianlianPublicFingerprint: fingerprintPublicKeyObject(lianlianPublicKeyObject),
    sampleBodyLength: Buffer.byteLength(sampleBody),
    sampleDigest: digest,
    sampleSignatureLength: signature.length,
    sampleSelfVerify: selfVerify,
    signingRule: "md5(JSON utf8 lowercase hex) -> MD5withRSA over digest string -> base64"
  };
}

function isHttpEvent(event) {
  return Boolean(
    event
    && (
      event.httpMethod
      || event.requestContext
      || event.path
      || event.rawPath
      || event.body
    )
    && !event.action
  );
}

function parseHttpBody(event) {
  const rawBody = event && event.body != null ? String(event.body) : "";
  if (!rawBody) {
    return {
      raw: "",
      json: {}
    };
  }

  const raw = event && event.isBase64Encoded
    ? Buffer.from(rawBody, "base64").toString("utf8")
    : rawBody;
  return {
    raw,
    json: safeParseJson(raw)
  };
}

async function handleLianlianOnboardingNotify(event = {}) {
  const config = getLianlianConfig();
  const headers = event.headers || {};
  const parsedBody = parseHttpBody(event);
  const signature = getHeaderValue(headers, "Signature-Data");
  const signatureVerified = signature
    ? verifyLianlianSignature(parsedBody.raw, signature, config.publicKey)
    : false;
  const body = parsedBody.json || {};
  const txnSeqno = normalizeText(body.txn_seqno || body.txnSeqno);
  const isSubMerchantNotify = Boolean(body.sub_mchid || body.subMchid || body.wx_sub_mchid || body.wxSubMchid || body.ali_sub_mchid || body.aliSubMchid);

  if (!isSubMerchantNotify) {
    await insertOnboardingRecord({
      type: "personal_user_notify",
      txnSeqno,
      userId: normalizeText(body.user_id || body.userId),
      platformTxno: normalizeText(body.platform_txno || body.platformTxno),
      oidUserno: normalizeText(body.oid_userno || body.oidUserno),
      userStatus: normalizeText(body.user_status || body.userStatus),
      status: normalizeText(body.user_status || body.userStatus) || "NOTIFIED",
      remark: normalizeText(body.remark),
      openAccountWillUrl: normalizeText(body.open_account_will_url || body.openAccountWillUrl),
      willVerifyStatus: normalizeText(body.will_verify_status || body.willVerifyStatus),
      willFailResult: normalizeText(body.will_fail_result || body.willFailResult),
      rawBody: parsedBody.raw,
      notifySnapshot: body,
      signatureVerified
    });

    return {
      ret_code: "0000",
      ret_msg: "success"
    };
  }

  await insertOnboardingRecord({
    type: "sub_merchant_notify",
    txnSeqno,
    userId: normalizeText(body.user_id || body.userId),
    status: normalizeText(body.status) || "NOTIFIED",
    subMchid: normalizeText(body.sub_mchid || body.subMchid),
    wxSubMchid: normalizeText(body.wx_sub_mchid || body.wxSubMchid),
    aliSubMchid: normalizeText(body.ali_sub_mchid || body.aliSubMchid),
    rawBody: parsedBody.raw,
    notifySnapshot: body,
    signatureVerified
  });

  return {
    ret_code: "0000",
    ret_msg: "success"
  };
}

async function handleLianlianPaymentNotify(event = {}) {
  const config = getLianlianConfig();
  const headers = event.headers || {};
  const parsedBody = parseHttpBody(event);
  const signature = getHeaderValue(headers, "Signature-Data");
  const signatureVerified = signature
    ? verifyLianlianSignature(parsedBody.raw, signature, config.publicKey)
    : false;
  const body = parsedBody.json || {};
  const txnSeqno = normalizeText(body.txn_seqno || body.txnSeqno);
  const paymentCreateRecord = await findPaymentCreateRecordByTxnSeqno(txnSeqno);
  const orderNo = normalizeText(body.order_no || body.orderNo || (paymentCreateRecord && paymentCreateRecord.orderNo));
  const platformTxno = normalizeText(body.platform_txno || body.platformTxno);
  const txnStatus = normalizeText(body.txn_status || body.txnStatus);
  let orderUpdate = null;

  if (signatureVerified && orderNo && isPaymentSuccessPayload(body)) {
    orderUpdate = await markOrderPaid(orderNo, "payment_notify", {
      userOpenid: normalizeText(paymentCreateRecord && paymentCreateRecord.userOpenid),
      txnSeqno,
      platformTxno
    });
  }

  await insertPaymentRecord({
    type: "payment_notify",
    txnSeqno,
    platformTxno,
    orderNo,
    status: "NOTIFIED",
    txnStatus,
    rawBody: parsedBody.raw,
    notifySnapshot: body,
    signatureVerified,
    orderUpdate
  });

  if (paymentCreateRecord && paymentCreateRecord._id) {
    await updatePaymentRecord(paymentCreateRecord._id, {
      status: signatureVerified && isPaymentSuccessPayload(body) ? "PAID" : "NOTIFIED",
      txnStatus,
      platformTxno: platformTxno || normalizeText(paymentCreateRecord.platformTxno),
      notifySnapshot: body,
      signatureVerified
    });
  }

  return {
    ret_code: "0000",
    ret_msg: "success"
  };
}

async function handleLianlianRefundNotify(event = {}) {
  const config = getLianlianConfig();
  const headers = event.headers || {};
  const parsedBody = parseHttpBody(event);
  const signature = getHeaderValue(headers, "Signature-Data");
  const signatureVerified = signature
    ? verifyLianlianSignature(parsedBody.raw, signature, config.publicKey)
    : false;
  const body = parsedBody.json || {};
  const refundSeqno = normalizeText(body.refund_seqno || body.refundSeqno);
  const platformRefundno = normalizeText(body.platform_refundno || body.platformRefundno);
  const existingRecord = await findRefundRecordByRefundSeqno(refundSeqno);
  const orderNo = normalizeText(body.order_no || body.orderNo || (existingRecord && existingRecord.orderNo));
  const status = normalizeRefundStatus(body);

  await insertRefundRecord({
    type: "refund_notify",
    orderNo,
    txnSeqno: normalizeText(body.txn_seqno || body.txnSeqno || (existingRecord && existingRecord.txnSeqno)),
    platformTxno: normalizeText(body.platform_txno || body.platformTxno || (existingRecord && existingRecord.platformTxno)),
    refundSeqno,
    platformRefundno,
    refundAmount: normalizeText(body.refund_amount || body.refundAmount || (existingRecord && existingRecord.refundAmount)),
    actuallyAmount: normalizeText(body.actually_amount || body.actuallyAmount),
    cancelOrderOnRefundSuccess: Boolean(existingRecord && existingRecord.cancelOrderOnRefundSuccess),
    status,
    refundFailMsg: normalizeText(body.refund_fail_msg || body.refundFailMsg),
    rawBody: parsedBody.raw,
    notifySnapshot: body,
    signatureVerified
  });

  if (existingRecord && existingRecord._id) {
    await updateRefundRecord(existingRecord._id, {
      status,
      platformRefundno: platformRefundno || normalizeText(existingRecord.platformRefundno),
      actuallyAmount: normalizeText(body.actually_amount || body.actuallyAmount),
      refundFailMsg: normalizeText(body.refund_fail_msg || body.refundFailMsg),
      notifySnapshot: body,
      signatureVerified
    });
  }

  if (signatureVerified && orderNo && isRefundSuccessStatus(status)) {
    await applyRefundOrderSideEffects(orderNo);
  }

  return {
    ret_code: "0000",
    ret_msg: "success"
  };
}

async function handleLianlianWithdrawalNotify(event = {}) {
  const config = getLianlianConfig();
  const headers = event.headers || {};
  const parsedBody = parseHttpBody(event);
  const signature = getHeaderValue(headers, "Signature-Data");
  const signatureVerified = signature
    ? verifyLianlianSignature(parsedBody.raw, signature, config.publicKey)
    : false;
  const body = parsedBody.json || {};
  const txnSeqno = normalizeText(body.txn_seqno || body.txnSeqno);
  const platformTxno = normalizeText(body.platform_txno || body.platformTxno);
  const existingRecord = await findWithdrawalApplyRecordByTxnSeqno(txnSeqno);
  const status = signatureVerified ? normalizeWithdrawalStatus(body) : "NOTIFIED";
  const txnStatus = normalizeText(body.txn_status || body.txnStatus);
  const failReason = normalizeText(body.fail_reason || body.failReason);
  const accountDate = normalizeText(body.account_date || body.accountDate);

  await insertWithdrawalRecord({
    type: "platform_withdrawal_notify",
    txnSeqno,
    platformTxno,
    orderAmount: normalizeText(body.order_amount || body.orderAmount || (existingRecord && existingRecord.orderAmount)),
    status,
    txnStatus,
    failReason,
    accountDate,
    rawBody: parsedBody.raw,
    notifySnapshot: body,
    signatureVerified
  });

  if (existingRecord && existingRecord._id) {
    await updateWithdrawalRecord(existingRecord._id, {
      status,
      txnStatus,
      platformTxno: platformTxno || normalizeText(existingRecord.platformTxno),
      orderAmount: normalizeText(body.order_amount || body.orderAmount || existingRecord.orderAmount),
      failReason,
      accountDate,
      notifySnapshot: body,
      signatureVerified
    });
  }

  return {
    ret_code: "0000",
    ret_msg: "success"
  };
}

function getHttpPath(event = {}) {
  return normalizeText(event.path || event.rawPath || (event.requestContext && event.requestContext.path));
}

function extractIp(payload) {
  return payload && (payload.ip || payload.ip_addr || payload.remote_addr || "");
}

async function getOutboundIp() {
  const errors = [];

  for (const endpoint of OUTBOUND_IP_ENDPOINTS) {
    try {
      const payload = await requestJson(endpoint);
      const ip = extractIp(payload);
      if (ip) {
        return {
          ip,
          endpoint,
          checkedAt: new Date().toISOString()
        };
      }
      errors.push(`${endpoint}: empty ip`);
    } catch (err) {
      errors.push(`${endpoint}: ${err.message}`);
    }
  }

  const error = new Error("Failed to detect outbound IP");
  error.details = errors;
  throw error;
}

exports.main = async (event = {}) => {
  if (isHttpEvent(event)) {
    const path = getHttpPath(event);
    if (path.indexOf(DEFAULT_WITHDRAWAL_NOTIFY_PATH) >= 0) {
      return handleLianlianWithdrawalNotify(event);
    }
    if (path.indexOf(DEFAULT_REFUND_NOTIFY_PATH) >= 0) {
      return handleLianlianRefundNotify(event);
    }
    if (path.indexOf(DEFAULT_PAYMENT_NOTIFY_PATH) >= 0) {
      return handleLianlianPaymentNotify(event);
    }
    return handleLianlianOnboardingNotify(event);
  }

  const action = event.action || "ping";
  const payload = getPayload(event);

  if (action === "ping") {
    return {
      code: 0,
      message: "paymentGateway ready",
      data: {
        codeVersion: CODE_VERSION,
        env: process.env.TCB_ENV || process.env.SCF_NAMESPACE || "",
        checkedAt: new Date().toISOString()
      }
    };
  }

  if (action === "getOutboundIp") {
    try {
      const data = await getOutboundIp();
      return { code: 0, message: "ok", data };
    } catch (err) {
      return {
        code: -1,
        message: err.message,
        data: {
          details: err.details || []
        }
      };
    }
  }

  if (action === "applySubMerchant") {
    try {
      const data = await applySubMerchant(payload);
      if (data.response && data.response.ret_code && data.response.ret_code !== "0000") {
        return {
          ok: false,
          error: data.response.ret_msg || `连连接口返回 ${data.response.ret_code}`,
          data
        };
      }
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "applySubMerchant failed"
      };
    }
  }

  if (action === "diagnoseLianlianConfig") {
    try {
      return { ok: true, data: diagnoseLianlianConfig(payload) };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "diagnoseLianlianConfig failed"
      };
    }
  }

  if (action === "querySubMerchantOnboarding") {
    try {
      const data = await querySubMerchantOnboarding(payload);
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "querySubMerchantOnboarding failed"
      };
    }
  }

  if (action === "listSubMerchantOnboardingNotifications") {
    try {
      const data = await listSubMerchantOnboardingNotifications(payload);
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "listSubMerchantOnboardingNotifications failed"
      };
    }
  }

  if (action === "registerAtSubMerchantChannel") {
    try {
      assertPaymentMaintenanceAccess(payload);
      const data = await registerAtSubMerchantChannel(payload);
      if (data.response && data.response.ret_code && data.response.ret_code !== "0000") {
        return {
          ok: false,
          error: data.response.ret_msg || `连连接口返回 ${data.response.ret_code}`,
          data
        };
      }
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "registerAtSubMerchantChannel failed"
      };
    }
  }

  if (action === "configureAtSubMerchantWechat") {
    try {
      assertPaymentMaintenanceAccess(payload);
      const data = await configureAtSubMerchantWechat(payload);
      if (data.response && data.response.ret_code && data.response.ret_code !== "0000") {
        return {
          ok: false,
          error: data.response.ret_msg || `连连接口返回 ${data.response.ret_code}`,
          data
        };
      }
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "configureAtSubMerchantWechat failed"
      };
    }
  }

  if (action === "applyPersonalUserH5OpenAcct") {
    try {
      const access = await resolvePaymentGatewayAccess();
      const data = await applyPersonalUserH5OpenAcct(payload, access);
      if (data.response && data.response.ret_code && data.response.ret_code !== "0000") {
        return {
          ok: false,
          error: data.response.ret_msg || `连连接口返回 ${data.response.ret_code}`,
          data
        };
      }
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "applyPersonalUserH5OpenAcct failed"
      };
    }
  }

  if (action === "listPersonalUserOnboardingRecords") {
    try {
      const access = await resolvePaymentGatewayAccess();
      const data = await listPersonalUserOnboardingRecordsForAccess(payload, access);
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "listPersonalUserOnboardingRecords failed"
      };
    }
  }

  if (action === "applyPersonalUserH5AccountManage") {
    try {
      const access = await resolvePaymentGatewayAccess();
      const data = await applyPersonalUserH5AccountManage(payload, access);
      if (data.response && data.response.ret_code && data.response.ret_code !== "0000") {
        return {
          ok: false,
          error: data.response.ret_msg || `连连接口返回 ${data.response.ret_code}`,
          data
        };
      }
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "applyPersonalUserH5AccountManage failed"
      };
    }
  }

  if (action === "applyPersonalUserBindCardH5") {
    try {
      const access = await resolvePaymentGatewayAccess();
      const data = await applyPersonalUserBindCardH5(payload, access);
      if (data.response && data.response.ret_code && data.response.ret_code !== "0000") {
        return {
          ok: false,
          error: data.response.ret_msg || `连连接口返回 ${data.response.ret_code}`,
          data
        };
      }
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "applyPersonalUserBindCardH5 failed"
      };
    }
  }

  if (action === "listPersonalUserAccountH5Records") {
    try {
      const access = await resolvePaymentGatewayAccess();
      const data = await listPersonalUserAccountH5RecordsForAccess(payload, access);
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "listPersonalUserAccountH5Records failed"
      };
    }
  }

  if (action === "createTestPayment") {
    try {
      assertPaymentMaintenanceAccess(payload);
      const data = await createTestPayment(payload);
      if (data.response && data.response.ret_code && data.response.ret_code !== "0000") {
        return {
          ok: false,
          error: data.response.ret_msg || `连连接口返回 ${data.response.ret_code}`,
          data
        };
      }
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "createTestPayment failed"
      };
    }
  }

  if (action === "createMiniProgramOrderPayment") {
    try {
      const data = await createMiniProgramOrderPayment(payload);
      if (data.response && data.response.ret_code && data.response.ret_code !== "0000") {
        return {
          ok: false,
          error: data.response.ret_msg || `连连接口返回 ${data.response.ret_code}`,
          data
        };
      }
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "createMiniProgramOrderPayment failed"
      };
    }
  }

  if (action === "confirmMiniProgramOrderPayment") {
    try {
      const data = await confirmMiniProgramOrderPayment(payload);
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "confirmMiniProgramOrderPayment failed"
      };
    }
  }

  if (action === "queryPayment") {
    try {
      assertPaymentMaintenanceAccess(payload);
      const data = await queryPayment(payload);
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "queryPayment failed"
      };
    }
  }

  if (action === "listPaymentRecords") {
    try {
      assertPaymentMaintenanceAccess(payload);
      const data = await listPaymentRecords(payload);
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "listPaymentRecords failed"
      };
    }
  }

  if (action === "listProfitSharingCandidates") {
    try {
      await resolvePlatformPaymentAdminAccess();
      const data = await listProfitSharingCandidates(payload);
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "listProfitSharingCandidates failed"
      };
    }
  }

  if (action === "previewProfitSharing") {
    try {
      await resolvePlatformPaymentAdminAccess();
      const data = await previewProfitSharing(payload);
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "previewProfitSharing failed"
      };
    }
  }

  if (action === "createProfitSharingRequest") {
    try {
      await resolvePlatformPaymentAdminAccess();
      const data = await createProfitSharingRequest(payload);
      if (data.response && data.response.ret_code && data.response.ret_code !== "0000") {
        return {
          ok: false,
          error: data.response.ret_msg || `连连接口返回 ${data.response.ret_code}`,
          data
        };
      }
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "createProfitSharingRequest failed"
      };
    }
  }

  if (action === "listProfitSharingRecords") {
    try {
      await resolvePlatformPaymentAdminAccess();
      const data = await listProfitSharingRecords(payload);
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "listProfitSharingRecords failed"
      };
    }
  }

  if (action === "previewRefundOrder") {
    try {
      await resolvePlatformPaymentAdminAccess();
      const data = sanitizeRefundPreview(await previewRefundOrder(payload));
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "previewRefundOrder failed"
      };
    }
  }

  if (action === "createRefundRequest") {
    try {
      const access = await resolvePlatformPaymentAdminAccess();
      const data = await createRefundRequest(payload, access);
      if (data.response && data.response.ret_code && data.response.ret_code !== "0000") {
        return {
          ok: false,
          error: data.response.ret_msg || `连连接口返回 ${data.response.ret_code}`,
          data
        };
      }
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "createRefundRequest failed"
      };
    }
  }

  if (action === "queryRefund") {
    try {
      await resolvePlatformPaymentAdminAccess();
      const data = await queryRefund(payload);
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "queryRefund failed"
      };
    }
  }

  if (action === "listRefundRecords") {
    try {
      const access = await resolvePaymentGatewayAccess();
      const data = await listRefundRecordsForAccess(payload, access);
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "listRefundRecords failed"
      };
    }
  }

  if (action === "applyPlatformWithdrawal") {
    try {
      const access = await resolvePlatformPaymentAdminAccess();
      const data = await applyPlatformWithdrawal(payload, access);
      if (data.response && data.response.ret_code && ["0000", "8888", "8889"].indexOf(data.response.ret_code) < 0) {
        return {
          ok: false,
          error: data.response.ret_msg || `连连接口返回 ${data.response.ret_code}`,
          data
        };
      }
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "applyPlatformWithdrawal failed"
      };
    }
  }

  if (action === "confirmPlatformWithdrawal") {
    try {
      const access = await resolvePlatformPaymentAdminAccess();
      const data = await confirmPlatformWithdrawal(payload, access);
      if (data.response && data.response.ret_code && data.response.ret_code !== "0000") {
        return {
          ok: false,
          error: data.response.ret_msg || `连连接口返回 ${data.response.ret_code}`,
          data
        };
      }
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "confirmPlatformWithdrawal failed"
      };
    }
  }

  if (action === "queryPlatformWithdrawal") {
    try {
      await resolvePlatformPaymentAdminAccess();
      const data = await queryPlatformWithdrawal(payload);
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "queryPlatformWithdrawal failed"
      };
    }
  }

  if (action === "listPlatformWithdrawalAccounts") {
    try {
      await resolvePlatformPaymentAdminAccess();
      const data = listPlatformWithdrawalAccounts();
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "listPlatformWithdrawalAccounts failed"
      };
    }
  }

  if (action === "queryPlatformAccountInfo") {
    try {
      await resolvePlatformPaymentAdminAccess();
      const data = await queryPlatformAccountInfo(payload);
      if (data.retCode && data.retCode !== "0000") {
        return {
          ok: false,
          error: data.retMsg || `连连接口返回 ${data.retCode}`,
          data
        };
      }
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "queryPlatformAccountInfo failed"
      };
    }
  }

  if (action === "listPlatformAccountSerials") {
    try {
      await resolvePlatformPaymentAdminAccess();
      const data = await listPlatformAccountSerials(payload);
      if (data.retCode && data.retCode !== "0000") {
        return {
          ok: false,
          error: data.retMsg || `连连接口返回 ${data.retCode}`,
          data
        };
      }
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "listPlatformAccountSerials failed"
      };
    }
  }

  if (action === "listPlatformWithdrawalRecords") {
    try {
      await resolvePlatformPaymentAdminAccess();
      const data = await listPlatformWithdrawalRecords(payload);
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "listPlatformWithdrawalRecords failed"
      };
    }
  }

  if (action === "listOwnedProfitSharingOrders") {
    try {
      const access = await resolvePaymentGatewayAccess();
      const data = await listOwnedProfitSharingOrders(payload, access);
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "listOwnedProfitSharingOrders failed"
      };
    }
  }

  return {
    code: -1,
    message: `Unsupported action: ${action}`,
    data: null
  };
};

exports.__test__ = {
  buildWechatPayProductInfo,
  buildAtSubMerchantChannelRegisterBody,
  buildPersonalUserH5OpenAcctBody,
  buildPersonalUserH5AccountManageBody,
  buildPersonalUserBindCardH5Body,
  buildCreatePaymentBody,
  LIANLIAN_CREATEPAY_PATH,
  LIANLIAN_ORDERQUERY_PATH,
  LIANLIAN_REFUND_PATH,
  LIANLIAN_REFUND_QUERY_PATH,
  LIANLIAN_AT_WECHAT_CONFIG_PATH,
  LIANLIAN_PROFIT_SHARING_PATH,
  LIANLIAN_WITHDRAWAL_PATH,
  LIANLIAN_WITHDRAWAL_CHECK_PATH,
  LIANLIAN_WITHDRAWAL_QUERY_PATH,
  LIANLIAN_ACCP_ACCOUNT_INFO_PATH,
  LIANLIAN_ACCP_ACCOUNT_SERIAL_PATH,
  buildAtSubMerchantWechatConfigBody,
  buildPayeeInfos,
  buildRefundBody,
  buildRefundMethodInfos,
  buildPayeeRefundInfos,
  buildRefundQueryBody,
  normalizeRefundStatus,
  summarizeRefundRecords,
  summarizeRefundByOrder,
  buildPlatformWithdrawalBody,
  buildPlatformWithdrawalCheckBody,
  buildPlatformWithdrawalQueryBody,
  normalizeWithdrawalStatus,
  getConfiguredPlatformWithdrawalAccounts,
  buildPlatformAccountInfoBody,
  buildPlatformAccountSerialBody,
  normalizePlatformAccountInfoResponse,
  normalizePlatformAccountSerialResponse,
  buildProfitSharingBody,
  normalizeProfitSharingShareList,
  summarizeCreatorProfitSharingByOrder,
  isOrderReadyForProfitSharing,
  normalizeWechatPaymentPayload,
  isPaymentSuccessPayload,
  createAtChannelTxnSeqno,
  createTxnSeqno,
  createPaymentTxnSeqno,
  createRefundTxnSeqno,
  createWithdrawalTxnSeqno,
  createPersonalUserTxnSeqno,
  encryptWithLianlianPublicKey,
  formatLianlianTimestamp,
  signLianlianBody,
  verifyLianlianSignature
};
