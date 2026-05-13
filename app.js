console.log('App.js loaded');

// DOM Elements
const typeButtons = document.querySelectorAll('.tab');
const captureButton = document.getElementById('capture');
const submitButton = document.getElementById('submit');
const retakeButton = document.getElementById('retake');
const clockLabel = document.getElementById('clock');
const locationStatus = document.getElementById('location-status');
const message = document.getElementById('message');
const video = document.getElementById('camera');
const capturedImage = document.getElementById('captured-image');

console.log('Elements found:', {
  typeButtons: typeButtons.length,
  captureButton,
  submitButton,
  retakeButton,
  clockLabel,
  locationStatus,
  message,
  video
});

// State
let selectedType = 'KIRISH';
let latitude = 0;
let longitude = 0;
let accuracy = 0;
let selfieData = '';
let captureTime = 0;
let stream = null;

// API URL
const isLocalhost =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.protocol === 'file:';

const API_BASE_URL = isLocalhost
  ? 'http://127.0.0.1:8000'
  : (
      import.meta.env.VITE_API_URL ||
      'https://your-render-url.onrender.com'
    );

console.log('API_BASE_URL:', API_BASE_URL);

// Start Camera
async function startCamera() {
  try {
    console.log('Starting camera...');

    const constraints = {
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };

    stream = await navigator.mediaDevices.getUserMedia(constraints);

    video.srcObject = stream;

    console.log('Camera started successfully');

    setMessage('Kamera tayyor');
  } catch (err) {
    console.error('Camera error:', err);

    setMessage(
      'Kamera ruxsati berilmadi: ' + err.message,
      true
    );
  }
}

// Set Message
function setMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? '#ff6b6b' : '#00d98e';
}

// Update Clock
function updateClock() {
  const now = new Date();

  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  clockLabel.textContent = ${hours}:${minutes}:${seconds};
}

// Get Location
function getLocation() {
  if (!navigator.geolocation) {
    setMessage('Geolocation qo‘llab-quvvatlanmadi', true);
    return;
  }

  navigator.geolocation.watchPosition(
    (position) => {
      latitude = position.coords.latitude;
      longitude = position.coords.longitude;
      accuracy = position.coords.accuracy;

      locationStatus.textContent =
        ${latitude.toFixed(4)}, ${longitude.toFixed(4)};

      console.log('Location updated:', {
        latitude,
        longitude,
        accuracy
      });
    },
    (err) => {
      console.error('Location error:', err);

      locationStatus.textContent =
        'Xatolik: ' + err.message;
    },
    {
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 0
    }
  );
}

// Tab Buttons
typeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    typeButtons.forEach(b =>
      b.classList.remove('active')
    );

    btn.classList.add('active');

    selectedType = btn.dataset.type;

    console.log('Type selected:', selectedType);
  });
});

// Capture Button
captureButton.addEventListener('click', () => {
  console.log('Capture clicked');

  if (!video.videoWidth) {
    setMessage('Kamera hali tayyor emas', true);
    return;
  }

  const canvas = document.createElement('canvas');

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext('2d');

  ctx.drawImage(
    video,
    0,
    0,
    canvas.width,
    canvas.height
  );

  selfieData = canvas.toDataURL(
    'image/jpeg',
    0.85
  );

  captureTime = Math.floor(Date.now() / 1000);

  console.log(
    'Captured image, size:',
    selfieData.length
  );

  // Stop camera
  if (stream) {
    stream.getTracks().forEach(track =>
      track.stop()
                               );
  }

  // Hide video, show image
  video.style.display = 'none';

  capturedImage.src = selfieData;

  capturedImage.style.display = 'block';

  // Buttons
  captureButton.style.display = 'none';

  retakeButton.style.display = 'inline-block';

  setMessage('Rasm olindi ✓');
});

// Retake Button
retakeButton.addEventListener('click', async () => {
  console.log('Retake clicked');

  capturedImage.style.display = 'none';

  video.style.display = 'block';

  await startCamera();

  selfieData = '';

  captureTime = 0;

  retakeButton.style.display = 'none';

  captureButton.style.display = 'inline-block';

  setMessage('');
});

// Submit Button
submitButton.addEventListener('click', async () => {
  console.log('Submit clicked');

  if (!selfieData) {
    return setMessage(
      'Avval rasm oling',
      true
    );
  }

  if (latitude === 0 || longitude === 0) {
    return setMessage(
      'Joylashuv aniqlanmadi',
      true
    );
  }

  // Telegram initData
  let initData =
    window.Telegram?.WebApp?.initData;

  // Local testing mock
  if (!initData) {
    initData =
      'query_id=mock&user=test&auth_date=123456&hash=abcdef';

    console.log(
      'Using mock initData for local testing'
    );
  }

  console.log(
    'InitData present:',
    !!initData
  );

  submitButton.disabled = true;

  setMessage('Yuborilmoqda...');

  try {
    const payload = {
      telegram_id:
        window.Telegram?.WebApp
          ?.initDataUnsafe?.user?.id ||
        123456789,

      type: selectedType,

      latitude,
      longitude,
      accuracy,

      selfie_data: selfieData,

      init_data: initData,

      device_info: navigator.userAgent,

      platform: navigator.platform,

      capture_time: captureTime,
    };

    console.log('Sending payload:', {
      ...payload,
      selfie_data: '...'
    });

    const response = await fetch(
      ${API_BASE_URL}/api/attendance,
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json'
        },

        body: JSON.stringify(payload),
      }
    );

    const result = await response.json();

    console.log('Response:', result);

    if (!response.ok) {
      throw new Error(
        result.detail ||
        'Xatolik yuz berdi'
      );
    }

    setMessage(
      'Davomat qabul qilindi ✓'
    );

    setTimeout(async () => {
      selfieData = '';

      retakeButton.style.display = 'none';

      captureButton.style.display =
        'inline-block';

      setMessage('');

      capturedImage.style.display = 'none';

      video.style.display = 'block';

      await startCamera();
    }, 2000);

  } catch (err) {
    console.error('Submit error:', err);

    setMessage(err.message, true);

  } finally {
    submitButton.disabled = false;
  }
});

// Initialize
function init() {
  console.log('Initializing app...');

  startCamera();

  getLocation();

  updateClock();

  setInterval(updateClock, 1000);
}

// Start App
if (document.readyState === 'loading') {
  document.addEventListener(
    'DOMContentLoaded',
    init
  );
} else {
  init();
}
