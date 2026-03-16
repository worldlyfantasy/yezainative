Component({
  options: {
    addGlobalClass: true
  },
  properties: {
    creator: {
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
        slug: this.properties.creator.slug
      });
    }
  }
});
