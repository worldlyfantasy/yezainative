const { getCreatorsPageData } = require("../../repositories/content-repository");
const {
  ROUTE_TYPE_ORDER,
  buildRouteTypeIconUrl,
  buildRouteTypeSelectedIconUrl,
  normalizeRouteTypeLabel
} = require("../../constants/journey");
const {
  getDestinationRegionLabel
} = require("../../constants/destination-region");
const {
  enablePageShareMenus,
  createAddToFavorites,
  createShareAppMessage,
  createShareTimeline
} = require("../../utils/share");
const MAX_CREATOR_TAGS = 3;
const MAX_GRID_CREATOR_TAGS = 2;
const STYLE_SHEET_SELECTION_FEEDBACK_DELAY_MS = 110;
const REGION_SCOPE_TABS = [
  { key: "domestic", label: "国内" },
  { key: "international", label: "国际" }
];
const VALID_REGION_SCOPES = new Set(REGION_SCOPE_TABS.map((item) => item.key));

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatCreatorCountText(count) {
  const safeCount = Math.max(0, Number(count) || 0);
  return `${safeCount} 位创作者`;
}

function normalizeRegionScope(scope) {
  const normalized = normalizeText(scope);
  return VALID_REGION_SCOPES.has(normalized) ? normalized : "domestic";
}

function getRegionScopeByCode(regionCode) {
  return normalizeText(regionCode).startsWith("intl_") ? "international" : "domestic";
}

function buildRegionScopeTabs(activeScope) {
  const normalizedActiveScope = normalizeRegionScope(activeScope);
  return REGION_SCOPE_TABS.map((item) => Object.assign({}, item, {
    active: item.key === normalizedActiveScope
  }));
}

function splitIntoColumns(list, size) {
  const source = ensureArray(list);
  const columnSize = Math.max(1, Number(size) || 1);
  const columns = [];

  for (let index = 0; index < source.length; index += columnSize) {
    columns.push(source.slice(index, index + columnSize));
  }

  return columns;
}

function decorateCreator(creator) {
  return Object.assign({}, creator, {
    displayTags: ensureArray(creator && creator.tags).slice(0, MAX_CREATOR_TAGS),
    gridDisplayTags: ensureArray(creator && creator.tags).slice(0, MAX_GRID_CREATOR_TAGS)
  });
}

function decorateCreators(creators) {
  return ensureArray(creators).map((creator) => decorateCreator(creator));
}

