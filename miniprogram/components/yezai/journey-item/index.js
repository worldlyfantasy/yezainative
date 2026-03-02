Component({
  options: {
    addGlobalClass: true
  },
  properties: {
    cover: {
      type: String,
      value: ""
    },
    eyebrow: {
      type: String,
      value: ""
    },
    title: {
      type: String,
      value: ""
    },
    description: {
      type: String,
      value: ""
    },
    meta: {
      type: String,
      value: ""
    },
    extra: {
      type: String,
      value: ""
    },
    tail: {
      type: String,
      value: ""
    },
    value: {
      type: String,
      value: ""
    }
  },
  methods: {
    onTap() {
      this.triggerEvent("itemtap", {
        value: this.properties.value
      });
    }
  }
});
