// ─── CONFIG ───────────────────────────────────────────────────────────────────
const SERVER = "https://mirmaks-davomat-server.onrender.com";

// ─── TELEGRAM WEBAPP — employee_id URL parametrdan olinadi ───────────────────
function getEmployeeId() {
  // 1. URL query parametr: ?user_id=... yoki ?employee_id=...
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("user_id") || params.get("employee_id") || params.get("id");
  if (fromUrl) return fromUrl;

  // 2. Telegram WebApp initData (agar mavjud bo'lsa)
  try {
    if (window.Telegram && window.Telegram.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();
      const tgUser = (tg.initDataUnsafe || {}).user || {};
      if (tgUser.id) return String(tgUser.id);
    }
  } catch (e) {
    console.warn("Telegram WebApp:", e);
  }

  return null;
}

// ─── STATE ────────────────────────────────────────────────────────────────────
let attendanceType = "KIRISH";
let capturedBlob   = null;
let latitude       = null;
let longitude      = null;
const employeeId   = getEmployeeId();

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
    .map(n => String(n).padStart(2, "0"))
    .join(":");
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
      locationEl.textContent = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    },
    err => {
      locationEl.textContent = "Ruxsat yo'q";
      console.warn("GPS:", err.message);
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}
getLocation();

// ─── CAMERA ───────────────────────────────────────────────────────────────────
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 853 } },
      audio: false
    });
    video.srcObject = stream;
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
  // Selfie mirror
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob(blob => {
    capturedBlob = blob;
    capturedImg.src = URL.createObjectURL(blob);
    capturedImg.style.display = "block";
    video.style.display       = "none";
    captureBtn.style.display  = "none";
    retakeBtn.style.display   = "block";
    showMsg("Rasm olindi — OK tugmasini bosing");
  }, "image/jpeg", 0.85);
});

// ─── RETAKE ───────────────────────────────────────────────────────────────────
retakeBtn.addEventListener("click", () => {
  capturedBlob              = null;
  capturedImg.style.display = "none";
  video.style.display       = "block";
  retakeBtn.style.display   = "none";
  captureBtn.style.display  = "block";
  clearMsg();
});

// ─── SUBMIT ───────────────────────────────────────────────────────────────────
submitBtn.addEventListener("click", async () => {
  if (!capturedBlob) { showMsg("Avval rasm oling!", true); return; }

  submitBtn.disabled    = true;
  submitBtn.textContent = "Yuborilmoqda...";
  showMsg("Serverga ulanilmoqda...");

  try {
    const formData = new FormData();
    formData.append("photo",     capturedBlob, "photo.jpg");
    formData.append("type",      attendanceType);
    formData.append("timestamp", new Date().toISOString());

    if (latitude  !== null) formData.append("latitude",  String(latitude));
    if (longitude !== null) formData.append("longitude", String(longitude));
    if (employeeId)         formData.append("employee_id", employeeId);

    const response = await fetch(`${SERVER}/api/attendance`, {
      method: "POST",
      body: formData
      // Content-Type YO'Q — FormData o'zi boundary qo'shadi
    });

    // Server javobini xavfsiz o'qiymiz
    let result = {};
    try { result = await response.json(); } catch { result = {}; }
    console.log("Server javobi:", result);

    if (!response.ok) {
      let errText = "Server xatosi (" + response.status + ")";
      if (typeof result.detail === "string") {
        errText = result.detail;
      } else if (Array.isArray(result.detail)) {
        // FastAPI validation xatolari massiv bo'ladi
        errText = result.detail.map(d => d.msg || JSON.stringify(d)).join(" | ");
      } else if (typeof result.message === "string") {
        errText = result.message;
      }
      throw new Error(errText);
    }

    // ✅ Muvaffaqiyat
    const ok = result.message || result.detail || "Davomat yuborildi ✓";
    showMsg(typeof ok === "string" ? ok : "Davomat yuborildi ✓");
    setTimeout(resetUI, 3000);

  } catch (err) {
    console.error("Xato:", err);
    showMsg(typeof err.message === "string" ? err.message : "Noma'lum xato", true);
  } finally {
    submitBtn.disabled    = false;
    submitBtn.textContent = "OK";
  }
});

// ─── RESET ────────────────────────────────────────────────────────────────────
function resetUI() {
  capturedBlob              = null;
  capturedImg.style.display = "none";
  video.style.display       = "block";
  retakeBtn.style.display   = "none";
  captureBtn.style.display  = "block";
  clearMsg();
  getLocation();
}
