Component({
  options: {
    addGlobalClass: true
  },
  properties: {
    text: {
      type: String,
      value: ""
    },
    indent: {
      type: Boolean,
      value: false
    },
    tone: {
      type: String,
      value: "default"
    }
  }
});
