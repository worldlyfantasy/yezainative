const { getServiceDetailData } = require("../../../repositories/content-repository");
const { getServiceDetailPageConfig } = require("../../../repositories/config-repository");
const { isFavorited, toggleFavorite } = require("../../../repositories/transaction-repository");
const { getCurrentUser } = require("../../../services/user");
const { goTopLevel, TOP_LEVEL_ROUTES } = require("../../../services/navigation");
const { clearFavoriteNotice, showFavoriteNotice } = require("../utils/favorite-notice");
const { isAuditMode, pickAuditText } = require("../../../utils/audit");

const SECTION_SCROLL_DURATION = 320;

function calcDurationLabelFromDates(dateStart, dateEnd) {
  if (!dateStart || !dateEnd) return "";
  const start = new Date(dateStart);
  const end = new Date(dateEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
  const diff = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  if (!Number.isFinite(diff) || diff <= 0) return "";
  const days = diff;
  const nights = Math.max(days - 1, 0);
  return nights > 0 ? `${days}天${nights}晚` : `${days}天`;
}

function calcDurationLabel(payload, travelDetail) {
  const durationTag = String((payload && payload.service && payload.service.durationTag) || "").trim();
  if (durationTag) return durationTag;

  const firstPeriod = (payload && payload.groupPeriods && payload.groupPeriods[0]) || null;
  if (firstPeriod) {
    const fromPeriod = calcDurationLabelFromDates(firstPeriod.dateStart, firstPeriod.dateEnd);
    if (fromPeriod) return fromPeriod;
  }

  const itineraryDays = travelDetail && travelDetail.itinerary && Array.isArray(travelDetail.itinerary.days)
    ? travelDetail.itinerary.days.length
    : 0;
  if (itineraryDays > 0) {
    const nights = Math.max(itineraryDays - 1, 0);
    return nights > 0 ? `${itineraryDays}天${nights}晚` : `${itineraryDays}天`;
  }

  return "行程待确认";
}

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
      title: pickAuditText("退订规则", "变更说明"),
      rows: (costs.refundRules || []).map((item) => ({
        label: item.days,
        content: item.percent
      }))
    }
  ].filter((group) => group.rows.length);
}

function buildTravelDetailState(travelDetail) {
  if (!travelDetail) {
    return {
      travelDetail: null,
      costTableGroups: [],
      activeSectionKey: ""
    };
  }

  const sections = Array.isArray(travelDetail.sections)
    ? travelDetail.sections.filter((item) => item && item.key && item.anchorId)
    : [];

  return {
    travelDetail: Object.assign({}, travelDetail, {
      sections
    }),
    costTableGroups: buildCostTableGroups(travelDetail.costs),
    activeSectionKey: sections[0] ? sections[0].key : ""
  };
}

function getCreatorQuoteText(service, travelDetail) {
  const source = travelDetail && travelDetail.overview && travelDetail.overview.whyJoinText
    ? String(travelDetail.overview.whyJoinText)
    : "";
  const firstParagraph = source.split(/\n\s*\n/)[0].trim();
  if (firstParagraph) {
    return firstParagraph;
  }

  return String(service && service.summary ? service.summary : "").trim();
}

