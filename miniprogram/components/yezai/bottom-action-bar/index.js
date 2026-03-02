Component({
  options: {
    addGlobalClass: true
  },
  properties: {
    priceText: {
      type: String,
      value: ""
    },
    buttonText: {
      type: String,
      value: ""
    }
  },
  methods: {
    handleTap() {
      this.triggerEvent("actiontap");
    }
  }
});
