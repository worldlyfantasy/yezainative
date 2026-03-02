Component({
  options: {
    addGlobalClass: true
  },
  properties: {
    text: {
      type: String,
      value: ""
    },
    value: {
      type: String,
      value: ""
    },
    variant: {
      type: String,
      value: "primary"
    }
  },
  methods: {
    onTap() {
      this.triggerEvent("buttontap", {
        value: this.properties.value
      });
    }
  }
});
