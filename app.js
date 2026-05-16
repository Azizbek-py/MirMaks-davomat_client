// ─── CONFIG ───────────────────────────────────────────────────────────────────
const SERVER = "https://mirmaks-davomat-server.onrender.com";

// ─── TELEGRAM WEBAPP ──────────────────────────────────────────────────────────
const tg = window.Telegram?.WebApp || null;
if (tg) { tg.ready(); tg.expand(); }

function getTelegramId() {
  // 1. Telegram WebApp
  if (tg?.initDataUnsafe?.user?.id) {
    return tg.initDataUnsafe.user.id; // number
  }
  // 2. URL parametr
  const p = new URLSearchParams(window.location.search);
  const v = p.get("telegram_id") || p.get("user_id") || p.get("id");
  if (v) return parseInt(v);
  return null;
}

function getInitData() {
  return tg?.initData || "";
}

// ─── STATE ────────────────────────────────────────────────────────────────────
let attendanceType = "KIRISH";
let selfieBase64   = null;
let latitude       = 0;
let longitude      = 0;
let accuracy       = 0;

const telegramId = getTelegramId();
const initData   = getInitData();

console.log("[DEBUG] telegramId:", telegramId);
console.log("[DEBUG] initData uzunligi:", initData.length);
console.log("[DEBUG] SERVER:", SERVER);

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
      console.log("[DEBUG] GPS:", latitude, longitude, "accuracy:", accuracy);
    },
    err => {
      locationEl.textContent = "Ruxsat yo'q";
      console.warn("[DEBUG] GPS xato:", err.message);
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}
getLocation();

// ─── CAMERA ───────────────────────────────────────────────────────────────────
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 640 } },
      audio: false
    });
    video.srcObject = stream;
    video.style.transform = "scaleX(-1)";
  } catch (err) {
    showMsg("Kamera: " + err.message, true);
    console.error("[DEBUG] Kamera:", err);
  }
}
startCamera();

// ─── CAPTURE ──────────────────────────────────────────────────────────────────
captureBtn.addEventListener("click", () => {
  if (!video.srcObject) { showMsg("Kamera tayyor emas", true); return; }

  const canvas = document.createElement("canvas");
  canvas.width  = 480;
  canvas.height = 640;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const dataUrl    = canvas.toDataURL("image/jpeg", 0.7);
  selfieBase64     = dataUrl.split(",")[1];

  console.log("[DEBUG] Rasm base64 uzunligi:", selfieBase64.length);

  capturedImg.src           = dataUrl;
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
  if (!telegramId)   { showMsg("Telegram orqali oching!", true); return; }

  submitBtn.disabled    = true;
  submitBtn.textContent = "Yuborilmoqda...";
  showMsg("Serverga ulanilmoqda...");

  const payload = {
    telegram_id: telegramId,
    type:        attendanceType,
    latitude:    latitude,
    longitude:   longitude,
    accuracy:    accuracy,
    selfie_data: selfieBase64,
    init_data:   initData,
    timestamp:   new Date().toISOString(),
    platform:    navigator.userAgent,
  };

  console.log("[DEBUG] Yuborilayotgan payload (selfie_data uzunligi):", payload.selfie_data.length);
  console.log("[DEBUG] URL:", SERVER + "/api/attendance");

  try {
    const response = await fetch(`${SERVER}/api/attendance`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });

    console.log("[DEBUG] Response status:", response.status);

    let result = {};
    try {
      result = await response.json();
    } catch (e) {
      console.warn("[DEBUG] JSON parse xato:", e);
      result = {};
    }

    console.log("[DEBUG] Server javobi:", result);

    if (!response.ok) {
      let errText = `Xato (${response.status})`;
      if (typeof result.detail === "string") {
        errText = result.detail;
      } else if (Array.isArray(result.detail)) {
        errText = result.detail
          .map(d => `"${Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : "?"}: ${d.msg}"`)
          .join(" | ");
      } else if (typeof result.message === "string") {
        errText = result.message;
      }
      throw new Error(errText);
    }

    const ok = result.message || "Davomat yuborildi ✓";
    showMsg(typeof ok === "string" ? ok : "Davomat yuborildi ✓");
    setTimeout(resetUI, 3000);

  } catch (err) {
    console.error("[DEBUG] Fetch xato:", err.name, err.message);

    // "Failed to fetch" — network muammosi
    if (err.name === "TypeError" && err.message.includes("fetch")) {
      showMsg("Server bilan aloqa yo'q. Internet yoki server tekshiring.", true);
    } else {
      showMsg(typeof err.message === "string" ? err.message : "Noma'lum xato", true);
    }
  } finally {
    submitBtn.disabled    = false;
    submitBtn.textContent = "OK";
  }
});

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
