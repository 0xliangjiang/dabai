const { ensureLogin, getCurrentUser, request } = require("../../utils/api");
const { inviterSuffix, inviterQuery } = require("../../utils/share");

Page({
  data: {
    article: null,
    loading: true,
    notFound: false,
    errorMsg: ""
  },

  onShareAppMessage() {
    const article = this.data.article;
    return {
      title: article ? article.title : "实用教程",
      path: this.articleId
        ? `/pages/article-detail/index?id=${this.articleId}${inviterSuffix(getCurrentUser(), true)}`
        : `/pages/deals/index${inviterSuffix(getCurrentUser())}`
    };
  },

  onShareTimeline() {
    return {
      title: this.data.article ? this.data.article.title : "实用教程",
      query: inviterQuery(getCurrentUser(), this.articleId ? `id=${this.articleId}` : "")
    };
  },

  async onLoad(options) {
    this.articleId = options.id || "";
    if (wx.showShareMenu) {
      wx.showShareMenu({ withShareTicket: true, menus: ["shareAppMessage", "shareTimeline"] });
    }
    await this.fetchArticle();
  },

  async fetchArticle() {
    if (!this.articleId) {
      this.setData({ loading: false, notFound: true });
      return;
    }
    this.setData({ loading: true, notFound: false, errorMsg: "" });
    ensureLogin().catch(() => {});
    try {
      const { article } = await request(`/api/articles/${this.articleId}`);
      article.coverUrl = toDisplayUrl(article.coverUrl);
      article.blocks = (article.blocks || []).map((block) => {
        if (block.type === "image") return { ...block, url: toDisplayUrl(block.url) };
        if (block.type === "list") {
          return {
            ...block,
            displayItems: (block.items || []).map((text, index) => ({
              text,
              marker: block.style === "ordered" ? `${index + 1}.` : "•"
            }))
          };
        }
        return block;
      });
      this.setData({ article, loading: false });
      wx.setNavigationBarTitle({ title: article.title || "教程详情" });
      request(`/api/articles/${this.articleId}/view`, {
        method: "POST",
        data: { visitorId: getVisitorId() }
      }).catch(() => {});
    } catch (error) {
      if (error && error.statusCode === 404) {
        this.setData({ article: null, loading: false, notFound: true });
        return;
      }
      this.setData({ article: null, loading: false, errorMsg: "教程加载失败，请检查网络后重试" });
    }
  },

  retryLoad() {
    this.fetchArticle();
  },

  previewImage(event) {
    wx.previewImage({ urls: [event.currentTarget.dataset.url], current: event.currentTarget.dataset.url });
  },

  backToList() {
    wx.switchTab({ url: "/pages/deals/index" });
  }
});

function toDisplayUrl(url) {
  if (!url) return "";
  return url.startsWith("/") ? `${getApp().globalData.apiBaseUrl}${url}` : url;
}

function getVisitorId() {
  let id = "";
  try {
    id = wx.getStorageSync("visitor_id");
  } catch (_error) {
    id = "";
  }
  if (!id) {
    id = `v_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    try {
      wx.setStorageSync("visitor_id", id);
    } catch (_error) {
      // ignore
    }
  }
  return id;
}
