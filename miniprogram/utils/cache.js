function readCache(key, maxAgeMs) {
  try {
    const cached = wx.getStorageSync(key);
    if (!cached || !cached.savedAt || !cached.data) return null;
    if (Date.now() - cached.savedAt > maxAgeMs) return null;
    return cached.data;
  } catch (_error) {
    return null;
  }
}

function writeCache(key, data) {
  try {
    wx.setStorageSync(key, { savedAt: Date.now(), data });
  } catch (_error) {
    // Storage limits should not block the primary flow.
  }
}

module.exports = { readCache, writeCache };
