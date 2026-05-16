const {
  getServiceDetailSummaryData,
  getServiceDetailContentData,
  getServiceGalleryData,
  getServiceGalleryOriginalData
} = require("../../../repositories/content-repository");
const { getServiceDetailPageConfig } = require("../../../repositories/config-repository");
const { isFavorited, toggleFavorite } = require("../../../repositories/transaction-repository");
const { getCurrentUser } = require("../../../services/user");
const { goTopLevel, setPendingJourneyFilter, TOP_LEVEL_ROUTES } = require("../../../services/navigation");
const { clearFavoriteNotice, showFavoriteNotice } = require("../utils/favorite-notice");
const { isAuditMode } = require("../../../utils/audit");
const {
  getExceededOrderPeopleLimitMessage,
  getInsufficientSeatsMessage,
  hasEnoughSeats,
  normalizeOrderPeopleCount
} = require("../period-seat");
const {
  normalizeVersionName,
  resolveItineraryVersionState
} = require("./version-state");
const { calcDurationLabel } = require("./duration-state");
const { enablePageShareMenus, createShareAppMessage, createShareTimeline } = require("../../../utils/share");
const { normalizeRouteTypeLabel } = require("../../../constants/journey");

const SECTION_SCROLL_DURATION = 320;

function getMonthLabel(dateStr) {
  const m = new Date(dateStr).getMonth() + 1;
  return `${m}月`;
}

function getMonthsFromPeriods(periods) {
  const set = new Set((periods || []).map((p) => getMonthLabel(p.dateStart)));
  return Array.from(set).sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    return na - nb;
  });
}

function filterPeriodsByMonth(periods, monthLabel) {
  if (!periods || !monthLabel) return [];
  const monthNum = parseInt(monthLabel, 10);
  return periods.filter((p) => {
    const m = new Date(p.dateStart).getMonth() + 1;
    return m === monthNum;
  });
}

function normalizePeriodVersionKey(value) {
  return normalizeVersionName(value) || "__default__";
}

function buildPeriodVersionLabel(value) {
  const normalized = normalizeVersionName(value);
  return normalized || "默认版";
}

function buildPeriodVersionOptions(periods) {
  const optionMap = {};
  (periods || []).forEach((period) => {
    const key = normalizePeriodVersionKey(period && period.versionName);
    if (optionMap[key]) {
      return;
    }

    optionMap[key] = {
      key,
      label: buildPeriodVersionLabel(period && period.versionName),
      versionName: normalizeVersionName(period && period.versionName)
    };
  });

  return Object.keys(optionMap).map((key) => optionMap[key]);
}

function formatRefundRuleText(item) {
  const label = String(item && item.days || "").trim();
  const content = String(item && item.percent || "").trim();

  if (label && content) {
    return `${label}，${content}`;
  }

  return label || content;
}

function hasMultiplePeriodVersions(periods) {
  return buildPeriodVersionOptions(periods).length > 1;
}

function filterPeriodsByVersion(periods, versionKey) {
  if (!periods || !periods.length) return [];
  if (!versionKey) return periods;
  return periods.filter((period) => normalizePeriodVersionKey(period && period.versionName) === versionKey);
}

function getSelectedPeriod(periods, selectedPeriodId) {
  if (!Array.isArray(periods) || !periods.length) {
    return null;
  }

  if (!selectedPeriodId) {
    return periods[0];
  }

  return periods.find((item) => item.id === selectedPeriodId) || periods[0];
}

function isBookablePeriodStatus(status) {
  const normalized = String(status || "").trim();
  return normalized === "available" || normalized === "confirmed";
}

function isBookablePeriod(period) {
  return isBookablePeriodStatus(period && period.status);
}

function getPeriodUnavailableMessage(period) {
  const status = String(period && period.status || "").trim();
  if (status === "soldout") {
    return "该团期已报满";
  }
  if (status === "closed") {
    return "该团期已截止报名";
  }
  return "该团期暂不可报名";
}

function buildCostTableGroups(costs) {
  if (!costs) return [];
  return [
    {
      key: "include",
      title: "费用包含",
      rows: (costs.include || []).map((item) => ({
        label: item.label,
        content: item.content
      }))
    },
    {
      key: "exclude",
      title: "费用不含",
      rows: (costs.exclude || []).map((item) => ({
        label: item.label,
        content: item.content
      }))
    },
    {
      key: "refundRules",
      title: "退订规则",
      singleColumn: true,
      rows: (costs.refundRules || [])
        .map((item) => ({
          label: "",
          content: formatRefundRuleText(item)
        }))
        .filter((item) => item.content)
    }
  ].filter((group) => group.rows.length);
}

function buildTravelDetailState(travelDetail, preferredVersionName) {
  if (!travelDetail) {
    return {
      travelDetail: null,
      overviewChannelsVideo: null,
      itineraryVersions: [],
      activeItineraryVersionKey: "",
      activeItineraryVersionName: "",
      displayItinerary: null,
      costTableGroups: [],
      activeSectionKey: ""
    };
  }

  const sections = Array.isArray(travelDetail.sections)
    ? travelDetail.sections.filter((item) => item && item.key && item.anchorId)
    : [];
  const itineraryState = resolveItineraryVersionState(travelDetail, preferredVersionName);
  const overviewChannelsVideo = normalizeOverviewChannelsVideo(travelDetail.overview && travelDetail.overview.channelsVideo);

  return {
    travelDetail: Object.assign({}, travelDetail, {
      sections,
      overview: Object.assign({}, travelDetail.overview || {}, {
        channelsVideo: overviewChannelsVideo
      })
    }),
    overviewChannelsVideo,
    itineraryVersions: itineraryState.itineraryVersions,
    activeItineraryVersionKey: itineraryState.activeItineraryVersionKey,
    activeItineraryVersionName: itineraryState.activeItineraryVersionName,
    displayItinerary: itineraryState.displayItinerary,
    costTableGroups: buildCostTableGroups(travelDetail.costs),
    activeSectionKey: sections[0] ? sections[0].key : ""
  };
}

function normalizeOverviewChannelsVideo(value) {
  const source = value && typeof value === "object" ? value : {};
  const feedToken = String(source.feedToken || "").trim();
  const finderUserName = String(source.finderUserName || "").trim();
  const feedId = String(source.feedId || "").trim();
  const canUseChannelVideo = typeof wx !== "undefined" && typeof wx.canIUse === "function"
    ? wx.canIUse("channel-video")
    : false;

  if (!canUseChannelVideo || (!feedToken && !(finderUserName && feedId))) {
    return null;
  }

  return {
    feedToken,
    finderUserName,
    feedId,
    autoplay: Boolean(source.autoplay) && !feedToken
  };
}

