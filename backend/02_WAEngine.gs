/**
 * ============================================================================
 * 02_WAENGINE.GS — ENGINE WA GATEWAY REUSABLE (ONESENDER API)
 * ============================================================================
 * @param {string} target - Nomor WA (628xxx) atau Group ID (xxx@g.us)
 * @param {string} message - Teks pesan
 * @return {object} { success: boolean, response: string }
 */
function sendWA(target, message) {
  const targetClean = String(target || "").trim();
  const messageClean = String(message || "").trim();

  if (!targetClean) return { success: false, response: "Target WA kosong." };
  if (!messageClean) return { success: false, response: "Isi pesan kosong." };

  try {
    const config = (typeof getSystemConfig === "function") ? getSystemConfig() : {};
    const url = config.wa_api_url || "https://wa5717.oneapi.my.id/api/v1/messages";
    const token = config.wa_api_token || "u3bc8fd0cb829466.f144ce696aea4ec78567cf4eab20bfd2";

    const isGroup = targetClean.includes("@g.us");

    const payload = {
      recipient_type: isGroup ? "group" : "individual",
      to: targetClean,
      type: "text",
      text: {
        body: messageClean
      }
    };

    const options = {
      method: "post",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json"
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const res = UrlFetchApp.fetch(url, options);
    const code = res.getResponseCode();
    const body = res.getContentText();

    return {
      success: code >= 200 && code < 300,
      response: body
    };

  } catch (err) {
    Logger.log("❌ Error sendWA: " + err.toString());
    return {
      success: false,
      response: err.toString()
    };
  }
}
