Component({
  options: {
    addGlobalClass: true
  },
  properties: {
    destination: {
      type: Object,
      value: {}
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
