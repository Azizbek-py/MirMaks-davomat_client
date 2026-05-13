// Submit
submitButton.addEventListener(
  'click',
  async () => {

    if (!selfieData) {

      setMessage(
        'Avval rasm oling',
        true
      );

      return;
    }

    if (latitude === 0 || longitude === 0) {

      setMessage(
        'Joylashuv aniqlanmadi',
        true
      );

      return;
    }

    let initData =
      window.Telegram?.WebApp?.initData;

    if (!initData) {

      initData =
        'query_id=test&user=test&auth_date=123456&hash=testhash';
    }

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

      const result =
        await response.json();

      if (!response.ok) {

        throw new Error(
          result.detail ||
          'Server xatosi'
        );
      }

      setMessage(
        'Davomat qabul qilindi ✓'
      );

      setTimeout(async () => {

        selfieData = '';

        capturedImage.style.display =
          'none';

        video.style.display = 'block';

        retakeButton.style.display =
          'none';

        captureButton.style.display =
          'inline-block';

        await startCamera();

        setMessage('');

      }, 2000);

    } catch (err) {

      console.error(err);

      setMessage(
        err.message,
        true
      );

    } finally {

      submitButton.disabled = false;
    }
  }
);

// Init
function init() {

  updateClock();

  setInterval(updateClock, 1000);

  getLocation();

  startCamera();
}

// Start
if (document.readyState === 'loading') {

  document.addEventListener(
    'DOMContentLoaded',
    init
  );

} else {

  init();
}
