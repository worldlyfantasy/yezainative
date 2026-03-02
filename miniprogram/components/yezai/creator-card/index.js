Component({
  options: {
    addGlobalClass: true
  },
  properties: {
    creator: {
      type: Object,
      value: {}
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
