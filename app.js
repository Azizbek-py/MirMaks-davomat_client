// ─── CONFIG ───────────────────────────────────────────────────────────────────
const SERVER = "https://mirmaks-davomat-server.onrender.com";

// ─── TELEGRAM SDK YO'Q — brauzerda ishlaymiz ──────────────────────────────────
// Telegram WebApp SDK kerak emas, init_data ham yuborilmaydi

function getTelegramId() {
  const p = new URLSearchParams(window.location.search);
  const v = p.get("telegram_id") || p.get("user_id") || p.get("id");
  return v ? parseInt(v) : null;
}

// ─── STATE ────────────────────────────────────────────────────────────────────
let attendanceType = "KIRISH";
let selfieBase64   = null;
let latitude       = 0;
let longitude      = 0;
let accuracy       = 0;
let camStream      = null;
let serverReady    = false;
let gpsReady       = false;
let watchId        = null;
const telegramId   = getTelegramId();

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

// ─── TELEGRAM ID TEKSHIRISH ───────────────────────────────────────────────────
if (!telegramId) {
  document.body.innerHTML = `
    <div style="
      display:flex; flex-direction:column; align-items:center;
      justify-content:center; height:100vh; padding:24px;
      font-family:sans-serif; text-align:center; background:#0f0f0f; color:#fff;
    ">
      <div style="font-size:48px; margin-bottom:16px;">⚠️</div>
      <div style="font-size:18px; font-weight:bold; margin-bottom:8px;">Havola noto'g'ri</div>
      <div style="font-size:14px; color:#aaa;">
        Telegram bot orqali yuborilgan havoladan oching
      </div>
    </div>
  `;
}

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

// ─── GPS ──────────────────────────────────────────────────────────────────────
// Brauzerda GPS so'rovi — foydalanuvchi ruxsat berishi kerak bo'ladi
// Android Chrome'da permission dialog chiqadi — bu normal

function startGPS() {
  if (!navigator.geolocation) {
    locationEl.textContent = "GPS yo'q";
    return;
  }

  locationEl.textContent = "GPS aniqlanmoqda...";

  // 1-bosqich: tez (network/WiFi) lokatsiya
  navigator.geolocation.getCurrentPosition(
    pos => onGPSSuccess(pos),
    err => onGPSError(err),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 }
  );

  // 2-bosqich: aniq GPS, parallel
  watchId = navigator.geolocation.watchPosition(
    pos => onGPSSuccess(pos),
    () => {},
    { enableHighAccuracy: true, timeout: 30000, maximumAge: 5000 }
  );
}

function onGPSSuccess(pos) {
  latitude  = pos.coords.latitude;
  longitude = pos.coords.longitude;
  accuracy  = Math.round(pos.coords.accuracy || 0);
  gpsReady  = true;
  locationEl.textContent = `${latitude.toFixed(4)}, ${longitude.toFixed(4)} ±${accuracy}m`;
}

function onGPSError(err) {
  const msgs = {
    1: "GPS ruxsati berilmagan",
    2: "GPS signal topilmadi",
    3: "GPS vaqt tugadi"
  };
  locationEl.textContent = msgs[err.code] || "GPS xato";
  if (err.code === 3) setTimeout(startGPS, 3000);
}

startGPS();

// ─── SERVER UYG'OTISH ─────────────────────────────────────────────────────────
async function wakeUpServer() {
  try {
    const res = await fetch(`${SERVER}/`, { method: "GET" });
    if (res.ok) serverReady = true;
  } catch {}
}
wakeUpServer();

// ─── CAMERA ───────────────────────────────────────────────────────────────────
// Brauzerda (Chrome Android, Firefox, Safari) getUserMedia yaxshi ishlaydi
// Telegram WebView'dagi cheklovlar yo'q