function formatFullGroupSize(service, period) {
  const routeFullGroupSize = Number(service && service.fullGroupSize);
  if (Number.isFinite(routeFullGroupSize) && routeFullGroupSize > 0) {
    return `${Math.trunc(routeFullGroupSize)}人`;
  }

  const totalSeats = Number(period && period.totalSeats);
  return Number.isFinite(totalSeats) && totalSeats > 0 ? `${totalSeats}人` : "待确认";
}

function buildServiceMetaCards(durationLabel, options) {
  const canJumpToItinerary = !(options && options.disableDurationAction);
  const selectedPeriod = options && options.selectedPeriod;
  const service = options && options.service;
  const travelDetail = options && options.travelDetail;
  return [
    {
      key: "duration",
      label: "行程时间",
      value: durationLabel || "行程待确认",
      clickable: canJumpToItinerary
    },
    {
      key: "fullGroupSize",
      label: "满团人数",
      value: formatFullGroupSize(service, selectedPeriod),
      clickable: false
    },
    {
      key: "meetingPoint",
      label: "集合地",
      value: String(travelDetail && travelDetail.meetingPoint || "").trim() || "待确认",
      clickable: false
    },
    {
      key: "dismissalPoint",
      label: "解散地",
      value: String(travelDetail && travelDetail.dismissalPoint || "").trim() || "待确认",
      clickable: false
    }
  ];
}

function getCreatorQuoteText(service, travelDetail) {
  const creatorMessage = String(service && service.creatorMessage ? service.creatorMessage : "").trim();
  if (creatorMessage) {
    return creatorMessage;
  }

  const source = travelDetail && travelDetail.overview && travelDetail.overview.whyJoinText
    ? String(travelDetail.overview.whyJoinText)
    : "";
  const firstParagraph = source.split(/\n\s*\n/)[0].trim();
  if (firstParagraph) {
    return firstParagraph;
  }

  return String(service && service.summary ? service.summary : "").trim();
}

function formatGalleryLabel(label) {
  const normalized = String(label || "").trim();
  if (normalized === "封面") {
    return "精选";
  }
  return normalized;
}

function normalizeMediaTabs(mediaTabs, hasGalleryGroups) {
  const normalizedTabs = Array.isArray(mediaTabs)
    ? mediaTabs.map((item, index) => {
      const images = Array.isArray(item && item.images)
        ? item.images.map((image) => String(image || "").trim()).filter(Boolean)
        : [];
      const rawLabel = String(item && item.label ? item.label : "").trim();
      const label = formatGalleryLabel(rawLabel) || `图集${index + 1}`;

      return {
        key: item && item.key ? item.key : `gallery-${index}`,
        label,
        images,
        imageCount: Number(item && item.imageCount) || images.length
      };
    }).filter((item) => item.images.length || item.imageCount)
    : [];

  if (hasGalleryGroups || normalizedTabs.length <= 1) {
    return normalizedTabs;
  }

  const images = Array.from(new Set(
    normalizedTabs.flatMap((item) => Array.isArray(item.images) ? item.images : []).filter(Boolean)
  ));
  return images.length
    ? [{
      key: "cover",
      label: "精选",
      images,
      imageCount: images.length
    }]
    : [];
}

function buildGalleryCounterText(label, total) {
  const count = Number(total) || 0;
  if (count <= 4) {
    return "";
  }
  return `1/${count}`;
}

function getMediaTabAnchor(index) {
  const safeIndex = Number(index);
  return Number.isFinite(safeIndex) && safeIndex >= 0
    ? `media-tab-${Math.floor(safeIndex)}`
    : "";
}

function buildGalleryPreviewState(photoGallery, heroCover, mediaTabs, activeIndex, hasGalleryGroups, photoTotal) {
  const normalizedTabs = normalizeMediaTabs(mediaTabs, hasGalleryGroups);
  const galleryTabs = hasGalleryGroups ? normalizedTabs : [];
  const safeActiveIndex = Number.isFinite(activeIndex)
    ? Math.max(0, Math.min(activeIndex, Math.max(galleryTabs.length - 1, 0)))
    : 0;
  const activeTab = galleryTabs[safeActiveIndex] || null;
  const fallbackImages = Array.isArray(photoGallery)
    ? photoGallery.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const previewImages = activeTab && activeTab.images.length ? activeTab.images : fallbackImages;
  const currentLabel = activeTab ? activeTab.label : "创作者实拍";
  const currentTotal = activeTab ? activeTab.imageCount : Number(photoTotal) || previewImages.length;

  return {
    galleryHero: previewImages[0] || heroCover || "",
    galleryHeroMode: currentTotal === 1 ? "aspectFit" : "aspectFill",
    galleryThumbs: previewImages.slice(1, 4),
    mediaTabs: normalizedTabs,
    galleryTabs,
    activeGalleryTabIndex: safeActiveIndex,
    currentGalleryLabel: currentLabel,
    currentGalleryTotal: currentTotal,
    galleryCounterText: buildGalleryCounterText(currentLabel, currentTotal),
    galleryLayoutClass: currentTotal === 1
      ? "service-gallery--single"
      : currentTotal === 2 ? "service-gallery--two" : "",
    photoGallery: previewImages
  };
}

