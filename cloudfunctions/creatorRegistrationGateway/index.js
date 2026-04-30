const cloud = require("wx-server-sdk");
const cloudbase = require("@cloudbase/node-sdk");
const crypto = require("node:crypto");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const app = cloudbase.init({
  env: process.env.TCB_ENV || cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const auth = app.auth();
const COLLECTION_NAME = "creator_registrations";
const CREATORS_COLLECTION_NAME = "creators";
const ADMIN_ACCOUNTS_COLLECTION_NAME = "admin_accounts";
const MUTABLE_STATUSES = new Set(["draft", "rejected"]);
const APPROVAL_EMAIL_STATUSES = new Set(["pending", "sent", "failed"]);
const REGISTERED_CREATOR_EMAIL_MESSAGE = "该邮箱已经被注册过，可以用该邮箱作为用户名登录";
const MAX_IMAGE_UPLOAD_BYTES = 15 * 1024 * 1024;
const IMAGE_MIME_EXTENSION_MAP = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/heic": ".heic",
  "image/heif": ".heif"
};

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizePhone(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function normalizeDocumentNumber(value) {
  return normalizeText(value).replace(/\s+/g, "").toUpperCase();
}

function normalizeDocumentType(value) {
  const normalized = normalizeText(value);
  if (normalized === "idCard") {
    return "id_card";
  }
  if (normalized === "hkmtResidencePermit") {
    return "hk_macao_taiwan";
  }
  return normalized;
}

function normalizeGender(value) {
  const normalized = normalizeText(value);
  return normalized === "male" || normalized === "female" ? normalized : "";
}

function normalizeAbout(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function normalizeApprovalEmailStatus(value) {
  const status = normalizeText(value);
  return APPROVAL_EMAIL_STATUSES.has(status) ? status : "pending";
}

function hashActivationToken(token) {
  return crypto.createHash("sha256").update(normalizeText(token)).digest("hex");
}

function sanitizePathSegment(value) {
  return normalizeText(value)
    .replace(/[^0-9a-zA-Z/!_\-.*\u4e00-\u9fa5 ]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^\/|\/$/g, "");
}

function getExtensionFromMimeType(contentType) {
  return IMAGE_MIME_EXTENSION_MAP[normalizeText(contentType).toLowerCase()] || "";
}

function getExtensionFromFileName(fileName) {
  const normalized = normalizeText(fileName);
  const matched = normalized.match(/(\.[a-zA-Z0-9]+)$/);
  return matched ? matched[1].toLowerCase() : "";
}

function normalizeUploadImageFileName(fileName, contentType) {
  const normalized = normalizeText(fileName);
  const providedExtension = getExtensionFromFileName(normalized);
  const fallbackExtension = getExtensionFromMimeType(contentType) || ".jpg";
  const extension = providedExtension || fallbackExtension;
  const baseName = providedExtension ? normalized.slice(0, -providedExtension.length) : normalized;
  return `${baseName || "image"}${extension}`;
}

function buildCloudPath(folder, fileName, fallbackExtension) {
  const safeFolder = sanitizePathSegment(folder || "uploads");
  const normalizedName = normalizeText(fileName) || "image";
  const detectedExtension = getExtensionFromFileName(normalizedName) || normalizeText(fallbackExtension);
  const baseName = detectedExtension ? normalizedName.slice(0, -detectedExtension.length) : normalizedName;
  const safeName = sanitizePathSegment(baseName || "image").replace(/\//g, "-");
  return `${safeFolder}/${safeName}${detectedExtension}`;
}

function parseBase64ImagePayload(rawValue) {
  const normalized = normalizeText(rawValue);
  assertCondition(normalized, "缺少图片内容");

  const dataUrlMatch = normalized.match(/^data:([^;,]+)?;base64,(.+)$/i);
  const mimeType = normalizeText(dataUrlMatch && dataUrlMatch[1]).toLowerCase();
  const rawBase64 = dataUrlMatch && dataUrlMatch[2] ? dataUrlMatch[2] : normalized;
  const base64 = String(rawBase64 || "").replace(/\s+/g, "");
  assertCondition(base64, "图片内容为空");
  assertCondition(/^[A-Za-z0-9+/=]+$/.test(base64), "图片内容格式不正确");

  const buffer = Buffer.from(base64, "base64");
  assertCondition(buffer.length > 0, "图片内容解析失败");
  assertCondition(buffer.length <= MAX_IMAGE_UPLOAD_BYTES, "图片体积过大，请控制在 15MB 以内");

  return {
    buffer,
    mimeType
  };
}

function isValidDateParts(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
  );
}

function isValidBirthday(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return true;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return false;
  }

  const [year, month, day] = normalized.split("-").map((item) => Number(item));
  return isValidDateParts(year, month, day);
}

function isValidMainlandMobile(value) {
  return /^1[3-9]\d{9}$/.test(normalizePhone(value).replace(/^\+?86(?=1[3-9]\d{9}$)/, ""));
}

function isValidChineseIdCard(value) {
  const normalized = normalizeDocumentNumber(value);

  if (/^\d{15}$/.test(normalized)) {
    const year = Number(`19${normalized.slice(6, 8)}`);
    const month = Number(normalized.slice(8, 10));
    const day = Number(normalized.slice(10, 12));
    return isValidDateParts(year, month, day);
  }

  if (!/^\d{17}[\dX]$/.test(normalized)) {
    return false;
  }

  const year = Number(normalized.slice(6, 10));
  const month = Number(normalized.slice(10, 12));
  const day = Number(normalized.slice(12, 14));
  if (!isValidDateParts(year, month, day)) {
    return false;
  }

  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checkDigits = ["1", "0", "X", "9", "8", "7", "6", "5", "4", "3", "2"];
  const checksum = normalized
    .slice(0, 17)
    .split("")
    .reduce((sum, digit, index) => sum + Number(digit) * weights[index], 0);

  return checkDigits[checksum % 11] === normalized.slice(17);
}

function isValidPassportNumber(value) {
  const normalized = normalizeDocumentNumber(value);
  return /[A-Z]/.test(normalized) && /^[A-Z0-9]{5,17}$/.test(normalized);
}

function isValidHkMacaoTaiwanDocument(value) {
  const normalized = normalizeDocumentNumber(value);
  if (!/^(810000|820000|830000)\d{12}[\dX]$/.test(normalized)) {
    return false;
  }
  return isValidChineseIdCard(normalized);
}

function validateDocumentNumber(documentType, documentNumber) {
  const normalizedType = normalizeDocumentType(documentType);
  const normalizedNumber = normalizeDocumentNumber(documentNumber);

  if (!normalizedType && !normalizedNumber) {
    return "";
  }

  if (!normalizedType) {
    return "请选择证件类型";
  }

  if (!normalizedNumber) {
    return "请填写证件号码";
  }

  if (normalizedType === "id_card") {
    return isValidChineseIdCard(normalizedNumber) ? "" : "请输入正确的身份证号";
  }

  if (normalizedType === "passport") {
    return isValidPassportNumber(normalizedNumber) ? "" : "请输入正确的护照号";
  }

  if (normalizedType === "hk_macao_taiwan") {
    return isValidHkMacaoTaiwanDocument(normalizedNumber) ? "" : "请输入正确的港澳台证件号";
  }

  return "";
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isMissingDocumentError(error) {
  const message = normalizeText(
    (error && error.errMsg) || (error && error.message) || ""
  ).toLowerCase();

  return Boolean(
    message
    && (
      message.includes("document with _id")
      || message.includes("does not exist")
      || message.includes("not exist")
      || message.includes("不存在")
    )
  );
}

async function requireApplicant(options = {}) {
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

  const authUserId =
    normalizeText(userInfo && userInfo.id)
    || normalizeText(userInfo && userInfo.uid)
    || normalizeText(callerInfo && callerInfo.uid)
    || normalizeText(callerInfo && callerInfo.customUserId)
    || normalizeText(callerInfo && callerInfo.openId);
  const authEmail = normalizeEmail(userInfo && (userInfo.email || userInfo.mail));

  assertCondition(authUserId, "请先完成邮箱验证");
  if (options.requireEmail !== false) {
    assertCondition(authEmail, "请先使用邮箱验证码登录");
  }

  return { authUserId, authEmail };
}

function normalizeRegistrationPayload(payload, applicant) {
  const source = payload || {};
  const contactEmail = normalizeEmail(source.contactEmail);

  return {
    _id: applicant.authUserId,
    authUserId: applicant.authUserId,
    authEmail: applicant.authEmail || contactEmail,
    contactEmail,
    applicantName: normalizeText(source.applicantName),
    phone: normalizePhone(source.phone),
    gender: normalizeGender(source.gender),
    birthday: normalizeText(source.birthday),
    documentType: normalizeDocumentType(source.documentType),
    documentNumber: normalizeDocumentNumber(source.documentNumber),
    wechat: normalizeText(source.wechat),
    avatar: normalizeText(source.avatar),
    stance: normalizeText(source.stance),
    about: normalizeAbout(source.about)
  };
}

function normalizeRegistrationDoc(doc) {
  if (!doc) {
    return null;
  }

  return {
    registrationId: normalizeText(doc._id),
    authUserId: normalizeText(doc.authUserId),
    authEmail: normalizeEmail(doc.authEmail),
    contactEmail: normalizeEmail(doc.contactEmail),
    applicantName: normalizeText(doc.applicantName),
    phone: normalizePhone(doc.phone),
    gender: normalizeText(doc.gender),
    birthday: normalizeText(doc.birthday),
    documentType: normalizeText(doc.documentType),
    documentNumber: normalizeText(doc.documentNumber),
    wechat: normalizeText(doc.wechat),
    avatar: normalizeText(doc.avatar),
    stance: normalizeText(doc.stance),
    about: normalizeAbout(doc.about),
    status: normalizeText(doc.status) || "draft",
    submittedAt: Number(doc.submittedAt) || 0,
    rejectionReason: normalizeText(doc.rejectionReason),
    linkedCreatorId: normalizeText(doc.linkedCreatorId),
    linkedCreatorSlug: normalizeText(doc.linkedCreatorSlug),
    linkedAdminAccountId: normalizeText(doc.linkedAdminAccountId),
    accessProvisionStatus: normalizeText(doc.accessProvisionStatus) || "pending",
    activationTokenHash: normalizeText(doc.activationTokenHash),
    activationExpiresAt: Number(doc.activationExpiresAt) || 0,
    activationConsumedAt: Number(doc.activationConsumedAt) || 0,
    approvalEmailStatus: normalizeApprovalEmailStatus(doc.approvalEmailStatus),
    approvalEmailSentAt: Number(doc.approvalEmailSentAt) || 0,
    approvalEmailError: normalizeText(doc.approvalEmailError),
    reviewedAt: Number(doc.reviewedAt) || 0,
    reviewedBy: normalizeText(doc.reviewedBy),
    createdAt: Number(doc.createdAt) || 0,
    updatedAt: Number(doc.updatedAt) || 0,
    _id: normalizeText(doc._id)
  };
}

async function findRegistrationByAuthUserId(authUserId) {
  try {
    const result = await db.collection(COLLECTION_NAME).doc(authUserId).get();
    return result && result.data ? result.data : null;
  } catch (error) {
    if (isMissingDocumentError(error)) {
      return null;
    }
    throw error;
  }
}

async function findApprovedRegistrationByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  const contactEmailResult = await db.collection(COLLECTION_NAME).where({
    contactEmail: normalizedEmail,
    status: "approved"
  }).limit(1).get();
  const contactEmailMatch = contactEmailResult
    && contactEmailResult.data
    && contactEmailResult.data[0];
  if (contactEmailMatch) {
    return contactEmailMatch;
  }

  const authEmailResult = await db.collection(COLLECTION_NAME).where({
    authEmail: normalizedEmail,
    status: "approved"
  }).limit(1).get();
  const authEmailMatch = authEmailResult
    && authEmailResult.data
    && authEmailResult.data[0];

  return authEmailMatch || null;
}

function isActiveCreatorPortalAccount(account) {
  return (
    normalizeText(account && account.accountType) === "creator_portal"
    && (normalizeText(account && account.status) || "active") === "active"
  );
}

async function findRegisteredCreatorPortalAccountByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  const emailResult = await db.collection(ADMIN_ACCOUNTS_COLLECTION_NAME).where({
    accountType: "creator_portal",
    email: normalizedEmail
  }).limit(10).get();
  const emailMatch = emailResult
    && emailResult.data
    && emailResult.data.find((item) => isActiveCreatorPortalAccount(item));
  if (emailMatch) {
    return emailMatch;
  }

  const usernameResult = await db.collection(ADMIN_ACCOUNTS_COLLECTION_NAME).where({
    accountType: "creator_portal",
    username: normalizedEmail
  }).limit(10).get();
  const usernameMatch = usernameResult
    && usernameResult.data
    && usernameResult.data.find((item) => isActiveCreatorPortalAccount(item));

  return usernameMatch || null;
}

async function getRegisteredCreatorApplicationEmailMatch(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  const approvedRegistration = await findApprovedRegistrationByEmail(normalizedEmail);
  if (approvedRegistration) {
    const linkedAccount = await findAdminAccountByRegistration(approvedRegistration);
    if (isActiveCreatorPortalAccount(linkedAccount)) {
      return {
        source: "creator_registration",
        registration: normalizeRegistrationDoc(approvedRegistration)
      };
    }
  }

  const creatorPortalAccount = await findRegisteredCreatorPortalAccountByEmail(normalizedEmail);
  if (creatorPortalAccount) {
    return {
      source: "creator_portal_account",
      adminAccountId: normalizeText(creatorPortalAccount._id)
    };
  }

  return null;
}

async function checkEmailAvailability(payload) {
  const email = normalizeEmail(payload && payload.email);
  assertCondition(email, "请填写邮箱");

  const match = await getRegisteredCreatorApplicationEmailMatch(email);
  return {
    email,
    available: !match,
    message: match ? REGISTERED_CREATOR_EMAIL_MESSAGE : ""
  };
}

async function assertCreatorApplicationEmailAvailable(email) {
  const availability = await checkEmailAvailability({ email });
  assertCondition(availability.available, availability.message || REGISTERED_CREATOR_EMAIL_MESSAGE);
}

async function findRegistrationByActivationToken(token) {
  const hashedToken = hashActivationToken(token);
  const result = await db.collection(COLLECTION_NAME).where({
    activationTokenHash: hashedToken
  }).limit(1).get();

  return result && result.data && result.data[0] ? result.data[0] : null;
}

async function findCreatorDocByRegistration(registration) {
  const creatorId = normalizeText(registration && registration.linkedCreatorId);
  const creatorSlug = normalizeText(registration && registration.linkedCreatorSlug);
  const candidates = [creatorId, creatorSlug].filter(Boolean);

  for (const candidate of candidates) {
    const byIdResult = await db.collection(CREATORS_COLLECTION_NAME).where({
      id: candidate
    }).limit(1).get();

    if (byIdResult && byIdResult.data && byIdResult.data[0]) {
      return byIdResult.data[0];
    }

    const bySlugResult = await db.collection(CREATORS_COLLECTION_NAME).where({
      slug: candidate
    }).limit(1).get();

    if (bySlugResult && bySlugResult.data && bySlugResult.data[0]) {
      return bySlugResult.data[0];
    }
  }

  return null;
}

async function findAdminAccountByRegistration(registration) {
  const linkedAdminAccountId = normalizeText(registration && registration.linkedAdminAccountId);
  if (linkedAdminAccountId) {
    try {
      const linkedAccount = await db.collection(ADMIN_ACCOUNTS_COLLECTION_NAME).doc(linkedAdminAccountId).get();
      if (linkedAccount && linkedAccount.data) {
        return linkedAccount.data;
      }
    } catch (error) {
      if (!isMissingDocumentError(error)) {
        throw error;
      }
    }
  }

  const authUserId = normalizeText(registration && registration.authUserId);
  const authEmail = normalizeEmail(registration && (registration.authEmail || registration.contactEmail));
  if (authUserId) {
    const result = await db.collection(ADMIN_ACCOUNTS_COLLECTION_NAME).where({
      uid: authUserId
    }).limit(1).get();

    if (result && result.data && result.data[0]) {
      return result.data[0];
    }
  }

  if (!authEmail) {
    return null;
  }

  const emailResult = await db.collection(ADMIN_ACCOUNTS_COLLECTION_NAME).where({
    email: authEmail
  }).limit(1).get();

  return emailResult && emailResult.data && emailResult.data[0] ? emailResult.data[0] : null;
}

function assertMutableRegistration(existing) {
  if (!existing) {
    return;
  }

  const status = normalizeText(existing.status) || "draft";
  assertCondition(MUTABLE_STATUSES.has(status), "当前申请状态不可修改");
}

function buildMutableReviewMetadata(existing) {
  const status = normalizeText(existing && existing.status) || "draft";
  const shouldResetReviewState = !existing || status === "rejected" || status === "draft";

  if (shouldResetReviewState) {
    return {
      rejectionReason: "",
      linkedCreatorId: "",
      linkedCreatorSlug: "",
      approvalEmailStatus: "pending",
      approvalEmailSentAt: 0,
      approvalEmailError: "",
      reviewedAt: 0,
      reviewedBy: ""
    };
  }

  return {
    rejectionReason: normalizeText(existing.rejectionReason),
    linkedCreatorId: normalizeText(existing.linkedCreatorId),
    linkedCreatorSlug: normalizeText(existing.linkedCreatorSlug),
    approvalEmailStatus: normalizeApprovalEmailStatus(existing.approvalEmailStatus),
    approvalEmailSentAt: Number(existing.approvalEmailSentAt) || 0,
    approvalEmailError: normalizeText(existing.approvalEmailError),
    reviewedAt: Number(existing.reviewedAt) || 0,
    reviewedBy: normalizeText(existing.reviewedBy)
  };
}

async function upsertRegistration(nextDoc, options = {}) {
  const existing = await findRegistrationByAuthUserId(nextDoc.authUserId);
  assertMutableRegistration(existing);
  const now = Date.now();
  const reviewMetadata = buildMutableReviewMetadata(existing);
  const merged = Object.assign({}, existing || {}, nextDoc, {
    _id: nextDoc.authUserId,
    authUserId: nextDoc.authUserId,
    authEmail: nextDoc.authEmail,
    status: options.nextStatus || (existing && normalizeText(existing.status)) || "draft",
    submittedAt: options.submittedAt === undefined ? (existing && Number(existing.submittedAt)) || 0 : options.submittedAt,
    rejectionReason: options.rejectionReason === undefined ? reviewMetadata.rejectionReason : options.rejectionReason,
    linkedCreatorId: reviewMetadata.linkedCreatorId,
    linkedCreatorSlug: reviewMetadata.linkedCreatorSlug,
    approvalEmailStatus: reviewMetadata.approvalEmailStatus,
    approvalEmailSentAt: reviewMetadata.approvalEmailSentAt,
    approvalEmailError: reviewMetadata.approvalEmailError,
    reviewedAt: reviewMetadata.reviewedAt,
    reviewedBy: reviewMetadata.reviewedBy,
    updatedAt: now
  });

  if (existing) {
    await db.collection(COLLECTION_NAME).doc(nextDoc.authUserId).update({
      data: {
        authUserId: merged.authUserId,
        authEmail: merged.authEmail,
        contactEmail: merged.contactEmail,
        applicantName: merged.applicantName,
        phone: merged.phone,
        gender: merged.gender,
        birthday: merged.birthday,
        documentType: merged.documentType,
        documentNumber: merged.documentNumber,
        wechat: merged.wechat,
        avatar: merged.avatar,
        stance: merged.stance,
        about: merged.about,
        status: merged.status,
        submittedAt: merged.submittedAt,
        rejectionReason: merged.rejectionReason,
        linkedCreatorId: merged.linkedCreatorId,
        linkedCreatorSlug: merged.linkedCreatorSlug,
        approvalEmailStatus: merged.approvalEmailStatus,
        approvalEmailSentAt: merged.approvalEmailSentAt,
        approvalEmailError: merged.approvalEmailError,
        reviewedAt: merged.reviewedAt,
        reviewedBy: merged.reviewedBy,
        updatedAt: merged.updatedAt
      }
    });
  } else {
    await db.collection(COLLECTION_NAME).add({
      data: Object.assign({}, merged, {
        createdAt: now
      })
    });
    merged.createdAt = now;
  }

  return normalizeRegistrationDoc(merged);
}

async function getMyRegistration() {
  const applicant = await requireApplicant();
  const existing = await findRegistrationByAuthUserId(applicant.authUserId);
  return normalizeRegistrationDoc(existing);
}

function assertActivationRegistrationUsable(registration) {
  assertCondition(registration, "激活链接无效");
  assertCondition(registration.status === "approved", "当前申请尚未通过");
  assertCondition(registration.accessProvisionStatus === "activation_pending", "当前申请无需激活");
  assertCondition(registration.activationExpiresAt > Date.now(), "激活链接已过期");
  assertCondition(!registration.activationConsumedAt, "激活链接已失效");
}

async function getActivationDetail(payload) {
  const token = normalizeText(payload && payload.token);
  assertCondition(token, "缺少激活 token");

  const registration = normalizeRegistrationDoc(await findRegistrationByActivationToken(token));
  assertActivationRegistrationUsable(registration);
  const linkedAdminAccount = await findAdminAccountByRegistration(registration);

  return {
    registrationId: registration.registrationId,
    applicantName: registration.applicantName,
    contactEmail: registration.contactEmail,
    loginUsername:
      normalizeText(linkedAdminAccount && linkedAdminAccount.username)
      || normalizeText(registration.authUserId),
    linkedCreatorSlug: registration.linkedCreatorSlug,
    status: registration.accessProvisionStatus,
    expiresAt: registration.activationExpiresAt
  };
}

async function saveDraft(payload) {
  const applicant = await requireApplicant({ requireEmail: false });
  const nextDoc = normalizeRegistrationPayload(payload, applicant);
  return upsertRegistration(nextDoc, {
    nextStatus: "draft",
    submittedAt: 0,
    rejectionReason: ""
  });
}

async function submit(payload) {
  const applicant = await requireApplicant({ requireEmail: false });
  const nextDoc = normalizeRegistrationPayload(payload, applicant);

  assertCondition(nextDoc.contactEmail, "请填写邮箱");
  await assertCreatorApplicationEmailAvailable(nextDoc.contactEmail);
  if (applicant.authEmail) {
    assertCondition(applicant.authEmail === nextDoc.contactEmail, "联系邮箱已变更，请重新验证邮箱");
  }
  assertCondition(nextDoc.applicantName, "请填写真实姓名");
  assertCondition(nextDoc.phone, "请填写手机号");
  assertCondition(isValidMainlandMobile(nextDoc.phone), "请输入正确的手机号");
  assertCondition(isValidBirthday(nextDoc.birthday), "请选择正确的生日");
  assertCondition(!validateDocumentNumber(nextDoc.documentType, nextDoc.documentNumber), validateDocumentNumber(nextDoc.documentType, nextDoc.documentNumber));
  assertCondition(nextDoc.avatar, "请上传头像");
  assertCondition(nextDoc.stance, "请填写一句话定位");
  assertCondition(nextDoc.about.length > 0, "请填写关于创作者");

  return upsertRegistration(nextDoc, {
    nextStatus: "submitted",
    submittedAt: Date.now(),
    rejectionReason: ""
  });
}

async function uploadImageFile(payload) {
  const applicant = await requireApplicant({ requireEmail: false });
  const folder = normalizeText(payload && payload.folder);
  const fileName = normalizeText(payload && payload.fileName);
  const contentType = normalizeText(payload && payload.contentType).toLowerCase();
  const base64 = payload && (payload.base64 || payload.dataUrl);

  assertCondition(applicant.authUserId, "请先完成邮箱验证");
  assertCondition(folder, "缺少图片存储目录");

  const parsed = parseBase64ImagePayload(base64);
  const effectiveContentType = parsed.mimeType || contentType;
  const normalizedFileName = normalizeUploadImageFileName(fileName, effectiveContentType);
  const cloudPath = buildCloudPath(
    folder,
    normalizedFileName,
    getExtensionFromMimeType(effectiveContentType) || getExtensionFromFileName(normalizedFileName)
  );
  const uploadResult = await cloud.uploadFile({
    cloudPath,
    fileContent: parsed.buffer
  });

  return {
    fileID: normalizeText(uploadResult && uploadResult.fileID),
    cloudPath
  };
}

async function consumeActivation(payload) {
  const token = normalizeText(payload && payload.token);
  assertCondition(token, "缺少激活 token");

  const applicant = await requireApplicant({ requireEmail: false });
  const registration = normalizeRegistrationDoc(await findRegistrationByActivationToken(token));
  assertActivationRegistrationUsable(registration);

  const expectedEmail = registration.contactEmail || registration.authEmail;
  assertCondition(applicant.authUserId === registration.authUserId, "请使用申请邮箱完成激活");
  if (applicant.authEmail && expectedEmail) {
    assertCondition(applicant.authEmail === expectedEmail, "请使用申请邮箱完成激活");
  }

  const consumedAt = Date.now();
  const creator = await findCreatorDocByRegistration(registration);
  assertCondition(creator && normalizeText(creator._id), "未找到关联创作者资料，请联系管理员处理");

  await db.collection(CREATORS_COLLECTION_NAME).doc(creator._id).update({
    data: {
      status: "active",
      updatedAt: consumedAt,
      updatedBy: normalizeText(applicant.authUserId)
    }
  });

  await db.collection(COLLECTION_NAME).doc(registration.registrationId).update({
    data: {
      accessProvisionStatus: "provisioned",
      activationConsumedAt: consumedAt,
      updatedAt: consumedAt
    }
  });

  return {
    registrationId: registration.registrationId,
    status: "provisioned",
    activationConsumedAt: consumedAt
  };
}

const handlers = {
  checkEmailAvailability: (payload) => checkEmailAvailability(payload),
  getMyRegistration: () => getMyRegistration(),
  getActivationDetail: (payload) => getActivationDetail(payload),
  saveDraft: (payload) => saveDraft(payload),
  submit: (payload) => submit(payload),
  uploadImageFile: (payload) => uploadImageFile(payload),
  consumeActivation: (payload) => consumeActivation(payload)
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
      error: error && error.message ? error.message : "Creator registration gateway error"
    };
  }
};

exports.__test__ = {
  assertCondition,
  getMyRegistration,
  REGISTERED_CREATOR_EMAIL_MESSAGE,
  normalizeEmail,
  normalizeApprovalEmailStatus,
  hashActivationToken,
  normalizeAbout,
  parseBase64ImagePayload,
  normalizeDocumentNumber,
  normalizeDocumentType,
  normalizeGender,
  normalizePhone,
  normalizeRegistrationDoc,
  normalizeRegistrationPayload,
  normalizeUploadImageFileName,
  normalizeText,
  isMissingDocumentError,
  buildCloudPath,
  validateDocumentNumber,
  assertMutableRegistration,
  assertCreatorApplicationEmailAvailable,
  assertActivationRegistrationUsable,
  checkEmailAvailability,
  findApprovedRegistrationByEmail,
  findRegisteredCreatorPortalAccountByEmail,
  getRegisteredCreatorApplicationEmailMatch,
  findRegistrationByActivationToken,
  getActivationDetail,
  requireApplicant,
  saveDraft,
  submit,
  uploadImageFile,
  consumeActivation,
  upsertRegistration
};
