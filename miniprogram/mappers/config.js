function ensureObject(value) {
  return value && typeof value === "object" ? value : {};
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
    consultGroupQr: source.consultGroupQr || "",
    consultSheetTitle: source.consultSheetTitle || "",
    consultCardLabel: source.consultCardLabel || "",
    consultCardDesc: source.consultCardDesc || "",
    consultFollowupNote: source.consultFollowupNote || "",
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
    creatorContactText: source.creatorContactText || "",
    serviceContactText: source.serviceContactText || "",
    statusTitleText: source.statusTitleText || "",
    orderIdLabelText: source.orderIdLabelText || "",
    priceTitleText: source.priceTitleText || "",
    payableLabelText: source.payableLabelText || "",
    pendingPrimaryText: source.pendingPrimaryText || "",
    pendingSecondaryText: source.pendingSecondaryText || "",
    completedPrimaryText: source.completedPrimaryText || ""
  };
}

function mapFavoritesPageConfig(payload) {
  const source = ensureObject(payload);
  return {
    loginHint: source.loginHint || ""
  };
}

module.exports = {
  mapHowItWorksPageConfig,
  mapCheckoutPageConfig,
  mapServiceDetailPageConfig,
  mapPaymentResultPageConfig,
  mapOrderDetailPageConfig,
  mapFavoritesPageConfig
};
