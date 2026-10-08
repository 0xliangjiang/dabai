const api = require("../../utils/api");
const goals = require("../../utils/goals");
Page({
  data: { loading: true, configReady: false, linked: false, previewMode: false, previewAvailable: false, goalInput: "", busy: false, linking: false, bindingCode: "", adLoading: false, error: "", result: "", accountName: "运动账号", isBound: false, todaySteps: "", membershipText: "未开通", expired: true, stepsInput: "", grantToken: "", accessCode: "", enabled: false, adUnitId: "", sourceAppId: "" },
  onLoad(options) { this.accountMode = Boolean(options && options.mode === "account"); },
  onShow() {
    const state = getApp().globalData;
    if (state.accountEntryRequested) { state.accountEntryRequested = false; this.accountMode = true; }
    this.reload();
  },
  onUnload() { if (this.rewardedAd) this.rewardedAd.destroy(); },
  async reload() {
    if (this.reloading || this.data.busy) return;
    this.reloading = true;
    this.setData({ loading: true, configReady: false, error: "" });
    try {
      const config = await api.getConfig();
      this.setData({ configReady: true, sourceAppId: config.sourceAppId, enabled: config.enabled && config.sportsEnabled, previewAvailable: config.previewEnabled === true, adUnitId: config.rewardedVideoAdUnitId || "" });
      if (this.data.previewAvailable && !this.accountMode) {
        this.enterPublicGoal();
        return;
      }
      if (this.data.previewMode) this.setData({ previewMode: false, goalInput: "", result: "", stepsInput: "", todaySteps: "" });
      if (!config.enabled) throw { error: "运动服务暂未开放，请稍后再来" };
      await api.ensureLogin();
      await this.loadAccount();
      this.setData({ linked: true });
    } catch (error) {
      this.setData({ linked: false, previewMode: false, error: error.error || error.errMsg || "连接失败，请重试" });
    } finally { this.reloading = false; this.setData({ loading: false }); }
  },
  enterPublicGoal() { this.setData({ previewMode: true, linked: false, result: "", stepsInput: "", todaySteps: "", bindingCode: "", error: "" }); },
  useLinkedAccount() { return this.reload(); },
  inputGoal(event) { this.setData({ goalInput: event.detail.value, error: "", result: "" }); },
  submitGoal() {
    if (!this.data.previewMode || this.data.busy) return;
    try {
      const title = goals.validateTitle(this.data.goalInput);
      const items = goals.readGoals();
      if (items.length >= goals.LIMIT) throw new Error("最多保存 100 个目标，请先到目标清单删除不需要的记录");
      const createdAt = Date.now();
      goals.writeGoals([{ id: `${createdAt}-${Math.random().toString(36).slice(2, 10)}`, title, done: false, createdAt }].concat(items));
      this.setData({ goalInput: "", result: "目标已保存到本机，可在目标清单中查看。不修改微信运动。", error: "" });
    } catch (error) { this.setData({ result: "", error: error.message }); }
  },
  inputBindingCode(e) { this.setData({ bindingCode: e.detail.value.toUpperCase(), error: "" }); },
  async linkWithCode() {
    if (this.data.busy || this.reloading) return;
    const bindingCode = this.data.bindingCode.replace(/[\s-]/g, "").toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{12}$/.test(bindingCode)) { this.setData({ error: "请输入原小程序生成的 12 位绑定码" }); return; }
    this.setData({ busy: true, linking: true, error: "" });
    try {
      await api.linkAccount(bindingCode);
      await this.loadAccount();
      this.setData({ linked: true, bindingCode: "", grantToken: "", result: "账号关联成功" });
    } catch (error) { this.setData({ error: error.error || error.errMsg || "关联失败，请重试" }); }
    finally { this.setData({ busy: false, linking: false }); }
  },
  async loadAccount() {
    const account = await api.request("/api/sports/account");
    const expiry = account.membershipExpiresAt ? new Date(account.membershipExpiresAt) : null;
    const permanent = expiry && expiry.getUTCFullYear() >= 9999;
    this.setData({ accountName: (account.account && account.account.email) || "运动账号", isBound: account.isBound,
      todaySteps: account.todayTargetSteps || "", expired: !expiry || expiry.getTime() <= Date.now(),
      membershipText: permanent ? "永久有效" : expiry ? `${expiry.getFullYear()}/${expiry.getMonth()+1}/${expiry.getDate()}` : "未开通" });
  },
  openSource() {
    const appId = this.data.sourceAppId || getApp().globalData.sourceAppId;
    wx.navigateToMiniProgram({ appId, path: "pages/sports/index", envVersion: "release",
      fail: () => wx.showToast({ title: "跳转未完成，请重试", icon: "none" }) });
  },
  inputSteps(e) { this.setData({ stepsInput: e.detail.value, error: "", result: "" }); },
  chooseSteps(e) { this.setData({ stepsInput: String(e.currentTarget.dataset.steps), error: "", result: "" }); },
  inputCode(e) { this.setData({ accessCode: e.detail.value.trim() }); },
  async submitSteps() {
    if (this.data.busy || this.data.previewMode) return;
    const steps = Number(this.data.stepsInput);
    if (!Number.isInteger(steps) || steps < 1 || steps > 98800) { this.setData({ error: "请输入 1–98,800 之间的整数" }); return; }
    if (!this.data.linked || !this.data.isBound || !this.data.enabled) { this.setData({ error: "请先关联已绑定的账号，并确认运动服务已开放" }); return; }
    if (this.data.expired && !this.data.grantToken) { this.setData({ error: "请先观看广告解锁一次，或使用卡密延期" }); return; }
    this.setData({ busy: true, error: "", result: "" });
    try {
      const result = await api.request("/api/sports/chat", { method: "POST", timeout: 120000,
        data: { message: `今天运动目标 ${steps} 步`, ...(this.data.grantToken ? { accessGrantToken: this.data.grantToken } : {}) } });
      if (!result.success) {
        if (result.action === "ad_grant_invalid") this.setData({ grantToken: "" });
        if (result.action === "membership_expired") this.setData({ expired: true });
        throw { error: result.reply || "提交失败" };
      }
      this.setData({ result: result.reply, grantToken: "", todaySteps: result.steps || this.data.todaySteps });
    } catch (error) { this.setData({ error: error.error || error.errMsg || "步数提交失败，请稍后重试" }); }
    finally { this.setData({ busy: false }); }
  },
  async watchAd() {
    if (this.data.previewMode || this.data.busy || this.data.grantToken || !this.data.adUnitId) return;
    this.setData({ busy: true, adLoading: true, error: "" });
    try {
      await new Promise((resolve, reject) => {
        const ad = wx.createRewardedVideoAd({ adUnitId: this.data.adUnitId });
        this.rewardedAd = ad;
        const cleanup = () => { ad.offClose(close); ad.offError(fail); ad.destroy(); this.rewardedAd = null; };
        const close = (result) => { cleanup(); result && result.isEnded === true ? resolve() : reject({ error: "完整观看后才能解锁，本次未发放授权" }); };
        const fail = () => { cleanup(); reject({ error: "广告暂时不可用，请稍后重试" }); };
        ad.onClose(close); ad.onError(fail);
        ad.load().then(() => ad.show()).catch(fail);
      });
      const reward = await api.request("/api/sports/ad/reward", { method: "POST" });
      this.setData({ grantToken: reward.grantToken, result: "已解锁一次，请输入步数并提交" });
    } catch (error) { this.setData({ error: error.error || error.errMsg || "广告解锁失败" }); }
    finally { this.setData({ busy: false, adLoading: false }); }
  },
  async redeemCode() {
    if (this.data.previewMode || this.data.busy || !this.data.accessCode) return;
    this.setData({ busy: true, error: "" });
    try {
      await api.request("/api/sports/access-code/redeem", { method: "POST", data: { code: this.data.accessCode } });
      await this.loadAccount(); this.setData({ accessCode: "", result: "卡密兑换成功" });
    } catch (error) { this.setData({ error: error.error || error.errMsg || "卡密兑换失败" }); }
    finally { this.setData({ busy: false }); }
  }
});
