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
let serverReady    = false;
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
// FIX: Android uchun timeout oshirildi, maximumAge qo'shildi,
//      va watchPosition ishlatildi — bir marta so'rab bekor qilmaydi
let geoWatchId = null;

function getLocation() {
  if (!navigator.geolocation) {
    locationEl.textContent = "Qo'llab-quvvatlanmaydi";
    return;
  }

  locationEl.textContent = "Aniqlanmoqda...";

  // Avval tez (past aniqlikda) olishga harakat qilamiz
  navigator.geolocation.getCurrentPosition(
    pos => {
      latitude  = pos.coords.latitude;
      longitude = pos.coords.longitude;
      accuracy  = Math.round(pos.coords.accuracy || 0);
      locationEl.textContent = `${latitude.toFixed(4)}, ${longitude.toFixed(4)} (±${accuracy}m)`;
    },
    () => {
      // Agar tez muvaffaqiyatsiz bo'lsa — past aniqlikda qayta urinib ko'ramiz
      navigator.geolocation.getCurrentPosition(
        pos => {
          latitude  = pos.coords.latitude;
          longitude = pos.coords.longitude;
          accuracy  = Math.round(pos.coords.accuracy || 0);
          locationEl.textContent = `${latitude.toFixed(4)}, ${longitude.toFixed(4)} (±${accuracy}m)`;
        },
        err => {
          // Android'da ba'zan ruxsat so'rovi kechikadi — xato turini ko'rsatamiz
          if (err.code === 1) {
            locationEl.textContent = "GPS ruxsati berilmagan";
          } else if (err.code === 2) {
            locationEl.textContent = "GPS signal yo'q";
          } else {
            locationEl.textContent = "GPS vaqt tugadi";
          }
        },
        {
          enableHighAccuracy: false,   // FIX: false — Android'da tezroq ishlaydi
          timeout: 30000,              // FIX: 30 soniya (10dan ko'p)
          maximumAge: 60000            // FIX: 1 daqiqa oldingi koordinatani qabul qiladi
        }
      );
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,                  // FIX: 15 soniya
      maximumAge: 10000                // FIX: 10 soniyalik kesh
    }
  );
}

getLocation();

// ─── SERVER UYG'OTISH ─────────────────────────────────────────────────────────
async function wakeUpServer() {
  try {
    const res = await fetch(`${SERVER}/`, { method: "GET" });
    if (res.ok) {
      serverReady = true;
      console.log("[SERVER] Tayyor ✓");
    }
  } catch {
    console.warn("[SERVER] Uyg'otib bo'lmadi, keyinroq urinamiz");
  }
}
wakeUpServer();

// ─── CAMERA ───────────────────────────────────────────────────────────────────
// FIX: Android'da kamera qorashi uchun to'liq qayta yozildi
async function startCamera() {
  stopCamera(); // oldingi stream'ni tozalash

  // FIX: video elementiga kerakli atributlarni JS orqali ham o'rnatamiz
  video.setAttribute("autoplay", "");
  video.setAttribute("playsinline", "");   // iOS + Android WebView uchun MUHIM
  video.setAttribute("muted", "");
  video.muted = true;

  // FIX: Android'da ideal constraints ishlatamiz — qattiq qiymat emas
  const constraints = {
    audio: false,
    video: {
      facingMode: { ideal: "user" },       // FIX: exact emas, ideal
      width:  { ideal: 640, max: 1280 },   // FIX: aniq o'lcham — qorashni oldini oladi
      height: { ideal: 480, max: 960 },
    }
  };

  try {
    camStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = camStream;

    // FIX: Android'da play() promiseni kutish kerak
    try {
      await video.play();
    } catch (playErr) {
      // Ba'zi Android brauzerlarida play() avtomatik chaqiriladi — xato normal
      console.warn("[CAM] play() xatosi (normal):", playErr.message);
    }

    // FIX: loadedmetadata kutish — video o'lchamlari tayyor bo'lguncha
    await new Promise((resolve) => {
      if (video.readyState >= 2) {
        resolve();
      } else {
        video.addEventListener("loadedmetadata", resolve, { once: true });
        // Xavfsizlik uchun timeout
        setTimeout(resolve, 3000);
      }
    });

    console.log(`[CAM] ${video.videoWidth}x${video.videoHeight} — tayyor`);

  } catch (err) {
    // FIX: Constraints ishlamasa — eng oddiy rejimda qayta urinib ko'ramiz
    console.warn("[CAM] Constraints bilan ishlamadi, oddiy rejim:", err.message);
    try {
      camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      video.srcObject = camStream;
      await video.play().catch(() => {});
    } catch (fallbackErr) {
      showMsg("Kamera: " + fallbackErr.message, true);
    }
  }
}

function stopCamera() {
  if (camStream) {
    camStream.getTracks().forEach(t => t.stop());
    camStream = null;
  }
  video.srcObject = null;
}

startCamera();

// ─── CAPTURE ──────────────────────────────────────────────────────────────────
captureBtn.addEventListener("click", () => {
  // FIX: videoWidth 0 bo'lsa — kamera hali tayyor emas
  const vw = video.videoWidth;
  const vh = video.videoHeight;

  if (!camStream || !vw || !vh) {
    showMsg("Kamera hali tayyor emas, kuting...", true);
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width  = vw;
  canvas.height = vh;
  const ctx = canvas.getContext("2d");

  // Mirror — livecam bilan bir xil ko'rinsin
  ctx.translate(vw, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, vw, vh);

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
retakeBtn.addEventListener("click", async () => {
  selfieBase64              = null;
  capturedImg.style.display = "none";
  video.style.display       = "block";
  retakeBtn.classList.add("hidden");
  submitBtn.classList.add("hidden");
  captureBtn.classList.remove("hidden");
  clearMsg();

  // FIX: Retake'da kamerani qayta ishga tushiramiz
  await startCamera();
});

// ─── SUBMIT ───────────────────────────────────────────────────────────────────
submitBtn.addEventListener("click", async () => {
  if (!selfieBase64) { showMsg("Avval rasm oling!", true); return; }
  if (!telegramId)   { showMsg("Telegram orqali oching!", true); return; }

  submitBtn.disabled    = true;
  submitBtn.textContent = "Yuborilmoqda...";
  showMsg("Serverga ulanilmoqda...");

  if (!serverReady) {
    showMsg("Server uyg'onmoqda... (30 soniya)");
    await wakeUpServer();
  }

  const ok = await sendWithRetry(3);

  if (ok) {
    stopCamera();
    showSuccessPanel();
  } else {
    submitBtn.disabled    = false;
    submitBtn.textContent = "✅ Tasdiqlash";
  }
});

// ─── RETRY MEXANIZMI ──────────────────────────────────────────────────────────
async function sendWithRetry(maxAttempts) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      showMsg(`Qayta urinish ${attempt}/${maxAttempts}...`);
      await sleep(3000);
    }

    const result = await sendAttendance();

    if (result.success) return true;

    if (!result.retry) {
      showMsg(result.message, true);
      return false;
    }

    if (attempt < maxAttempts) {
      showMsg("Server uyg'onmoqda...");
      await wakeUpServer();
    }
  }

  showMsg("Server bilan aloqa o'rnatilmadi. Keyinroq urinib ko'ring.", true);
  return false;
}

// ─── SLEEP HELPER ─────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
    try { result = await res.json(); } catch {}

    if (res.ok) return { success: true };

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
