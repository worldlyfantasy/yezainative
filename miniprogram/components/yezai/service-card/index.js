Component({
  options: {
    addGlobalClass: true
  },
  properties: {
    service: {
      type: Object,
      value: {}
    },
    creatorName: {
      type: String,
      value: ""
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
