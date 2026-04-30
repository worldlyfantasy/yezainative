const { bootstrapParticipation } = require("../api/referral");
const { activateSession } = require("../../../services/user");
const { goTopLevel, TOP_LEVEL_ROUTES } = require("../../../services/navigation");

const DEFAULT_FIRST_AWARD_INTRO = "恭喜获得150元优惠券，可以在价格超过1000元的路线上叠加使用！";
const DEFAULT_PHASE2_DIRECT_AWARD_INTRO = "恭喜获得100元优惠券，可以在价格超过1000元的路线上使用！";
const DEFAULT_BONUS_UPGRADE_INTRO = "恭喜获得额外50元的优惠券，可以在价格超过1000元的路线上使用！";

function normalizeText(value) {
  return String(value || "").trim();
}

function sumAwardAmount(assets) {
  return (Array.isArray(assets) ? assets : []).reduce((total, item) => total + (Number(item && item.amount) || 0), 0);
}

function buildCouponCards(result, awardedAssets, summary) {
  const scenario = normalizeText(result && result.resultScenario);
  if (scenario === "phase2_bonus") {
    return [
      {
        couponType: "share_referral_welcome_100",
        title: "野哉分享家新人券",
        amount: 100,
        threshold: Number(result && result.campaign && result.campaign.couponThreshold) || 1000
      },
      {
        couponType: "share_referral_bonus_50",
        title: "野哉分享家加码券",
        amount: 50,
        threshold: Number(result && result.campaign && result.campaign.couponThreshold) || 1000
      }
    ];
  }

  return awardedAssets;
}

function buildReasonCards(reason) {
  const cards = {
    self_scan: {
      key: "self_scan",
      title: "不能扫描自己的分享码",
      desc: "请使用朋友的分享码领取新人券。"
    },
    invalid_code: {
      key: "invalid_code",
      title: "这个分享码暂时不可用",
      desc: "分享码可能已失效，建议换一个朋友的分享码试试。"
    },
    old_user: {
      key: "old_user",
      title: "本活动仅限新用户领取",
      desc: "你可以继续浏览和预订野哉路线。"
    },
    duplicate_join: {
      key: "duplicate_join",
      title: "首个有效邀请关系已确认",
      desc: "本次扫码没有新增优惠券。"
    },
    duplicate_max: {
      key: "duplicate_max",
      title: "你已经拿到最高新人优惠券金额了～",
      desc: "新人券仍可在券包中查看。"
    }
  };

  return cards[reason] ? [cards[reason]] : [
    cards.self_scan,
    cards.invalid_code,
    cards.old_user
  ];
}

function getAwardedCouponTypes(summary, awardedAssets) {
  const summaryTypes = summary && Array.isArray(summary.awardedTypes) ? summary.awardedTypes : [];
  const assetTypes = (Array.isArray(awardedAssets) ? awardedAssets : [])
    .map((item) => normalizeText(item && item.couponType))
    .filter(Boolean);
  return summaryTypes.concat(assetTypes).map((item) => normalizeText(item));
}

function resolveAwardIntroText(result, awardedAssets, summary, scenario) {
  const campaign = result && result.campaign && typeof result.campaign === "object" ? result.campaign : {};
  const campaignCopywriting = campaign.copywriting && typeof campaign.copywriting === "object"
    ? campaign.copywriting
    : {};

  if (scenario === "phase2_bonus") {
    return normalizeText(campaignCopywriting.bonusUpgradeIntro) || DEFAULT_BONUS_UPGRADE_INTRO;
  }

  const awardedTypes = getAwardedCouponTypes(summary, awardedAssets);
  const phase = normalizeText(campaign.phase).toLowerCase();
  const onlyPhase2DirectCoupon = phase === "phase2"
    && awardedTypes.indexOf("share_referral_welcome_100") >= 0
    && awardedTypes.indexOf("share_referral_bonus_50") < 0;

  if (onlyPhase2DirectCoupon) {
    return normalizeText(campaignCopywriting.phase2DirectAwardIntro) || DEFAULT_PHASE2_DIRECT_AWARD_INTRO;
  }

  return normalizeText(campaignCopywriting.firstAwardIntro) || DEFAULT_FIRST_AWARD_INTRO;
}

function inferScenarioFromLegacyResult(result) {
  const status = normalizeText(result && result.status);
  const awardedAssets = Array.isArray(result && result.awardedCouponAssets) ? result.awardedCouponAssets : [];
  const awardedAmount = sumAwardAmount(awardedAssets);

  if (status === "awarded") {
    return awardedAmount === 50 ? "phase2_bonus" : "success_first_award";
  }
  if (status === "invalid_self" || status === "invalid_code" || status === "invalid_old_user") {
    return "failed_ineligible";
  }
  if (status === "duplicate_join" || status === "duplicate_max") {
    return "duplicate_bound";
  }
  return "idle";
}

