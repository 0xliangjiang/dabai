const { downloadFile, ensureLogin, getCurrentUser } = require("../../utils/api");
const {
  POSTER_HEIGHT,
  POSTER_TEMPLATES,
  POSTER_WIDTH,
  renderPoster
} = require("../../utils/poster");
const { inviterSuffix, inviterQuery } = require("../../utils/share");
const { trackEvent } = require("../../utils/analytics");

Page({
  data: {
    templates: POSTER_TEMPLATES,
    selectedTemplateId: POSTER_TEMPLATES[0].id,
    rendering: true,
    posterReady: false,
    posterImagePath: "",
    saving: false,
    errorMsg: ""
  },

  onShareAppMessage() {
    return {
      title: "送你一个查优惠工具，买东西前先查一查",
      path: `/pages/home/index${inviterSuffix(getCurrentUser())}`
    };
  },

  onShareTimeline() {
    return {
      title: "买东西前先查一查，优惠和奖励一目了然",
      query: inviterQuery(getCurrentUser())
    };
  },

  async onReady() {
    if (wx.showShareMenu) {
      wx.showShareMenu({ withShareTicket: true, menus: ["shareAppMessage", "shareTimeline"] });
    }
    await this.generatePoster();
  },

  async generatePoster() {
    if (this.generating) return;
    this.generating = true;
    this.setData({ rendering: true, errorMsg: "" });
    try {
      await ensureLogin();
      const canvas = this.canvas || (await getCanvas(this));
      this.canvas = canvas;
      canvas.width = POSTER_WIDTH;
      canvas.height = POSTER_HEIGHT;
      const qrPath = this.qrPath || (await downloadFile("/api/users/me/invite-code"));
      this.qrPath = qrPath;
      const qrImage = await loadImage(canvas, qrPath);
      const user = getCurrentUser() || {};
      const context = canvas.getContext("2d");
      renderPoster(context, this.data.selectedTemplateId, {
        nickname: user.nickname || "好友",
        qrImage
      });
      await wait(80);
      const posterImagePath = await exportCanvas(canvas);
      this.setData({
        rendering: false,
        posterReady: true,
        posterImagePath,
        errorMsg: ""
      });
      trackEvent("invite_poster_generated", { template: this.data.selectedTemplateId });
    } catch (error) {
      console.warn("邀请海报生成失败", error);
      this.setData({
        rendering: false,
        posterReady: false,
        errorMsg: error && error.statusCode === 502
          ? "专属小程序码生成失败，请稍后重试"
          : "海报生成失败，请检查网络后重试"
      });
    } finally {
      this.generating = false;
    }
  },

  selectTemplate(event) {
    const id = event.currentTarget.dataset.id;
    if (!id || id === this.data.selectedTemplateId || this.data.rendering) return;
    this.setData({ selectedTemplateId: id }, () => this.generatePoster());
  },

  retryGenerate() {
    this.qrPath = "";
    this.generatePoster();
  },

  async savePoster() {
    if (!this.data.posterReady || !this.data.posterImagePath || this.data.saving) return;
    this.setData({ saving: true });
    try {
      await ensureAlbumPermission();
      await saveToAlbum(this.data.posterImagePath);
      trackEvent("invite_poster_saved", { template: this.data.selectedTemplateId });
      wx.showToast({ title: "已保存到相册", icon: "success" });
    } catch (error) {
      if (isAlbumDenied(error)) {
        this.showAlbumPermissionGuide();
      } else if (!error || !String(error.errMsg || "").includes("cancel")) {
        console.warn("邀请海报保存失败", error);
        wx.showToast({ title: "保存失败，请稍后重试", icon: "none" });
      }
    } finally {
      this.setData({ saving: false });
    }
  },

  showAlbumPermissionGuide() {
    wx.showModal({
      title: "需要相册权限",
      content: "请在设置中允许保存到相册，开启后将自动继续保存海报。",
      confirmText: "去设置",
      success: (result) => {
        if (!result.confirm) return;
        wx.openSetting({
          success: (setting) => {
            if (setting.authSetting && setting.authSetting["scope.writePhotosAlbum"]) {
              this.savePoster();
            }
          }
        });
      }
    });
  }
});

function getCanvas(page) {
  return new Promise((resolve, reject) => {
    wx.createSelectorQuery()
      .in(page)
      .select("#posterCanvas")
      .fields({ node: true, size: true })
      .exec((result) => {
        const node = result && result[0] && result[0].node;
        if (node) resolve(node);
        else reject(new Error("canvas unavailable"));
      });
  });
}

function loadImage(canvas, src) {
  return new Promise((resolve, reject) => {
    const image = canvas.createImage();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function exportCanvas(canvas) {
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      destWidth: POSTER_WIDTH,
      destHeight: POSTER_HEIGHT,
      fileType: "png",
      quality: 1,
      success: (result) => resolve(result.tempFilePath),
      fail: reject
    });
  });
}

function ensureAlbumPermission() {
  return new Promise((resolve, reject) => {
    wx.getSetting({
      success(result) {
        const authorized = result.authSetting && result.authSetting["scope.writePhotosAlbum"];
        if (authorized === true) {
          resolve();
          return;
        }
        if (authorized === false) {
          reject({ errMsg: "authorize:fail auth denied" });
          return;
        }
        wx.authorize({
          scope: "scope.writePhotosAlbum",
          success: resolve,
          fail: reject
        });
      },
      fail: reject
    });
  });
}

function saveToAlbum(filePath) {
  return new Promise((resolve, reject) => {
    wx.saveImageToPhotosAlbum({ filePath, success: resolve, fail: reject });
  });
}

function isAlbumDenied(error) {
  const message = String((error && error.errMsg) || "").toLowerCase();
  return message.includes("auth deny") ||
    message.includes("auth denied") ||
    message.includes("authorize:fail") ||
    message.includes("permission denied");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
