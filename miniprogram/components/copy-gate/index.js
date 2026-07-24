const { getCurrentUser, getToken, loginWithWechat, request, uploadFile } = require("../../utils/api");
const { hasConsent, setConsent } = require("../../utils/privacy");

Component({
  properties: {
    show: {
      type: Boolean,
      value: false,
      observer(value) {
        // 每次打开时按当前登录态/资料计算从哪一步进入
        if (value) this.resolvePhase();
      }
    },
    // copy = 复制前拦截（可关闭）；onboarding = 首次进入登录+昵称硬门槛
    mode: { type: String, value: "copy" },
    // 是否允许关闭：onboarding 硬门槛传 false，遮罩点击/取消都无效
    dismissible: { type: Boolean, value: true }
  },

  data: {
    phase: "login", // privacy | login | profile
    draftNickname: "",
    draftAvatarTemp: "",
    draftAvatarUrl: "",
    displayAvatar: "",
    loggingIn: false,
    saving: false
  },

  methods: {
    // 计算当前该停在哪一步；全齐则直接放行
    resolvePhase() {
      if (!hasConsent()) {
        this.setData({ phase: "privacy" });
        return;
      }
      if (!getToken()) {
        this.setData({ phase: "login" });
        return;
      }
      const user = getCurrentUser();
      if (!user || !user.nickname) {
        this.setData({
          phase: "profile",
          draftNickname: (user && user.nickname) || "",
          draftAvatarUrl: (user && user.avatarUrl) || "",
          draftAvatarTemp: "",
          displayAvatar: toDisplayUrl((user && user.avatarUrl) || "")
        });
        return;
      }
      // 资料齐全（理论上调用方已拦过，这里兜底）
      this.triggerEvent("pass");
    },

    onPrivacyAgree() {
      setConsent();
      // 隐私授权可能是系统挂起的请求，确认放行
      if (getApp().resolvePrivacy) getApp().resolvePrivacy(true);
      this.resolvePhase();
    },

    onPrivacyReject() {
      if (getApp().resolvePrivacy) getApp().resolvePrivacy(false);
      wx.showToast({ title: "同意后才能继续", icon: "none" });
    },

    async onLogin() {
      if (this.data.loggingIn) return;
      this.setData({ loggingIn: true });
      try {
        await loginWithWechat();
        this.resolvePhase();
      } catch (error) {
        console.error("[copy-gate login] 失败:", error);
        const detail = (error && (error.errMsg || error.error || error.message)) || "";
        wx.showModal({
          title: "登录失败",
          content: detail || "请重试；若多次失败请联系客服",
          showCancel: false
        });
      } finally {
        this.setData({ loggingIn: false });
      }
    },

    onChooseAvatar(event) {
      this.setData({ draftAvatarTemp: event.detail.avatarUrl });
    },

    onAvatarError() {
      this.setData({ displayAvatar: "", draftAvatarTemp: "" });
    },

    onNicknameInput(event) {
      this.setData({ draftNickname: event.detail.value });
    },

    async onSave() {
      if (this.data.saving) return;
      const nickname = this.data.draftNickname.trim();
      if (!nickname) {
        wx.showToast({ title: "请填写昵称", icon: "none" });
        return;
      }
      this.setData({ saving: true });
      try {
        let avatarUrl = this.data.draftAvatarUrl;
        if (this.data.draftAvatarTemp) {
          const upload = await uploadFile("/api/uploads/avatar", this.data.draftAvatarTemp);
          avatarUrl = upload.url || avatarUrl;
        }
        const payload = { nickname };
        if (avatarUrl) payload.avatarUrl = avatarUrl;
        const { user } = await request("/api/users/me/profile", { method: "POST", data: payload });
        wx.setStorageSync("user", user);
        this.triggerEvent("pass");
      } catch (error) {
        wx.showToast({ title: (error && error.error) || "保存失败，请重试", icon: "none" });
      } finally {
        this.setData({ saving: false });
      }
    },

    onMaskTap() {
      // 硬门槛（不可关闭）下，点遮罩/取消无效，必须完成
      if (!this.properties.dismissible) return;
      this.triggerEvent("close");
    },

    stopProp() {}
  }
});

function toDisplayUrl(url) {
  if (!url) return "";
  return url.startsWith("/") ? `${getApp().globalData.apiBaseUrl}${url}` : url;
}
