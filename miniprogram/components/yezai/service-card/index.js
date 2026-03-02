Component({
  options: {
    addGlobalClass: true
  },
  data: {
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
    linkText: {
      type: String,
      value: "查看这段路"
    }
  },
  observers: {
    "service, hideDurationInPrice"(service, hideDurationInPrice) {
      const rawPrice = service && service.price ? service.price : "";
      const resolvedPrice = hideDurationInPrice
        ? rawPrice.replace(/\s*\/\s*\S+\s*$/, "")
        : rawPrice;

      this.setData({
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
