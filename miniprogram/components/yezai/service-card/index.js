Component({
  options: {
    addGlobalClass: true
  },
  data: {
    coverBackgroundStyle: "",
    resolvedPrice: ""
  },
  properties: {
    service: {
      type: Object,
      value: {}
    },
    creatorName: {
      type: String,
      value: ""
    },
    hideDurationInPrice: {
      type: Boolean,
      value: false
    },
    showTags: {
      type: Boolean,
      value: true
    },
    showSummary: {
      type: Boolean,
      value: true
    },
    showCreator: {
      type: Boolean,
      value: true
    },
    showCover: {
      type: Boolean,
      value: true
    },
    compact: {
      type: Boolean,
      value: false
    },
    linkText: {
      type: String,
      value: "查看这段路"
    },
    linkVariant: {
      type: String,
      value: "text"
    }
  },
  observers: {
    "service, compact, hideDurationInPrice"(service, compact, hideDurationInPrice) {
      const rawPrice = service && service.priceLabel ? service.priceLabel : "";
      const resolvedPrice = hideDurationInPrice
        ? rawPrice.replace(/\s*\/\s*\S+\s*$/, "")
        : rawPrice;
      const coverBackgroundStyle = compact
        ? (service && (service.coverSquareBackgroundStyle || service.coverBackgroundStyle)) || ""
        : (service && (service.coverCardBackgroundStyle || service.coverBackgroundStyle)) || "";

      this.setData({
        coverBackgroundStyle,
        resolvedPrice
      });
    }
  },
  methods: {
    handleTap() {
      this.triggerEvent("cardtap", {
        slug: this.properties.service.slug
      });
    }
  }
});