async function startCamera() {
  stopCamera();

  video.muted       = true;
  video.playsInline = true;

  // Brauzerda constraints ancha ishonchli ishlaydi
  const constraintsList = [
    // 1-urinish: old kamera, yaxshi sifat
    {
      video: { facingMode: { ideal: "user" }, width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    },
    // 2-urinish: istalgan kamera
    {
      video: { width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    },
    // 3-urinish: eng oddiy
    { video: true, audio: false }
  ];

  for (let i = 0; i < constraintsList.length; i++) {
    try {
      const stream    = await navigator.mediaDevices.getUserMedia(constraintsList[i]);
      camStream       = stream;
      video.srcObject = stream;
      await waitForVideoReady();
      return;
    } catch (err) {
      stopCamera();
      if (err.name === "NotAllowedError") {
        showMsg("Kamera ruxsati berilmagan — brauzer sozlamalaridan ruxsat bering", true);
        return;
      }
    }
  }

  showMsg("Kamera ishlamadi", true);
}

function waitForVideoReady() {
  return new Promise(resolve => {
    const tryPlay = () => {
      const p = video.play();
      if (p) p.catch(() => {});
    };

    if (video.readyState >= 3 && video.videoWidth > 0) { tryPlay(); resolve(); return; }

    let done = false;
    const finish = () => { if (!done) { done = true; tryPlay(); resolve(); } };

    video.addEventListener("canplay",     finish, { once: true });
    video.addEventListener("loadeddata",  finish, { once: true });

    const poll = setInterval(() => {
      if (video.videoWidth > 0) { clearInterval(poll); finish(); }
    }, 100);

    setTimeout(() => { clearInterval(poll); finish(); }, 5000);
  });
}

function stopCamera() {
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
  video.srcObject = null;
}

startCamera();

// ─── CAPTURE ──────────────────────────────────────────────────────────────────
captureBtn.addEventListener("click", () => {
  const vw = video.videoWidth;
  const vh = video.videoHeight;

  if (!camStream) { showMsg("Kamera ulanmagan", true); return; }

  if (!vw || !vh) {
    showMsg("Kamera yuklanmoqda...", true);
    waitForVideoReady().then(() => {
      if (video.videoWidth > 0) captureBtn.click();
      else showMsg("Kamera tayyor emas, qayta bosing", true);
    });
    return;
  }

  const canvas  = document.createElement("canvas");
  canvas.width  = vw;
  canvas.height = vh;
  const ctx     = canvas.getContext("2d");

  // Mirror — old kamera ko'zgudek ko'rinsin
  ctx.translate(vw, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, vw, vh);

  const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
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
retakeBtn.addEventListener("click", async () => {
  selfieBase64              = null;
  capturedImg.style.display = "none";
  video.style.display       = "block";
  retakeBtn.classList.add("hidden");
  submitBtn.classList.add("hidden");
  captureBtn.classList.remove("hidden");
  clearMsg();
  await startCamera();
});

// ─── SUBMIT ───────────────────────────────────────────────────────────────────
submitBtn.addEventListener("click", async () => {
  if (!selfieBase64) { showMsg("Avval rasm oling!", true); return; }
  if (!telegramId)   { showMsg("Havola noto'g'ri!", true); return; }

  if (!gpsReady) {
    showMsg("GPS hali aniqlanmadi, kuting...", true);
    return;
  }

  submitBtn.disabled    = true;
  submitBtn.textContent = "Yuborilmoqda...";
  showMsg("Serverga ulanilmoqda...");

  if (!serverReady) {
    showMsg("Server uyg'onmoqda...");
    await wakeUpServer();
  }

  const ok = await sendWithRetry(3);

  if (ok) {
    stopCamera();
    if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    showSuccessPanel();
  } else {
    submitBtn.disabled    = false;
    submitBtn.textContent = "✅ Tasdiqlash";
  }
});

// ─── RETRY ────────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function sendWithRetry(maxAttempts) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) { showMsg(`Qayta urinish ${attempt}/${maxAttempts}...`); await sleep(3000); }
    const result = await sendAttendance();
    if (result.success) return true;
    if (!result.retry) { showMsg(result.message, true); return false; }
    if (attempt < maxAttempts) await wakeUpServer();
  }
  showMsg("Server bilan aloqa o'rnatilmadi. Keyinroq urinib ko'ring.", true);
  return false;
}

// ─── YUBORISH ─────────────────────────────────────────────────────────────────
async function sendAttendance() {
  try {
    const payload = {
      telegram_id: telegramId,
      type:        attendanceType,
      latitude,
      longitude,
      accuracy,
      selfie_data: selfieBase64,
      init_data:   "",           // brauzerda init_data yo'q
      timestamp:   new Date().toISOString(),
      platform:    navigator.userAgent,
    };

    const res = await fetch(`${SERVER}/api/attendance`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });

    let result = {};
    try { result = await res.json(); } catch {}

    if (res.ok) return { success: true };

    let errText = `Xato (${res.status})`;
    if (typeof result.detail === "string") errText = result.detail;
    else if (Array.isArray(result.detail))
      errText = result.detail.map(d => `${d.loc?.at(-1)}: ${d.msg}`).join(" | ");
    else if (typeof result.message === "string") errText = result.message;

    return { success: false, retry: false, message: errText };
  } catch {
    return { success: false, retry: true, message: "Server bilan aloqa yo'q" };
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

  // Brauzerda sahifani yopish mumkin emas — faqat success ko'rsatamiz
  setTimeout(() => {
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
    startGPS();
  }, 5000);
}

// ─── YOPISH ───────────────────────────────────────────────────────────────────
// Brauzerda window.close() faqat JS tomonidan ochilgan tabni yopa oladi
// Shuning uchun foydalanuvchiga xabar ko'rsatamiz
function closeApp() {
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
  startGPS();
}
