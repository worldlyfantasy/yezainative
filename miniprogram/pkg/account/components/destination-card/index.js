Component({
  options: {
    addGlobalClass: true
  },
  properties: {
    destination: {
      type: Object,
      value: {}
    },
    showDivider: {
      type: Boolean,
      value: true
    }
  },
  methods: {
    handleTap() {
      this.triggerEvent("cardtap", {
        slug: this.properties.destination.slug
      });
    }
  }
});
