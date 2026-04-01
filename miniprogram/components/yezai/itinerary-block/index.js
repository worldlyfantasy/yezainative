const MODULE_META = {
  schedule: {
    title: "当日行程",
    icon: "schedule"
  },
  transport: {
    title: "交通",
    icon: "transport"
  },
  meals: {
    title: "餐食",
    icon: "meals"
  },
  accommodation: {
    title: "住宿",
    icon: "accommodation"
  },
  tips: {
    title: "温馨提示",
    icon: "tips"
  },
  meal: {
    title: "餐食",
    icon: "meals"
  },
  note: {
    title: "温馨提示",
    icon: "tips"
  },
  stay: {
    title: "住宿",
    icon: "accommodation"
  },
  gear: {
    title: "装备建议",
    icon: "gear"
  },
  terrain: {
    title: "地形提醒",
    icon: "terrain"
  },
  support: {
    title: "补给说明",
    icon: "support"
  }
};

const MODULE_TITLE_TYPE_MAP = {
  "当日行程": "schedule",
  "行程": "schedule",
  "交通": "transport",
  "餐食": "meals",
  "住宿": "accommodation",
  "提示": "tips",
  "温馨提示": "tips"
};

const MODULE_TYPE_ALIASES = {
  meal: "meals",
  note: "tips",
  stay: "accommodation"
};

function resolveModuleType(module) {
  const rawType = typeof module.type === "string" ? module.type.trim() : "";
  if (MODULE_TYPE_ALIASES[rawType]) {
    return MODULE_TYPE_ALIASES[rawType];
  }
  if (MODULE_META[rawType]) {
    return rawType;
  }

  const rawTitle = typeof module.title === "string" ? module.title.trim() : "";
  if (MODULE_TITLE_TYPE_MAP[rawTitle]) {
    return MODULE_TITLE_TYPE_MAP[rawTitle];
  }

  return rawType || "default";
}

function normalizeModule(module, dayKey, index) {
  const normalizedType = resolveModuleType(module);
  const meta = MODULE_META[normalizedType] || {};
  return Object.assign({}, module, {
    key: module.key || `${dayKey}-module-${index + 1}`,
    displayTitle: module.title || meta.title || "行程信息",
    iconType: meta.icon || normalizedType || "default",
    type: normalizedType
  });
}

function normalizeDay(day, index) {
  const dayNumber = day.day || index + 1;
  const key = day.key || `day-${dayNumber}`;
  const modules = Array.isArray(day.modules) ? day.modules : [];
  return Object.assign({}, day, {
    key,
    dayLabel: `D${dayNumber}`,
    modules: modules.map((module, moduleIndex) => normalizeModule(module, key, moduleIndex))
  });
}

Component({
  options: {
    addGlobalClass: true
  },
  properties: {
    itinerary: {
      type: Object,
      value: null,
      observer(itinerary) {
        this.initializeItinerary(itinerary);
      }
    }
  },
  data: {
    normalizedDays: [],
    activeDayKey: "",
    scrollIntoView: "",
    dayOffsets: [],
    isAutoScrolling: false
  },
  lifetimes: {
    ready() {
      this.initializeItinerary(this.properties.itinerary);
    },
    detached() {
      if (this.dayScrollTimer) {
        clearTimeout(this.dayScrollTimer);
      }
    }
  },
  methods: {
    initializeItinerary(itinerary) {
      const days = Array.isArray(itinerary && itinerary.days) ? itinerary.days : [];
      const normalizedDays = days.map(normalizeDay);
      const firstKey = normalizedDays[0] ? normalizedDays[0].key : "";
      this.setData(
        {
          normalizedDays,
          activeDayKey: firstKey,
          scrollIntoView: firstKey ? `itinerary-day-${firstKey}` : "",
          dayOffsets: [],
          isAutoScrolling: false
        },
        () => {
          this.measureDayOffsets();
        }
      );
    },

    measureDayOffsets() {
      if (!this.data.normalizedDays.length) return;
      const query = this.createSelectorQuery();
      query.select(".itinerary-block__content").boundingClientRect();
      query.selectAll(".itinerary-day-card").boundingClientRect();
      query.exec((res) => {
        const containerRect = res[0];
        const dayRects = res[1] || [];
        if (!containerRect || !dayRects.length) return;
        const dayOffsets = dayRects.map((rect, index) => ({
          key: this.data.normalizedDays[index].key,
          top: rect.top - containerRect.top
        }));
        this.setData({ dayOffsets });
      });
    },

    onDayTap(event) {
      const key = event.currentTarget.dataset.key;
      if (!key) return;
      if (this.dayScrollTimer) {
        clearTimeout(this.dayScrollTimer);
      }
      this.setData({
        activeDayKey: key,
        scrollIntoView: `itinerary-day-${key}`,
        isAutoScrolling: true
      });
      this.dayScrollTimer = setTimeout(() => {
        this.setData({ isAutoScrolling: false });
      }, 360);
    },

    onContentScroll(event) {
      if (this.data.isAutoScrolling) return;
      const scrollTop = event.detail.scrollTop || 0;
      if (!this.data.dayOffsets.length) {
        this.measureDayOffsets();
        return;
      }
      const currentTop = scrollTop + 28;
      let activeKey = this.data.dayOffsets[0].key;
      this.data.dayOffsets.forEach((offset) => {
        if (currentTop >= offset.top) {
          activeKey = offset.key;
        }
      });
      if (activeKey !== this.data.activeDayKey) {
        this.setData({ activeDayKey: activeKey });
      }
    }
  }
});
