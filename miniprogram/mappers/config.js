const { normalizeImageRef } = require("../services/image-ref");

function ensureObject(value) {
  return value && typeof value === "object" ? value : {};
}

function readImageValue(input) {
  if (typeof input === "string") {
    return input;
  }

  const source = ensureObject(input);
  return source.original
    || source.detail
    || source.card
    || source.fileID
    || source.cloudFileID
    || source.url
    || source.src
    || source.image
    || "";
}

function mapHowItWorksPageConfig(payload) {
  const source = ensureObject(payload);
  return {
    flows: Array.isArray(source.flows) ? source.flows : [],
    introText: source.introText || "",
    ctaTitle: source.ctaTitle || "",
    ctaDesc: source.ctaDesc || "",
    ctaButtonText: source.ctaButtonText || ""
  };
}

function mapCheckoutPageConfig(payload) {
  const source = ensureObject(payload);
  return {
    summaryTitleText: source.summaryTitleText || "",
    refundAgreementTitle: source.refundAgreementTitle || "",
    amountLabelText: source.amountLabelText || "",
    submitButtonText: source.submitButtonText || "",
    agreements: ensureObject(source.agreements)
  };
}

function mapServiceDetailPageConfig(payload) {
  const source = ensureObject(payload);
  return {
    consultWeChatQr: source.consultWeChatQr || "",
    consultSheetTitle: source.consultSheetTitle || "",
    consultCardLabel: source.consultCardLabel || "",
    consultCardDesc: source.consultCardDesc || "",
    consultFollowupNote: source.consultFollowupNote || "",
    suitableTitleText: source.suitableTitleText || "",
    timelineTitleText: source.timelineTitleText || "",
    refundTitleText: source.refundTitleText || "",
    serviceNoticeTitle: source.serviceNoticeTitle || "",
    serviceNoticeBody: source.serviceNoticeBody || ""
  };
}

function mapPaymentResultPageConfig(payload) {
  const source = ensureObject(payload);
  return {
    titleText: source.titleText || "",
    subtitleText: source.subtitleText || "",
    detailButtonText: source.detailButtonText || "",
    listButtonText: source.listButtonText || ""
  };
}

function mapOrderDetailPageConfig(payload) {
  const source = ensureObject(payload);
  return {
    statusTitleText: source.statusTitleText || "",
    orderIdLabelText: source.orderIdLabelText || "",
    priceTitleText: source.priceTitleText || "",
    payableLabelText: source.payableLabelText || "",
    pendingPrimaryText: source.pendingPrimaryText || "",
    completedPrimaryText: source.completedPrimaryText || ""
  };
}

function mapProfilePageConfig(payload) {
  const source = ensureObject(payload);
  return {
    emptyTripStateImage: normalizeImageRef(
      source.emptyTripStateImage || source.emptyStateImage || "",
      "detail"
    )
  };
}

function mapFavoritesPageConfig(payload) {
  const source = ensureObject(payload);
  return {
    loginHint: source.loginHint || ""
  };
}

function mapArticleBridgePageConfig(payload) {
  const source = ensureObject(payload);
  return {
    bridgeBaseUrl: source.bridgeBaseUrl || "",
    bridgePageTitle: source.bridgePageTitle || "",
    bridgeLoadingText: source.bridgeLoadingText || "",
    bridgeFallbackTitle: source.bridgeFallbackTitle || "",
    bridgeActionText: source.bridgeActionText || "",
    bridgeHintText: source.bridgeHintText || ""
  };
}

module.exports = {
  mapHowItWorksPageConfig,
  mapCheckoutPageConfig,
  mapServiceDetailPageConfig,
  mapPaymentResultPageConfig,
  mapOrderDetailPageConfig,
  mapProfilePageConfig,
  mapFavoritesPageConfig,
  mapArticleBridgePageConfig
};