Page({
  data: {
    loading: true,
    errorText: "",
    regionOptions: [{ label: "全部", value: "" }],
    regionLabels: ["全部"],
    styleOptions: [{ label: "全部", value: "" }],
    styleLabels: ["全部"],
    creators: [],
    routeTriggerDots: [1, 2, 3, 4],
    selectedRegionCode: "",
    selectedRegionLabel: "",
    selectedStyle: "",
    selectedStyleIcon: "",
    selectedStyleLabel: "",
    visibleStyleOptions: [],
    regionScopeTabs: buildRegionScopeTabs("domestic"),
    activeRegionScope: "domestic",
    regionSheetColumns: [],
    isStyleSheetVisible: false,
    isStyleSheetAnimating: false,
    isRegionSheetVisible: false,
    isRegionSheetAnimating: false
  },

  async onLoad(options) {
    enablePageShareMenus();

    this.setData({
      loading: true,
      errorText: ""
    });

    try {
      const initialFilters = {
        style: options.style || "",
        regionCode: options.regionCode || options.region || ""
      };
      const payload = await getCreatorsPageData(initialFilters);

      this.setData(
        Object.assign({}, payload, this.buildFilterState(payload, initialFilters), {
          loading: false,
          errorText: "",
          creators: decorateCreators(payload.creators)
        })
      );
    } catch (error) {
      console.error("Failed to load creators page", error);
      this.setData({
        loading: false,
        errorText: "创作者列表加载失败，请稍后重试。"
      });
    }
  },

  normalizeSelectedValue(list, value) {
    const normalizedValue = normalizeText(value);
    if (!normalizedValue) {
      return "";
    }

    return ensureArray(list).some((item) => normalizeText(item && item.value) === normalizedValue)
      ? normalizedValue
      : "";
  },

  buildStyleSheetOptions(styleOptions, selectedStyle) {
    const availableSet = new Set(
      ensureArray(styleOptions)
        .map((item) => normalizeRouteTypeLabel(item && item.value))
        .filter(Boolean)
    );
    const normalizedSelectedStyle = normalizeRouteTypeLabel(selectedStyle);
    const styleCards = ROUTE_TYPE_ORDER.map((tag) => ({
      key: tag,
      value: tag,
      label: tag,
      icon: buildRouteTypeIconUrl(tag),
      selectedIcon: buildRouteTypeSelectedIconUrl(tag),
      available: availableSet.has(tag),
      selected: tag === normalizedSelectedStyle
    }));

    return styleCards
      .filter((item) => item.available)
      .concat(styleCards.filter((item) => !item.available));
  },

  buildRegionSheetColumns(regionOptions, selectedRegionCode, regionScope) {
    const activeRegionScope = normalizeRegionScope(regionScope);
    const regionCards = ensureArray(regionOptions)
      .filter((item) => normalizeText(item && item.value))
      .filter((item) => getRegionScopeByCode(item && item.value) === activeRegionScope)
      .map((item) => {
        const value = normalizeText(item && item.value);
        const count = Math.max(0, Number(item && item.count) || 0);
        return {
          key: value,
          value,
          label: normalizeText(item && item.label),
          image: normalizeText(item && item.image),
          count,
          countText: formatCreatorCountText(count),
          available: count > 0,
          selected: value === selectedRegionCode
        };
      });

    return splitIntoColumns(regionCards, 2);
  },

  buildFilterState(payload, filters) {
    const normalizedStyle = this.normalizeSelectedValue(payload && payload.styleOptions, filters && filters.style);
    const normalizedRegionCode = this.normalizeSelectedValue(payload && payload.regionOptions, filters && filters.regionCode);
    const selectedStyleLabel = normalizedStyle || "";
    const selectedRegionLabel = getDestinationRegionLabel(normalizedRegionCode);
    const activeRegionScope = normalizedRegionCode
      ? getRegionScopeByCode(normalizedRegionCode)
      : normalizeRegionScope(this.data.activeRegionScope);

    return {
      selectedStyle: normalizedStyle,
      selectedStyleIcon: normalizedStyle ? buildRouteTypeIconUrl(normalizedStyle) : "",
      selectedStyleLabel,
      selectedRegionCode: normalizedRegionCode,
      selectedRegionLabel,
      visibleStyleOptions: this.buildStyleSheetOptions(payload && payload.styleOptions, normalizedStyle),
      activeRegionScope,
      regionScopeTabs: buildRegionScopeTabs(activeRegionScope),
      regionSheetColumns: this.buildRegionSheetColumns(payload && payload.regionOptions, normalizedRegionCode, activeRegionScope)
    };
  },

  resolveFilters(patch) {
    const nextPatch = patch || {};
    return {
      style: Object.prototype.hasOwnProperty.call(nextPatch, "style")
        ? normalizeRouteTypeLabel(nextPatch.style)
        : this.data.selectedStyle,
      regionCode: Object.prototype.hasOwnProperty.call(nextPatch, "regionCode")
        ? normalizeText(nextPatch.regionCode)
        : this.data.selectedRegionCode
    };
  },

  async applyFilters(patch) {
    this.setData({
      loading: true,
      errorText: ""
    });

    const filters = this.resolveFilters(patch);
    try {
      const payload = await getCreatorsPageData(filters);
      this.setData(Object.assign({}, payload, this.buildFilterState(payload, filters), {
        loading: false,
        errorText: "",
        creators: decorateCreators(payload.creators)
      }));
    } catch (error) {
      console.error("Failed to filter creators", error);
      this.setData({
        loading: false,
        errorText: "筛选结果加载失败，请稍后重试。"
      });
    }
  },

  getShareImageUrl() {
    const creators = this.data.creators || [];
    return (creators[0] && creators[0].avatar) || "";
  },

  onShareAppMessage() {
    return createShareAppMessage({
      title: "野哉创作者｜人物",
      pagePath: "/pages/creators/index",
      imageUrl: this.getShareImageUrl()
    });
  },

  onShareTimeline() {
    return createShareTimeline({
      title: "野哉创作者｜人物",
      imageUrl: this.getShareImageUrl()
    });
  },

  onAddToFavorites() {
    return createAddToFavorites({
      title: "野哉创作者｜人物",
      imageUrl: this.getShareImageUrl()
    });
  },

  openStyleSheet() {
    if (this.data.isStyleSheetVisible) {
      return;
    }

    if (this.data.loading) {
      wx.showToast({
        title: "人物加载中，请稍候",
        icon: "none"
      });
      return;
    }

    if (this.data.errorText) {
      wx.showToast({
        title: "请先重新加载人物",
        icon: "none"
      });
      return;
    }

    this.setData(
      {
        isRegionSheetVisible: false,
        isRegionSheetAnimating: false,
        isStyleSheetVisible: true,
        isStyleSheetAnimating: false
      },
      () => {
        setTimeout(() => {
          this.setData({
            isStyleSheetAnimating: true
          });
        }, 20);
      }
    );
  },

  closeStyleSheet() {
    if (!this.data.isStyleSheetVisible) {
      return;
    }

    this.setData({
      isStyleSheetAnimating: false
    });
    setTimeout(() => {
      this.setData({
        isStyleSheetVisible: false
      });
    }, 240);
  },

  openRegionSheet() {
    if (this.data.isRegionSheetVisible) {
      return;
    }

    if (this.data.loading) {
      wx.showToast({
        title: "人物加载中，请稍候",
        icon: "none"
      });
      return;
    }

    if (this.data.errorText) {
      wx.showToast({
        title: "请先重新加载人物",
        icon: "none"
      });
      return;
    }

    const activeRegionScope = this.data.selectedRegionCode
      ? getRegionScopeByCode(this.data.selectedRegionCode)
      : normalizeRegionScope(this.data.activeRegionScope);
    this.setData(
      {
        isStyleSheetVisible: false,
        isStyleSheetAnimating: false,
        isRegionSheetVisible: true,
        isRegionSheetAnimating: false,
        activeRegionScope,
        regionScopeTabs: buildRegionScopeTabs(activeRegionScope),
        regionSheetColumns: this.buildRegionSheetColumns(this.data.regionOptions, this.data.selectedRegionCode, activeRegionScope)
      },
      () => {
        setTimeout(() => {
          this.setData({
            isRegionSheetAnimating: true
          });
        }, 20);
      }
    );
  },

  closeRegionSheet() {
    if (!this.data.isRegionSheetVisible) {
      return;
    }

    this.setData({
      isRegionSheetAnimating: false
    });
    setTimeout(() => {
      this.setData({
        isRegionSheetVisible: false
      });
    }, 240);
  },

  onRegionScopeTabTap(event) {
    const activeRegionScope = normalizeRegionScope(event.currentTarget.dataset.scope);
    if (activeRegionScope === this.data.activeRegionScope) {
      return;
    }

    this.setData({
      activeRegionScope,
      regionScopeTabs: buildRegionScopeTabs(activeRegionScope),
      regionSheetColumns: this.buildRegionSheetColumns(this.data.regionOptions, this.data.selectedRegionCode, activeRegionScope)
    });
  },

  async onStyleTap(event) {
    const style = normalizeRouteTypeLabel(event.currentTarget.dataset.value);
    const styleOption = (this.data.visibleStyleOptions || []).find((item) => item && item.value === style);
    if (!style || !styleOption || !styleOption.available) {
      return;
    }

    const nextStyle = style === this.data.selectedStyle ? "" : style;
    this.setData({
      selectedStyle: nextStyle,
      selectedStyleIcon: nextStyle ? buildRouteTypeIconUrl(nextStyle) : "",
      selectedStyleLabel: nextStyle,
      visibleStyleOptions: (this.data.visibleStyleOptions || []).map((item) => Object.assign({}, item, {
        selected: item && item.value === nextStyle
      }))
    });

    await wait(STYLE_SHEET_SELECTION_FEEDBACK_DELAY_MS);
    await this.applyFilters({
      style: nextStyle
    });
    this.closeStyleSheet();
  },

  async onRegionTap(event) {
    const regionCode = normalizeText(event.currentTarget.dataset.region);
    const regionOptions = ensureArray(this.data.regionSheetColumns)
      .reduce((result, column) => result.concat(ensureArray(column)), []);
    const regionOption = regionOptions
      .find((item) => item && item.value === regionCode);
    if (!regionCode || !regionOption || (!regionOption.available && !regionOption.selected)) {
      return;
    }

    await this.applyFilters({
      regionCode: regionCode === this.data.selectedRegionCode ? "" : regionCode
    });
    this.closeRegionSheet();
  },

  async clearSelectedStyle() {
    if (!this.data.selectedStyle) {
      return;
    }

    await this.applyFilters({
      style: ""
    });
  },

  async clearSelectedRegion() {
    if (!this.data.selectedRegionCode) {
      return;
    }

    await this.applyFilters({
      regionCode: ""
    });
  },

  onCreatorTap(event) {
    wx.navigateTo({
      url: `/pkg/explore/creator-detail/index?slug=${event.detail.slug}`
    });
  }
});
