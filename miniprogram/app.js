// 按运行环境切换接口地址：develop=开发版，trial=体验版，release=正式版
// 上线前把 trial/release 替换为已备案的 HTTPS 域名，并在微信后台配置 request 合法域名
const API_BASE_URLS = {
  develop: "https://dabai.discordbot.cn",
  trial: "https://dabai.discordbot.cn",
  release: "https://dabai.discordbot.cn"
};

App({
  globalData: {
    apiBaseUrl: API_BASE_URLS.develop
  },

  onLaunch() {
    const envVersion = wx.getAccountInfoSync?.().miniProgram?.envVersion || "develop";
    this.globalData.apiBaseUrl = API_BASE_URLS[envVersion] || API_BASE_URLS.release;

    // 系统级隐私授权请求（如直接调用隐私接口时触发）：交给当前页面的同意弹窗处理
    if (wx.onNeedPrivacyAuthorization) {
      wx.onNeedPrivacyAuthorization((resolve) => {
        this.privacyResolve = resolve;
        const page = getCurrentPages().pop();
        if (page && page.data.showPrivacy !== undefined) {
          page.setData({ showPrivacy: true });
        }
      });
    }
  },

  resolvePrivacy(agreed) {
    if (this.privacyResolve) {
      this.privacyResolve({ event: agreed ? "agree" : "disagree" });
      this.privacyResolve = null;
    }
  }
});
