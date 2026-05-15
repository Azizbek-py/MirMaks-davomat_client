// ─── CONFIG ───────────────────────────────────────────────────────────────────
const SERVER = "https://mirmaks-davomat-server.onrender.com";

// ─── TELEGRAM WEBAPP ──────────────────────────────────────────────────────────
const tg = window.Telegram?.WebApp || null;
if (tg) { tg.ready(); tg.expand(); }

function getTelegramId() {
  // 1. Telegram WebApp orqali (asosiy yo'l)
  if (tg && tg.initDataUnsafe?.user?.id) {
    return String(tg.initDataUnsafe.user.id);
  }
  // 2. URL dan (?user_id=... yoki ?telegram_id=...)
  const p = new URLSearchParams(window.location.search);
  return p.get("telegram_id") || p.get("user_id") || p.get("id") || null;
}

function getInitData() {
  // Telegram WebApp initData — server tekshirish uchun ishlatadi
  if (tg && tg.initData) return tg.initData;
  return "";
}

// ─── STATE ────────────────────────────────────────────────────────────────────
let attendanceType = "KIRISH";
let selfieBase64   = null;   // base64 string (data: prefix yo'q)
let latitude       = null;
let longitude      = null;
let accuracy       = null;
const telegramId   = getTelegramId();
const initData     = getInitData();

// ─── DOM ──────────────────────────────────────────────────────────────────────
const video       = document.getElementById("camera");
const capturedImg = document.getElementById("captured-image");
const captureBtn  = document.getElementById("capture");
const retakeBtn   = document.getElementById("retake");
const submitBtn   = document.getElementById("submit");
const msgBox      = document.getElementById("message");
const locationEl  = document.getElementById("location-status");
const clockEl     = document.getElementById("clock");
const tabs        = document.querySelectorAll(".tab");

// ─── CLOCK ────────────────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  clockEl.textContent = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map(n => String(n).padStart(2, "0")).join(":");
}
setInterval(updateClock, 1000);
updateClock();

// ─── MESSAGE ──────────────────────────────────────────────────────────────────
function showMsg(text, isError = false) {
  if (typeof text !== "string") text = JSON.stringify(text);
  msgBox.textContent = text;
  msgBox.style.color = isError ? "#ff6b6b" : "#00d98e";
  msgBox.style.animation = "none";
  requestAnimationFrame(() => { msgBox.style.animation = "slideIn 0.3s ease"; });
}
function clearMsg() { msgBox.textContent = ""; }

// ─── TABS ─────────────────────────────────────────────────────────────────────
tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    tabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    attendanceType = tab.dataset.type;
    clearMsg();
  });
});

// ─── LOCATION ─────────────────────────────────────────────────────────────────
function getLocation() {
  if (!navigator.geolocation) {
    locationEl.textContent = "Qo'llab-quvvatlanmaydi";
    return;
  }
  locationEl.textContent = "Aniqlanmoqda...";
  navigator.geolocation.getCurrentPosition(
    pos => {
      latitude  = pos.coords.latitude;
      longitude = pos.coords.longitude;
      accuracy  = Math.round(pos.coords.accuracy || 0);
      locationEl.textContent = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    },
    err => {
      locationEl.textContent = "Ruxsat yo'q";
      latitude = 0; longitude = 0; accuracy = 0;
      console.warn("GPS:", err.message);
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}
getLocation();

// ─── CAMERA (to'g'ri ko'rsatish — mirror faqat preview da) ───────────────────
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 853 } },
      audio: false
    });
    video.srcObject = stream;
    // Preview da oyna ko'rinishi (foydalanuvchi o'zini to'g'ri ko'rsin)
    video.style.transform = "scaleX(-1)";
  } catch (err) {
    showMsg("Kamera ochilmadi: " + err.message, true);
  }
}
startCamera();

// ─── CAPTURE ──────────────────────────────────────────────────────────────────
captureBtn.addEventListener("click", () => {
  if (!video.srcObject) { showMsg("Kamera tayyor emas", true); return; }

  const canvas = document.createElement("canvas");
  canvas.width  = video.videoWidth  || 640;
  canvas.height = video.videoHeight || 853;
  const ctx = canvas.getContext("2d");

  // Rasmni NORMAL (mirror yo'q) saqlash — serverga to'g'ri boradi
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // base64 ga o'girish (data:image/jpeg;base64,... prefix ni olib tashlaymiz)
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  selfieBase64 = dataUrl.split(",")[1];  // faqat base64 qismi

  // Preview uchun
  capturedImg.src = dataUrl;
  capturedImg.style.transform = ""; // preview da mirror yo'q
  capturedImg.style.display = "block";
  video.style.display       = "none";
  captureBtn.style.display  = "none";
  retakeBtn.style.display   = "block";
  showMsg("Rasm olindi — OK tugmasini bosing");
});

