const { request } = require("../../utils/api");

Page({
  data: {
    orderSuffix: "",
    notes: "",
    files: []
  },

  onSuffixChange(event) {
    this.setData({ orderSuffix: event.detail.value });
  },

  onNotesChange(event) {
    this.setData({ notes: event.detail.value });
  },

  async onAddFile() {
    const result = await wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"]
    });
    this.setData({ files: result.tempFiles });
  },

  onRemoveFile() {
    this.setData({ files: [] });
  },

  async submit() {
    if (!this.data.orderSuffix.trim()) {
      wx.showToast({ title: "请填写订单后几位", icon: "none" });
      return;
    }

    await request("/api/orders/claim", {
      method: "POST",
      data: {
        orderSuffix: this.data.orderSuffix,
        notes: this.data.notes
      }
    });
    wx.showToast({ title: "已提交", icon: "success" });
  }
});
