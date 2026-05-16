Component({
  options: {
    addGlobalClass: true
  },
  properties: {
    journey: {
      type: Object,
      value: {}
    },
    compact: {
      type: Boolean,
      value: false
    },
    variant: {
      type: String,
      value: "image"
    },
    customExample: {
      type: Boolean,
      value: false
    }
  },
  data: {
    summaryOverflow: false
  },
  observers: {
    "journey.summary, variant": function observeSummary() {
      this.queueSummaryMeasurement();
    }
  },
  lifetimes: {
    ready() {
      this.queueSummaryMeasurement();
    },
    detached() {
      clearTimeout(this.summaryMeasureTimer);
    }
  },
  methods: {
    queueSummaryMeasurement() {
      clearTimeout(this.summaryMeasureTimer);
      const journey = this.properties.journey || {};
      if (this.properties.variant !== "image" || !journey.summary) {
        if (this.data.summaryOverflow) {
          this.setData({
            summaryOverflow: false
          });
        }
        return;
      }

      this.summaryMeasureTimer = setTimeout(() => {
        this.measureSummaryOverflow();
      }, 80);
    },

    measureSummaryOverflow() {
      const journey = this.properties.journey || {};
      if (this.properties.variant !== "image" || !journey.summary) {
        return;
      }

      const query = this.createSelectorQuery();
      query.select(".journey-route-card__summary-measurer").boundingClientRect();
      query.select(".journey-route-card__summary-line-probe").boundingClientRect();
      query.exec((result) => {
        const fullRect = Array.isArray(result) ? result[0] : null;
        const lineRect = Array.isArray(result) ? result[1] : null;
        if (!fullRect || !lineRect || !lineRect.height) {
          return;
        }

        const maxCollapsedHeight = lineRect.height * 5;
        const summaryOverflow = fullRect.height > maxCollapsedHeight + 1;
        if (summaryOverflow !== this.data.summaryOverflow) {
          this.setData({
            summaryOverflow
          });
        }
      });
    },

    handleSummaryToggle() {
      const journey = this.properties.journey || {};
      this.triggerEvent("summarytoggle", {
        slug: journey.slug || "",
        expanded: !journey.summaryExpanded
      });
    },

    handleTap(event) {
      const journey = this.properties.journey || {};
      const mark = event && event.mark ? event.mark : {};
      const targetDataset = event && event.target && event.target.dataset ? event.target.dataset : {};
      const currentDataset = event && event.currentTarget && event.currentTarget.dataset ? event.currentTarget.dataset : {};
      const action = mark.action || targetDataset.action || currentDataset.action || "";
      const departureDate = mark.departureDate || targetDataset.departureDate || currentDataset.departureDate || "";

      if (action === "departure" && departureDate) {
        this.triggerEvent("departuretap", {
          slug: journey.slug || "",
          departureDate
        });
        return;
      }

      this.triggerEvent("cardtap", {
        slug: journey.slug || ""
      });
    }
  }
});
