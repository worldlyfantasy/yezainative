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
    },
    disabled: {
      type: Boolean,
      value: false
    },
    loading: {
      type: Boolean,
      value: false
    },
    loadingText: {
      type: String,
      value: "处理中..."
    }
  },
  methods: {
    handleTap() {
      if (this.properties.disabled || this.properties.loading) {
        return;
      }

      this.triggerEvent("actiontap");
    }
  }
});