function inferReasonFromLegacyResult(result) {
  const status = normalizeText(result && result.status);
  if (status === "invalid_self") {
    return "self_scan";
  }
  if (status === "invalid_code") {
    return "invalid_code";
  }
  if (status === "invalid_old_user") {
    return "old_user";
  }
  if (status === "duplicate_join" || status === "duplicate_max") {
    return status;
  }
  return "";
}

function buildDuplicateRecordView(result, totalAmountAfter) {
  const source = result && result.duplicateRecord && typeof result.duplicateRecord === "object" ? result.duplicateRecord : {};
  const couponAmount = Number(source.couponAmount) || Number(totalAmountAfter) || 0;
  const firstValidScanAtText = normalizeText(source.firstValidScanAtText) || "已完成";
  const firstInviterName = normalizeText(source.firstInviterName) || "野哉分享家";
  const couponStatusText = normalizeText(source.couponStatusText) || (couponAmount ? `¥${couponAmount} 已存入券包` : "已存入券包");
  const relationStatusText = normalizeText(source.relationStatusText) || "已确认";
  const timeline = Array.isArray(source.timeline) && source.timeline.length ? source.timeline : [
    {
      key: "first_scan",
      title: "首次有效扫码",
      desc: firstValidScanAtText
    },
    {
      key: "coupon_awarded",
      title: "券包入账",
      desc: couponStatusText
    }
  ];

  return {
    firstValidScanAtText,
    firstInviterName,
    couponStatusText,
    relationStatusText,
    timeline: timeline
      .filter((item) => normalizeText(item && item.key) !== "relation_confirmed" && normalizeText(item && item.title) !== "关系确认")
      .map((item, index) => ({
        key: normalizeText(item && item.key) || `timeline_${index}`,
        title: normalizeText(item && item.title),
        desc: normalizeText(item && item.desc)
      }))
  };
}

function buildResultView(result) {
  if (!result) {
    return null;
  }

  const status = normalizeText(result.status);
  const scenario = normalizeText(result.resultScenario) || inferScenarioFromLegacyResult(result);
  const reason = normalizeText(result.resultReason) || inferReasonFromLegacyResult(result);
  const awardedAssets = Array.isArray(result.awardedCouponAssets) ? result.awardedCouponAssets : [];
  const summary = result.couponAwardSummary && typeof result.couponAwardSummary === "object" ? result.couponAwardSummary : {};
  const awardedAmount = Number(summary.awardedAmount) || sumAwardAmount(awardedAssets);
  const totalAmountAfter = Number(summary.totalAmountAfter) || awardedAmount;
  const fallbackMessage = normalizeText(result.message) || "领取状态已更新";
  const campaign = result && result.campaign && typeof result.campaign === "object" ? result.campaign : {};
  const campaignCopywriting = campaign.copywriting && typeof campaign.copywriting === "object"
    ? campaign.copywriting
    : {};
  const duplicateJoinDesc = normalizeText(campaignCopywriting.duplicateJoinDesc)
    || "你已参与过本次活动过，本次扫码没有新增优惠券";
  const titleMap = {
    awarded: scenario === "phase2_bonus"
      ? `新人权益已升级至 ¥${totalAmountAfter || 150}`
      : (totalAmountAfter ? `¥${totalAmountAfter} 新人券已存入券包` : "新人券已存入券包"),
    ready: "你的分享码已生成",
    idle: "欢迎来到野哉分享家",
    duplicate_join: normalizeText(campaignCopywriting.duplicateJoin) || "你已参与过本次活动",
    duplicate_max: "你已经拿到最高新人优惠券金额了～",
    invalid_self: "不能扫描自己的分享码",
    invalid_old_user: "本活动仅限新用户领取",
    invalid_code: "这个分享码暂时不可用"
  };
  const statusLabelMap = {
    awarded: "领取成功",
    ready: "分享码已生成",
    idle: "分享码已生成",
    duplicate_join: "已参与",
    duplicate_max: "已领取",
    invalid_self: "无法领取",
    invalid_old_user: "暂不符合",
    invalid_code: "无法领取"
  };
  const resultTitleMap = {
    awarded: scenario === "phase2_bonus" ? "升级成功" : "已到账",
    ready: "可以开始分享",
    idle: "可以开始分享",
    duplicate_join: "无需重复参与",
    duplicate_max: "无需重复领取",
    invalid_self: "本次未领取",
    invalid_old_user: "本次未领取",
    invalid_code: "本次未领取"
  };
  const resultDescMap = {
    awarded: scenario === "phase2_bonus"
      ? "¥100 新人券和 ¥50 加码券已存入券包，预订符合满减条件的路线时可使用。"
      : "你可以在“我的”页的「分享家资产」里查看优惠券，预订符合满减条件的路线时可使用。",
    ready: "你可以把自己的分享码发给朋友，或先去看看野哉路线。",
    idle: "你可以把自己的分享码发给朋友，或先去看看野哉路线。",
    duplicate_join: duplicateJoinDesc,
    duplicate_max: duplicateJoinDesc,
    invalid_self: "请使用朋友的分享码领取新人券。",
    invalid_old_user: "你可以继续浏览和预订野哉路线，新人券仅发放给首次参与的新用户。",
    invalid_code: "请确认二维码来自有效的野哉分享家。"
  };
  const ownReferralCode = normalizeText(result.ownReferralCode);
  const couponCards = buildCouponCards(result, awardedAssets, summary);
  const awardIntroText = resolveAwardIntroText(result, awardedAssets, summary, scenario);

  return {
    scenario,
    reason,
    statusLabel: statusLabelMap[status] || "领取结果",
    title: titleMap[status] || fallbackMessage,
    codeText: ownReferralCode ? `我的分享码：${ownReferralCode}` : "分享码生成中",
    resultTitle: resultTitleMap[status] || "领取状态已更新",
    resultDesc: resultDescMap[status] || fallbackMessage,
    awardText: awardedAmount ? `¥${awardedAmount}` : "新人礼",
    awardIntroText,
    totalAmountAfter,
    awardSectionEyebrow: scenario === "phase2_bonus" ? "权益升级" : "本次到账",
    hasAwards: couponCards.length > 0,
    couponCards,
    duplicateRecord: buildDuplicateRecordView(result, totalAmountAfter),
    reasonCards: buildReasonCards(reason),
    primaryActionText: status === "awarded" || status === "duplicate_max" || scenario === "duplicate_bound" ? "查看我的券包" : "查看分享家资产"
  };
}

