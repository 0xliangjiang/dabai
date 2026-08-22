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
    messages: [{
      id: "welcome",
      role: "assistant",
      content: "告诉我今天的运动目标，我会先确认账号、绑定和会员状态，再为你完成设置。"
    }],
    inputText: "",
    inputFocused: false,
    chatLoading: false,
    scrollToMessage: "",
    suggestions: [
      { label: "10,000", unit: "步", caption: "今日常用", text: "今天运动目标 10000 步" },
      { label: "20,000", unit: "步", caption: "进阶目标", text: "目标设为 20000 步" },
      { label: "设置其他目标", caption: "输入任意步数", text: "设置今天运动目标", custom: true }
    ]
  },

  async onShow() {
    syncTabBar(this);
    if (!(await this.ensureSportsEnabled())) return;
    await this.loadAccount();
  },

  async ensureSportsEnabled() {
    try {
      const config = await api.request("/api/app-config");
      const enabled = config.sportsEnabled !== false;
      getApp().globalData.sportsEnabled = enabled;
      if (enabled) return true;
      wx.switchTab({ url: "/pages/home/index" });
      return false;
    } catch (_error) {
      return getApp().globalData.sportsEnabled !== false;
    }
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

  handleChatInput(event) {
    this.setData({ inputText: event.detail.value });
  },

  handleComposerFocus() {
    this.setData({ inputFocused: true });
  },

  handleComposerBlur() {
    this.setData({ inputFocused: false });
  },

  handleSuggestionTap(event) {
    const text = String(event.currentTarget.dataset.text || "").trim();
    if (text) this.sendChatMessage(text);
  },

  async sendChatMessage(overrideText) {
    if (this.data.chatLoading) return;
    const text = typeof overrideText === "string"
      ? overrideText.trim()
      : String(this.data.inputText || "").trim();
    if (!text) return;

    const history = this.data.messages.slice(-10).map((message) => ({
      role: message.role,
      content: message.content
    }));
    const userMessage = { id: `user-${Date.now()}`, role: "user", content: text };
    const messages = [...this.data.messages, userMessage];
    this.setData({
      messages,
      inputText: "",
      chatLoading: true,
      scrollToMessage: userMessage.id
    });

    try {
      await api.ensureLogin();
      const result = await api.request("/api/sports/chat", {
        method: "POST",
        timeout: 120000,
        data: { message: text, history }
      });
      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: result.reply || "我暂时没有理解，请换一种说法。",
        success: result.action === "steps_updated"
      };
      this.setData({
        messages: [...this.data.messages, assistantMessage],
        scrollToMessage: assistantMessage.id
      });
      if (result.action === "steps_updated") {
        wx.showToast({ title: "今日目标设置成功", icon: "success" });
      } else if (result.action === "bind_required" && !this.data.binding) {
        await this.handleBindTap();
      }
    } catch (error) {
      const assistantMessage = {
        id: `assistant-error-${Date.now()}`,
        role: "assistant",
        content: (error && error.error) || "处理失败，请稍后重试。"
      };
      this.setData({
        messages: [...this.data.messages, assistantMessage],
        scrollToMessage: assistantMessage.id
      });
    } finally {
      this.setData({ chatLoading: false });
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
