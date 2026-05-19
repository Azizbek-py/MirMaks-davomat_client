// ─── CONFIG ───────────────────────────────────────────────────────────────────
const SERVER = "https://mirmaks-davomat-server.onrender.com";

// ─── TELEGRAM WEBAPP ──────────────────────────────────────────────────────────
const tg = window.Telegram?.WebApp || null;
if (tg) { tg.ready(); tg.expand(); }

function getTelegramId() {
  if (tg?.initDataUnsafe?.user?.id) return tg.initDataUnsafe.user.id;
  const p = new URLSearchParams(window.location.search);
  const v = p.get("telegram_id") || p.get("user_id") || p.get("id");
  return v ? parseInt(v) : null;
}
function getInitData() { return tg?.initData || ""; }

// ─── STATE ────────────────────────────────────────────────────────────────────
let attendanceType = "KIRISH";
let selfieBase64   = null;
let latitude       = 0;
let longitude      = 0;
let accuracy       = 0;
let camStream      = null;
const telegramId   = getTelegramId();
const initData     = getInitData();

// ─── DOM ──────────────────────────────────────────────────────────────────────
const video        = document.getElementById("camera");
const capturedImg  = document.getElementById("captured-image");
const captureBtn   = document.getElementById("capture");
const retakeBtn    = document.getElementById("retake");
const submitBtn    = document.getElementById("submit");
const msgBox       = document.getElementById("message");
const locationEl   = document.getElementById("location-status");
const clockEl      = document.getElementById("clock");
const tabs         = document.querySelectorAll(".tab");
const mainPanel    = document.getElementById("main-panel");
const successPanel = document.getElementById("success-panel");
const successIcon  = document.getElementById("success-icon");
const successSub   = document.getElementById("success-sub");
const successInfo  = document.getElementById("success-info");

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
  if (!navigator.geolocation) { locationEl.textContent = "Qo'llab-quvvatlanmaydi"; return; }
  locationEl.textContent = "Aniqlanmoqda...";
  navigator.geolocation.getCurrentPosition(
    pos => {
      latitude  = pos.coords.latitude;
      longitude = pos.coords.longitude;
      accuracy  = Math.round(pos.coords.accuracy || 0);
      locationEl.textContent = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    },
    () => { locationEl.textContent = "Ruxsat yo'q"; },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}
getLocation();

// ─── CAMERA ───────────────────────────────────────────────────────────────────
async function startCamera() {
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false
    });
    video.srcObject = camStream;
  } catch (err) {
    showMsg("Kamera: " + err.message, true);
  }
}

function stopCamera() {
  if (camStream) {
    camStream.getTracks().forEach(t => t.stop());
    camStream = null;
  }
}

startCamera();

// ─── CAPTURE ──────────────────────────────────────────────────────────────────
captureBtn.addEventListener("click", () => {
  if (!video.srcObject) { showMsg("Kamera tayyor emas", true); return; }

  const vw = video.videoWidth  || 480;
  const vh = video.videoHeight || 640;

  const canvas = document.createElement("canvas");
  canvas.width  = vw;
  canvas.height = vh;
  const ctx = canvas.getContext("2d");

  // ─── MIRROR FIX ───────────────────────────────────────────────────────────
  // Video CSS da scaleX(-1) bilan mirror ko'rsatiladi.
  // Preview da foydalanuvchi o'zini mirror ko'radi — bu tabiiy (selfie).
  // Rasmga olganda ham MIRROR saqlansin — foydalanuvchi ko'rgan narsa = saqlangan rasm.
  // Buning uchun canvas da ham scaleX(-1) qilamiz:
  ctx.translate(vw, 0);   // o'ng tomonga siljitamiz
  ctx.scale(-1, 1);       // gorizontal mirror
  ctx.drawImage(video, 0, 0, vw, vh);
  // ──────────────────────────────────────────────────────────────────────────

  const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
  selfieBase64  = dataUrl.split(",")[1];

  capturedImg.src           = dataUrl;
  capturedImg.style.display = "block";
  video.style.display       = "none";

  captureBtn.classList.add("hidden");
  retakeBtn.classList.remove("hidden");
  submitBtn.classList.remove("hidden");

  showMsg("Rasm olindi — Tasdiqlash tugmasini bosing");
});

// ─── RETAKE ───────────────────────────────────────────────────────────────────
retakeBtn.addEventListener("click", () => {
  selfieBase64              = null;
  capturedImg.style.display = "none";
  video.style.display       = "block";
  retakeBtn.classList.add("hidden");
  submitBtn.classList.add("hidden");
  captureBtn.classList.remove("hidden");
  clearMsg();
});

// ─── SUBMIT ───────────────────────────────────────────────────────────────────
submitBtn.addEventListener("click", async () => {
  if (!selfieBase64) { showMsg("Avval rasm oling!", true); return; }
  if (!telegramId)   { showMsg("Telegram orqali oching!", true); return; }

  submitBtn.disabled    = true;
  submitBtn.textContent = "Yuborilmoqda...";
  showMsg("Serverga ulanilmoqda...");

  const ok = await sendAttendance();

  if (ok) {
    stopCamera();
    showSuccessPanel();
  } else {
    submitBtn.disabled    = false;
    submitBtn.textContent = "✅ Tasdiqlash";
  }
});

// ─── SERVER GA YUBORISH ───────────────────────────────────────────────────────
async function sendAttendance() {
  try {
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

    const res = await fetch(`${SERVER}/api/attendance`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });

    let result = {};
    try { result = await res.json(); } catch { result = {}; }

    if (res.ok) return true;

    let errText = `Xato (${res.status})`;
    if (typeof result.detail === "string") {
      errText = result.detail;
    } else if (Array.isArray(result.detail)) {
      errText = result.detail
        .map(d => `"${Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : "?"}: ${d.msg}"`)
        .join(" | ");
    } else if (typeof result.message === "string") {
      errText = result.message;
    }
    showMsg(errText, true);
    return false;

  } catch (err) {
    showMsg("Server bilan aloqa yo'q", true);
    return false;
  }
}

// ─── TASDIQ EKRANI ────────────────────────────────────────────────────────────
function showSuccessPanel() {
  const label = attendanceType === "KIRISH" ? "Kirish" : "Chiqish";
  const emoji = attendanceType === "KIRISH" ? "🟢" : "🔴";
  const now   = new Date();

  successIcon.textContent = emoji;
  successSub.textContent  = `${label} qayd etildi ✓`;
  successInfo.innerHTML   = `
    📅 ${now.toLocaleDateString("uz-UZ", { day:"2-digit", month:"2-digit", year:"numeric" })}<br>
    🕐 ${now.toLocaleTimeString("uz-UZ")}<br>
    📍 ${latitude ? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` : "Lokatsiya yo'q"}
  `;

  mainPanel.classList.add("hidden");
  successPanel.classList.remove("hidden");

  setTimeout(closeApp, 5000);
}

// ─── YOPISH ───────────────────────────────────────────────────────────────────
function closeApp() {
  if (tg) {
    tg.close();
  } else {
    successPanel.classList.add("hidden");
    mainPanel.classList.remove("hidden");
    capturedImg.style.display = "none";
    video.style.display       = "block";
    captureBtn.classList.remove("hidden");
    retakeBtn.classList.add("hidden");
    submitBtn.classList.add("hidden");
    submitBtn.disabled        = false;
    submitBtn.textContent     = "✅ Tasdiqlash";
    selfieBase64              = null;
    clearMsg();
    startCamera();
    getLocation();
  }
}
