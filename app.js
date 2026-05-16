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
const telegramId   = getTelegramId();
const initData     = getInitData();

console.log("[DEBUG] telegramId:", telegramId);

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
  }
}
startCamera();

// ─── CAPTURE ──────────────────────────────────────────────────────────────────
captureBtn.addEventListener("click", () => {
  if (!video.srcObject) { showMsg("Kamera tayyor emas", true); return; }
  const canvas = document.createElement("canvas");
  canvas.width = 480; canvas.height = 640;
  canvas.getContext("2d").drawImage(video, 0, 0, 480, 640);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
  selfieBase64 = dataUrl.split(",")[1];
  capturedImg.src = dataUrl;
  capturedImg.style.display = "block";
  video.style.display       = "none";
  captureBtn.style.display  = "none";
  retakeBtn.style.display   = "block";
  showMsg("Rasm olindi — OK tugmasini bosing");
});

// ─── RETAKE ───────────────────────────────────────────────────────────────────
retakeBtn.addEventListener("click", () => {
  selfieBase64 = null;
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

  // Ikkala usulni sinab ko'ramiz: avval JSON body, muvaffaqiyatsiz bo'lsa query
  const success = await trySendJSON() || await trySendQuery();
  if (!success) {
    showMsg("Server bilan aloqa o'rnatilmadi. Keyinroq urinib ko'ring.", true);
  }

  submitBtn.disabled    = false;
  submitBtn.textContent = "OK";
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

    return await handleResponse(res);
  } catch (err) {
    console.warn("[DEBUG] JSON usul xato:", err.message);
    return false;
  }
}

// ─── QUERY PARAMETR orqali yuborish ──────────────────────────────────────────
async function trySendQuery() {
  try {
    // selfie_data query ga sig'masligi mumkin, shuning uchun FormData ishlatamiz
    const formData = new FormData();
    formData.append("telegram_id", String(telegramId));
    formData.append("type",        attendanceType);
    formData.append("latitude",    String(latitude));
    formData.append("longitude",   String(longitude));
    formData.append("accuracy",    String(accuracy));
    formData.append("selfie_data", selfieBase64);
    formData.append("init_data",   initData);
    formData.append("timestamp",   new Date().toISOString());

    const query = new URLSearchParams({
      telegram_id: String(telegramId),
      type:        attendanceType,
      latitude:    String(latitude),
      longitude:   String(longitude),
      accuracy:    String(accuracy),
      selfie_data: selfieBase64,
      init_data:   initData,
    });

    const res = await fetch(`${SERVER}/api/attendance?${query.toString()}`, {
      method: "POST",
    });

    return await handleResponse(res);
  } catch (err) {
    console.warn("[DEBUG] Query usul xato:", err.message);
    return false;
  }
}

// ─── JAVOBNI QAYTA ISHLASH ────────────────────────────────────────────────────
async function handleResponse(res) {
  console.log("[DEBUG] Status:", res.status);
  let result = {};
  try { result = await res.json(); } catch { result = {}; }
  console.log("[DEBUG] Javob:", result);

  if (res.ok) {
    const msg = result.message || "Davomat yuborildi ✓";
    showMsg(typeof msg === "string" ? msg : "Davomat yuborildi ✓");
    setTimeout(resetUI, 3000);
    return true;
  }

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
