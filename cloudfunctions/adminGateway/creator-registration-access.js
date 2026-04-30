const crypto = require("node:crypto");

const ACTIVATION_EXPIRATION_MS = 3 * 24 * 60 * 60 * 1000;
const CREATOR_PORTAL_CANONICAL_ORIGIN = "https://yezai.com.cn";

function hashActivationToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function createActivationToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function normalizeCreatorPortalPublicUrl(rawUrl) {
  const normalized = String(rawUrl || "").trim();
  if (!normalized) {
    return "";
  }

  try {
    const url = new URL(normalized);
    if (/cloudbaseapp\.com$/i.test(url.hostname)) {
      const canonical = new URL(CREATOR_PORTAL_CANONICAL_ORIGIN);
      url.protocol = canonical.protocol;
      url.hostname = canonical.hostname;
      url.port = canonical.port;
    }
    return url.toString();
  } catch (error) {
    return normalized;
  }
}

function endUserHasPassword(userInfo) {
  const metadata = userInfo && (userInfo.user_metadata || userInfo.userMetadata || {});
  return Boolean(metadata && metadata.hasPassword);
}

function buildActivationUrl(token, baseUrl) {
  const normalizedBaseUrl = String(baseUrl || "").trim();
  if (!normalizedBaseUrl) {
    return "";
  }

  const normalizedToken = String(token || "").trim();

  try {
    const url = new URL(normalizedBaseUrl);

    if (url.hash && /^#\//.test(url.hash)) {
      const hashRoute = url.hash.slice(1);
      const [hashPath, hashQuery = ""] = hashRoute.split("?");
      const hashParams = new URLSearchParams(hashQuery);
      hashParams.set("token", normalizedToken);
      const nextHashQuery = hashParams.toString();
      url.hash = nextHashQuery ? `${hashPath}?${nextHashQuery}` : hashPath;
      return url.toString();
    }

    url.searchParams.set("token", normalizedToken);
    return url.toString();
  } catch (error) {
    if (normalizedBaseUrl.includes("#/")) {
      const [prefix, hashPart = ""] = normalizedBaseUrl.split("#");
      const [hashPath, hashQuery = ""] = hashPart.split("?");
      const hashParams = new URLSearchParams(hashQuery);
      hashParams.set("token", normalizedToken);
      const nextHashQuery = hashParams.toString();
      return `${prefix}#${nextHashQuery ? `${hashPath}?${nextHashQuery}` : hashPath}`;
    }

    const separator = normalizedBaseUrl.includes("?") ? "&" : "?";
    return `${normalizedBaseUrl}${separator}token=${encodeURIComponent(normalizedToken)}`;
  }
}

