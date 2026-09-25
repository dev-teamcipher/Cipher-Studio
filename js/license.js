(function () {
  'use strict';
  const gate = document.getElementById('license-gate');
  const device = document.getElementById('license-device-id');
  const key = document.getElementById('license-key-input');
  const message = document.getElementById('license-message');
  const activate = document.getElementById('license-activate');
  const copy = document.getElementById('license-copy-device');
  const buyNow = document.getElementById('license-buy-now');
  const close = document.getElementById('license-close');
  const eyebrow = document.getElementById('license-eyebrow');
  const title = document.getElementById('license-title');
  const intro = document.getElementById('license-intro');
  const trialSummary = document.getElementById('license-trial-summary');
  const homeLabel = document.getElementById('home-license-label');
  const settingsStatus = document.getElementById('settings-license-status');
  let statusTimer = 0;
  let manualOpen = false;
  let lastStatus = null;

  function setMessage(text, success) {
    message.textContent = text || '';
    message.classList.toggle('success', Boolean(success));
  }
  async function status() {
    const response = await fetch('/api/license/status', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not check the license status.');
    return response.json();
  }
  function remainingText(ms) {
    const totalMinutes = Math.max(0, Math.ceil(Number(ms || 0) / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
  }
  function updateStatusSurfaces(result) {
    if (result.activated) {
      if (homeLabel) homeLabel.textContent = 'Lifetime Activated';
      if (settingsStatus) settingsStatus.textContent = `Lifetime license active${result.customer ? ` · ${result.customer}` : ''}`;
    } else if (result.trialActive) {
      const remaining = remainingText(result.trialRemainingMs);
      if (homeLabel) homeLabel.textContent = `Trial · ${remaining}`;
      if (settingsStatus) settingsStatus.textContent = `${remaining} remaining · Activate anytime with this device's lifetime key`;
    } else {
      if (homeLabel) homeLabel.textContent = 'Activation Required';
      if (settingsStatus) settingsStatus.textContent = 'Trial expired · Lifetime activation required';
    }
  }
  async function copyDeviceId() {
    const value = device.value;
    try { await navigator.clipboard.writeText(value); }
    catch { device.select(); document.execCommand('copy'); }
    copy.textContent = 'Copied';
    setTimeout(() => { copy.textContent = 'Copy'; }, 1400);
  }
  function scheduleStatusCheck(delay = 30000) {
    clearTimeout(statusTimer);
    statusTimer = setTimeout(initialize, Math.max(1000, Math.min(30000, delay)));
  }
  function showTrial(result) {
    const remaining = remainingText(result.trialRemainingMs);
    eyebrow.textContent = 'CIPHER STUDIO · 1-HOUR FULL TRIAL ACTIVE';
    title.textContent = 'Activate lifetime access anytime';
    intro.textContent = 'Copy this Device ID, send it to us on WhatsApp, then paste the activation key you receive below.';
    trialSummary.hidden = false;
    trialSummary.textContent = `${remaining} remaining in your full-feature trial. Every tool stays available until the trial ends.`;
    buyNow.hidden = false;
    close.hidden = false;
    gate.classList.remove('is-expired', 'is-hidden');
  }
  function showActivated(result) {
    eyebrow.textContent = 'CIPHER STUDIO · LICENSE ACTIVE';
    title.textContent = 'Lifetime access is activated';
    intro.textContent = `This device is permanently unlocked${result.customer ? ` for ${result.customer}` : ''}.`;
    trialSummary.hidden = false;
    trialSummary.textContent = 'All Cipher Studio tools and features are unlocked on this device.';
    buyNow.hidden = true;
    close.hidden = false;
    gate.classList.remove('is-expired', 'is-hidden');
  }
  function showExpired(result) {
    manualOpen = false; // FIXED: Allow auto-close when admin unsuspends
    eyebrow.textContent = 'CIPHER STUDIO · ACTIVATION REQUIRED';
    title.textContent = 'Software Activation Required';
    intro.textContent = 'All tools are locked. Copy this Device ID, send it to us on WhatsApp, then paste your lifetime activation key below.';
    trialSummary.hidden = false;
    trialSummary.textContent = 'Activation required to unlock this software.';
    buyNow.hidden = false;
    close.hidden = true;
    gate.classList.add('is-expired');
    gate.classList.remove('is-hidden');
    if (result.clockTampered) setMessage('The system clock changed during the trial. Activate a lifetime license to continue.');
  }
  async function initialize() {
    try {
      const result = await status();
      lastStatus = result;
      updateStatusSurfaces(result);
      if (device) device.value = result.deviceId || '';
      
      if (!result.accessGranted) {
        showExpired(result);
        if (result.state === 'suspended') {
            eyebrow.textContent = 'CIPHER STUDIO · ACCOUNT SUSPENDED';
            title.textContent = 'Account Suspended';
            intro.textContent = result.errorReason || 'Please contact the admin for re-activation: +923454582176';
            title.style.color = 'red';
        } else if (result.state === 'expired') {
            eyebrow.textContent = 'CIPHER STUDIO · LICENSE EXPIRED';
            title.textContent = 'License Expired';
            intro.textContent = result.errorReason || 'To renew or extend your license, please contact the admin: +923454582176';
            title.style.color = '#f59e0b';
        } else {
            title.style.color = 'white';
        }} else {
        if (!manualOpen) gate.classList.add('is-hidden');
      }
      scheduleStatusCheck(5000); // Check every 5s
    } catch (error) {
      scheduleStatusCheck(5000);
    }
  }
  function openActivation() {
    manualOpen = true;
    setMessage('');
    gate.classList.remove('is-hidden');
    initialize();
  }
  function closeActivation() {
    if (!lastStatus?.accessGranted) return;
    manualOpen = false;
    gate.classList.add('is-hidden');
  }

  copy.addEventListener('click', copyDeviceId);
  close.addEventListener('click', closeActivation);
  document.querySelectorAll('.btn-open-license').forEach(button => button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    openActivation();
  }));
  buyNow.addEventListener('click', async () => {
    const id = device.value;
    const whatsappText = `Hello, I want to activate Cipher Studio. My Device ID is: ${id}`;
    window.open(`https://wa.me/923454582176?text=${encodeURIComponent(whatsappText)}`, '_blank', 'noopener,noreferrer');
    await copyDeviceId();
    setMessage('Device ID copied and WhatsApp opened. Send the message, then paste the lifetime key below.', true);
    key.focus();
  });
  activate.addEventListener('click', async () => {
    const licenseKey = key.value.trim();
    if (!licenseKey) { setMessage('Paste the lifetime activation key first.'); return; }
    activate.disabled = true;
    setMessage('Verifying this key on your device…');
    try {
      const response = await fetch('/api/license/activate', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({key:licenseKey}) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || 'The license could not be activated.');
      setMessage(`Activated${result.customer ? ` for ${result.customer}` : ''}.`, true);
      clearTimeout(statusTimer);
      lastStatus = { ...(lastStatus || {}), activated:true, accessGranted:true, trialActive:false, customer:result.customer || '' };
      updateStatusSurfaces(lastStatus);
      setTimeout(() => { manualOpen=false; gate.classList.add('is-hidden'); }, 650);
    } catch (error) { setMessage(error.message || 'The license could not be activated.'); }
    finally { activate.disabled = false; }
  });

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    if (response.status === 403) response.clone().json().then(body => { if (body?.code === 'TRIAL_EXPIRED') initialize(); }).catch(() => {});
    return response;
  };

  window.CipherLicense = { open:openActivation, refresh:initialize, getStatus:() => lastStatus };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) initialize(); });
  initialize();
}());
