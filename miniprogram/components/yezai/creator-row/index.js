Component({
  options: {
    addGlobalClass: true
  },
  properties: {
    avatar: {
      type: String,
      value: ""
    },
    name: {
      type: String,
      value: ""
    },
    description: {
      type: String,
      value: ""
    },
    descriptors: {
      type: Array,
      value: []
    },
    meta: {
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
      this.triggerEvent("rowtap", {
        value: this.properties.value
      });
    }
  }
});