function normalizePreviewUrls(images) {
  return Array.isArray(images)
    ? images.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

Page({
  data: {
    loading: true,
    auditMode: isAuditMode(),
    service: null,
    serviceRouteTags: [],
    serviceMetaCards: [],
    travelDetail: null,
    overviewChannelsVideo: null,
    itineraryVersions: [],
    activeItineraryVersionKey: "",
    activeItineraryVersionName: "",
    displayItinerary: null,
    costTableGroups: [],
    activeSectionKey: "",
    sectionOffsets: [],
    sectionNavHeight: 0,
    sectionNavTop: 0,
    isSectionTabsSticky: false,
    isAutoScrolling: false,
    favoriteNoticeState: "",
    favoriteNoticeLabel: "收藏成功",
    favoriteNoticeActionLabel: "进入我的收藏",
    favoriteNoticeMode: "success",
    favoriteNoticeActionType: "favorites",
    checkoutNoticeState: "",
    checkoutNoticeLabel: "您还没有登录，请登录后再下单",
    checkoutNoticeActionLabel: "去登录",
    checkoutNoticeMode: "warning",
    checkoutNoticeActionType: "login",
    creator: null,
    creatorQuoteText: "",
    relatedDestinations: [],
    heroCover: "",
    galleryHero: "",
    galleryHeroMode: "aspectFill",
    galleryThumbs: [],
    galleryTabs: [],
    hasStructuredGallery: false,
    activeGalleryTabIndex: 0,
    currentGalleryLabel: "",
    currentGalleryTotal: 0,
    galleryCounterText: "",
    galleryLayoutClass: "",
    photoGallery: [],
    photoTotal: 0,
    mediaTabs: [],
    galleryLoaded: false,
    galleryLoading: false,
    galleryOriginalTabs: [],
    galleryOriginalLoaded: false,
    galleryOriginalLoading: false,
    activeMediaTabIndex: 0,
    mediaSheetTabIntoView: getMediaTabAnchor(0),
    mediaSheetVisible: false,
    mediaSheetAnimating: false,
    consultSheetVisible: false,
    consultSheetAnimating: false,
    consultWeChatQr: "",
    consultSheetTitle: "",
    consultCardLabel: "",
    consultCardDesc: "",
    consultFollowupNote: "",
    suitableTitleText: "",
    suitableSheetVisible: false,
    suitableSheetAnimating: false,
    suitableSheetContent: "",
    groupPeriods: [],
    showGroupPeriodVersionTags: false,
    selectedPeriodId: null,
    periodSheetVisible: false,
    periodSheetAnimating: false,
    periodSheetVersions: [],
    periodSheetActiveVersion: "",
    periodSheetMonths: [],
    periodSheetActiveMonth: "",
    periodSheetDates: [],
    periodSheetSelectedDateId: null,
    periodSheetPeople: 1,
    periodSheetPeopleLimitText: "",
    periodSheetTotalPrice: 0,
    periodSheetCanCheckout: false,
    timelineTitleText: "",
    refundTitleText: "",
    serviceNoticeTitle: "",
    serviceNoticeBody: ""
  },

  async onLoad(options) {
    this.pageScrollTop = 0;
    this.isPageActive = true;
    this.galleryRequestPromise = null;
    this.galleryOriginalRequestPromise = null;
    enablePageShareMenus();

    try {
      const slug = String(options && options.slug || "").trim();
      const contentPromise = getServiceDetailContentData(slug).catch((error) => {
        console.error("Failed to preload service detail content", error);
        return null;
      });
      const [payload, pageConfig] = await Promise.all([
        getServiceDetailSummaryData(slug),
        getServiceDetailPageConfig()
      ]);
      if (!payload) {
        this.setData({ loading: false });
        wx.showToast({
          title: "未找到服务",
          icon: "none"
        });

        setTimeout(() => {
          goTopLevel(TOP_LEVEL_ROUTES.journeys);
        }, 300);
        return;
      }

      const originalService = payload.service || {};
      const routeTags = Array.isArray(originalService.tags)
        ? Array.from(new Set(
          originalService.tags
            .map((item) => normalizeRouteTypeLabel(item))
            .filter(Boolean)
        )).slice(0, 3)
        : [];
      const summaryDetailState = buildTravelDetailState(null, "");
      const summaryMetaCards = buildServiceMetaCards(
        calcDurationLabel(payload, summaryDetailState.travelDetail),
        {
          disableDurationAction: true,
          service: originalService
        }
      );
      const galleryPreviewState = buildGalleryPreviewState(
        payload.photoGallery,
        payload.heroCover,
        payload.mediaTabs,
        0,
        Boolean(payload.hasGalleryGroups),
        payload.photoTotal
      );

      this.setData(
        Object.assign(
          {
            loading: false,
            service: originalService,
            serviceRouteTags: routeTags,
            serviceMetaCards: summaryMetaCards,
            creator: payload.creator,
            creatorQuoteText: getCreatorQuoteText(originalService, null),
            relatedDestinations: payload.relatedDestinations || [],
            heroCover: payload.heroCover || "",
            galleryHero: galleryPreviewState.galleryHero,
            galleryHeroMode: galleryPreviewState.galleryHeroMode,
            galleryThumbs: galleryPreviewState.galleryThumbs,
            hasStructuredGallery: Boolean(payload.hasGalleryGroups),
            galleryTabs: galleryPreviewState.galleryTabs,
            activeGalleryTabIndex: galleryPreviewState.activeGalleryTabIndex,
            currentGalleryLabel: galleryPreviewState.currentGalleryLabel,
            currentGalleryTotal: galleryPreviewState.currentGalleryTotal,
            galleryCounterText: galleryPreviewState.galleryCounterText,
            galleryLayoutClass: galleryPreviewState.galleryLayoutClass,
            photoGallery: galleryPreviewState.photoGallery,
            photoTotal: payload.photoTotal || 0,
            mediaTabs: galleryPreviewState.mediaTabs,
            galleryLoaded: false,
            galleryLoading: false,
            galleryOriginalTabs: [],
            galleryOriginalLoaded: false,
            galleryOriginalLoading: false,
            groupPeriods: [],
            showGroupPeriodVersionTags: false,
            selectedPeriodId: null,
            consultWeChatQr: pageConfig.consultWeChatQr,
            consultSheetTitle: pageConfig.consultSheetTitle,
            consultCardLabel: pageConfig.consultCardLabel,
            consultCardDesc: pageConfig.consultCardDesc,
            consultFollowupNote: pageConfig.consultFollowupNote,
            suitableTitleText: pageConfig.suitableTitleText,
            timelineTitleText: pageConfig.timelineTitleText,
            refundTitleText: pageConfig.refundTitleText,
            serviceNoticeTitle: pageConfig.serviceNoticeTitle,
            serviceNoticeBody: pageConfig.serviceNoticeBody,
            sectionOffsets: [],
            sectionNavHeight: 0,
            sectionNavTop: 0,
            isSectionTabsSticky: false,
            isAutoScrolling: false
          },
          summaryDetailState
        ),
        () => {
          this.ensureGalleryData();
        }
      );

      this.loadFavoriteState(originalService.slug);
      this.loadServiceDetailContent(contentPromise, originalService, pageConfig);
    } catch (error) {
      console.error("Failed to load service detail", error);
      this.setData({ loading: false });
      wx.showToast({
        title: "加载失败",
        icon: "none"
      });
    }
  },

  onReady() {
    if (this.data.travelDetail) {
      this.scheduleMeasureTravelDetailLayout();
    }
  },

  onPageScroll(event) {
    const scrollTop = event.scrollTop || 0;
    this.pageScrollTop = scrollTop;

    if (!this.data.travelDetail) {
      return;
    }

    if (!this.data.sectionOffsets.length || !this.data.sectionNavTop) {
      this.scheduleMeasureTravelDetailLayout();
      return;
    }

    this.updateSectionScrollState(scrollTop);
  },

  onUnload() {
    this.isPageActive = false;
    this.galleryRequestPromise = null;
    this.galleryOriginalRequestPromise = null;
    if (this.autoScrollTimer) {
      clearTimeout(this.autoScrollTimer);
    }
    if (this.sectionMeasureTimer) {
      clearTimeout(this.sectionMeasureTimer);
    }
    clearFavoriteNotice(this, "favoriteNoticeState", true);
    clearFavoriteNotice(this, "checkoutNoticeState", true);
  },

  onShareAppMessage() {
    const service = this.data.service || {};
    return createShareAppMessage({
      title: service.name ? `${service.name}｜野哉旅程` : "野哉旅程",
      pagePath: "/pkg/explore/service-detail/index",
      query: {
        slug: service.slug
      },
      imageUrl: this.data.heroCover || service.cover
    });
  },

  onShareTimeline() {
    const service = this.data.service || {};
    return createShareTimeline({
      title: service.name ? `${service.name}｜野哉旅程` : "野哉旅程",
      query: {
        slug: service.slug
      },
      imageUrl: this.data.heroCover || service.cover
    });
  },

  refreshDurationMetaCard(selectedPeriodOverride) {
    const selectedPeriod = selectedPeriodOverride || getSelectedPeriod(this.data.groupPeriods, this.data.selectedPeriodId);
    this.setData({
      serviceMetaCards: buildServiceMetaCards(
        calcDurationLabel({ groupPeriods: this.data.groupPeriods }, this.data.travelDetail),
        {
          disableDurationAction: !this.data.travelDetail,
          service: this.data.service,
          selectedPeriod,
          travelDetail: this.data.travelDetail
        }
      )
    });
  },

  async loadFavoriteState(serviceSlug) {
    if (!serviceSlug) {
      return;
    }

    try {
      const favorited = await isFavorited("services", serviceSlug);
      if (!this.isPageActive || !this.data.service || this.data.service.slug !== serviceSlug) {
        return;
      }

      this.setData({
        "service.isFavorited": favorited
      });
    } catch (error) {
      console.error("Failed to load service favorite state", error);
    }
  },

  async loadServiceDetailContent(contentPromise, service, pageConfig) {
    try {
      const payload = await contentPromise;
      if (!this.isPageActive || !payload) {
        return;
      }

      const groupPeriods = Array.isArray(payload.groupPeriods) ? payload.groupPeriods : [];
      const showGroupPeriodVersionTags = hasMultiplePeriodVersions(groupPeriods);
      const selectedPeriod = getSelectedPeriod(groupPeriods, this.data.selectedPeriodId);
      const detailState = buildTravelDetailState(
        payload.travelDetail,
        selectedPeriod && selectedPeriod.versionName
      );
      const creatorQuoteText = getCreatorQuoteText(service, detailState.travelDetail);

      this.setData(
        Object.assign(
          {
            creatorQuoteText,
            travelDetail: detailState.travelDetail,
            overviewChannelsVideo: detailState.overviewChannelsVideo,
            itineraryVersions: detailState.itineraryVersions,
            activeItineraryVersionKey: detailState.activeItineraryVersionKey,
            activeItineraryVersionName: detailState.activeItineraryVersionName,
            displayItinerary: detailState.displayItinerary,
            costTableGroups: detailState.costTableGroups,
            activeSectionKey: detailState.activeSectionKey,
            groupPeriods,
            showGroupPeriodVersionTags,
            selectedPeriodId: selectedPeriod ? selectedPeriod.id : null,
            consultWeChatQr: pageConfig.consultWeChatQr || ""
          },
          {
            serviceMetaCards: buildServiceMetaCards(
              calcDurationLabel({ groupPeriods }, detailState.travelDetail),
              {
                selectedPeriod,
                service,
                travelDetail: detailState.travelDetail
              }
            )
          }
        ),
        () => {
          if (detailState.travelDetail) {
            this.scheduleMeasureTravelDetailLayout();
          }
        }
      );
    } catch (error) {
      console.error("Failed to load service detail content", error);
    }
  },

  applyItineraryVersion(versionName, options) {
    if (!this.data.travelDetail) {
      return;
    }

    const itineraryState = resolveItineraryVersionState(this.data.travelDetail, versionName);
    const selectedPeriodId = options && Object.prototype.hasOwnProperty.call(options, "selectedPeriodId")
      ? options.selectedPeriodId
      : this.data.selectedPeriodId;
    const selectedPeriod = getSelectedPeriod(this.data.groupPeriods, selectedPeriodId);

    this.setData(
      {
        itineraryVersions: itineraryState.itineraryVersions,
        activeItineraryVersionKey: itineraryState.activeItineraryVersionKey,
        activeItineraryVersionName: itineraryState.activeItineraryVersionName,
        displayItinerary: itineraryState.displayItinerary
      },
      () => {
        this.refreshDurationMetaCard(selectedPeriod);
        this.scheduleMeasureTravelDetailLayout();
      }
    );
  },

  onItineraryVersionTap(event) {
    const versionName = event.currentTarget.dataset.versionName;
    this.applyItineraryVersion(versionName);
  },

  getActiveSectionKey(scrollTop, sectionOffsets, navHeight) {
    const offsets = sectionOffsets || this.data.sectionOffsets;
    if (!offsets.length) return "";

    const currentTop = scrollTop + (navHeight != null ? navHeight : this.data.sectionNavHeight) + 20;
    let activeKey = offsets[0].key;

    offsets.forEach((item) => {
      if (currentTop >= item.top) {
        activeKey = item.key;
      }
    });

    return activeKey;
  },

  updateSectionScrollState(scrollTop) {
    const nextData = {};
    let shouldUpdate = false;

    if (this.data.sectionNavTop) {
      const isSticky = scrollTop >= this.data.sectionNavTop;
      if (isSticky !== this.data.isSectionTabsSticky) {
        nextData.isSectionTabsSticky = isSticky;
        shouldUpdate = true;
      }
    }

    if (!this.data.isAutoScrolling && this.data.sectionOffsets.length) {
      const activeSectionKey = this.getActiveSectionKey(scrollTop);
      if (activeSectionKey && activeSectionKey !== this.data.activeSectionKey) {
        nextData.activeSectionKey = activeSectionKey;
        shouldUpdate = true;
      }
    }

    if (shouldUpdate) {
      this.setData(nextData);
    }
  },

  scheduleMeasureTravelDetailLayout(callback) {
    if (!this.data.travelDetail) {
      if (typeof callback === "function") callback();
      return;
    }

    if (this.sectionMeasureTimer) {
      clearTimeout(this.sectionMeasureTimer);
    }

    this.sectionMeasureTimer = setTimeout(() => {
      this.measureTravelDetailLayout(callback);
    }, 60);
  },

  measureTravelDetailLayout(callback) {
    if (!this.data.travelDetail) {
      if (typeof callback === "function") callback();
      return;
    }

    const sections = this.data.travelDetail.sections || [];
    if (!sections.length) {
      if (typeof callback === "function") callback();
      return;
    }

    const query = wx.createSelectorQuery();
    query.selectViewport().scrollOffset();
    query.select(".js-section-tabs-anchor").boundingClientRect();
    query.select(".js-section-tabs").boundingClientRect();
    sections.forEach((section) => {
      query.select(`#${section.anchorId}`).boundingClientRect();
    });

    query.exec((res) => {
      const viewport = res[0] || {};
      const anchorRect = res[1];
      const navRect = res[2];
      if (!anchorRect || !navRect) {
        if (typeof callback === "function") callback();
        return;
      }

      const scrollTop = viewport.scrollTop || this.pageScrollTop || 0;
      const sectionOffsets = sections
        .map((section, index) => {
          const rect = res[index + 3];
          if (!rect) return null;
          return {
            key: section.key,
            top: rect.top + scrollTop
          };
        })
        .filter(Boolean);

      if (!sectionOffsets.length) {
        if (typeof callback === "function") callback();
        return;
      }

      const nextData = {
        sectionOffsets,
        sectionNavHeight: navRect.height || 0,
        sectionNavTop: anchorRect.top + scrollTop,
        activeSectionKey:
          this.getActiveSectionKey(scrollTop, sectionOffsets, navRect.height || 0) || this.data.activeSectionKey,
        isSectionTabsSticky: (anchorRect.top || 0) <= 0
      };

      this.setData(nextData, () => {
        if (typeof callback === "function") callback();
      });
    });
  },

  onSectionTabTap(event) {
    const key = event.detail.key;
    if (!key || !this.data.travelDetail) {
      return;
    }

    const targetSection = (this.data.travelDetail.sections || []).find((item) => item.key === key);
    if (!targetSection) {
      return;
    }

    const scrollToSection = () => {
      if (this.autoScrollTimer) {
        clearTimeout(this.autoScrollTimer);
      }

      this.setData({
        activeSectionKey: key,
        isAutoScrolling: true
      });

      wx.pageScrollTo({
        selector: `#${targetSection.anchorId}`,
        offsetTop: -Math.round(this.data.sectionNavHeight || 0),
        duration: SECTION_SCROLL_DURATION
      });

      this.autoScrollTimer = setTimeout(() => {
        this.setData({
          isAutoScrolling: false
        });
        this.updateSectionScrollState(this.pageScrollTop || 0);
      }, SECTION_SCROLL_DURATION + 80);
    };

    if (!this.data.sectionNavHeight || !this.data.sectionOffsets.length) {
      this.measureTravelDetailLayout(scrollToSection);
      return;
    }

    scrollToSection();
  },

  onTravelDetailMediaLoad() {
    if (this.data.travelDetail) {
      this.scheduleMeasureTravelDetailLayout();
    }
  },

  previewTravelDetailImages(images, currentIndex) {
    const previewUrls = normalizePreviewUrls(images);
    if (!previewUrls.length) {
      return;
    }

    const safeIndex = Number.isFinite(currentIndex)
      ? Math.max(0, Math.min(currentIndex, previewUrls.length - 1))
      : 0;
    wx.previewImage({
      current: previewUrls[safeIndex] || previewUrls[0],
      urls: previewUrls
    });
  },

  onOverviewImageTap() {
    if (this.data.overviewChannelsVideo) {
      return;
    }

    const overview = this.data.travelDetail && this.data.travelDetail.overview;
    const coverImage = overview && overview.coverImage ? String(overview.coverImage).trim() : "";
    if (!coverImage) {
      return;
    }

    this.previewTravelDetailImages([coverImage], 0);
  },

  onOverviewChannelsVideoError(error) {
    console.warn("Overview channels video failed", error);
    wx.showToast({
      title: "视频暂时无法播放",
      icon: "none"
    });
  },

  onHighlightImageTap(event) {
    const cardIndex = Number(event.currentTarget.dataset.cardIndex);
    const imageIndex = Number(event.currentTarget.dataset.imageIndex);
    const highlights = this.data.travelDetail && Array.isArray(this.data.travelDetail.highlights)
      ? this.data.travelDetail.highlights
      : [];
    const highlight = Number.isFinite(cardIndex) ? highlights[cardIndex] : null;
    if (!highlight) {
      return;
    }

    this.previewTravelDetailImages(highlight.images, imageIndex);
  },

  onItineraryImageTap(event) {
    const detail = event.detail || {};
    this.previewTravelDetailImages(detail.images, Number(detail.imageIndex));
  },

  goBack() {
    goTopLevel(TOP_LEVEL_ROUTES.journeys);
  },

  onTagTap(event) {
    const key = event.currentTarget.dataset.key;
    if (key === "suggestedAge") {
      wx.showToast({ title: "建议年龄说明", icon: "none" });
      return;
    }
    if (key === "duration") {
      const selectedPeriod = getSelectedPeriod(this.data.groupPeriods, this.data.selectedPeriodId);
      if (selectedPeriod) {
        this.applyItineraryVersion(selectedPeriod.versionName, {
          selectedPeriodId: selectedPeriod.id
        });
      }
      this.onSectionTabTap({
        detail: {
          key: "itinerary"
        }
      });
      return;
    }
  },

  onRouteTagTap(event) {
    const routeTag = String(event.currentTarget.dataset.tag || "").trim();
    if (!routeTag) {
      return;
    }

    setPendingJourneyFilter({
      routeType: routeTag
    });
    goTopLevel(TOP_LEVEL_ROUTES.journeys);
  },

  buildSuitableSheetContent(service, travelDetail) {
    const overviewText = travelDetail && travelDetail.overview && travelDetail.overview.suitableText
      ? String(travelDetail.overview.suitableText).trim()
      : "";
    if (overviewText) {
      return overviewText;
    }

    return String(service && service.summary ? service.summary : "这段旅程的适配说明待补充。").trim();
  },

  openSuitableSheet() {
    if (this.data.suitableSheetVisible) return;
    const content = this.buildSuitableSheetContent(this.data.service, this.data.travelDetail);
    this.setData(
      {
        suitableSheetVisible: true,
        suitableSheetAnimating: false,
        suitableSheetContent: content
      },
      () => {
        setTimeout(() => {
          this.setData({ suitableSheetAnimating: true });
        }, 20);
      }
    );
  },

  closeSuitableSheet() {
    if (!this.data.suitableSheetVisible) return;
    this.setData({ suitableSheetAnimating: false });
    setTimeout(() => {
      this.setData({ suitableSheetVisible: false });
    }, 260);
  },

  openConsultSheet() {
    if (this.data.consultSheetVisible) return;
    this.setData(
      {
        consultSheetVisible: true,
        consultSheetAnimating: false
      },
      () => {
        setTimeout(() => {
          this.setData({
            consultSheetAnimating: true
          });
        }, 20);
      }
    );
  },

  closeConsultSheet() {
    if (!this.data.consultSheetVisible) return;
    this.setData({
      consultSheetAnimating: false
    });
    setTimeout(() => {
      this.setData({
        consultSheetVisible: false
      });
    }, 260);
  },

  onConsultQrTap() {
    const qrUrl = String(this.data.consultWeChatQr || "").trim();
    if (!qrUrl) {
      wx.showToast({
        title: "客服二维码暂不可用",
        icon: "none"
      });
      return;
    }

    wx.previewImage({
      current: qrUrl,
      urls: [qrUrl],
      showmenu: true,
      fail: () => {
        wx.showToast({
          title: "二维码打开失败",
          icon: "none"
        });
      }
    });
  },

  updatePeriodSheetDates(versionKey, monthLabel, preferredPeriodId) {
    const versionFiltered = filterPeriodsByVersion(this.data.groupPeriods, versionKey);
    const months = getMonthsFromPeriods(versionFiltered);
    const safeMonth = monthLabel && months.includes(monthLabel) ? monthLabel : (months[0] || "");
    const dates = filterPeriodsByMonth(versionFiltered, safeMonth);
    const selected = preferredPeriodId
      ? dates.find((item) => item.id === preferredPeriodId) || dates[0] || null
      : dates[0] || null;

    this.setData({
      periodSheetMonths: months,
      periodSheetActiveMonth: safeMonth,
      periodSheetDates: dates,
      periodSheetSelectedDateId: selected ? selected.id : null,
      selectedPeriodId: selected ? selected.id : this.data.selectedPeriodId,
      periodSheetTotalPrice: selected ? selected.price * this.data.periodSheetPeople : 0,
      periodSheetCanCheckout: isBookablePeriod(selected) && hasEnoughSeats(selected, this.data.periodSheetPeople)
    });

    if (selected) {
      this.applyItineraryVersion(selected.versionName, {
        selectedPeriodId: selected.id
      });
    }
  },

  onViewMorePeriods() {
    const periods = this.data.groupPeriods || [];
    if (!periods.length) return;
    const selectedId = this.data.selectedPeriodId;
    const period = selectedId
      ? periods.find((p) => p.id === selectedId) || periods[0]
      : periods[0];
    this.openPeriodSheetWith(period);
  },

  openPeriodSheetWith(period) {
    if (!period) return;
    const versionOptions = buildPeriodVersionOptions(this.data.groupPeriods);
    const activeVersionKey = versionOptions.length > 1
      ? normalizePeriodVersionKey(period.versionName)
      : (versionOptions[0] ? versionOptions[0].key : "");
    const monthLabel = getMonthLabel(period.dateStart);
    this.setData({
      selectedPeriodId: period.id,
      periodSheetVisible: true,
      periodSheetAnimating: false,
      periodSheetVersions: versionOptions,
      periodSheetActiveVersion: activeVersionKey,
      periodSheetMonths: [],
      periodSheetActiveMonth: "",
      periodSheetDates: [],
      periodSheetSelectedDateId: period.id,
      periodSheetPeople: normalizeOrderPeopleCount(1, 1),
      periodSheetPeopleLimitText: "",
      periodSheetTotalPrice: period.price * 1,
      periodSheetCanCheckout: isBookablePeriod(period) && hasEnoughSeats(period, 1)
    });
    this.updatePeriodSheetDates(activeVersionKey, monthLabel, period.id);
    setTimeout(() => {
      this.setData({ periodSheetAnimating: true });
    }, 20);
    this.applyItineraryVersion(period.versionName, {
      selectedPeriodId: period.id
    });
  },

  onSelectPeriod(event) {
    const period = event.currentTarget.dataset.period;
    if (!period) return;
    this.openPeriodSheetWith(period);
  },

  closePeriodSheet() {
    this.setData({ periodSheetAnimating: false });
    setTimeout(() => {
      this.setData({ periodSheetVisible: false });
    }, 260);
  },

  onOrderNoticeHintTap() {
    const hasNoticesSection = Boolean(
      this.data.travelDetail &&
      (this.data.travelDetail.sections || []).some((item) => item.key === "notices")
    );

    if (!hasNoticesSection) {
      wx.showToast({
        title: "出行须知暂未加载",
        icon: "none"
      });
      return;
    }

    this.closePeriodSheet();
    setTimeout(() => {
      this.onSectionTabTap({
        detail: {
          key: "notices"
        }
      });
    }, 280);
  },

  onSelectPeriodVersion(event) {
    const versionKey = event.currentTarget.dataset.versionKey;
    if (!versionKey || versionKey === this.data.periodSheetActiveVersion) {
      return;
    }

    this.setData({
      periodSheetActiveVersion: versionKey
    });
    this.updatePeriodSheetDates(versionKey, "", null);
  },

  onSelectMonth(event) {
    const month = event.currentTarget.dataset.month;
    this.updatePeriodSheetDates(this.data.periodSheetActiveVersion, month, null);
  },

  onSelectSheetDate(event) {
    const period = event.currentTarget.dataset.date;
    if (!period) return;
    this.setData({
      selectedPeriodId: period.id,
      periodSheetSelectedDateId: period.id,
      periodSheetTotalPrice: period.price * this.data.periodSheetPeople,
      periodSheetCanCheckout: isBookablePeriod(period) && hasEnoughSeats(period, this.data.periodSheetPeople)
    });
    this.applyItineraryVersion(period.versionName, {
      selectedPeriodId: period.id
    });
  },

  increaseSheetPeople() {
    const selected = this.data.periodSheetDates.find((d) => d.id === this.data.periodSheetSelectedDateId);
    const n = this.data.periodSheetPeople + 1;
    const peopleLimitError = getExceededOrderPeopleLimitMessage(n);
    if (peopleLimitError) {
      this.setData({
        periodSheetPeopleLimitText: peopleLimitError
      });
      wx.showToast({
        title: peopleLimitError,
        icon: "none"
      });
      return;
    }
    const seatError = getInsufficientSeatsMessage(selected, n);
    if (seatError) {
      wx.showToast({
        title: seatError,
        icon: "none"
      });
      return;
    }

    const price = selected ? selected.price * n : 0;
    this.setData({
      periodSheetPeople: n,
      periodSheetPeopleLimitText: "",
      periodSheetTotalPrice: price,
      periodSheetCanCheckout: isBookablePeriod(selected) && hasEnoughSeats(selected, n)
    });
  },

  decreaseSheetPeople() {
    if (this.data.periodSheetPeople <= 1) return;
    const n = this.data.periodSheetPeople - 1;
    const selected = this.data.periodSheetDates.find((d) => d.id === this.data.periodSheetSelectedDateId);
    const price = selected ? selected.price * n : 0;
    this.setData({
      periodSheetPeople: n,
      periodSheetPeopleLimitText: "",
      periodSheetTotalPrice: price,
      periodSheetCanCheckout: isBookablePeriod(selected) && hasEnoughSeats(selected, n)
    });
  },

  async goToCheckout() {
    const selected = this.data.periodSheetDates.find((d) => d.id === this.data.periodSheetSelectedDateId);
    if (!selected) {
      wx.showToast({ title: "请选择出发日期", icon: "none" });
      return;
    }
    if (!isBookablePeriod(selected)) {
      wx.showToast({
        title: getPeriodUnavailableMessage(selected),
        icon: "none"
      });
      return;
    }
    const seatError = getInsufficientSeatsMessage(selected, this.data.periodSheetPeople);
    if (seatError) {
      wx.showToast({
        title: seatError,
        icon: "none"
      });
      return;
    }
    const user = await getCurrentUser();
    if (!user) {
      showFavoriteNotice(this, {
        stateKey: "checkoutNoticeState",
        labelKey: "checkoutNoticeLabel",
        actionLabelKey: "checkoutNoticeActionLabel",
        modeKey: "checkoutNoticeMode",
        actionTypeKey: "checkoutNoticeActionType",
        label: "您还没有登录，请登录后再下单",
        actionLabel: "去登录",
        mode: "warning",
        actionType: "login"
      });
      return;
    }

    this.closePeriodSheet();
    const slug = this.data.service.slug;
    const travelDateStart = selected.dateStart;
    const travelDateEnd = selected.dateEnd || selected.dateStart;
    const peopleCount = normalizeOrderPeopleCount(this.data.periodSheetPeople, 1);
    const unitPrice = selected.price;
    const versionName = selected.versionName ? encodeURIComponent(selected.versionName) : "";
    const periodCode = selected.periodCode || "";
    wx.navigateTo({
      url:
        `/pkg/explore/checkout/index?slug=${slug}&travelDateStart=${travelDateStart}&travelDateEnd=${travelDateEnd}&peopleCount=${peopleCount}` +
        `&unitPrice=${unitPrice}&versionName=${versionName}&periodCode=${periodCode}`
    });
  },

  goCreatorDetail() {
    if (!this.data.creator) {
      return;
    }

    wx.navigateTo({
      url: `/pkg/explore/creator-detail/index?slug=${this.data.creator.slug}`
    });
  },

  onDestinationTap(event) {
    const slug = event.currentTarget.dataset.slug;
    wx.navigateTo({
      url: `/pkg/explore/destination-detail/index?slug=${slug}`
    });
  },

  async toggleFavorite() {
    const user = await getCurrentUser();
    if (!user) {
      showFavoriteNotice(this, {
        label: "您还没有登录，请登录后再收藏",
        actionLabel: "去登录",
        mode: "warning",
        actionType: "login"
      });
      return;
    }

    const favorited = await toggleFavorite("services", this.data.service.slug);
    this.setData({
      "service.isFavorited": favorited
    });
    if (favorited) {
      showFavoriteNotice(this);
      return;
    }

    clearFavoriteNotice(this);
  },

  goFavorites() {
    wx.navigateTo({
      url: "/pkg/account/favorites/index"
    });
  },

  handleFavoriteNoticeAction() {
    const actionType = this.data.favoriteNoticeActionType;
    clearFavoriteNotice(this, "favoriteNoticeState");
    if (actionType === "login") {
      goTopLevel(TOP_LEVEL_ROUTES.profile);
      return;
    }

    this.goFavorites();
  },

  handleCheckoutNoticeAction() {
    clearFavoriteNotice(this, "checkoutNoticeState");
    goTopLevel(TOP_LEVEL_ROUTES.profile);
  },

  async ensureGalleryData() {
    if (this.data.galleryLoaded) {
      return {
        mediaTabs: this.data.mediaTabs || [],
        photoTotal: this.data.photoTotal || 0
      };
    }

    if (!this.data.service || !this.data.service.slug) {
      return null;
    }

    if (!this.galleryRequestPromise) {
      this.setData({
        galleryLoading: true
      });

      this.galleryRequestPromise = getServiceGalleryData(this.data.service.slug)
        .then((payload) => {
          if (!this.isPageActive || !payload) {
            return payload;
          }

          const hasStructuredGallery = Boolean(payload.hasGalleryGroups);
          const mediaTabs = normalizeMediaTabs(payload.mediaTabs, hasStructuredGallery);
          const imageCount = mediaTabs.flatMap((item) => item.images || []).filter(Boolean).length;
          const galleryPreviewState = buildGalleryPreviewState(
            this.data.photoGallery,
            this.data.heroCover,
            mediaTabs,
            this.data.activeGalleryTabIndex,
            hasStructuredGallery,
            Number(payload.photoTotal) || this.data.photoTotal || imageCount
          );

          this.setData({
            mediaTabs,
            galleryHero: galleryPreviewState.galleryHero || this.data.galleryHero,
            galleryHeroMode: galleryPreviewState.galleryHeroMode,
            galleryThumbs: galleryPreviewState.galleryThumbs,
            galleryTabs: galleryPreviewState.galleryTabs,
            hasStructuredGallery,
            activeGalleryTabIndex: galleryPreviewState.activeGalleryTabIndex,
            activeMediaTabIndex: galleryPreviewState.activeGalleryTabIndex,
            mediaSheetTabIntoView: getMediaTabAnchor(galleryPreviewState.activeGalleryTabIndex),
            currentGalleryLabel: galleryPreviewState.currentGalleryLabel,
            currentGalleryTotal: galleryPreviewState.currentGalleryTotal,
            galleryCounterText: galleryPreviewState.galleryCounterText,
            galleryLayoutClass: galleryPreviewState.galleryLayoutClass,
            photoGallery: galleryPreviewState.photoGallery,
            galleryLoaded: true,
            galleryLoading: false,
            photoTotal: Number(payload.photoTotal) || this.data.photoTotal || imageCount
          });

          return {
            mediaTabs,
            photoTotal: Number(payload.photoTotal) || imageCount
          };
        })
        .catch((error) => {
          console.error("Failed to load service gallery", error);
          if (this.isPageActive) {
            this.setData({
              galleryLoading: false
            });
          }
          return null;
        })
        .finally(() => {
          this.galleryRequestPromise = null;
        });
    }

    return this.galleryRequestPromise;
  },

  async ensureGalleryOriginalData() {
    if (this.data.galleryOriginalLoaded) {
      return {
        mediaTabs: this.data.galleryOriginalTabs || [],
        photoTotal: this.data.photoTotal || 0
      };
    }

    if (!this.data.service || !this.data.service.slug) {
      return null;
    }

    if (!this.galleryOriginalRequestPromise) {
      this.setData({
        galleryOriginalLoading: true
      });

      this.galleryOriginalRequestPromise = getServiceGalleryOriginalData(this.data.service.slug)
        .then((payload) => {
          if (!this.isPageActive || !payload) {
            return payload;
          }

          const mediaTabs = normalizeMediaTabs(payload.mediaTabs, Boolean(payload.hasGalleryGroups));

          this.setData({
            galleryOriginalTabs: mediaTabs,
            galleryOriginalLoaded: true,
            galleryOriginalLoading: false,
            photoTotal: Number(payload.photoTotal) || this.data.photoTotal
          });

          return {
            mediaTabs,
            photoTotal: Number(payload.photoTotal) || this.data.photoTotal
          };
        })
        .catch((error) => {
          console.error("Failed to load service gallery originals", error);
          if (this.isPageActive) {
            this.setData({
              galleryOriginalLoading: false
            });
          }
          return null;
        })
        .finally(() => {
          this.galleryOriginalRequestPromise = null;
        });
    }

    return this.galleryOriginalRequestPromise;
  },

  openMediaSheet() {
    if (!(this.data.photoTotal || this.data.galleryHero)) {
      return;
    }
    this.setData(
      {
        mediaSheetVisible: true,
        mediaSheetAnimating: false,
        mediaSheetTabIntoView: getMediaTabAnchor(this.data.activeMediaTabIndex)
      },
      () => {
        setTimeout(() => {
          this.setData({
            mediaSheetAnimating: true
          });
        }, 20);
      }
    );

    this.ensureGalleryData();
  },

  closeMediaSheet() {
    if (!this.data.mediaSheetVisible) {
      return;
    }
    this.setData({
      mediaSheetAnimating: false
    });
    setTimeout(() => {
      this.setData({
        mediaSheetVisible: false
      });
    }, 260);
  },

  onMediaTabChange(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isNaN(index)) {
      this.setData({
        activeMediaTabIndex: index,
        mediaSheetTabIntoView: getMediaTabAnchor(index)
      });
    }
  },

  onGalleryTabTap(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (Number.isNaN(index)) {
      return;
    }

    const galleryPreviewState = buildGalleryPreviewState(
      this.data.photoGallery,
      this.data.heroCover,
      this.data.mediaTabs,
      index,
      this.data.hasStructuredGallery,
      this.data.photoTotal
    );

    this.setData({
      galleryHero: galleryPreviewState.galleryHero,
      galleryHeroMode: galleryPreviewState.galleryHeroMode,
      galleryThumbs: galleryPreviewState.galleryThumbs,
      galleryTabs: galleryPreviewState.galleryTabs,
      activeGalleryTabIndex: galleryPreviewState.activeGalleryTabIndex,
      activeMediaTabIndex: galleryPreviewState.activeGalleryTabIndex,
      mediaSheetTabIntoView: getMediaTabAnchor(galleryPreviewState.activeGalleryTabIndex),
      currentGalleryLabel: galleryPreviewState.currentGalleryLabel,
      currentGalleryTotal: galleryPreviewState.currentGalleryTotal,
      galleryCounterText: galleryPreviewState.galleryCounterText,
      galleryLayoutClass: galleryPreviewState.galleryLayoutClass,
      photoGallery: galleryPreviewState.photoGallery
    });
  },

  onMediaImageTap(event) {
    const tabIndex = Number(event.currentTarget.dataset.tabIndex);
    const imageIndex = Number(event.currentTarget.dataset.imageIndex);
    const mediaTabs = Array.isArray(this.data.mediaTabs) ? this.data.mediaTabs : [];
    const tab = mediaTabs[tabIndex];
    if (!tab) {
      return;
    }

    this.ensureGalleryOriginalData().then((galleryData) => {
      const originalTabs = galleryData && Array.isArray(galleryData.mediaTabs)
        ? galleryData.mediaTabs
        : [];
      const originalTab = originalTabs[tabIndex];
      const previewUrls = Array.isArray(originalTab && originalTab.images)
        ? originalTab.images.filter(Boolean)
        : Array.isArray(tab.images)
          ? tab.images.filter(Boolean)
          : [];
      if (!previewUrls.length) {
        return;
      }

      const safeIndex = Number.isFinite(imageIndex)
        ? Math.max(0, Math.min(imageIndex, previewUrls.length - 1))
        : 0;
      wx.previewImage({
        current: previewUrls[safeIndex] || previewUrls[0],
        urls: previewUrls
      });
    });
  },

  onGalleryAreaTap() {
    if (!(this.data.galleryHero || this.data.photoGallery.length)) {
      return;
    }
    this.openMediaSheet();
  }
});
