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
      deal.steps = (deal.steps || []).map((step) => ({
        ...step,
        images: (step.images || []).map(toDisplayUrl),
        videoUrl: step.videoUrl ? toDisplayUrl(step.videoUrl) : ""
      }));
      this.setData({ deal, loading: false });
    } catch (_error) {
      this.setData({ loading: false, notFound: true });
    }
  },

  copyStep(event) {
    const index = Number(event.currentTarget.dataset.index);
    const step = this.data.deal.steps[index];
    if (!step || !step.copyValue) return;

    wx.setClipboardData({
      data: step.copyValue,
      success: () => {
        this.setData({ copiedIndex: index });
        clearTimeout(this.copiedTimer);
        this.copiedTimer = setTimeout(() => {
          this.setData({ copiedIndex: -1 });
        }, 1500);
      },
      fail: (error) => {
        console.warn("setClipboardData failed:", error.errMsg || error);
        wx.showModal({
          title: "复制失败",
          content: "开发调试请在开发者工具勾选「不校验隐私接口」；线上需在小程序后台《用户隐私保护指引》申报剪切板。",
          showCancel: false
        });
      }
    });
  },

  previewImage(event) {
    const { urls, current } = event.currentTarget.dataset;
    wx.previewImage({ urls, current });
  },

  onUnload() {
    clearTimeout(this.copiedTimer);
  },

  backToList() {
    wx.switchTab({ url: "/pages/deals/index" });
  }
});

function toDisplayUrl(url) {
  if (!url) return "";
  return url.startsWith("/") ? `${getApp().globalData.apiBaseUrl}${url}` : url;
}
