const { ensureLogin, request } = require("../../utils/api");

Page({
  data: {
    deal: null,
    loading: true,
    notFound: false,
    copiedIndex: -1
  },

  onShareAppMessage() {
    const title = this.data.deal ? this.data.deal.title : "优惠线报";
    return {
      title,
      path: this.dealId ? `/pages/deal-detail/index?id=${this.dealId}` : "/pages/deals/index"
    };
  },

  async onLoad(options) {
    this.dealId = options.id || "";
    await this.fetchDeal();
  },

  async fetchDeal() {
    if (!this.dealId) {
      this.setData({ loading: false, notFound: true });
      return;
    }
    try {
      await ensureLogin();
      const { deal } = await request(`/api/deals/${this.dealId}`);
      this.setData({ deal, loading: false });
    } catch (_error) {
      this.setData({ loading: false, notFound: true });
    }
  },

  async copyStep(event) {
    const index = Number(event.currentTarget.dataset.index);
    const step = this.data.deal.steps[index];
    if (!step || !step.copyValue) return;

    await wx.setClipboardData({ data: step.copyValue });
    this.setData({ copiedIndex: index });
    clearTimeout(this.copiedTimer);
    this.copiedTimer = setTimeout(() => {
      this.setData({ copiedIndex: -1 });
    }, 1500);
  },

  onUnload() {
    clearTimeout(this.copiedTimer);
  },

  backToList() {
    wx.switchTab({ url: "/pages/deals/index" });
  }
});
