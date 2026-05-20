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

// ─── GPS ──────────────────────────────────────────────────────────────────────
// Android WebView'da GPS ishonchli ishlashi uchun:
// 1. watchPosition — bir marta emas, doimiy kuzatadi
// 2. enableHighAccuracy: false — avval tez (network) lokatsiya oladi
// 3. Ikki bosqichli: avval tez, keyin aniq

let gpsReady = false;
let watchId  = null;

function startGPS() {
  if (!navigator.geolocation) {
    locationEl.textContent = "GPS yo'q";
    return;
  }

  locationEl.textContent = "GPS aniqlanmoqda...";

  // 1-bosqich: network orqali tez olish (Android'da 1-2 soniyada ishlaydi)
  navigator.geolocation.getCurrentPosition(
    pos => onGPSSuccess(pos, "tez"),
    err => onGPSError(err, "tez"),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 }
  );

  // 2-bosqich: GPS orqali aniq olish (parallel ishga tushadi)
  watchId = navigator.geolocation.watchPosition(
    pos => onGPSSuccess(pos, "aniq"),
    err => onGPSError(err, "aniq"),
    { enableHighAccuracy: true, timeout: 30000, maximumAge: 5000 }
  );
}

function onGPSSuccess(pos, source) {
  latitude  = pos.coords.latitude;
  longitude = pos.coords.longitude;
  accuracy  = Math.round(pos.coords.accuracy || 0);
  gpsReady  = true;
  locationEl.textContent = `${latitude.toFixed(4)}, ${longitude.toFixed(4)} ±${accuracy}m`;

  // Aniq GPS olindi — watchni to'xtatamiz
  if (source === "aniq" && watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

function onGPSError(err, source) {
  // Tez rejim xato berganda aniq rejim hali ishlaydi — xabar chiqarmaymiz
  if (source === "tez") return;

  const msgs = {
    1: "GPS ruxsati yo'q — telefon sozlamalaridan ruxsat bering",
    2: "GPS signal topilmadi — ochiq joyga chiqing",
    3: "GPS vaqt tugadi — qayta urinmoqda..."
  };
  locationEl.textContent = msgs[err.code] || "GPS xato";

  // Timeout bo'lsa qayta urinib ko'ramiz
  if (err.code === 3) {
    setTimeout(startGPS, 3000);
  }
}

startGPS();

// ─── SERVER UYG'OTISH ─────────────────────────────────────────────────────────
async function wakeUpServer() {
  try {
    const res = await fetch(`${SERVER}/`, { method: "GET" });
    if (res.ok) { serverReady = true; }
  } catch {
    // keyinroq qayta uriniladi
  }
}
wakeUpServer();

// ─── CAMERA ───────────────────────────────────────────────────────────────────
// Android Telegram WebView'da kamera qorong'u bo'lishining sabablari:
// 1. getUserMedia qaytgunga qadar video.play() chaqirilmaydi
// 2. srcObject o'rnatilgach loadedmetadata kutilmaydi
// 3. Constraints juda qattiq bo'lsa oqim tashlanadi
// 4. WebView kamera ruxsatini alohida so'raydi

async function startCamera() {
  stopCamera();

  // Video atributlarini JS orqali ham o'rnatamiz (HTML'ga qo'shimcha)
  video.setAttribute("autoplay", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("muted", "");
  video.muted      = true;
  video.playsInline = true;

  // Android uchun constraints — qattiq emas, ideal
  const constraintsList = [
    // 1-urinish: old kamera, ideal o'lcham
    {
      video: {
        facingMode: { ideal: "user" },
        width:  { ideal: 640 },
        height: { ideal: 480 }
      },
      audio: false
    },
    // 2-urinish: facingMode'siz
    {
      video: {
        width:  { ideal: 640 },
        height: { ideal: 480 }
      },
      audio: false
    },
    // 3-urinish: eng oddiy
    { video: true, audio: false }
  ];

  for (let i = 0; i < constraintsList.length; i++) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraintsList[i]);
      camStream      = stream;
      video.srcObject = stream;

      // Android'da MUHIM: srcObject o'rnatilgach play() chaqirilishi kerak
      // va loadedmetadata hodisasini kutish shart
      await waitForVideoReady();

      console.log(`[CAM] Ishladi (${i + 1}-urinish): ${video.videoWidth}x${video.videoHeight}`);
      showMsg(""); // xato xabarni tozalash
      return; // muvaffaqiyatli — chiqamiz

    } catch (err) {
      console.warn(`[CAM] ${i + 1}-urinish xato: ${err.name} — ${err.message}`);
      stopCamera();

      if (err.name === "NotAllowedError") {
        showMsg("Kamera ruxsati berilmagan — telefon sozlamalaridan ruxsat bering", true);
        return; // ruxsat yo'q — qayta urinishning foydasi yo'q
      }
      // Boshqa xatolarda keyingi constraints bilan davom etamiz
    }
  }

  showMsg("Kamera ishlamadi — brauzer kamerani qo'llab-quvvatlamayapti", true);
}

// Android'da video tayyor bo'lguncha kutish
function waitForVideoReady() {
  return new Promise((resolve) => {
    // play() ni chaqiramiz
    const playPromise = video.play();
    if (playPromise) {
      playPromise.catch(() => {}); // xatoni e'tiborsiz qoldiramiz
    }

    // Allaqachon tayyor bo'lsa — darhol
    if (video.readyState >= 3 && video.videoWidth > 0) {
      resolve();
      return;
    }

    let resolved = false;

    const done = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    // loadeddata — metadata + birinchi frame tayyor
    video.addEventListener("loadeddata", done, { once: true });

    // canplay — oqim o'ynashga tayyor
    video.addEventListener("canplay", done, { once: true });

    // videoWidth pollingsi — ba'zi Android'da hodisalar otib ketadi
    const poll = setInterval(() => {
      if (video.videoWidth > 0) {
        clearInterval(poll);
        done();
      }
    }, 100);

    // 5 soniyada majburiy hal — kutishni tugatamiz
    setTimeout(() => {
      clearInterval(poll);
      done();
    }, 5000);
  });
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
  const vw = video.videoWidth;
  const vh = video.videoHeight;

  if (!camStream) {
    showMsg("Kamera ulanmagan", true);
    return;
  }

  if (!vw || !vh) {
    // Video hali tayyor emas — kutib qayta urinib ko'ramiz
    showMsg("Kamera yuklanmoqda, bir soniya...", true);
    waitForVideoReady().then(() => {
      if (video.videoWidth > 0) captureBtn.click();
      else showMsg("Kamera tayyor emas, qayta bosing", true);
    });
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width  = vw;
  canvas.height = vh;
  const ctx = canvas.getContext("2d");

  // Mirror
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
  if (!telegramId)   { showMsg("Telegram orqali oching!", true); return; }

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
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
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
    if (attempt > 1) {
      showMsg(`Qayta urinish ${attempt}/${maxAttempts}...`);
      await sleep(3000);
    }
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
    startGPS();
  }
}
