const { activateSession, getCurrentUser } = require("../../../services/user");
const { goTopLevel, TOP_LEVEL_ROUTES } = require("../../../services/navigation");
const { bootstrapParticipation, getAssetOverview, markCashRewardGiftOpened } = require("../api/referral");

const REFERRAL_SHARE_TITLE = "邀请您扫描野哉的活动二维码，获得最高150元的优惠券。";
const REFERRAL_SHARE_FALLBACK_PATH = "/pkg/activity/share-referral/index";

function buildTabSections(coupons, rewards) {
  const couponCount = Array.isArray(coupons) ? coupons.length : 0;
  const rewardCount = Array.isArray(rewards) ? rewards.length : 0;
  return [
    { key: "coupons", title: `优惠券 ${couponCount}` },
    { key: "rewards", title: `现金奖励 ${rewardCount}` }
  ];
}

function getCouponBackgroundImage(status) {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  if (normalizedStatus === "used") {
    return "images/coupon-bg-used.png";
  }
  if (normalizedStatus === "expired" || normalizedStatus === "revoked") {
    return "images/coupon-bg-expired.png";
  }
  return "images/coupon-bg-active.png";
}

function getCouponStackUsageText(item) {
  const couponType = String(item && item.couponType || "").trim();
  return couponType === "share_referral_bonus_50" ? "可与新人券叠加使用" : "";
}

function getRewardVisualStatus(status) {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  if (normalizedStatus === "paid") {
    return "paid";
  }
  if (normalizedStatus === "failed") {
    return "failed";
  }
  return "pending";
}

function getRewardBackgroundImage(status) {
  const visualStatus = getRewardVisualStatus(status);
  if (visualStatus === "paid") {
    return "images/reward-bg-paid.png";
  }
  if (visualStatus === "failed") {
    return "images/reward-bg-failed.png";
  }
  return "images/reward-bg-pending.png";
}

function getRewardDisplayStatusLabel(status) {
  const visualStatus = getRewardVisualStatus(status);
  if (visualStatus === "paid") {
    return "已发放";
  }
  if (visualStatus === "failed") {
    return "发放失败";
  }
  return "待发放";
}

function normalizeCouponCards(coupons) {
  return (Array.isArray(coupons) ? coupons : []).map((item) => ({
    ...item,
    backgroundImage: getCouponBackgroundImage(item && item.status),
    showStatusBadge: item && item.status === "active",
    statusLabel: item && item.status === "active" ? "可使用" : "",
    stackUsageText: getCouponStackUsageText(item)
  }));
}

function normalizeRewardCards(rewards) {
  return (Array.isArray(rewards) ? rewards : []).map((item) => ({
    ...item,
    rewardVisualStatus: getRewardVisualStatus(item && item.status),
    backgroundImage: getRewardBackgroundImage(item && item.status),
    displayStatusLabel: getRewardDisplayStatusLabel(item && item.status)
  }));
}

function buildRewardGiftView(rewardGift) {
  const source = rewardGift && typeof rewardGift === "object" ? rewardGift : {};
  const rewardIds = Array.isArray(source.rewardIds)
    ? source.rewardIds.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const totalAmount = Number(source.totalAmount) || 0;
  const rewardCount = Number(source.rewardCount) || rewardIds.length;
  return {
    shouldOpen: Boolean(source.shouldOpen && rewardIds.length && totalAmount > 0),
    rewardIds,
    rewardCount,
    totalAmount,
    title: String(source.title || "").trim() || `获得 ¥${totalAmount} 现金奖励`,
    desc: String(source.desc || "").trim() || "被邀请人已完成首次旅行，现金奖励已记入你的分享家资产。",
    amountText: `¥${totalAmount}`,
    stageTitle: "你有一份现金奖励待开启",
    stageDesc: "点击礼盒，查看本次邀请奖励。"
  };
}

function showActivityMessage(message) {
  const content = String(message || "已确认备用码").trim();
  if (content.length > 10) {
    wx.showModal({
      title: "活动提示",
      content,
      showCancel: false,
      confirmText: "知道了"
    });
    return;
  }

  wx.showToast({
    title: content,
    icon: "none"
  });
}

