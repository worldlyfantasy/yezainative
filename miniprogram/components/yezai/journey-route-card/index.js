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
    }
  },
  methods: {
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
