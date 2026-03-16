Component({
  options: {
    addGlobalClass: true
  },
  properties: {
    order: {
      type: Object,
      value: {}
    }
  },
  methods: {
    handleTap() {
      this.triggerEvent("cardtap", {
        id: this.properties.order.id
      });
    }
  }
});
