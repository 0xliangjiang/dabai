const CONSENT_KEY = "privacyConsent";
const CONSENT_VERSION = "v1";

function hasConsent() {
  const consent = wx.getStorageSync(CONSENT_KEY);
  return Boolean(consent && consent.version === CONSENT_VERSION);
}

function setConsent() {
  wx.setStorageSync(CONSENT_KEY, {
    version: CONSENT_VERSION,
    agreedAt: Date.now()
  });
}

module.exports = {
  hasConsent,
  setConsent
};
