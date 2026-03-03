const { getServiceDetailData } = require("../../services/content");
const { goTopLevel, TOP_LEVEL_ROUTES } = require("../../services/navigation");
const { toggleFavorite } = require("../../services/favorites");
const { clearFavoriteNotice, showFavoriteNotice } = require("../../utils/favorite-notice");

const SECTION_SCROLL_DURATION = 320;

function getMonthLabel(dateStr) {
  const m = new Date(dateStr).getMonth() + 1;
  return `${m}月`;
}

function getUniqueVersions(periods) {
  const set = new Set((periods || []).map((p) => p.versionName));
  return Array.from(set);
}

function getMonthsFromPeriods(periods) {
  const set = new Set((periods || []).map((p) => getMonthLabel(p.dateStart)));
  return Array.from(set).sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    return na - nb;
  });
}

function filterPeriodsByVersionAndMonth(periods, version, monthLabel) {
  if (!periods || !version || !monthLabel) return [];
  const monthNum = parseInt(monthLabel, 10);
  return periods.filter((p) => {
    if (p.versionName !== version) return false;
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
      title: "退订规则",
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

Page({
  data: {
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
    creator: null,
    relatedDestinations: [],
    heroCover: "",
    photoGallery: [],
    photoTotal: 0,
    mediaTabs: [],
    activeMediaTabIndex: 0,
    mediaSheetVisible: false,
    mediaSheetAnimating: false,
    groupPeriods: [],
    selectedPeriodId: null,
    periodSheetVisible: false,
    periodSheetAnimating: false,
    periodSheetVersions: [],
    periodSheetSelectedVersion: "",
    periodSheetMonths: [],
    periodSheetActiveMonth: "",
    periodSheetDates: [],
    periodSheetSelectedDateId: null,
    periodSheetPeople: 1,
    periodSheetGroupHint: "",
    periodSheetTotalPrice: 0,
    periodSheetDepartureLabel: "",
    periodSheetDateRange: "",
    periodSheetStatusText: ""
  },

  onLoad(options) {
    this.pageScrollTop = 0;
    const payload = getServiceDetailData(options.slug);
    if (!payload) {
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
    const detailState = buildTravelDetailState(payload.travelDetail);

    this.setData(
      Object.assign(
        {
          service: payload.service,
          creator: payload.creator,
          relatedDestinations: payload.relatedDestinations || [],
          heroCover: payload.heroCover || "",
          photoGallery: payload.photoGallery || [],
          photoTotal: payload.photoTotal || 0,
          mediaTabs: payload.mediaTabs || [],
          groupPeriods,
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
      url: `/pages/destination-detail/index?slug=${destinationSlug}`
    });
  },

  onTagTap(event) {
    const key = event.currentTarget.dataset.key;
    if (key === "suggestedAge") {
      wx.showToast({ title: "建议年龄说明", icon: "none" });
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
    const versions = getUniqueVersions(this.data.groupPeriods);
    const months = getMonthsFromPeriods(this.data.groupPeriods);
    const version = period.versionName;
    const monthLabel = getMonthLabel(period.dateStart);
    const dates = filterPeriodsByVersionAndMonth(this.data.groupPeriods, version, monthLabel);
    const meetingTag = (this.data.service.tags || []).find((t) => t.key === "meetingPoint");
    const departureLabel = meetingTag ? `${meetingTag.value}出发` : "集合酒店出发";
    const hint =
      period.minGroup && period.remainingSeats != null
        ? `${period.minGroup}人成行/当期余位${period.remainingSeats}人`
        : "";
    this.setData({
      selectedPeriodId: period.id,
      periodSheetVisible: true,
      periodSheetAnimating: false,
      periodSheetVersions: versions,
      periodSheetSelectedVersion: version,
      periodSheetMonths: months,
      periodSheetActiveMonth: monthLabel,
      periodSheetDates: dates,
      periodSheetSelectedDateId: period.id,
      periodSheetPeople: 1,
      periodSheetGroupHint: hint,
      periodSheetTotalPrice: period.price * 1,
      periodSheetDepartureLabel: departureLabel,
      periodSheetDateRange: `${period.dateStart} ~ ${period.dateEnd}`,
      periodSheetStatusText: period.statusText
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

  onSelectVersion(event) {
    const version = event.currentTarget.dataset.version;
    const month = this.data.periodSheetActiveMonth;
    const dates = filterPeriodsByVersionAndMonth(this.data.groupPeriods, version, month);
    const first = dates[0];
    this.setData({
      periodSheetSelectedVersion: version,
      periodSheetDates: dates,
      periodSheetSelectedDateId: first ? first.id : null,
      periodSheetGroupHint:
        first && first.minGroup && first.remainingSeats != null
          ? `${first.minGroup}人成行/当期余位${first.remainingSeats}人`
          : "",
      periodSheetTotalPrice: first ? first.price * this.data.periodSheetPeople : 0,
      periodSheetDateRange: first ? `${first.dateStart} ~ ${first.dateEnd}` : "",
      periodSheetStatusText: first ? first.statusText : ""
    });
  },

  onSelectMonth(event) {
    const month = event.currentTarget.dataset.month;
    const version = this.data.periodSheetSelectedVersion;
    const dates = filterPeriodsByVersionAndMonth(this.data.groupPeriods, version, month);
    const first = dates[0];
    this.setData({
      periodSheetActiveMonth: month,
      periodSheetDates: dates,
      periodSheetSelectedDateId: first ? first.id : null,
      periodSheetGroupHint:
        first && first.minGroup && first.remainingSeats != null
          ? `${first.minGroup}人成行/当期余位${first.remainingSeats}人`
          : "",
      periodSheetTotalPrice: first ? first.price * this.data.periodSheetPeople : 0,
      periodSheetDateRange: first ? `${first.dateStart} ~ ${first.dateEnd}` : "",
      periodSheetStatusText: first ? first.statusText : ""
    });
  },

  onSelectSheetDate(event) {
    const period = event.currentTarget.dataset.date;
    if (!period) return;
    this.setData({
      periodSheetSelectedDateId: period.id,
      periodSheetGroupHint:
        period.minGroup && period.remainingSeats != null
          ? `${period.minGroup}人成行/当期余位${period.remainingSeats}人`
          : "",
      periodSheetTotalPrice: period.price * this.data.periodSheetPeople,
      periodSheetDateRange: `${period.dateStart} ~ ${period.dateEnd}`,
      periodSheetStatusText: period.statusText
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

  goToCheckout() {
    const selected = this.data.periodSheetDates.find((d) => d.id === this.data.periodSheetSelectedDateId);
    if (!selected) {
      wx.showToast({ title: "请选择出发日期", icon: "none" });
      return;
    }
    this.closePeriodSheet();
    const slug = this.data.service.slug;
    const travelDate = selected.dateStart;
    const peopleCount = this.data.periodSheetPeople;
    const unitPrice = selected.price;
    const versionName = selected.versionName ? encodeURIComponent(selected.versionName) : "";
    wx.navigateTo({
      url: `/pages/checkout/index?slug=${slug}&travelDate=${travelDate}&peopleCount=${peopleCount}&unitPrice=${unitPrice}&versionName=${versionName}`
    });
  },

  goCreatorDetail() {
    if (!this.data.creator) {
      return;
    }

    wx.navigateTo({
      url: `/pages/creator-detail/index?slug=${this.data.creator.slug}`
    });
  },

  onDestinationTap(event) {
    const slug = event.currentTarget.dataset.slug;
    wx.navigateTo({
      url: `/pages/destination-detail/index?slug=${slug}`
    });
  },

  toggleFavorite() {
    const favorited = toggleFavorite("services", this.data.service.slug);
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
      url: "/pages/favorites/index"
    });
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
