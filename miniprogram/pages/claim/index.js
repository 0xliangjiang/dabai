const { ensureLogin, request } = require("../../utils/api");

const NOTES_MAX = 200;

Page({
  data: {
    orderSuffix: "",
    notes: "",
    notesMax: NOTES_MAX,
    files: [],
    hasFiles: false,
    previewUrl: "",
    submitting: false
  },

  onSuffixChange(event) {
    this.setData({ orderSuffix: event.detail.value });
  },

  onNotesChange(event) {
    this.setData({ notes: event.detail.value });
  },

  async onAddFile() {
    try {
      const result = await wx.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: ["album", "camera"]
      });
      const file = result.tempFiles[0];
      this.setData({
        files: result.tempFiles,
        hasFiles: Boolean(file),
        previewUrl: file ? file.tempFilePath : ""
      });
    } catch (_error) {
      // 用户取消选择
    }
  },

  onRemoveFile() {
    this.setData({
      files: [],
      hasFiles: false,
      previewUrl: ""
    });
  },

  async submit() {
    if (this.data.submitting) return;

    if (!this.data.orderSuffix.trim()) {
      wx.showToast({ title: "请填写订单后几位", icon: "none" });
      return;
    }

    this.setData({ submitting: true });
    try {
      await ensureLogin();
      await request("/api/orders/claim", {
        method: "POST",
        data: {
          orderSuffix: this.data.orderSuffix,
          notes: this.data.notes
        }
      });
      wx.showToast({ title: "已提交", icon: "success" });
      setTimeout(() => {
        wx.navigateBack({
          fail() {
            wx.switchTab({ url: "/pages/profile/index" });
          }
        });
      }, 1200);
    } catch (error) {
      wx.showToast({ title: error.error || "提交失败，请重试", icon: "none" });
      this.setData({ submitting: false });
    }
  }
});
