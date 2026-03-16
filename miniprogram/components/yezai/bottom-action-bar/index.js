Component({
  options: {
    addGlobalClass: true
  },
  properties: {
    labelText: {
      type: String,
      value: "参考金额"
    },
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