// ─── RETAKE ───────────────────────────────────────────────────────────────────
retakeBtn.addEventListener("click", () => {
  selfieBase64              = null;
  capturedImg.style.display = "none";
  video.style.display       = "block";
  retakeBtn.style.display   = "none";
  captureBtn.style.display  = "block";
  clearMsg();
});

// ─── SUBMIT ───────────────────────────────────────────────────────────────────
submitBtn.addEventListener("click", async () => {
  if (!selfieBase64) { showMsg("Avval rasm oling!", true); return; }
  if (!telegramId)   {
    showMsg("Telegram ID aniqlanmadi! Botdan oching.", true);
    return;
  }

  submitBtn.disabled    = true;
  submitBtn.textContent = "Yuborilmoqda...";
  showMsg("Serverga ulanilmoqda...");

  try {
    // Server query string + JSON body yoki query string + form — tekshirib ko'ramiz
    // Rasmdan oldingi testda server query parametr kutgan edi
    // Shuning uchun hamma narsani query ga qo'yamiz, selfie_data ham shu yerda

    const query = new URLSearchParams({
      telegram_id:  telegramId,
      type:         attendanceType,
      timestamp:    new Date().toISOString(),
      latitude:     latitude  !== null ? String(latitude)  : "0",
      longitude:    longitude !== null ? String(longitude) : "0",
      accuracy:     accuracy  !== null ? String(accuracy)  : "0",
      selfie_data:  selfieBase64,
      init_data:    initData,
    });

    const url = `${SERVER}/api/attendance?${query.toString()}`;
    console.log("POST →", SERVER + "/api/attendance");

    const response = await fetch(url, { method: "POST" });

    let result = {};
    try { result = await response.json(); } catch { result = {}; }
    console.log("Server javobi:", result);

    if (!response.ok) {
      let errText = `Server xatosi (${response.status})`;
      if (typeof result.detail === "string") {
        errText = result.detail;
      } else if (Array.isArray(result.detail)) {
        errText = result.detail
          .map(d => {
            const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : "?";
            return `"${field}": ${d.msg}`;
          }).join(" | ");
      } else if (typeof result.message === "string") {
        errText = result.message;
      }
      throw new Error(errText);
    }

    const ok = result.message || result.detail || "Davomat yuborildi ✓";
    showMsg(typeof ok === "string" ? ok : "Davomat yuborildi ✓");
    setTimeout(resetUI, 3000);

  } catch (err) {
    // URL juda uzun bo'lsa (selfie_data query da), JSON body ga o'tamiz
    if (err.message && err.message.includes("414")) {
      await submitAsJson();
      return;
    }
    console.error("Xato:", err);
    showMsg(typeof err.message === "string" ? err.message : "Noma'lum xato", true);
  } finally {
    submitBtn.disabled    = false;
    submitBtn.textContent = "OK";
  }
});

// ─── FALLBACK: JSON body orqali yuborish (URL juda uzun bo'lsa) ───────────────
async function submitAsJson() {
  try {
    const body = {
      telegram_id: telegramId,
      type:        attendanceType,
      timestamp:   new Date().toISOString(),
      latitude:    latitude  !== null ? latitude  : 0,
      longitude:   longitude !== null ? longitude : 0,
      accuracy:    accuracy  !== null ? accuracy  : 0,
      selfie_data: selfieBase64,
      init_data:   initData,
    };

    const response = await fetch(`${SERVER}/api/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    let result = {};
    try { result = await response.json(); } catch { result = {}; }

    if (!response.ok) {
      let errText = `Server xatosi (${response.status})`;
      if (typeof result.detail === "string") errText = result.detail;
      else if (Array.isArray(result.detail)) {
        errText = result.detail
          .map(d => {
            const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : "?";
            return `"${field}": ${d.msg}`;
          }).join(" | ");
      }
      throw new Error(errText);
    }

    const ok = result.message || result.detail || "Davomat yuborildi ✓";
    showMsg(typeof ok === "string" ? ok : "Davomat yuborildi ✓");
    setTimeout(resetUI, 3000);
  } catch (err) {
    showMsg(typeof err.message === "string" ? err.message : "Noma'lum xato", true);
  } finally {
    submitBtn.disabled    = false;
    submitBtn.textContent = "OK";
  }
}

// ─── RESET ────────────────────────────────────────────────────────────────────
function resetUI() {
  selfieBase64              = null;
  capturedImg.style.display = "none";
  video.style.display       = "block";
  retakeBtn.style.display   = "none";
  captureBtn.style.display  = "block";
  clearMsg();
  getLocation();
}
