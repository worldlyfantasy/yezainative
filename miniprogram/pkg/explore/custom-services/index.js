const { getCustomJourneyPageData } = require("../../../repositories/content-repository");
const { getServiceDetailPageConfig } = require("../../../repositories/config-repository");
const {
  enablePageShareMenus,
  createAddToFavorites,
  createShareAppMessage,
  createShareTimeline
} = require("../../../utils/share");
const {
  buildRouteTypeWordmarkUrl,
  getStatusMeta,
  normalizeRouteTypeLabel
} = require("../../../constants/journey");

const INITIAL_RENDER_COUNT = 8;
const RENDER_BATCH_SIZE = 8;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function formatCustomPriceText(journey) {
  const priceLabel = normalizeText(journey && journey.priceLabel);
  if (!priceLabel) {
    return "定制报价";
  }

  const amount = priceLabel.match(/¥\s*[\d,.]+/);
  if (amount && amount[0]) {
    return `参考 ${amount[0].replace(/\s+/g, "")} 起`;
  }

  return priceLabel.includes("参考") ? priceLabel : `参考 ${priceLabel}`;
}

Page({
  data: {
    loading: true,
    errorText: "",
    activeCustomTab: "flow",
    customTabs: [
      { key: "flow", label: "定制流程" },
      { key: "examples", label: "定制范例" }
    ],
    resultCountText: "",
    consultWeChatQr: "",
    introParagraphs: [
      "野哉连接着一批真正熟悉目的地、热爱旅行、也有自己理解的独立旅行创作者。",
      "你只需要说出你的需求，野哉就会为你匹配合适的创作者，协助完成专属旅行定制。",
      "家庭、朋友、亲子、海外目的地，还是平台暂未上架的路线，都可以先来咨询。"
    ],
    prepareItems: [
      "想去的目的地，或大致方向",
      "计划的旅行起止时间",
      "同行人数与成员关系",
      "大致预算范围",
      "想要的以及不想要的旅行体验"
    ],
    displayJourneys: [],
    renderedCountText: "",
    hasMoreJourneys: false
  },

  onLoad() {
    enablePageShareMenus();
    this.allJourneys = [];
    this.loadCustomJourneys();
  },

  normalizeJourney(rawJourney) {
    const routeTypes = unique(
      ensureArray(rawJourney && rawJourney.routeTypes)
        .concat(ensureArray(rawJourney && rawJourney.tags))
        .concat(ensureArray(rawJourney && rawJourney.styles))
        .map((item) => normalizeRouteTypeLabel(item))
    );
    const statusMeta = getStatusMeta("available");
    const primaryRouteType = normalizeRouteTypeLabel(rawJourney && rawJourney.primaryRouteType) || routeTypes[0] || "";

    return Object.assign({}, rawJourney, {
      routeTypes,
      primaryRouteType,
      primaryRouteTypeWordmark: buildRouteTypeWordmarkUrl(primaryRouteType),
      displayPeriod: {
        dateStart: "",
        status: "available"
      },
      displayStatus: "available",
      displayStatusText: "支持定制",
      displayStatusTheme: statusMeta.theme,
      displayDateText: "按需求定制",
      displayDepartureDatesText: "按需求定制",
      displayDurationLabel: normalizeText(rawJourney && rawJourney.durationTag),
      priceText: formatCustomPriceText(rawJourney)
    });
  },

  async loadCustomJourneys() {
    this.setData({
      loading: true,
      errorText: ""
    });

    try {
      const [payload, pageConfig] = await Promise.all([
        getCustomJourneyPageData(),
        getServiceDetailPageConfig().catch(() => null)
      ]);
      const allJourneys = ensureArray(payload && payload.journeys).map((item) => this.normalizeJourney(item));
      this.allJourneys = allJourneys;
      this.setData({
        loading: false,
        errorText: "",
        consultWeChatQr: normalizeText(pageConfig && pageConfig.consultWeChatQr),
        resultCountText: allJourneys.length ? `共 ${allJourneys.length} 条示例路线` : "",
        displayJourneys: allJourneys.slice(0, INITIAL_RENDER_COUNT),
        hasMoreJourneys: allJourneys.length > INITIAL_RENDER_COUNT,
        renderedCountText: this.buildRenderedCountText(allJourneys.length, Math.min(allJourneys.length, INITIAL_RENDER_COUNT))
      });
    } catch (error) {
      console.error("Failed to load custom journeys", error);
      this.allJourneys = [];
      this.setData({
        loading: false,
        errorText: "定制路线加载失败，请稍后重试。",
        resultCountText: "",
        displayJourneys: [],
        hasMoreJourneys: false,
        renderedCountText: ""
      });
    }
  },

  buildRenderedCountText(totalCount, visibleCount) {
    const safeTotal = Math.max(0, Number(totalCount) || 0);
    const safeVisible = Math.max(0, Number(visibleCount) || 0);
    if (!safeTotal) {
      return "";
    }

    if (safeVisible >= safeTotal) {
      return `已显示全部 ${safeTotal} 条路线`;
    }

    return `已显示 ${safeVisible}/${safeTotal} 条路线`;
  },

  onLoadMoreTap() {
    const source = this.allJourneys || [];
    const nextCount = Math.min(source.length, (this.data.displayJourneys || []).length + RENDER_BATCH_SIZE);
    this.setData({
      displayJourneys: source.slice(0, nextCount),
      hasMoreJourneys: nextCount < source.length,
      renderedCountText: this.buildRenderedCountText(source.length, nextCount)
    });
  },

  onReachBottom() {
    if (this.data.hasMoreJourneys) {
      this.onLoadMoreTap();
    }
  },

  retryLoadCustomJourneys() {
    this.loadCustomJourneys();
  },

  onJourneyTap(event) {
    const slug = normalizeText(event.detail && event.detail.slug);
    if (!slug) {
      return;
    }

    wx.navigateTo({
      url: `/pkg/explore/service-detail/index?slug=${slug}`
    });
  },

  onJourneyDepartureTap(event) {
    this.onJourneyTap(event);
  },

  onCustomTabTap(event) {
    const nextTab = normalizeText(event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.tab);
    if (!nextTab || nextTab === this.data.activeCustomTab) {
      return;
    }

    this.setData({
      activeCustomTab: nextTab
    });
  },

  onConsultQrTap() {
    const qrUrl = normalizeText(this.data.consultWeChatQr);
    if (!qrUrl) {
      return;
    }

    wx.previewImage({
      current: qrUrl,
      urls: [qrUrl]
    });
  },

  getShareImageUrl() {
    const displayJourneys = this.data.displayJourneys || [];
    const allJourneys = this.allJourneys || [];

    return (displayJourneys[0] && displayJourneys[0].cover)
      || (allJourneys[0] && allJourneys[0].cover)
      || "";
  },

  onShareAppMessage() {
    return createShareAppMessage({
      title: "野哉定制｜专属旅行定制",
      pagePath: "/pkg/explore/custom-services/index",
      imageUrl: this.getShareImageUrl()
    });
  },

  onShareTimeline() {
    return createShareTimeline({
      title: "野哉定制｜专属旅行定制",
      imageUrl: this.getShareImageUrl()
    });
  },

  onAddToFavorites() {
    return createAddToFavorites({
      title: "野哉定制｜专属旅行定制",
      imageUrl: this.getShareImageUrl()
    });
  }
});
