const { syncTabBar } = require("../../utils/tabbar");
const api = require("../../utils/api");

Page({
  data: {
    isBound: false,
    account: null,
    membershipExpiresAt: "",
    binding: false,
    dialogVisible: false,
    dialogStage: "",
    captchaImage: "",
    captchaCode: "",
    qrcodeImage: "",
    bindingMessage: "",
    bindingError: "",
    suggestions: [
      "总结本周运动",
      "帮我安排恢复日",
      "分析最近的跑步节奏"
    ]
  },

  async onShow() {
    syncTabBar(this);
    await this.loadAccount();
  },

  async loadAccount() {
    try {
      await api.ensureLogin();
      const result = await api.request("/api/sports/account");
      this.applyAccount(result);
    } catch (error) {
      console.warn("加载运动账号失败", error);
    }
  },

  applyAccount(result) {
    this.setData({
      isBound: Boolean(result && result.isBound),
      account: result && result.account ? result.account : null,
      membershipExpiresAt: formatDate(result && result.membershipExpiresAt)
    });
  },

  async handleBindTap() {
    if (this.data.binding) return;
    if (this.data.isBound) {
      wx.showToast({ title: "账号已绑定", icon: "success" });
      return;
    }
    this.setData({ binding: true, bindingError: "" });
    try {
      await api.ensureLogin();
      const result = await api.request("/api/sports/bind/start", { method: "POST", timeout: 180000 });
      this.openBindingResult(result);
    } catch (error) {
      this.showBindingError(error, "暂时无法开始绑定");
    } finally {
      this.setData({ binding: false });
    }
  },

  handleCaptchaInput(event) {
    this.setData({ captchaCode: event.detail.value.trim(), bindingError: "" });
  },

  async submitCaptcha() {
    if (this.data.binding) return;
    if (!this.data.captchaCode) {
      this.setData({ bindingError: "请输入图片中的验证码" });
      return;
    }
    this.setData({ binding: true, bindingError: "" });
    try {
      const result = await api.request("/api/sports/bind/captcha", {
        method: "POST",
        timeout: 60000,
        data: { code: this.data.captchaCode }
      });
      this.openBindingResult(result);
    } catch (error) {
      this.showBindingError(error, "账号创建失败，请重试");
    } finally {
      this.setData({ binding: false });
    }
  },

  async refreshBinding() {
    if (this.data.binding) return;
    this.setData({ binding: true, bindingError: "" });
    try {
      const result = await api.request("/api/sports/bind/refresh", { method: "POST", timeout: 30000 });
      this.applyAccount(result);
      if (result.isBound) {
        this.closeBindingDialog();
        wx.showToast({ title: "绑定成功", icon: "success" });
        return;
      }
      this.openBindingResult(result);
    } catch (error) {
      this.showBindingError(error, "检查绑定状态失败");
    } finally {
      this.setData({ binding: false });
    }
  },

  openBindingResult(result) {
    this.applyAccount(result);
    this.setData({
      dialogVisible: Boolean(result && result.action),
      dialogStage: result.action || "",
      captchaImage: result.captchaImage || "",
      captchaCode: "",
      qrcodeImage: result.qrcodeImage || "",
      bindingMessage: result.message || "",
      bindingError: ""
    });
  },

  showBindingError(error, fallback) {
    this.setData({
      dialogVisible: true,
      bindingError: (error && error.error) || fallback
    });
  },

  closeBindingDialog() {
    if (this.data.binding) return;
    this.setData({
      dialogVisible: false,
      dialogStage: "",
      captchaImage: "",
      captchaCode: "",
      qrcodeImage: "",
      bindingMessage: "",
      bindingError: ""
    });
  },

  noop() {
    // 阻止弹层打开时页面跟随滚动。
  }
});

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
