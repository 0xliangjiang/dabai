const { ensureLogin, request, uploadFile } = require("../../utils/api");
const { hasConsent, setConsent } = require("../../utils/privacy");

const NOTES_MAX = 200;

Page({
  data: {
    orderSuffix: "",
    notes: "",
    notesMax: NOTES_MAX,
    files: [],
    hasFiles: false,
    previewUrl: "",
    submitting: false,
    showPrivacy: false
  },

  onSuffixChange(event) {
    this.setData({ orderSuffix: event.detail.value });
  },

  onNotesChange(event) {
    this.setData({ notes: event.detail.value });
  },

  async onPrivacyAgree() {
    setConsent();
    getApp().resolvePrivacy(true);
    this.setData({ showPrivacy: false });
    // 同意后自动继续选图
    await this.pickFile();
  },

  onPrivacyReject() {
    getApp().resolvePrivacy(false);
    this.setData({ showPrivacy: false });
    wx.showToast({ title: "同意后才能选择截图", icon: "none" });
  },

  async onAddFile() {
    if (!hasConsent()) {
      this.setData({ showPrivacy: true });
      return;
    }
    await this.pickFile();
  },

  async pickFile() {
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

    if (!hasConsent()) {
      this.setData({ showPrivacy: true });
      return;
    }

    if (!this.data.orderSuffix.trim()) {
      wx.showToast({ title: "请填写订单后几位", icon: "none" });
      return;
    }

    this.setData({ submitting: true });
    try {
      await ensureLogin();

      let screenshotUrl = "";
      if (this.data.hasFiles && this.data.files[0]) {
        const upload = await uploadFile("/api/uploads/claim-screenshot", this.data.files[0].tempFilePath);
        screenshotUrl = upload.url || "";
      }

      await request("/api/orders/claim", {
        method: "POST",
        data: {
          orderSuffix: this.data.orderSuffix,
          notes: this.data.notes,
          screenshotUrl
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
