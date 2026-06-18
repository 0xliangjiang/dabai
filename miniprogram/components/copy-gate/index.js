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
    }
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
      } catch (_error) {
        wx.showToast({ title: "登录失败，请重试", icon: "none" });
      } finally {
        this.setData({ loggingIn: false });
      }
    },

    onChooseAvatar(event) {
      this.setData({ draftAvatarTemp: event.detail.avatarUrl });
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
      this.triggerEvent("close");
    },

    stopProp() {}
  }
});

function toDisplayUrl(url) {
  if (!url) return "";
  return url.startsWith("/") ? `${getApp().globalData.apiBaseUrl}${url}` : url;
}
