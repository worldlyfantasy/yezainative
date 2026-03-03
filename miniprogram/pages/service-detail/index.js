const { getServiceDetailData } = require("../../services/content");
const { goTopLevel, TOP_LEVEL_ROUTES } = require("../../services/navigation");
const { toggleFavorite } = require("../../services/favorites");
const { clearFavoriteNotice, showFavoriteNotice } = require("../../utils/favorite-notice");

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

Page({
  data: {
    service: null,
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
    this.setData({
      service: payload.service,
      creator: payload.creator,
      relatedDestinations: payload.relatedDestinations || [],
      heroCover: payload.heroCover || "",
      photoGallery: payload.photoGallery || [],
      photoTotal: payload.photoTotal || 0,
      mediaTabs: payload.mediaTabs || [],
      groupPeriods
    });
  },

  onUnload() {
    clearFavoriteNotice(this, "favoriteNoticeState", true);
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
      periodSheetGroupHint: first && first.minGroup && first.remainingSeats != null
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
      periodSheetGroupHint: first && first.minGroup && first.remainingSeats != null
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
      periodSheetGroupHint: period.minGroup && period.remainingSeats != null
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
    wx.navigateTo({
      url: `/pages/checkout/index?slug=${slug}&travelDate=${travelDate}&peopleCount=${peopleCount}&unitPrice=${unitPrice}`
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
    const index = event.currentTarget.dataset.index;
    if (typeof index === "number") {
      this.setData({
        activeMediaTabIndex: index
      });
    }
  }
});
