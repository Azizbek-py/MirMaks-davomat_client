// ─── CONFIG ───────────────────────────────────────────────────────────────────
const SERVER = "https://mirmaks-davomat-server.onrender.com";

// ─── STATE ────────────────────────────────────────────────────────────────────
let attendanceType = "KIRISH";   // "KIRISH" | "CHIQISH"
let capturedBlob   = null;       // rasm blob
let latitude       = null;
let longitude      = null;
let locationReady  = false;
let employees      = [];         // serverdan kelgan xodimlar
let selectedId     = null;       // tanlangan xodim ID

// ─── DOM ──────────────────────────────────────────────────────────────────────
const video         = document.getElementById("camera");
const capturedImg   = document.getElementById("captured-image");
const captureBtn    = document.getElementById("capture");
const retakeBtn     = document.getElementById("retake");
const submitBtn     = document.getElementById("submit");
const msgBox        = document.getElementById("message");
const locationEl    = document.getElementById("location-status");
const clockEl       = document.getElementById("clock");
const tabs          = document.querySelectorAll(".tab");

// ─── CLOCK ────────────────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  clockEl.textContent = `${h}:${m}:${s}`;
}
setInterval(updateClock, 1000);
updateClock();

// ─── MESSAGE ──────────────────────────────────────────────────────────────────
function showMsg(text, isError = false) {
  msgBox.textContent = text;
  msgBox.style.color = isError ? "#ff6b6b" : "#00d98e";
  // animatsiya reset
  msgBox.style.animation = "none";
  requestAnimationFrame(() => {
    msgBox.style.animation = "slideIn 0.3s ease";
  });
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
      locationReady = true;
      locationEl.textContent = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    },
    err => {
      locationEl.textContent = "Ruxsat berilmadi";
      console.warn("Lokatsiya xatosi:", err.message);
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

  // selfie mirror effect — chapdan o'ngga oynalash
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob(blob => {
    capturedBlob = blob;
    const url = URL.createObjectURL(blob);
    capturedImg.src = url;
    capturedImg.style.display = "block";
    video.style.display = "none";
    captureBtn.style.display = "none";
    retakeBtn.style.display  = "block";
    showMsg("Rasm olindi. OK tugmasini bosing.");
  }, "image/jpeg", 0.85);
});

// ─── RETAKE ───────────────────────────────────────────────────────────────────
retakeBtn.addEventListener("click", () => {
  capturedBlob = null;
  capturedImg.style.display = "none";
  video.style.display       = "block";
  retakeBtn.style.display   = "none";
  captureBtn.style.display  = "block";
  clearMsg();
});

// ─── XODIM TANLASH (agar kerak bo'lsa modal) ──────────────────────────────────
// Agar serverda employee_id kerak bo'lsa, oddiy select qo'shamiz
function injectEmployeeSelect(list) {
  // Agar allaqachon bor bo'lsa, qayta qo'shmaymiz
  if (document.getElementById("emp-select")) return;

  const wrapper = document.createElement("div");
  wrapper.style.cssText = `
    margin-bottom: 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  `;

  const label = document.createElement("label");
  label.textContent = "Xodimni tanlang";
  label.style.cssText = "color:#b0b0b0; font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:1px;";

  const select = document.createElement("select");
  select.id = "emp-select";
  select.style.cssText = `
    width: 100%;
    padding: 14px 18px;
    border-radius: 16px;
    border: 2px solid rgba(0,217,142,0.3);
    background: rgba(40,40,40,0.9);
    color: #fff;
    font-size: 16px;
    font-weight: 700;
    font-family: inherit;
    outline: none;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
  `;

  const defaultOpt = document.createElement("option");
  defaultOpt.value = "";
  defaultOpt.textContent = "— Tanlang —";
  select.appendChild(defaultOpt);

  list.forEach(emp => {
    const opt = document.createElement("option");
    opt.value = emp.id || emp.employee_id || emp._id;
    opt.textContent = emp.name || emp.full_name || emp.username || ("ID: " + opt.value);
    select.appendChild(opt);
  });

  select.addEventListener("change", () => {
    selectedId = select.value || null;
  });

  wrapper.appendChild(label);
  wrapper.appendChild(select);

  // toggle dan keyin qo'shamiz
  const toggle = document.querySelector(".toggle");
  toggle.insertAdjacentElement("afterend", wrapper);
}

// ─── XODIMLARNI YUKLASH ───────────────────────────────────────────────────────
async function loadEmployees() {
  try {
    const res  = await fetch(`${SERVER}/api/employees`);
    const data = await res.json();
    // server massiv yoki {employees: [...]} qaytarishi mumkin
    employees = Array.isArray(data) ? data : (data.employees || data.data || []);
    if (employees.length > 0) {
      injectEmployeeSelect(employees);
    }
  } catch (err) {
    console.warn("Xodimlar yuklanmadi:", err.message);
    // Xodim ro'yxati yuklanmasa ham app ishlayveradi
  }
}
loadEmployees();

// ─── SUBMIT ───────────────────────────────────────────────────────────────────
submitBtn.addEventListener("click", async () => {
  // Validatsiya
  if (!capturedBlob) {
    showMsg("Avval rasm oling!", true);
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Yuborilmoqda...";
  showMsg("Server bilan bog'lanilmoqda...");

  try {
    const formData = new FormData();

    // Rasm
    formData.append("photo", capturedBlob, "photo.jpg");

    // Tur: KIRISH / CHIQISH
    formData.append("type", attendanceType);

    // Vaqt (ISO format)
    formData.append("timestamp", new Date().toISOString());

    // Lokatsiya
    if (latitude !== null)  formData.append("latitude",  latitude);
    if (longitude !== null) formData.append("longitude", longitude);

    // Xodim ID (agar tanlangan bo'lsa)
    if (selectedId) formData.append("employee_id", selectedId);

    const response = await fetch(`${SERVER}/api/attendance`, {
      method: "POST",
      body: formData
      // Content-Type headerini QOLDIRAMIZ — FormData o'zi boundary qo'shadi
    });

    let result;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      result = await response.json();
    } else {
      result = { message: await response.text() };
    }

    console.log("Server javobi:", result);

    if (!response.ok) {
      const errMsg = result.detail || result.message || result.error || "Server xatosi";
      throw new Error(errMsg);
    }

    // ✅ Muvaffaqiyat
    showMsg("✓ Davomat yuborildi!");
    // 3 sekunddan keyin reset
    setTimeout(() => {
      resetUI();
    }, 3000);

  } catch (err) {
    console.error("Submit xatosi:", err);
    showMsg(err.message || "Xato yuz berdi", true);
  } finally {
    submitBtn.disabled  = false;
    submitBtn.textContent = "OK";
  }
});

// ─── RESET UI ─────────────────────────────────────────────────────────────────
function resetUI() {
  capturedBlob = null;
  capturedImg.style.display = "none";
  video.style.display       = "block";
  retakeBtn.style.display   = "none";
  captureBtn.style.display  = "block";

  // Select reset
  const sel = document.getElementById("emp-select");
  if (sel) { sel.value = ""; selectedId = null; }

  clearMsg();
  // Lokatsiyani yangilaymiz
  getLocation();
}
