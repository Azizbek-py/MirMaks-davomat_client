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
let stream         = null; // kamera stream
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
// FIX: video element CSS da mirror ko'rsatiladi (foydalanuvchi o'zini to'g'ri ko'rsin)
// Lekin canvas ga chizishda MIRROR YO'Q — rasm to'g'ri saqlanadi
video.style.transform = "scaleX(-1)";

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 640 } },
      audio: false
    });
    video.srcObject = stream;
  } catch (err) {
    showMsg("Kamera: " + err.message, true);
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

  // Rasmni NORMAL saqlash (mirror yo'q) — serverga to'g'ri boradi
  ctx.drawImage(video, 0, 0, 480, 640);

  const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
  selfieBase64  = dataUrl.split(",")[1];

  // Preview da ham normal ko'rsatamiz
  capturedImg.style.transform = "none";
  capturedImg.src             = dataUrl;
  capturedImg.style.display   = "block";
  video.style.display         = "none";
  captureBtn.style.display    = "none";
  retakeBtn.style.display     = "block";
  showMsg("Rasm olindi — OK tugmasini bosing");
});

// ─── RETAKE ───────────────────────────────────────────────────────────────────
retakeBtn.addEventListener("click", () => {
  selfieBase64                = null;
  capturedImg.style.display   = "none";
  video.style.display         = "block";
  retakeBtn.style.display     = "none";
  captureBtn.style.display    = "block";
  clearMsg();
});

// ─── SUBMIT ───────────────────────────────────────────────────────────────────
submitBtn.addEventListener("click", async () => {
  if (!selfieBase64) { showMsg("Avval rasm oling!", true); return; }
  if (!telegramId)   { showMsg("Telegram orqali oching!", true); return; }

  submitBtn.disabled    = true;
  submitBtn.textContent = "Yuborilmoqda...";
  showMsg("Serverga ulanilmoqda...");

  const ok = await trySendJSON();
  if (!ok) {
    showMsg("Server bilan aloqa o'rnatilmadi. Keyinroq urinib ko'ring.", true);
    submitBtn.disabled    = false;
    submitBtn.textContent = "OK";
    return;
  }

  // ✅ Muvaffaqiyat — WebApp yopish yoki tasdiq ekranini ko'rsatish
  showSuccessScreen();
});

// ─── JSON BODY orqali yuborish ────────────────────────────────────────────────
async function trySendJSON() {
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

    // Xato matnini chiqarish
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
    console.warn("[DEBUG] Fetch xato:", err.message);
    return false;
  }
}

// ─── TASDIQ EKRANI ────────────────────────────────────────────────────────────
function showSuccessScreen() {
  // Kamerani o'chiramiz
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }

  const label = attendanceType === "KIRISH" ? "Kirish" : "Chiqish";
  const emoji = attendanceType === "KIRISH" ? "🟢" : "🔴";

  // Butun panelni tasdiq ekrani bilan almashtiramiz
  const panel = document.querySelector(".panel");
  panel.innerHTML = `
    <div style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 400px;
      gap: 24px;
      text-align: center;
    ">
      <div style="
        width: 100px;
        height: 100px;
        border-radius: 50%;
        background: linear-gradient(135deg, #00d98e, #00ff99);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 48px;
        box-shadow: 0 0 40px rgba(0,217,142,0.5);
        animation: pulse 1.5s infinite;
      ">${emoji}</div>

      <div>
        <div style="font-size: 26px; font-weight: 800; color: #00d98e; margin-bottom: 8px;">
          Muvaffaqiyatli!
        </div>
        <div style="font-size: 17px; color: #b0b0b0; font-weight: 600;">
          ${label} qayd etildi ✓
        </div>
      </div>

      <div style="
        width: 100%;
        padding: 18px 24px;
        border-radius: 20px;
        background: rgba(0,217,142,0.08);
        border: 2px solid rgba(0,217,142,0.3);
        font-size: 15px;
        color: #b0b0b0;
        line-height: 1.7;
      ">
        📅 ${new Date().toLocaleDateString("uz-UZ")}<br>
        🕐 ${new Date().toLocaleTimeString("uz-UZ")}<br>
        📍 ${latitude.toFixed(4)}, ${longitude.toFixed(4)}
      </div>

      <button onclick="closeApp()" style="
        width: 100%;
        padding: 18px 0;
        border-radius: 20px;
        background: linear-gradient(135deg, #00d98e, #00ff99);
        color: #000;
        font-size: 17px;
        font-weight: 800;
        border: none;
        cursor: pointer;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        box-shadow: 0 10px 30px rgba(0,217,142,0.4);
      ">Yopish</button>
    </div>
  `;

  // 5 sekunddan keyin avtomatik yopiladi
  setTimeout(closeApp, 5000);
}

// ─── WEBAPP YOPISH ────────────────────────────────────────────────────────────
function closeApp() {
  // 1. Telegram WebApp API orqali yopish (eng to'g'ri usul)
  if (tg) {
    tg.close();
    return;
  }
  // 2. Brauzerda ochilgan bo'lsa — sahifani qayta yuklash
  resetUI();
}

// ─── RESET ────────────────────────────────────────────────────────────────────
function resetUI() {
  selfieBase64              = null;
  capturedImg.style.display = "none";
  video.style.display       = "block";
  retakeBtn.style.display   = "none";
  captureBtn.style.display  = "block";
  submitBtn.disabled        = false;
  submitBtn.textContent     = "OK";
  clearMsg();
  startCamera();
  getLocation();
}
