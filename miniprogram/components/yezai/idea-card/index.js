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
        slug: this.properties.idea.slug,
        sourceType: this.properties.idea.sourceType,
        wechatArticleUrl: this.properties.idea.wechatArticleUrl,
        wechatArticleTitle: this.properties.idea.wechatArticleTitle,
        title: this.properties.idea.title
      });
    }
  }
});