function deriveCreatorActivationBaseUrl(activationUrl, portalHomeUrl) {
  const normalizedActivationUrl = normalizeCreatorPortalPublicUrl(activationUrl);
  if (normalizedActivationUrl) {
    return normalizedActivationUrl;
  }

  const normalizedPortalHomeUrl = normalizeCreatorPortalPublicUrl(portalHomeUrl);
  if (!normalizedPortalHomeUrl) {
    return "";
  }

  try {
    const url = new URL(normalizedPortalHomeUrl);
    const pathname = url.pathname || "/";

    if (!pathname || pathname === "/") {
      url.pathname = "/creator-activate";
    } else if (/\/login\/?$/i.test(pathname)) {
      url.pathname = pathname.replace(/\/login\/?$/i, "/creator-activate");
    } else if (pathname.endsWith("/")) {
      url.pathname = `${pathname}creator-activate`;
    } else {
      url.pathname = `${pathname}/creator-activate`;
    }

    url.search = "";
    url.hash = "";
    return url.toString();
  } catch (error) {
    const sanitizedPortalHomeUrl = normalizedPortalHomeUrl.replace(/[?#].*$/, "");

    if (/\/login\/?$/i.test(sanitizedPortalHomeUrl)) {
      return sanitizedPortalHomeUrl.replace(/\/login\/?$/i, "/creator-activate");
    }

    if (sanitizedPortalHomeUrl.endsWith("/")) {
      return `${sanitizedPortalHomeUrl}creator-activate`;
    }

    return `${sanitizedPortalHomeUrl}/creator-activate`;
  }
}

function buildCreatorPortalEmailPayload(options) {
  const {
    registration,
    linkedCreator,
    sender,
    creatorPortalHomeUrl,
    normalizeText,
    normalizeEmail,
    assertCondition
  } = options;
  const applicantName = normalizeText(registration && registration.applicantName) || "创作者";
  const contactEmail = normalizeEmail(registration && registration.contactEmail);
  const creatorSlug = normalizeText(linkedCreator && linkedCreator.slug);
  const portalUrl = normalizeText(normalizeCreatorPortalPublicUrl(creatorPortalHomeUrl));
  const creatorLine = creatorSlug
    ? `我们已经为你创建了创作者资料草稿（${creatorSlug}），当前保持未公开状态。`
    : "我们已经为你创建了创作者资料草稿，当前保持未公开状态。";

  assertCondition(contactEmail, "申请缺少通知邮箱");

  return {
    from: sender,
    to: contactEmail,
    subject: "野哉创作者申请审核结果",
    text: portalUrl
      ? `你好，${applicantName}。你的创作者申请已审核通过。${creatorLine} 你的创作者后台已开通，可直接使用申请邮箱登录：${portalUrl}`
      : `你好，${applicantName}。你的创作者申请已审核通过。${creatorLine} 你的创作者后台已开通，可直接使用申请邮箱登录。`
  };
}

function buildCreatorRejectionEmailPayload(options) {
  const {
    registration,
    sender,
    normalizeText,
    normalizeEmail,
    assertCondition
  } = options;
  const applicantName = normalizeText(registration && registration.applicantName) || "创作者";
  const contactEmail = normalizeEmail(registration && registration.contactEmail);
  const rejectionReason = normalizeText(registration && registration.rejectionReason) || "申请资料暂未符合当前审核要求";

  assertCondition(contactEmail, "申请缺少通知邮箱");

  return {
    from: sender,
    to: contactEmail,
    subject: "野哉创作者申请审核结果",
    text: `你好，${applicantName}。你的创作者申请暂未通过审核。驳回原因：${rejectionReason} 你可以修改资料后重新提交申请。`
  };
}

function buildCreatorActivationEmailPayload(options) {
  const {
    registration,
    linkedCreator,
    token,
    sender,
    creatorActivationUrl,
    creatorPortalHomeUrl,
    normalizeText,
    normalizeEmail,
    assertCondition
  } = options;
  const applicantName = normalizeText(registration && registration.applicantName) || "创作者";
  const contactEmail = normalizeEmail(registration && registration.contactEmail);
  const creatorSlug = normalizeText(linkedCreator && linkedCreator.slug);
  const activationUrl = buildActivationUrl(
    token,
    deriveCreatorActivationBaseUrl(creatorActivationUrl, creatorPortalHomeUrl)
  );
  const creatorLine = creatorSlug
    ? `我们已经为你创建了创作者资料草稿（${creatorSlug}），当前保持未公开状态。`
    : "我们已经为你创建了创作者资料草稿，当前保持未公开状态。";
  const activationLine = activationUrl
    ? `请打开以下链接设置初始密码并完成后台激活：${activationUrl} 如链接无法直接打开，可使用激活码继续操作：${normalizeText(token)}`
    : `请使用以下激活码设置初始密码并完成后台激活：${normalizeText(token)}`;

  assertCondition(contactEmail, "申请缺少通知邮箱");

  return {
    from: sender,
    to: contactEmail,
    subject: "野哉创作者后台激活",
    text: `你好，${applicantName}。你的创作者申请已审核通过。${creatorLine} ${activationLine}`
  };
}

function buildCreatorPortalAccountProfile(registration, normalizeText) {
  const documentType = normalizeText(registration && registration.documentType);
  const documentNumber = normalizeText(registration && registration.documentNumber);
  const documents = documentType || documentNumber
    ? [{ documentType, documentNumber }]
    : [];

  return {
    phone: normalizeText(registration && registration.phone),
    realName: normalizeText(registration && registration.applicantName),
    gender: normalizeText(registration && registration.gender),
    birthday: normalizeText(registration && registration.birthday),
    documentType,
    documentNumber,
    documents,
    wechat: normalizeText(registration && registration.wechat)
  };
}

async function ensureCreatorPortalAccess(options) {
  const {
    registration,
    linkedCreator,
    adminUser,
    listAdminAccountsData,
    saveAdminAccount,
    normalizeText,
    normalizeEmail,
    assertCondition
  } = options;
  const authUserId = normalizeText(registration && registration.authUserId);
  const authEmail = normalizeEmail(registration && registration.authEmail);
  const linkedCreatorId = normalizeText(linkedCreator && linkedCreator.id);
  const accountProfile = buildCreatorPortalAccountProfile(registration, normalizeText);
  const accounts = await listAdminAccountsData();
  const matched = accounts.find((account) => (
    normalizeText(account && account.uid) === authUserId
    || normalizeEmail(account && account.email) === authEmail
  )) || null;

  assertCondition(authUserId, "申请缺少认证身份，请联系管理员处理");
  assertCondition(authEmail, "申请缺少认证邮箱，请联系管理员处理");

  if (
    matched
    && normalizeText(matched.accountType)
    && normalizeText(matched.accountType) !== "creator_portal"
  ) {
    return {
      status: "conflict",
      adminAccountId: "",
      error: "该认证身份已存在非创作者后台账号，不能自动改造成创作者后台账号，请人工处理"
    };
  }

  if (
    matched
    && !normalizeText(matched.accountType)
  ) {
    return {
      status: "conflict",
      adminAccountId: "",
      error: "该认证身份已存在后台账号，但账号类型缺失，请人工处理"
    };
  }

  if (
    matched
    && normalizeText(matched.accountType) === "creator_portal"
    && normalizeText(matched.boundCreatorId)
    && normalizeText(matched.boundCreatorId) !== linkedCreatorId
  ) {
    return {
      status: "conflict",
      adminAccountId: "",
      error: "该邮箱对应的后台账号已绑定到其他创作者，请人工处理"
    };
  }

  if (
    matched
    && normalizeText(matched.accountType) === "creator_portal"
    && !normalizeText(matched.boundCreatorId)
  ) {
    const saved = await saveAdminAccount(
      {
        _id: matched._id,
        uid: authUserId,
        email: authEmail,
        displayName: normalizeText(registration && registration.applicantName) || normalizeText(linkedCreator && linkedCreator.name),
        phone: accountProfile.phone,
        realName: accountProfile.realName,
        gender: accountProfile.gender,
        birthday: accountProfile.birthday,
        documentType: accountProfile.documentType,
        documentNumber: accountProfile.documentNumber,
        documents: accountProfile.documents,
        wechat: accountProfile.wechat,
        accountType: "creator_portal",
        boundCreatorId: linkedCreatorId,
        status: "active",
        note: normalizeText(matched.note) || "由创作者申请审批自动开通"
      },
      adminUser,
      {
        creatorRegistrationProvision: true,
        trustedBoundCreator: linkedCreator
      }
    );

    return {
      status: "provisioned",
      adminAccountId: normalizeText(saved && saved._id),
      error: ""
    };
  }

  const saved = await saveAdminAccount(
    {
      _id: matched ? matched._id : undefined,
      uid: authUserId,
      email: authEmail,
      displayName: normalizeText(registration && registration.applicantName) || normalizeText(linkedCreator && linkedCreator.name),
      phone: accountProfile.phone,
      realName: accountProfile.realName,
      gender: accountProfile.gender,
      birthday: accountProfile.birthday,
      documentType: accountProfile.documentType,
      documentNumber: accountProfile.documentNumber,
      documents: accountProfile.documents,
      wechat: accountProfile.wechat,
      accountType: "creator_portal",
      boundCreatorId: linkedCreatorId,
      status: "active",
      note: normalizeText(matched && matched.note) || "由创作者申请审批自动开通"
    },
    adminUser,
    {
      creatorRegistrationProvision: true,
      trustedBoundCreator: linkedCreator
    }
  );

  return {
    status: "provisioned",
    adminAccountId: normalizeText(saved && saved._id),
    error: ""
  };
}

async function buildApprovalAccessOutcome(options) {
  const {
    registration,
    linkedCreator,
    adminUser,
    getEndUserInfo,
    listAdminAccountsData,
    saveAdminAccount,
    deliverCreatorRegistrationApprovalEmail,
    deliverCreatorRegistrationActivationEmail,
    normalizeText,
    normalizeEmail,
    assertCondition,
    now = Date.now()
  } = options;
  const authUserId = normalizeText(registration && registration.authUserId);
  const authEmail = normalizeEmail(registration && registration.authEmail);
  const contactEmail = normalizeEmail(registration && registration.contactEmail);

  if (authEmail && contactEmail && authEmail !== contactEmail) {
    return {
      accessProvisionStatus: "failed",
      linkedAdminAccountId: "",
      activationTokenHash: "",
      activationExpiresAt: 0,
      activationConsumedAt: 0,
      activationEmailStatus: "pending",
      activationEmailSentAt: 0,
      activationEmailError: "",
      accessProvisionError: "联系邮箱与登录邮箱不一致，已停止自动开通，请人工核对",
      approvalEmailStatus: "pending",
      approvalEmailSentAt: 0,
      approvalEmailError: ""
    };
  }

  const endUserInfoResult = authUserId ? await getEndUserInfo(authUserId) : null;
  const endUserInfo = endUserInfoResult && endUserInfoResult.userInfo ? endUserInfoResult.userInfo : null;
  const access = await ensureCreatorPortalAccess({
    registration,
    linkedCreator,
    adminUser,
    listAdminAccountsData,
    saveAdminAccount,
    normalizeText,
    normalizeEmail,
    assertCondition
  });

  if (access.status === "conflict") {
    return {
      accessProvisionStatus: "conflict",
      linkedAdminAccountId: "",
      activationTokenHash: "",
      activationExpiresAt: 0,
      activationConsumedAt: 0,
      activationEmailStatus: "pending",
      activationEmailSentAt: 0,
      activationEmailError: "",
      accessProvisionError: access.error,
      approvalEmailStatus: "pending",
      approvalEmailSentAt: 0,
      approvalEmailError: ""
    };
  }

  if (endUserHasPassword(endUserInfo)) {
    const approvalPatch = await deliverCreatorRegistrationApprovalEmail(Object.assign({}, registration, {
      linkedCreatorId: normalizeText(linkedCreator && linkedCreator.id),
      linkedCreatorSlug: normalizeText(linkedCreator && linkedCreator.slug)
    }));

    return {
      accessProvisionStatus: "provisioned",
      linkedAdminAccountId: access.adminAccountId,
      activationTokenHash: "",
      activationExpiresAt: 0,
      activationConsumedAt: 0,
      activationEmailStatus: "pending",
      activationEmailSentAt: 0,
      activationEmailError: "",
      accessProvisionError: "",
      approvalEmailStatus: approvalPatch.approvalEmailStatus,
      approvalEmailSentAt: approvalPatch.approvalEmailSentAt,
      approvalEmailError: approvalPatch.approvalEmailError
    };
  }

  const token = createActivationToken();
  const activationPatch = await deliverCreatorRegistrationActivationEmail({
    registration,
    linkedCreator,
    token
  });

  return {
    accessProvisionStatus: "activation_pending",
    linkedAdminAccountId: access.adminAccountId,
    activationTokenHash: hashActivationToken(token),
    activationExpiresAt: now + ACTIVATION_EXPIRATION_MS,
    activationConsumedAt: 0,
    activationEmailStatus: activationPatch.activationEmailStatus,
    activationEmailSentAt: activationPatch.activationEmailSentAt,
    activationEmailError: activationPatch.activationEmailError,
    accessProvisionError: "",
    approvalEmailStatus: "pending",
    approvalEmailSentAt: 0,
    approvalEmailError: ""
  };
}

module.exports = {
  ACTIVATION_EXPIRATION_MS,
  hashActivationToken,
  createActivationToken,
  endUserHasPassword,
  buildCreatorPortalEmailPayload,
  buildCreatorRejectionEmailPayload,
  buildCreatorActivationEmailPayload,
  buildCreatorPortalAccountProfile,
  ensureCreatorPortalAccess,
  buildApprovalAccessOutcome
};