function buildStageView(stage, resultView) {
  const view = resultView || {};
  const base = {
    showGiftModal: false,
    showCelebration: false,
    showFlyingCoupon: false,
    showResult: stage === "result",
    showFailed: stage === "failed",
    showDuplicateRecord: stage === "duplicate_record" || stage === "duplicate",
    isLocked: stage === "gift_locked",
    giftImage: "",
    modalTitle: "",
    modalDesc: "",
    modalButtonText: "",
    canOpenGift: false,
    confetti: [0, 1, 2, 3, 4, 5, 6, 7]
  };

  if (stage === "gift_pending") {
    return Object.assign({}, base, {
      showGiftModal: true,
      giftImage: "images/gift-closed.png",
      modalTitle: "你有一份新人礼待开启",
      modalDesc: "点击打开后，新人券会自动存入券包。",
      modalButtonText: "打开礼盒",
      canOpenGift: true
    });
  }

  if (stage === "bonus_pending") {
    return Object.assign({}, base, {
      showGiftModal: true,
      giftImage: "images/gift-bonus-50.png",
      modalTitle: "你有一份加码券待开启",
      modalDesc: "扫码后可升级新人权益。",
      modalButtonText: "打开加码礼",
      canOpenGift: true
    });
  }

  if (stage === "gift_opening" || stage === "celebrating" || stage === "coupon_flying") {
    return Object.assign({}, base, {
      showGiftModal: true,
      showCelebration: stage === "celebrating" || stage === "coupon_flying",
      showFlyingCoupon: stage === "coupon_flying",
      giftImage: stage === "gift_opening" ? "images/gift-opening.png" : "images/gift-open.png",
      modalTitle: stage === "gift_opening" ? "正在打开新人礼" : `恭喜获得 ${view.awardText || "新人券"}`,
      modalDesc: stage === "coupon_flying" ? "优惠券正在存入你的券包。" : "请稍等片刻。",
      modalButtonText: "",
      canOpenGift: false
    });
  }

  if (stage === "gift_locked") {
    return Object.assign({}, base, {
      showGiftModal: true,
      giftImage: "images/gift-locked.png",
      modalTitle: "暂时无法领取",
      modalDesc: "正在为你整理本次扫码结果。",
      canOpenGift: false
    });
  }

  return base;
}

