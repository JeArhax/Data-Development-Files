const axios = require("axios");

const CAPTCHA_API_URL = "http://2captcha.com";
const API_KEY = "6d881536e9bf2da434a9d63e18c8ba00";

class CaptchaSolver {
  constructor(apiKey = API_KEY) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: CAPTCHA_API_URL,
      timeout: 180000,
    });
  }

  async solveRecaptchaV2(sitekey, pageurl, isInvisible = false) {
    console.log(`[2Captcha] Solving reCAPTCHA v2 (invisible=${isInvisible})...`);
    try {
      const params = new URLSearchParams({
        key: this.apiKey,
        method: "userrecaptcha",
        googlekey: sitekey,
        pageurl: pageurl,
        json: "1",
      });
      if (isInvisible) params.append("invisible", "1");

      const submitResponse = await this.client.post("/in.php", params.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      if (submitResponse.data?.status !== 1)
        throw new Error(`2Captcha submit failed: ${JSON.stringify(submitResponse.data)}`);

      const captchaId = submitResponse.data.request;
      if (!captchaId) throw new Error("Failed to get CAPTCHA ID");

      const token = await this._pollForResult(captchaId);
      console.log("[2Captcha] ✅ reCAPTCHA v2 solved successfully");
      return token;
    } catch (error) {
      console.error("[2Captcha] ❌ Error solving reCAPTCHA v2:", error.message);
      throw error;
    }
  }

  async solveRecaptchaV3(sitekey, pageurl, minScore = 0.3, action = 'verify') {
    console.log("[2Captcha] Solving reCAPTCHA v3...");
    try {
      const params = new URLSearchParams({
        key: this.apiKey,
        method: "userrecaptcha",
        googlekey: sitekey,
        pageurl: pageurl,
        version: "v3",
        min_score: String(minScore),
        action: action,
        json: "1",
      });

      const submitResponse = await this.client.post("/in.php", params.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      if (submitResponse.data?.status !== 1)
        throw new Error(`2Captcha submit failed: ${JSON.stringify(submitResponse.data)}`);

      const captchaId = submitResponse.data.request;
      if (!captchaId) throw new Error("Failed to get CAPTCHA ID");

      const token = await this._pollForResult(captchaId);
      console.log("[2Captcha] ✅ reCAPTCHA v3 solved successfully");
      return token;
    } catch (error) {
      console.error("[2Captcha] ❌ Error solving reCAPTCHA v3:", error.message);
      throw error;
    }
  }

  async solveTurnstile(sitekey, pageurl) {
    console.log("[2Captcha] Solving Cloudflare Turnstile...");
    try {
      const params = new URLSearchParams({
        key: this.apiKey,
        method: "turnstile",
        sitekey: sitekey,
        pageurl: pageurl,
        json: "1",
      });

      const submitResponse = await this.client.post("/in.php", params.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      if (submitResponse.data?.status !== 1)
        throw new Error(`2Captcha submit failed: ${JSON.stringify(submitResponse.data)}`);

      const captchaId = submitResponse.data.request;
      const token = await this._pollForResult(captchaId);
      console.log("[2Captcha] ✅ Turnstile solved successfully");
      return token;
    } catch (error) {
      console.error("[2Captcha] ❌ Error solving Turnstile:", error.message);
      throw error;
    }
  }

  async _pollForResult(captchaId, maxAttempts = 30) {
    await this._delay(15000);
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await this._delay(5000);
      try {
        const response = await this.client.get("/res.php", {
          params: { key: this.apiKey, action: "get", id: captchaId, json: 1 },
        });

        console.log(`[2Captcha] Poll ${attempt + 1}/${maxAttempts}:`, response.data);

        if (response.data?.status === 1) return response.data.request;
        if (response.data?.request === "CAPCHA_NOT_READY" || response.data?.status === 0) continue;

        throw new Error(`2Captcha error: ${response.data?.request || JSON.stringify(response.data)}`);
      } catch (error) {
        if (attempt === maxAttempts - 1) throw error;
        console.warn(`[2Captcha] Poll error (attempt ${attempt + 1}):`, error.message);
      }
    }
    throw new Error("CAPTCHA solving timeout after " + maxAttempts + " attempts");
  }

  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = CaptchaSolver;