function buildReferralSharePath(sharePath, referralCode) {
  const normalizedPath = String(sharePath || "").trim();
  if (normalizedPath) {
    return normalizedPath;
  }

  const code = String(referralCode || "").trim();
  return code
    ? `${REFERRAL_SHARE_FALLBACK_PATH}?ref=${encodeURIComponent(code)}`
    : REFERRAL_SHARE_FALLBACK_PATH;
}

function normalizeReferralCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function parseQueryPayload(rawValue) {
  const source = decodeURIComponent(String(rawValue || "").trim());
  if (!source) {
    return {};
  }

  const queryStart = source.indexOf("?");
  const queryText = queryStart >= 0 ? source.slice(queryStart + 1).split("#")[0] : source;
  const result = {};
  queryText.split("&").forEach((entry) => {
    const [rawKey, ...rest] = entry.split("=");
    const key = String(rawKey || "").trim();
    const value = String(rest.join("=") || "").trim();
    if (key) {
      result[key] = value;
    }
  });

  return result;
}

function resolveReferralCodeFromPayload(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const scenePayload = parseQueryPayload(source.scene);
  return normalizeReferralCode(
    source.referralCode
    || source.ref
    || source.code
    || source.inviteCode
    || scenePayload.referralCode
    || scenePayload.ref
    || scenePayload.code
    || scenePayload.inviteCode
  );
}

function resolveScannedReferralCode(scanResult) {
  const source = scanResult && typeof scanResult === "object" ? scanResult : {};
  const candidates = [
    source.path,
    source.result,
    source.rawData
  ];

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = String(candidates[index] || "").trim();
    if (!candidate) {
      continue;
    }
    const queryCode = resolveReferralCodeFromPayload(parseQueryPayload(candidate));
    if (queryCode) {
      return queryCode;
    }
    const directCode = normalizeReferralCode(candidate);
    if (directCode.length >= 4 && directCode.length <= 16 && directCode === candidate.toUpperCase()) {
      return directCode;
    }
  }

  return "";
}

function buildShareReferralPageUrl(referralCode) {
  const code = normalizeReferralCode(referralCode);
  return code
    ? `${REFERRAL_SHARE_FALLBACK_PATH}?ref=${encodeURIComponent(code)}`
    : REFERRAL_SHARE_FALLBACK_PATH;
}

function resolvePayoutStatusText(payoutAccount, fallbackLabel) {
  const status = String(payoutAccount && payoutAccount.status ? payoutAccount.status : "").trim().toLowerCase();
  if (!payoutAccount) {
    return {
      statusLabel: fallbackLabel || "待补收款信息",
      actionLabel: "完善"
    };
  }
  if (status === "payable" || status === "under_review") {
    return {
      statusLabel: "已登记",
      actionLabel: "修改"
    };
  }

  const statusLabel = String(
    (payoutAccount && payoutAccount.statusLabel) || fallbackLabel || "待补收款信息"
  ).trim();
  return {
    statusLabel,
    actionLabel: statusLabel
  };
}