Page({
  data: {
    loading: true,
    auditMode: isAuditMode(),
    service: null,
    travelDetail: null,
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
    photoGallery: [],
    photoTotal: 0,
    mediaTabs: [],
    activeMediaTabIndex: 0,
    mediaSheetVisible: false,
    mediaSheetAnimating: false,
    consultSheetVisible: false,
    consultSheetAnimating: false,
    consultWeChatQr: "",
    consultGroupQr: "",
    consultSheetTitle: "",
    consultCardLabel: "",
    consultCardDesc: "",
    consultFollowupNote: "",
    suitableSheetVisible: false,
    suitableSheetAnimating: false,
    suitableSheetContent: "",
    groupPeriods: [],
    selectedPeriodId: null,
    periodSheetVisible: false,
    periodSheetAnimating: false,
    periodSheetMonths: [],
    periodSheetActiveMonth: "",
    periodSheetDates: [],
    periodSheetSelectedDateId: null,
    periodSheetPeople: 1,
    periodSheetTotalPrice: 0,
    timelineTitleText: "",
    refundTitleText: "",
    serviceNoticeTitle: "",
    serviceNoticeBody: ""
  },

  async onLoad(options) {
    this.pageScrollTop = 0;

    try {
      const [payload, pageConfig] = await Promise.all([
        getServiceDetailData(options.slug),
        getServiceDetailPageConfig()
      ]);
      if (!payload) {
        this.setData({ loading: false });
        wx.showToast({
          title: "未找到服务",
          icon: "none"
        });

        setTimeout(() => {
          goTopLevel(TOP_LEVEL_ROUTES.destinations);
        }, 300);
        return;
      }

      const groupPeriods = Array.isArray(payload.groupPeriods) ? payload.groupPeriods : [];
      const originalService = payload.service || {};
      const detailState = buildTravelDetailState(payload.travelDetail);

      const durationTag = {
        key: "duration",
        label: "行程时间",
        value: calcDurationLabel(payload, detailState.travelDetail),
        clickable: true
      };
      const consultationTag = {
        key: "consultation",
        label: "报名咨询",
        value: "路线专属客服",
        clickable: true
      };
      const mappedTags = [durationTag, consultationTag].filter(Boolean);
      const favorited = await isFavorited("services", originalService.slug);
      const serviceWithTags = Object.assign({}, originalService, {
        isFavorited: favorited,
        tags: mappedTags
      });

      this.setData(
        Object.assign(
          {
            loading: false,
            service: serviceWithTags,
            creator: payload.creator,
            creatorQuoteText: getCreatorQuoteText(originalService, detailState.travelDetail),
            relatedDestinations: payload.relatedDestinations || [],
            heroCover: payload.heroCover || "",
            photoGallery: payload.photoGallery || [],
            photoTotal: payload.photoTotal || 0,
            mediaTabs: payload.mediaTabs || [],
            groupPeriods,
            consultWeChatQr: pageConfig.consultWeChatQr,
            consultGroupQr: pageConfig.consultGroupQr,
            consultSheetTitle: pageConfig.consultSheetTitle,
            consultCardLabel: pageConfig.consultCardLabel,
            consultCardDesc: pageConfig.consultCardDesc,
            consultFollowupNote: pageConfig.consultFollowupNote,
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
          detailState
        ),
        () => {
          if (detailState.travelDetail) {
            this.scheduleMeasureTravelDetailLayout();
          }
        }
      );
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
    if (this.autoScrollTimer) {
      clearTimeout(this.autoScrollTimer);
    }
    if (this.sectionMeasureTimer) {
      clearTimeout(this.sectionMeasureTimer);
    }
    clearFavoriteNotice(this, "favoriteNoticeState", true);
    clearFavoriteNotice(this, "checkoutNoticeState", true);
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

  goBack() {
    const destinationSlug = this.data.service.destinationSlugs[0];
    wx.redirectTo({
      url: `/pkg/explore/destination-detail/index?slug=${destinationSlug}`
    });
  },

  onTagTap(event) {
    const key = event.currentTarget.dataset.key;
    if (key === "suggestedAge") {
      wx.showToast({ title: "建议年龄说明", icon: "none" });
      return;
    }
    if (key === "duration") {
      this.onSectionTabTap({
        detail: {
          key: "itinerary"
        }
      });
      return;
    }
    if (key === "consultation") {
      this.openConsultSheet();
      return;
    }
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
    const months = getMonthsFromPeriods(this.data.groupPeriods);
    const monthLabel = getMonthLabel(period.dateStart);
    const dates = filterPeriodsByMonth(this.data.groupPeriods, monthLabel);
    this.setData({
      selectedPeriodId: period.id,
      periodSheetVisible: true,
      periodSheetAnimating: false,
      periodSheetMonths: months,
      periodSheetActiveMonth: monthLabel,
      periodSheetDates: dates,
      periodSheetSelectedDateId: period.id,
      periodSheetPeople: 1,
      periodSheetTotalPrice: period.price * 1
    });
    setTimeout(() => {
      this.setData({ periodSheetAnimating: true });
    }, 20);
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

  onSelectMonth(event) {
    const month = event.currentTarget.dataset.month;
    const dates = filterPeriodsByMonth(this.data.groupPeriods, month);
    const first = dates[0];
    this.setData({
      periodSheetActiveMonth: month,
      periodSheetDates: dates,
      periodSheetSelectedDateId: first ? first.id : null,
      periodSheetTotalPrice: first ? first.price * this.data.periodSheetPeople : 0
    });
  },

  onSelectSheetDate(event) {
    const period = event.currentTarget.dataset.date;
    if (!period) return;
    this.setData({
      periodSheetSelectedDateId: period.id,
      periodSheetTotalPrice: period.price * this.data.periodSheetPeople
    });
  },

  increaseSheetPeople() {
    const n = this.data.periodSheetPeople + 1;
    const selected = this.data.periodSheetDates.find((d) => d.id === this.data.periodSheetSelectedDateId);
    const price = selected ? selected.price * n : 0;
    this.setData({
      periodSheetPeople: n,
      periodSheetTotalPrice: price
    });
  },

  decreaseSheetPeople() {
    if (this.data.periodSheetPeople <= 1) return;
    const n = this.data.periodSheetPeople - 1;
    const selected = this.data.periodSheetDates.find((d) => d.id === this.data.periodSheetSelectedDateId);
    const price = selected ? selected.price * n : 0;
    this.setData({
      periodSheetPeople: n,
      periodSheetTotalPrice: price
    });
  },

  async goToCheckout() {
    const selected = this.data.periodSheetDates.find((d) => d.id === this.data.periodSheetSelectedDateId);
    if (!selected) {
      wx.showToast({ title: "请选择出发日期", icon: "none" });
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
    const peopleCount = this.data.periodSheetPeople;
    const unitPrice = selected.price;
    const versionName = selected.versionName ? encodeURIComponent(selected.versionName) : "";
    const periodCode = selected.periodCode || selected.id || "";
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

  openMediaSheet() {
    if (!this.data.mediaTabs || !this.data.mediaTabs.length) {
      return;
    }
    this.setData(
      {
        mediaSheetVisible: true,
        mediaSheetAnimating: false
      },
      () => {
        setTimeout(() => {
          this.setData({
            mediaSheetAnimating: true
          });
        }, 20);
      }
    );
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
        activeMediaTabIndex: index
      });
    }
  }
});
