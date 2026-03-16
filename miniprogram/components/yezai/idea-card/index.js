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
    },
    showDivider: {
      type: Boolean,
      value: true
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
