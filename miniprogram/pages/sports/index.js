const { syncTabBar } = require("../../utils/tabbar");
const api = require("../../utils/api");
const { inviterSuffix, inviterQuery } = require("../../utils/share");

Page({
  data: {
    isBound: false,
    account: null,
    membershipExpiresAt: "",
    membershipExpired: false,
    sportsInviteRewardDays: 3,
    rewardedVideoAdUnitId: "",
    virtualPaymentProducts: [],
    membershipDialogVisible: false,
    paymentLoadingProductId: "",
    adLoading: false,
    adStepGrantToken: "",
    pendingExpiredMessage: "",
    codeExpanded: false,
    accessCode: "",
    codeRedeeming: false,
    todayTargetSteps: "",
    binding: false,
    dialogVisible: false,
    dialogStage: "",
    captchaImage: "",
    captchaCode: "",
    qrcodeImage: "",
    bindingMessage: "",
    bindingError: "",
    messages: [],
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
    await this.reconcilePendingVirtualPayment();
  },

  async ensureSportsEnabled() {
    try {
      const config = await api.getAppConfig();
      const enabled = config.sportsEnabled !== false;
      const virtualPaymentProducts = Array.isArray(config.sportsVirtualPaymentProducts)
        ? config.sportsVirtualPaymentProducts
            .filter((item) => item.productId !== "sports_member_quarter")
            .map((item) => ({
              ...item,
              priceText: (Number(item.priceCents) / 100).toFixed(2),
              durationText: item.permanent ? "永久有效" : `增加 ${item.durationDays} 天`
            }))
        : [];
      this.setData({
        sportsInviteRewardDays: Number(config.sportsInviteRewardDays) || 3,
        rewardedVideoAdUnitId: String(config.sportsRewardedVideoAdUnitId || ""),
        virtualPaymentProducts,
        membershipDialogVisible: virtualPaymentProducts.length
          ? this.data.membershipDialogVisible
          : false
      });
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
      membershipExpiresAt: formatDate(result && result.membershipExpiresAt),
      membershipExpired: isMembershipExpired(result && result.membershipExpiresAt),
      todayTargetSteps: formatSteps(
        result && (result.todayTargetSteps != null ? result.todayTargetSteps : result.lastTargetSteps)
      )
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

  async sendChatMessage(overrideText, options = {}) {
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
    const accessGrantToken = options.accessGrantToken || this.data.adStepGrantToken;
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
        data: {
          message: text,
          history,
          ...(accessGrantToken ? { accessGrantToken } : {})
        }
      });
      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: result.reply || "我暂时没有理解，请换一种说法。",
        success: result.action === "steps_updated" || result.action === "access_code_redeemed"
      };
      this.setData({
        messages: [...this.data.messages, assistantMessage],
        scrollToMessage: assistantMessage.id
      });
      if (result.action === "steps_updated") {
        this.setData({
          todayTargetSteps: formatSteps(result.steps),
          adStepGrantToken: "",
          pendingExpiredMessage: ""
        });
        wx.showToast({ title: "今日目标设置成功", icon: "success" });
      } else if (result.action === "access_code_redeemed") {
        // 先用兑换响应立即更新顶部状态，再拉取账号作为服务端权威值。
        this.setData({ membershipExpiresAt: formatDate(result.membershipExpiresAt) });
        await this.loadAccount();
        wx.showToast({ title: "会员有效期已更新", icon: "success" });
      } else if (result.action === "bind_required" && !this.data.binding) {
        await this.handleBindTap();
      } else if (result.action === "membership_expired") {
        this.setData({ membershipExpired: true, pendingExpiredMessage: text });
      } else if (result.action === "ad_grant_invalid") {
        this.setData({ adStepGrantToken: "" });
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

  async handleWatchAd() {
    if (this.data.adLoading) return;
    if (this.data.adStepGrantToken) {
      wx.showToast({ title: "已解锁，输入目标即可", icon: "none" });
      return;
    }
    if (!this.data.rewardedVideoAdUnitId || !wx.createRewardedVideoAd) {
      wx.showModal({
        title: "广告暂未开放",
        content: "广告位尚未配置，可先输入卡密或邀请好友增加使用天数。",
        showCancel: false,
        confirmText: "知道了"
      });
      return;
    }
    this.setData({ adLoading: true });
    try {
      const completed = await showRewardedVideoAd(this.data.rewardedVideoAdUnitId);
      if (!completed) {
        wx.showToast({ title: "看完广告才能解锁", icon: "none" });
        return;
      }
      const reward = await api.request("/api/sports/ad/reward", { method: "POST" });
      this.setData({ adStepGrantToken: reward.grantToken || "" });
      if (this.data.pendingExpiredMessage && reward.grantToken) {
        await this.sendChatMessage(this.data.pendingExpiredMessage, {
          accessGrantToken: reward.grantToken
        });
      } else {
        wx.showToast({ title: "已解锁 1 次设置", icon: "success" });
      }
    } catch (error) {
      wx.showToast({ title: (error && error.error) || "广告加载失败，请稍后重试", icon: "none" });
    } finally {
      this.setData({ adLoading: false });
    }
  },

  toggleAccessCode() {
    this.setData({ codeExpanded: !this.data.codeExpanded });
  },

  handleAccessCodeInput(event) {
    this.setData({ accessCode: String(event.detail.value || "").trim().toUpperCase() });
  },

  async redeemAccessCode() {
    if (this.data.codeRedeeming) return;
    if (!this.data.accessCode) {
      wx.showToast({ title: "请输入卡密", icon: "none" });
      return;
    }
    this.setData({ codeRedeeming: true });
    try {
      const result = await api.request("/api/sports/access-code/redeem", {
        method: "POST",
        data: { code: this.data.accessCode }
      });
      this.setData({
        membershipExpiresAt: formatDate(result.membershipExpiresAt),
        membershipExpired: false,
        accessCode: "",
        codeExpanded: false
      });
      await this.loadAccount();
      wx.showToast({ title: `已增加 ${result.durationDays} 天`, icon: "success" });
    } catch (error) {
      wx.showToast({ title: (error && error.error) || "卡密兑换失败", icon: "none" });
    } finally {
      this.setData({ codeRedeeming: false });
    }
  },

  async handleBuyMembership(event) {
    const productId = String(event.currentTarget.dataset.productId || "");
    if (!productId || this.data.paymentLoadingProductId) return;
    if (typeof wx.requestVirtualPayment !== "function") {
      wx.showModal({ title: "暂不支持", content: "当前微信版本不支持虚拟支付，请升级微信后重试。", showCancel: false });
      return;
    }
    this.setData({ paymentLoadingProductId: productId });
    try {
      await api.ensureLogin();
      const login = await wxLogin();
      const order = await api.request("/api/sports/virtual-payment/create", {
        method: "POST",
        data: { code: login.code, productId }
      });
      wx.setStorageSync("sportsPendingVirtualPayment", order.outTradeNo);
      await requestVirtualPayment(order.payment);
      const confirmed = await this.confirmVirtualPayment(order.outTradeNo);
      if (confirmed) wx.showToast({
        title: confirmed.permanent ? "已开通永久会员" : `会员已增加 ${confirmed.durationDays} 天`,
        icon: "success"
      });
    } catch (error) {
      const message = String((error && (error.error || error.errMsg)) || "支付失败，请稍后重试");
      if (/cancel/i.test(message)) {
        wx.removeStorageSync("sportsPendingVirtualPayment");
      } else {
        wx.showToast({ title: message, icon: "none" });
      }
    } finally {
      this.setData({ paymentLoadingProductId: "" });
    }
  },

  openMembershipDialog() {
    if (!this.data.virtualPaymentProducts.length) return;
    this.setData({ membershipDialogVisible: true });
  },

  closeMembershipDialog() {
    if (this.data.paymentLoadingProductId) return;
    this.setData({ membershipDialogVisible: false });
  },

  async reconcilePendingVirtualPayment() {
    const outTradeNo = String(wx.getStorageSync("sportsPendingVirtualPayment") || "");
    if (!outTradeNo) return;
    try {
      await this.confirmVirtualPayment(outTradeNo);
    } catch (error) {
      const message = String((error && error.error) || "");
      if (message && message !== "支付尚未完成") console.warn("确认会员支付结果失败", error);
    }
  },

  async confirmVirtualPayment(outTradeNo) {
    const result = await api.request("/api/sports/virtual-payment/confirm", {
      method: "POST",
      data: { outTradeNo }
    });
    wx.removeStorageSync("sportsPendingVirtualPayment");
    this.setData({
      membershipExpiresAt: formatDate(result.membershipExpiresAt),
      membershipExpired: false,
      membershipDialogVisible: false
    });
    await this.loadAccount();
    return result;
  },

  onShareAppMessage() {
    const user = api.getCurrentUser();
    return {
      title: `邀请你使用运动助手，注册成功我可获得 ${this.data.sportsInviteRewardDays} 天`,
      path: `/pages/sports/index${inviterSuffix(user)}`
    };
  },

  onShareTimeline() {
    const user = api.getCurrentUser();
    return {
      title: `邀请新用户，运动会员增加 ${this.data.sportsInviteRewardDays} 天`,
      query: inviterQuery(user)
    };
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

function formatSteps(value) {
  const steps = Number(value);
  if (!Number.isInteger(steps) || steps <= 0) return "";
  return steps.toLocaleString("en-US");
}

function wxLogin() {
  return new Promise((resolve, reject) => wx.login({ success: resolve, fail: reject }));
}

function requestVirtualPayment(payment) {
  return new Promise((resolve, reject) => {
    wx.requestVirtualPayment({ ...payment, success: resolve, fail: reject });
  });
}

function isMembershipExpired(value) {
  if (!value) return true;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date.getTime() <= Date.now();
}

function showRewardedVideoAd(adUnitId) {
  return new Promise((resolve, reject) => {
    const ad = wx.createRewardedVideoAd({ adUnitId });
    const cleanup = () => {
      if (ad.offClose) ad.offClose(handleClose);
      if (ad.offError) ad.offError(handleError);
    };
    const handleClose = (result) => {
      cleanup();
      resolve(Boolean(result && result.isEnded));
    };
    const handleError = (error) => {
      cleanup();
      reject(error);
    };
    ad.onClose(handleClose);
    ad.onError(handleError);
    ad.show().catch(() => ad.load().then(() => ad.show()).catch(handleError));
  });
}
