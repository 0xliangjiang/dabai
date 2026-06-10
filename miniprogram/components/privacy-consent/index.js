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

    // 同意按钮同时绑定 bindtap 和 agreePrivacyAuthorization：
    // 系统有挂起的隐私授权请求时走后者，普通主动弹窗时走前者，需去重
    onAgree() {
      if (this._agreedOnce) return;
      this._agreedOnce = true;
      setTimeout(() => {
        this._agreedOnce = false;
      }, 600);
      this.triggerEvent("agree");
    },

    onReject() {
      this.triggerEvent("reject");
    },

    noop() {}
  }
});
