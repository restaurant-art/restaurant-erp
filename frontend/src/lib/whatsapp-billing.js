export function billingMobile(value) {
  const international = value.trim().startsWith("+");
  const digits = value.replace(/[^0-9]/g, "").slice(0, 20);
  return international ? `+${digits}` : digits;
}

export function validBillingMobile(value) {
  return /^(?:[0-9]{10}|\+[1-9][0-9]{7,14})$/.test(value);
}

const metaOrigins = new Set(["https://www.facebook.com", "https://web.facebook.com"]);

export function embeddedSignupEvent({ origin, data }) {
  if (!metaOrigins.has(origin)) return null;
  try {
    const event = typeof data === "string" ? JSON.parse(data) : data;
    return event?.type === "WA_EMBEDDED_SIGNUP" ? event : null;
  } catch {
    return null;
  }
}

let sdkPromise;

export function loadMetaSdk({ appId, graphVersion }) {
  sdkPromise ??= new Promise((resolve, reject) => {
    if (window.FB) {
      resolve(window.FB);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => window.FB ? resolve(window.FB) : reject(new Error("The Meta sign-in SDK is unavailable."));
    script.onerror = () => reject(new Error("Could not load Meta sign-in. Check your connection."));
    document.head.appendChild(script);
  }).catch((error) => {
    sdkPromise = undefined;
    throw error;
  });
  return sdkPromise.then((sdk) => {
    sdk.init({ appId, version: graphVersion, cookie: false, xfbml: false, autoLogAppEvents: false });
    return sdk;
  });
}

export function launchMetaSignup(sdk, configId, signal) {
  return new Promise((resolve, reject) => {
    let authorizationCode;
    let sender;
    const timeout = window.setTimeout(() => finish(new Error("Meta signup took too long. Start again.")), 600000);
    function cleanup() {
      window.clearTimeout(timeout);
      window.removeEventListener("message", receive);
      signal?.removeEventListener("abort", cancel);
    }
    function finish(error) {
      if (error) {
        cleanup();
        reject(error);
      } else if (authorizationCode && sender) {
        cleanup();
        resolve({ code: authorizationCode, ...sender });
      }
    }
    function cancel() {
      finish(new Error("Meta signup was closed."));
    }
    function receive(message) {
      const event = embeddedSignupEvent(message);
      if (!event) return;
      if (event.event === "CANCEL" || event.event === "ERROR") {
        finish(new Error("Meta signup did not finish. Start again to connect your sender."));
      } else if (event.event === "FINISH_ONLY_WABA") {
        finish(new Error("Select a business phone number during Meta signup."));
      } else if (event.event === "FINISH" || event.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
        sender = { wabaId: event.data?.waba_id, phoneId: event.data?.phone_number_id, businessId: event.data?.business_id };
        if (!sender.wabaId || !sender.phoneId) finish(new Error("Meta did not return a business phone number."));
        else finish();
      }
    }
    window.addEventListener("message", receive);
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      sdk.login((response) => {
        authorizationCode = response?.authResponse?.code;
        if (!authorizationCode) finish(new Error("Meta did not authorize the connection. Check the signup window and try again."));
        else finish();
      }, { config_id: configId, response_type: "code", override_default_response_type: true, extras: { setup: {}, version: "v4" } });
    } catch (error) {
      finish(error);
    }
  });
}
