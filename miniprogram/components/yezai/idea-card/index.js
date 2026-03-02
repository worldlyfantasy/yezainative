Component({
  options: {
    addGlobalClass: true
  },
  properties: {
    idea: {
      type: Object,
      value: {}
    },
    authorName: {
      type: String,
      value: ""
    }
  },
  methods: {
    handleTap() {
      this.triggerEvent("cardtap", {
        slug: this.properties.idea.slug
      });
    }
  }
});
