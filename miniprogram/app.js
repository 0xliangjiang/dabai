// 按运行环境切换接口地址：develop=开发版，trial=体验版，release=正式版
// 上线前把 trial/release 替换为已备案的 HTTPS 域名，并在微信后台配置 request 合法域名
const API_BASE_URLS = {
  develop: "https://dabai.discordbot.cn",
  trial: "https://dabai.discordbot.cn",
  release: "https://dabai.discordbot.cn"
};

App({
  globalData: {
    apiBaseUrl: API_BASE_URLS.develop,
    launchScene: 0,
    singlePageMode: false,
    pendingInviter: ""
  },

  onLaunch(options) {
    const envVersion = wx.getAccountInfoSync?.().miniProgram?.envVersion || "develop";
    this.globalData.apiBaseUrl = API_BASE_URLS[envVersion] || API_BASE_URLS.release;
    this.updateLaunchContext(options);
    this.setupUpdateManager();

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

  setupUpdateManager() {
    if (!wx.getUpdateManager) return;
    const updateManager = wx.getUpdateManager();
    updateManager.onUpdateReady(() => {
      wx.showModal({
        title: "新版本已准备好",
        content: "重启小程序即可使用最新功能。",
        confirmText: "立即重启",
        cancelText: "稍后",
        success: (result) => {
          if (result.confirm) updateManager.applyUpdate();
        }
      });
    });
    updateManager.onUpdateFailed(() => {
      console.warn("小程序新版本下载失败，将在下次启动时重试");
    });
  },

  onShow(options) {
    this.updateLaunchContext(options);
    this.routeInvitedGuest();
  },

  updateLaunchContext(options) {
    const scene = Number(options && options.scene) || 0;
    this.globalData.launchScene = scene;
    this.globalData.singlePageMode = scene === 1154;
    this.captureInviter(options);
  },

  // 二级分销：进入小程序时从启动 query 捕获邀请人，暂存本地，登录时绑定。
  // 仅在「本地还没有」时写入，避免后续普通进入覆盖；已登录用户不再捕获（老用户不绑定）。
  captureInviter(options) {
    const query = (options && options.query) || {};
    const inviter = normalizeInviter(query.inviter || query.scene);
    if (!inviter) return;
    try {
      if (wx.getStorageSync("token")) return;
      const pending = wx.getStorageSync("pending_inviter");
      const firstInviter = pending || this.globalData.pendingInviter || inviter;
      this.globalData.pendingInviter = firstInviter;
      if (!pending) wx.setStorageSync("pending_inviter", firstInviter);
    } catch (_e) {
      // 朋友圈 1154 单页模式下部分存储能力不可用，先保存在当前运行上下文。
      if (!this.globalData.pendingInviter) this.globalData.pendingInviter = inviter;
    }
  },

  routeInvitedGuest() {
    if (this.globalData.singlePageMode || this.routingInvitedGuest) return;
    let token = "";
    let inviter = this.globalData.pendingInviter || "";
    try {
      token = wx.getStorageSync("token") || "";
      inviter = wx.getStorageSync("pending_inviter") || inviter;
    } catch (_e) {
      // 使用当前运行上下文中的邀请参数。
    }
    if (token || !inviter) return;

    this.routingInvitedGuest = true;
    setTimeout(() => {
      const current = getCurrentPages().pop();
      if (current && current.route === "pages/invite/index") {
        this.routingInvitedGuest = false;
        return;
      }
      wx.reLaunch({
        url: `/pages/invite/index?inviter=${encodeURIComponent(inviter)}`,
        complete: () => {
          this.routingInvitedGuest = false;
        }
      });
    }, 0);
  },

  resolvePrivacy(agreed) {
    if (this.privacyResolve) {
      this.privacyResolve({ event: agreed ? "agree" : "disagree" });
      this.privacyResolve = null;
    }
  }
});

function normalizeInviter(value) {
  if (!value) return "";
  let decoded = String(value);
  try {
    decoded = decodeURIComponent(decoded);
  } catch (_error) {
    // 使用微信传入的原值。
  }
  return /^[A-Za-z0-9_-]{1,32}$/.test(decoded) ? decoded : "";
}
