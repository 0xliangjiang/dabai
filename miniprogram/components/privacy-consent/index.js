Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    openPrivacy() {
      wx.navigateTo({ url: "/pages/privacy/index" });
    },

    openAgreement() {
      wx.navigateTo({ url: "/pages/agreement/index" });
    },

    onAgree() {
      this.triggerEvent("agree");
    },

    onReject() {
      this.triggerEvent("reject");
    },

    noop() {}
  }
});
