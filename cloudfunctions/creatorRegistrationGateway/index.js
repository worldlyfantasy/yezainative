const cloud = require("wx-server-sdk");
const cloudbase = require("@cloudbase/node-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const app = cloudbase.init({
  env: process.env.TCB_ENV || cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const auth = app.auth();
const COLLECTION_NAME = "creator_registrations";
const MUTABLE_STATUSES = new Set(["draft", "rejected"]);
const APPROVAL_EMAIL_STATUSES = new Set(["pending", "sent", "failed"]);

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

async function requireApplicant() {
  const result = await auth.getEndUserInfo();
  const userInfo = result && result.userInfo ? result.userInfo : null;
  const authUserId = normalizeText(userInfo && userInfo.id);
  const authEmail = normalizeEmail(userInfo && (userInfo.email || userInfo.mail));

  assertCondition(authUserId, "请先完成邮箱验证");
  assertCondition(authEmail, "请先使用邮箱验证码登录");

  return { authUserId, authEmail };
}

function normalizeRegistrationPayload(payload, applicant) {
  const source = payload || {};

  return {
    _id: applicant.authUserId,
    authUserId: applicant.authUserId,
    authEmail: applicant.authEmail,
    contactEmail: normalizeEmail(source.contactEmail),
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
  const result = await db.collection(COLLECTION_NAME).doc(authUserId).get();
  return result && result.data ? result.data : null;
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

async function saveDraft(payload) {
  const applicant = await requireApplicant();
  const nextDoc = normalizeRegistrationPayload(payload, applicant);
  return upsertRegistration(nextDoc, {
    nextStatus: "draft",
    submittedAt: 0,
    rejectionReason: ""
  });
}

async function submit(payload) {
  const applicant = await requireApplicant();
  const nextDoc = normalizeRegistrationPayload(payload, applicant);

  assertCondition(nextDoc.contactEmail, "请填写邮箱");
  assertCondition(applicant.authEmail === nextDoc.contactEmail, "联系邮箱已变更，请重新验证邮箱");
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

const handlers = {
  getMyRegistration: () => getMyRegistration(),
  saveDraft: (payload) => saveDraft(payload),
  submit: (payload) => submit(payload)
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
  normalizeEmail,
  normalizeApprovalEmailStatus,
  normalizeAbout,
  normalizeDocumentNumber,
  normalizeDocumentType,
  normalizeGender,
  normalizePhone,
  normalizeRegistrationDoc,
  normalizeRegistrationPayload,
  normalizeText,
  validateDocumentNumber,
  assertMutableRegistration,
  requireApplicant,
  saveDraft,
  submit,
  upsertRegistration
};