Page({
  data: {
    loading: true,
    loggedIn: false,
    user: null,
    activeTab: "coupons",
    tabSections: buildTabSections([], []),
    assetOverview: null,
    coupons: [],
    rewards: [],
    ownReferralCode: "",
    sharePath: "",
    shareScene: "",
    shareQrCodeFileID: "",
    shareQrCodeImageUrl: "",
    referralCodeDraft: "",
    submittingReferralCode: false,
    couponSummaryText: "暂无可用券",
    rewardSummaryText: "尚无现金奖励",
    payoutAccountStatusLabel: "待补收款信息",
    payoutAccountActionLabel: "完善",
    payoutAccountSummaryText: "",
    rewardGiftVisible: false,
    rewardGiftStage: "idle",
    rewardGiftView: null,
    rewardGiftConfetti: [0, 1, 2, 3, 4, 5, 6, 7],
    rewardGiftCoins: [0, 1, 2, 3, 4, 5]
  },
  rewardGiftTimers: [],
  handledRewardGiftKey: "",

  onLoad(options) {
    const initialTab = String(options && options.tab ? options.tab : "").trim();
    if (initialTab === "rewards") {
      this.setData({
        activeTab: "rewards"
      });
    }
  },

  onShow() {
    void this.refresh();
  },

  async refresh() {
    this.setData({
      loading: true
    });

    try {
      const user = await getCurrentUser();
      if (!user) {
        this.setData({
          loading: false,
          loggedIn: false,
          user: null,
          assetOverview: null,
          coupons: [],
          rewards: [],
          tabSections: buildTabSections([], []),
          ownReferralCode: "",
          sharePath: "",
          shareScene: "",
          shareQrCodeFileID: "",
          shareQrCodeImageUrl: "",
          referralCodeDraft: "",
          submittingReferralCode: false,
          couponSummaryText: "暂无可用券",
          rewardSummaryText: "尚无现金奖励",
          payoutAccountStatusLabel: "待补收款信息",
          payoutAccountActionLabel: "完善",
          payoutAccountSummaryText: "",
          rewardGiftVisible: false,
          rewardGiftStage: "idle",
          rewardGiftView: null
        });
        return;
      }

      const assetOverview = await getAssetOverview();
      const payoutAccount = assetOverview && assetOverview.rewardSummary ? assetOverview.rewardSummary.payoutAccount : null;
      const payoutStatusText = resolvePayoutStatusText(
        payoutAccount,
        assetOverview && assetOverview.rewardSummary && assetOverview.rewardSummary.payoutAccountStatusLabel
      );
      const coupons = normalizeCouponCards(assetOverview && Array.isArray(assetOverview.coupons) ? assetOverview.coupons : []);
      const rewards = normalizeRewardCards(assetOverview && Array.isArray(assetOverview.rewards) ? assetOverview.rewards : []);
      const rewardGiftView = buildRewardGiftView(assetOverview && assetOverview.rewardGift);
      const shareQrCodeFileID = assetOverview && assetOverview.shareQrCodeFileID ? assetOverview.shareQrCodeFileID : "";
      this.setData({
        loading: false,
        loggedIn: true,
        user,
        assetOverview: assetOverview || null,
        coupons,
        rewards,
        tabSections: buildTabSections(coupons, rewards),
        ownReferralCode: assetOverview && assetOverview.ownReferralCode ? assetOverview.ownReferralCode : "",
        sharePath: assetOverview && assetOverview.sharePath ? assetOverview.sharePath : "",
        shareScene: assetOverview && assetOverview.shareScene ? assetOverview.shareScene : "",
        shareQrCodeFileID,
        shareQrCodeImageUrl: "",
        couponSummaryText: assetOverview && assetOverview.couponSummary && assetOverview.couponSummary.summaryText
          ? assetOverview.couponSummary.summaryText
          : "暂无可用券",
        rewardSummaryText: assetOverview && assetOverview.rewardSummary && assetOverview.rewardSummary.summaryText
          ? assetOverview.rewardSummary.summaryText
          : "尚无现金奖励",
        payoutAccountStatusLabel: payoutStatusText.statusLabel,
        payoutAccountActionLabel: payoutStatusText.actionLabel,
        payoutAccountSummaryText: payoutAccount
          ? `${payoutAccount.bankName || "收款账户"} · ${payoutAccount.bankAccountMasked || "待补"}`
          : "",
        rewardGiftView
      });
      this.maybeOpenRewardGift(rewardGiftView);
      if (shareQrCodeFileID) {
        this.prepareReferralShareImage(shareQrCodeFileID);
      }
    } catch (error) {
      console.error("Failed to load asset page", error);
      this.setData({
        loading: false,
        loggedIn: false,
        user: null,
        assetOverview: null,
        coupons: [],
        rewards: [],
        tabSections: buildTabSections([], []),
        ownReferralCode: "",
        sharePath: "",
        shareScene: "",
        shareQrCodeFileID: "",
        shareQrCodeImageUrl: "",
        referralCodeDraft: "",
        submittingReferralCode: false,
        couponSummaryText: "暂无可用券",
        rewardSummaryText: "尚无现金奖励",
        payoutAccountStatusLabel: "待补收款信息",
        payoutAccountActionLabel: "完善",
        payoutAccountSummaryText: "",
        rewardGiftVisible: false,
        rewardGiftStage: "idle",
        rewardGiftView: null
      });
    }
  },

  maybeOpenRewardGift(rewardGiftView) {
    if (!rewardGiftView || !rewardGiftView.shouldOpen || this.data.rewardGiftVisible) {
      return;
    }
    const rewardGiftKey = rewardGiftView.rewardIds.join(",");
    if (!rewardGiftKey || rewardGiftKey === this.handledRewardGiftKey) {
      return;
    }
    this.handledRewardGiftKey = rewardGiftKey;
    this.clearRewardGiftTimers();
    this.setData({
      activeTab: "rewards",
      rewardGiftVisible: true,
      rewardGiftStage: "pending",
      rewardGiftView
    });
  },

  setRewardGiftStage(stage) {
    this.setData({
      rewardGiftStage: stage
    });
  },

  scheduleRewardGiftStage(stage, delay) {
    const timer = setTimeout(() => {
      this.setRewardGiftStage(stage);
    }, delay);
    this.rewardGiftTimers.push(timer);
  },

  clearRewardGiftTimers() {
    (this.rewardGiftTimers || []).forEach((timer) => clearTimeout(timer));
    this.rewardGiftTimers = [];
  },

  openRewardGift() {
    const rewardGiftView = this.data.rewardGiftView || {};
    if (!this.data.rewardGiftVisible || this.data.rewardGiftStage !== "pending") {
      return;
    }
    if (wx.vibrateShort) {
      wx.vibrateShort({ type: "light" });
    }
    this.clearRewardGiftTimers();
    this.setRewardGiftStage("opening");
    this.scheduleRewardGiftStage("celebrating", 520);
    this.scheduleRewardGiftStage("result", 1280);
    void markCashRewardGiftOpened({ rewardIds: rewardGiftView.rewardIds || [] }).catch((error) => {
      console.error("Failed to mark cash reward gift opened", error);
    });
  },

  closeRewardGift() {
    this.clearRewardGiftTimers();
    this.setData({
      activeTab: "rewards",
      rewardGiftVisible: false,
      rewardGiftStage: "idle"
    });
    void this.refresh();
  },

  prepareReferralShareImage(fileID) {
    const currentFileID = String(fileID || "").trim();
    if (!currentFileID) {
      this.setData({
        shareQrCodeImageUrl: ""
      });
      return;
    }

    if (!wx.cloud || typeof wx.cloud.getTempFileURL !== "function") {
      this.setData({
        shareQrCodeImageUrl: currentFileID
      });
      return;
    }

    wx.cloud.getTempFileURL({
      fileList: [currentFileID],
      success: (result) => {
        const fileList = result && Array.isArray(result.fileList) ? result.fileList : [];
        const firstFile = fileList[0] || {};
        const tempFileURL = firstFile && firstFile.tempFileURL ? firstFile.tempFileURL : "";
        if (this.data.shareQrCodeFileID !== currentFileID) {
          return;
        }
        this.setData({
          shareQrCodeImageUrl: tempFileURL || currentFileID
        });
      },
      fail: () => {
        if (this.data.shareQrCodeFileID !== currentFileID) {
          return;
        }
        this.setData({
          shareQrCodeImageUrl: currentFileID
        });
      }
    });
  },

  onShareAppMessage() {
    return {
      title: REFERRAL_SHARE_TITLE,
      path: buildReferralSharePath(this.data.sharePath, this.data.ownReferralCode),
      imageUrl: this.data.shareQrCodeImageUrl || this.data.shareQrCodeFileID || ""
    };
  },

  onTabTap(event) {
    const key = event && event.detail ? event.detail.key : "";
    if (!key || key === this.data.activeTab) {
      return;
    }

    this.setData({
      activeTab: key
    });
  },

  goBack() {
    wx.navigateBack({
      fail: () => {
        goTopLevel(TOP_LEVEL_ROUTES.profile);
      }
    });
  },

  jumpToPayoutAccountPage() {
    wx.navigateTo({
      url: "/pkg/account/payout-account/index"
    });
  },

  openReferralRules() {
    wx.navigateTo({
      url: "/pkg/account/share-referral-rules/index"
    });
  },

  copyReferralCode() {
    const code = String(this.data.ownReferralCode || "").trim();
    if (!code) {
      wx.showToast({
        title: "分享码待生成",
        icon: "none"
      });
      return;
    }

    wx.setClipboardData({
      data: code,
      success: () => {
        wx.showToast({
          title: "已复制备用码",
          icon: "success"
        });
      }
    });
  },

  onReferralCodeInput(event) {
    const value = normalizeReferralCode(event && event.detail ? event.detail.value : "");
    this.setData({
      referralCodeDraft: value
    });
  },

  async submitReferralCode(event, scannedReferralCode) {
    const referralCode = normalizeReferralCode(scannedReferralCode || this.data.referralCodeDraft);
    if (!referralCode) {
      wx.showToast({
        title: "请输入备用码",
        icon: "none"
      });
      return;
    }
    if (this.data.submittingReferralCode) {
      return;
    }

    this.setData({
      submittingReferralCode: true
    });
    wx.showLoading({
      title: "确认中"
    });

    try {
      const result = await bootstrapParticipation({ referralCode });
      if (result && result.currentUser) {
        activateSession(result.currentUser);
      }
      wx.hideLoading();
      this.setData({
        referralCodeDraft: "",
        submittingReferralCode: false
      });
      showActivityMessage(result && result.message ? result.message : "已确认备用码");
      await this.refresh();
    } catch (error) {
      console.error("Failed to submit referral code", error);
      wx.hideLoading();
      this.setData({
        submittingReferralCode: false
      });
      wx.showToast({
        title: error instanceof Error ? error.message : "备用码确认失败",
        icon: "none"
      });
    }
  },

  scanReferralQrCode() {
    if (this.data.submittingReferralCode) {
      return;
    }
    if (!wx.scanCode || typeof wx.scanCode !== "function") {
      wx.showToast({
        title: "当前微信版本暂不支持扫码",
        icon: "none"
      });
      return;
    }

    wx.scanCode({
      onlyFromCamera: false,
      scanType: ["qrCode", "wxCode"],
      success: (result) => {
        const referralCode = resolveScannedReferralCode(result);
        if (!referralCode) {
          wx.showToast({
            title: "未识别到有效备用码",
            icon: "none"
          });
          return;
        }
        this.setData({
          referralCodeDraft: referralCode
        });
        wx.navigateTo({
          url: buildShareReferralPageUrl(referralCode)
        });
      },
      fail: (error) => {
        if (error && /cancel/i.test(String(error.errMsg || ""))) {
          return;
        }
        wx.showToast({
          title: "扫码失败，请重试",
          icon: "none"
        });
      }
    });
  },

  previewReferralQrCode() {
    const fileID = String(this.data.shareQrCodeFileID || "").trim();
    if (!fileID) {
      wx.showToast({
        title: "二维码生成中",
        icon: "none"
      });
      return;
    }

    wx.previewImage({
      current: fileID,
      urls: [fileID]
    });
  },

  saveReferralQrCode() {
    const fileID = String(this.data.shareQrCodeFileID || "").trim();
    if (!fileID) {
      wx.showToast({
        title: "二维码生成中",
        icon: "none"
      });
      return;
    }

    if (!wx.cloud || typeof wx.cloud.downloadFile !== "function") {
      wx.showToast({
        title: "当前环境暂不支持保存",
        icon: "none"
      });
      return;
    }

    wx.showLoading({
      title: "保存中"
    });
    wx.cloud.downloadFile({
      fileID,
      success: (downloadResult) => {
        const filePath = downloadResult && downloadResult.tempFilePath ? downloadResult.tempFilePath : "";
        if (!filePath) {
          wx.hideLoading();
          wx.showToast({
            title: "二维码下载失败",
            icon: "none"
          });
          return;
        }

        wx.saveImageToPhotosAlbum({
          filePath,
          success: () => {
            wx.hideLoading();
            wx.showToast({
              title: "已保存到相册",
              icon: "success"
            });
          },
          fail: () => {
            wx.hideLoading();
            wx.showToast({
              title: "保存失败，请检查相册权限",
              icon: "none"
            });
          }
        });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({
          title: "二维码下载失败",
          icon: "none"
        });
      }
    });
  },

  onUnload() {
    this.clearRewardGiftTimers();
  }
});
