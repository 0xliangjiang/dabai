const { request } = require("./api");

function getVisitorId() {
  try {
    let id = wx.getStorageSync("visitor_id");
    if (!id) {
      id = `v_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      wx.setStorageSync("visitor_id", id);
    }
    return id;
  } catch (_error) {
    return "storage_unavailable";
  }
}

function trackEvent(name, properties = {}) {
  request("/api/client-events", {
    method: "POST",
    data: { name, visitorId: getVisitorId(), properties }
  }).catch(() => {});
}

module.exports = { trackEvent };