function parseScenePayload(rawValue) {
  const source = decodeURIComponent(normalizeText(rawValue));
  if (!source) {
    return {};
  }

  const result = {};
  source.split("&").forEach((entry) => {
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

  return { ref: source };
}

function resolveRequestPayload(options) {
  const source = options && typeof options === "object" ? options : {};
  const scenePayload = parseScenePayload(source.scene);

  return {
    scene: normalizeText(source.scene),
    referralCode: normalizeText(
      source.referralCode
      || source.ref
      || source.code
      || source.inviteCode
      || scenePayload.referralCode
      || scenePayload.ref
      || scenePayload.code
      || scenePayload.inviteCode
    )
  };
}

function shouldRedirectToAssetsAfterBootstrap(requestPayload, result, resultView) {
  if (normalizeText(requestPayload && requestPayload.referralCode)) {
    return false;
  }

  const scenario = normalizeText(resultView && resultView.scenario) || inferScenarioFromLegacyResult(result);
  if (scenario !== "idle") {
    return false;
  }

  const summary = result && result.couponAwardSummary && typeof result.couponAwardSummary === "object"
    ? result.couponAwardSummary
    : {};
  const awardedAssets = Array.isArray(result && result.awardedCouponAssets) ? result.awardedCouponAssets : [];
  const awardedAmount = Number(summary.awardedAmount) || sumAwardAmount(awardedAssets);
  const totalAmountAfter = Number(summary.totalAmountAfter) || 0;
  return awardedAmount <= 0 && totalAmountAfter > 0;
}

Page({
  data: {
    loading: true,
    errorText: "",
    result: null,
    resultView: null,
    flowStage: "checking",
    stageView: buildStageView("checking", null),
    referralCode: ""
  },
  flowTimers: [],

  onLoad(options) {
    const requestPayload = resolveRequestPayload(options);
    this.setData({
      referralCode: requestPayload.referralCode || ""
    });
    void this.bootstrap(requestPayload);
  },

  async bootstrap(requestPayload) {
    this.clearFlowTimers();
    this.setData({
      loading: true,
      errorText: "",
      flowStage: "checking",
      stageView: buildStageView("checking", null)
    });

    try {
      const result = await bootstrapParticipation(requestPayload);
      if (result && result.currentUser) {
        activateSession(result.currentUser);
      }

      const resultView = buildResultView(result);
      this.setData({
        loading: false,
        result: result || null,
        resultView
      });
      if (shouldRedirectToAssetsAfterBootstrap(requestPayload, result, resultView)) {
        wx.redirectTo({
          url: "/pkg/account/assets/index"
        });
        return;
      }
      this.startFlow(result, resultView);
    } catch (error) {
      console.error("Failed to bootstrap share referral page", error);
      this.setData({
        loading: false,
        errorText: error instanceof Error ? error.message : "活动信息加载失败"
      });
    }
  },

  startFlow(result, resultView) {
    const scenario = normalizeText(resultView && resultView.scenario) || inferScenarioFromLegacyResult(result);
    if (scenario === "success_first_award") {
      this.setFlowStage("gift_pending");
      return;
    }
    if (scenario === "phase2_bonus") {
      this.setFlowStage("bonus_pending");
      return;
    }
    if (scenario === "failed_ineligible") {
      if (normalizeText(resultView && resultView.reason) === "duplicate_max") {
        this.setFlowStage("failed");
        return;
      }
      this.setFlowStage("gift_locked");
      this.scheduleFlowStage("failed", 900);
      return;
    }
    if (scenario === "duplicate_bound") {
      this.setFlowStage("duplicate_record");
      this.scheduleFlowStage("duplicate", 900);
      return;
    }
    this.setFlowStage("result");
  },

  setFlowStage(stage) {
    this.setData({
      flowStage: stage,
      stageView: buildStageView(stage, this.data.resultView)
    });
  },

  scheduleFlowStage(stage, delay) {
    const timer = setTimeout(() => {
      this.setFlowStage(stage);
    }, delay);
    this.flowTimers.push(timer);
  },

  clearFlowTimers() {
    (this.flowTimers || []).forEach((timer) => clearTimeout(timer));
    this.flowTimers = [];
  },

  openGift() {
    if (!this.data.stageView || !this.data.stageView.canOpenGift) {
      return;
    }
    if (wx.vibrateShort) {
      wx.vibrateShort({ type: "light" });
    }
    this.clearFlowTimers();
    this.setFlowStage("gift_opening");
    this.scheduleFlowStage("celebrating", 550);
    this.scheduleFlowStage("coupon_flying", 1200);
    this.scheduleFlowStage("result", 1900);
  },

  openAssets() {
    wx.navigateTo({
      url: "/pkg/account/assets/index"
    });
  },

  openRewards() {
    wx.navigateTo({
      url: "/pkg/account/assets/index?tab=rewards"
    });
  },

  goJourneyList() {
    goTopLevel(TOP_LEVEL_ROUTES.journeys);
  },

  goProfile() {
    goTopLevel(TOP_LEVEL_ROUTES.profile);
  },

  onUnload() {
    this.clearFlowTimers();
  }
});
