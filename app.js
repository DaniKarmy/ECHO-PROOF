(() => {
  "use strict";

  const CONFIG = Object.freeze({
    version: "EP-MAP-1.0",
    width: 1920,
    height: 1440,
    cols: 6,
    rows: 4,
    cellWidth: 320,
    cellHeight: 360,
    lumaThreshold: 128,
    freqBase: 220,
    freqSpan: 660,
    panByCol: [-0.75, -0.45, -0.15, 0.15, 0.45, 0.75],
    toneMs: 180,
    gapMs: 40,
    roi: { x0: 1440, y0: 360, x1: 3360, y1: 1800 }
  });

  const SOURCE = Object.freeze({
    A: { date: "2026-06-18", frame: 426, file: "krasheninnikov_2026-06-18_ROI.png" },
    B: { date: "2026-06-30", frame: 439, file: "krasheninnikov_2026-06-30_ROI.png" }
  });

  const el = id => document.getElementById(id);
  const imgA = el("imgA");
  const imgB = el("imgB");
  const gridA = el("gridA");
  const gridB = el("gridB");
  const receiptBody = el("receiptBody");
  const status = el("status");
  const currentCell = el("currentCell");
  const playMatched = el("playMatched");
  const playA = el("playA");
  const playB = el("playB");
  const pauseButton = el("pause");
  const stopButton = el("stop");
  const muteButton = el("mute");
  const volume = el("volume");

  let receipts = { A: null, B: null };
  let audioCtx = null;
  let masterGain = null;
  let activeNodes = new Set();
  let playToken = 0;
  let muted = false;
  let paused = false;
  let playbackActive = false;
  let playbackStatus = "";
  let audioUnavailable = false;

  function buildGrid(container) {
    container.innerHTML = "";
    for (let i = 0; i < CONFIG.cols * CONFIG.rows; i++) {
      const cell = document.createElement("div");
      cell.className = "grid-cell";
      cell.dataset.index = String(i);
      container.appendChild(cell);
    }
  }

  buildGrid(gridA);
  buildGrid(gridB);

  function setStatus(message) {
    status.textContent = message;
  }

  function setControlsEnabled(enabled) {
    playMatched.disabled = !enabled;
    playA.disabled = !enabled;
    playB.disabled = !enabled;
  }
  setControlsEnabled(false);

  function wait(ms, token) {
    return new Promise(resolve => {
      let remaining = ms;
      let last = performance.now();

      function step() {
        if (token !== playToken) return resolve(false);

        const now = performance.now();
        if (!paused) remaining -= now - last;
        last = now;

        if (remaining <= 0) return resolve(true);
        setTimeout(step, Math.min(20, Math.max(1, remaining)));
      }

      setTimeout(step, Math.min(20, Math.max(1, ms)));
    });
  }

  function highlight(index, side = "both") {
    document.querySelectorAll(".grid-cell.active").forEach(x => x.classList.remove("active"));
    document.querySelectorAll("tbody tr.active").forEach(x => x.classList.remove("active"));
    if (index == null) return;

    if (side === "both" || side === "A") gridA.children[index]?.classList.add("active");
    if (side === "both" || side === "B") gridB.children[index]?.classList.add("active");
    receiptBody.children[index]?.classList.add("active");

    const a = receipts.A[index];
    const b = receipts.B[index];
    currentCell.textContent =
      `Cell ${index + 1} · r${a.row} c${a.col} · A ${a.freq.toFixed(1)} Hz · B ${b.freq.toFixed(1)} Hz · Δ ${(b.freq - a.freq).toFixed(1)} Hz`;
  }

  function loadImage(img) {
    return new Promise((resolve, reject) => {
      if (img.complete && img.naturalWidth) return resolve();
      img.addEventListener("load", resolve, { once: true });
      img.addEventListener("error", () => reject(new Error(`Could not load ${img.src}`)), { once: true });
    });
  }

  function computeReceipt(img, canvas, source) {
    if (img.naturalWidth !== CONFIG.width || img.naturalHeight !== CONFIG.height) {
      throw new Error(`Frozen ROI size mismatch: expected ${CONFIG.width}×${CONFIG.height}, got ${img.naturalWidth}×${img.naturalHeight}.`);
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, CONFIG.width, CONFIG.height);
    ctx.drawImage(img, 0, 0, CONFIG.width, CONFIG.height);

    const receipt = [];
    for (let r = 0; r < CONFIG.rows; r++) {
      for (let c = 0; c < CONFIG.cols; c++) {
        const x0 = c * CONFIG.cellWidth;
        const y0 = r * CONFIG.cellHeight;
        const imageData = ctx.getImageData(x0, y0, CONFIG.cellWidth, CONFIG.cellHeight).data;
        let bright = 0;
        const total = CONFIG.cellWidth * CONFIG.cellHeight;

        for (let i = 0; i < imageData.length; i += 4) {
          const R = imageData[i];
          const G = imageData[i + 1];
          const B = imageData[i + 2];
          const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
          if (y >= CONFIG.lumaThreshold) bright++;
        }

        const p = bright / total;
        receipt.push({
          mappingVersion: CONFIG.version,
          sourceFile: source.file,
          displayedDate: source.date,
          frameIndex0Based: source.frame,
          roi: CONFIG.roi,
          row: r + 1,
          col: c + 1,
          scanIndex: r * CONFIG.cols + c + 1,
          cellBoundsRoi: { x0, y0, x1: x0 + CONFIG.cellWidth, y1: y0 + CONFIG.cellHeight },
          lumaFormula: "Y'=0.2126R+0.7152G+0.0722B",
          threshold: CONFIG.lumaThreshold,
          brightPixelCount: bright,
          totalPixelCount: total,
          p,
          freq: CONFIG.freqBase + CONFIG.freqSpan * p,
          pan: CONFIG.panByCol[c],
          toneMs: CONFIG.toneMs,
          gapMs: CONFIG.gapMs
        });
      }
    }
    return receipt;
  }

  function renderReceipt() {
    receiptBody.innerHTML = "";
    receipts.A.forEach((a, i) => {
      const b = receipts.B[i];
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>r${a.row} c${a.col}</td>
        <td>${a.p.toFixed(5)}</td>
        <td>${b.p.toFixed(5)}</td>
        <td>${a.freq.toFixed(1)}</td>
        <td>${b.freq.toFixed(1)}</td>
        <td>${(b.freq - a.freq).toFixed(1)}</td>
        <td>${a.pan.toFixed(2)}</td>`;
      receiptBody.appendChild(tr);
    });

    const meanA = receipts.A.reduce((s, x) => s + x.freq, 0) / receipts.A.length;
    const meanB = receipts.B.reduce((s, x) => s + x.freq, 0) / receipts.B.length;
    el("metricA").textContent = `mean ${meanA.toFixed(1)} Hz`;
    el("metricB").textContent = `mean ${meanB.toFixed(1)} Hz`;
  }

  function ensureAudio() {
    if (audioUnavailable) return false;

    try {
      if (!audioCtx) {
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtor) {
          audioUnavailable = true;
          return false;
        }
        audioCtx = new AudioCtor();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = muted ? 0 : Number(volume.value);
        masterGain.connect(audioCtx.destination);
      }

      if (audioCtx.state === "suspended" && !paused) {
        audioCtx.resume().catch(() => {
          audioUnavailable = true;
        });
      }
      return true;
    } catch (error) {
      console.error("Audio unavailable:", error);
      audioUnavailable = true;
      audioCtx = null;
      masterGain = null;
      return false;
    }
  }

  function resetPauseState() {
    paused = false;
    playbackActive = false;
    playbackStatus = "";
    pauseButton.textContent = "Pause";
    pauseButton.setAttribute("aria-pressed", "false");
    pauseButton.disabled = true;
  }

  function beginPlayback(message) {
    paused = false;
    playbackActive = true;
    playbackStatus = message;
    pauseButton.textContent = "Pause";
    pauseButton.setAttribute("aria-pressed", "false");
    pauseButton.disabled = false;
    setStatus(message);
  }

  function finishPlayback(message) {
    resetPauseState();
    highlight(null);
    currentCell.textContent = "No cell playing.";
    setStatus(message);
  }

  function stopAll(message = "Stopped.") {
    playToken++;
    for (const node of activeNodes) {
      try { node.stop(); } catch (_) {}
    }
    activeNodes.clear();
    if (audioCtx?.state === "suspended") audioCtx.resume().catch(() => {});
    resetPauseState();
    highlight(null);
    currentCell.textContent = "No cell playing.";
    setStatus(message);
  }

  async function tone(freq, pan, durationMs, token) {
    if (token !== playToken) return false;

    if (!ensureAudio()) {
      setStatus(`Audio unavailable · visual sequence + Translation Receipt remain available · ${CONFIG.version}.`);
      return await wait(durationMs, token);
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const panner = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : null;
    const now = audioCtx.currentTime;
    const duration = durationMs / 1000;
    const attack = Math.min(0.01, duration / 4);
    const release = Math.min(0.02, duration / 4);

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.18, now + attack);
    gain.gain.setValueAtTime(0.18, Math.max(now + attack, now + duration - release));
    gain.gain.linearRampToValueAtTime(0, now + duration);

    if (panner) {
      panner.pan.setValueAtTime(pan, now);
      osc.connect(gain).connect(panner).connect(masterGain);
    } else {
      osc.connect(gain).connect(masterGain);
    }

    activeNodes.add(osc);
    osc.onended = () => activeNodes.delete(osc);
    osc.start(now);
    osc.stop(now + duration + 0.005);

    return await wait(durationMs, token);
  }

  async function playSingle(side) {
    stopAll("");
    const token = playToken;
    beginPlayback(`Playing ${side === "A" ? "Jun 18" : "Jun 30"} with frozen ${CONFIG.version}…`);

    const rows = receipts[side];
    for (let i = 0; i < rows.length; i++) {
      if (token !== playToken) return;
      highlight(i, side);
      if (!await tone(rows[i].freq, rows[i].pan, CONFIG.toneMs, token)) return;
      if (!await wait(CONFIG.gapMs, token)) return;
    }
    finishPlayback(audioUnavailable
      ? "Visual playback complete · audio unavailable in this browser."
      : "Playback complete.");
  }

  async function playMatchedAB() {
    stopAll("");
    const token = playToken;
    beginPlayback(`Matched A/B: same cell, Jun 18 then Jun 30 · ${CONFIG.version} unchanged.`);

    for (let i = 0; i < receipts.A.length; i++) {
      if (token !== playToken) return;

      highlight(i, "A");
      if (!await tone(receipts.A[i].freq, receipts.A[i].pan, CONFIG.toneMs, token)) return;
      if (!await wait(CONFIG.gapMs, token)) return;

      highlight(i, "B");
      if (!await tone(receipts.B[i].freq, receipts.B[i].pan, CONFIG.toneMs, token)) return;
      if (!await wait(CONFIG.gapMs, token)) return;
    }

    finishPlayback(audioUnavailable
      ? "Matched A/B visual playback complete · audio unavailable in this browser."
      : "Matched A/B playback complete.");
  }

  pauseButton.addEventListener("click", async () => {
    if (!playbackActive) return;

    if (!paused) {
      paused = true;
      pauseButton.textContent = "Resume";
      pauseButton.setAttribute("aria-pressed", "true");
      setStatus(`Paused · ${playbackStatus}`);
      if (audioCtx?.state === "running") {
        try { await audioCtx.suspend(); } catch (_) {}
      }
      return;
    }

    try {
      if (audioCtx?.state === "suspended") await audioCtx.resume();
      paused = false;
      pauseButton.textContent = "Pause";
      pauseButton.setAttribute("aria-pressed", "false");
      setStatus(playbackStatus);
    } catch (error) {
      console.error("Resume unavailable:", error);
      setStatus("Paused · audio resume unavailable.");
    }
  });

  volume.addEventListener("input", () => {
    if (masterGain) masterGain.gain.value = muted ? 0 : Number(volume.value);
  });

  muteButton.addEventListener("click", () => {
    muted = !muted;
    muteButton.setAttribute("aria-pressed", String(muted));
    muteButton.textContent = muted ? "Unmute" : "Mute";
    if (masterGain) masterGain.gain.value = muted ? 0 : Number(volume.value);
  });

  stopButton.addEventListener("click", () => {
    stopAll("");
    if (receipts.A && receipts.B) {
      const maxDelta = Math.max(
        ...receipts.A.map((a, i) => Math.abs(receipts.B[i].freq - a.freq))
      );
      setStatus(`Ready · ${CONFIG.version} · 24 cells · max |Δf| ${maxDelta.toFixed(1)} Hz.`);
    } else {
      setStatus("Ready.");
    }
  });
  playMatched.addEventListener("click", playMatchedAB);
  playA.addEventListener("click", () => playSingle("A"));
  playB.addEventListener("click", () => playSingle("B"));

  Promise.all([loadImage(imgA), loadImage(imgB)])
    .then(() => {
      receipts.A = computeReceipt(imgA, el("measureA"), SOURCE.A);
      receipts.B = computeReceipt(imgB, el("measureB"), SOURCE.B);
      renderReceipt();

      const maxDelta = Math.max(...receipts.A.map((a, i) => Math.abs(receipts.B[i].freq - a.freq)));
      setStatus(`Ready · ${CONFIG.version} · 24 cells · max |Δf| ${maxDelta.toFixed(1)} Hz.`);
      setControlsEnabled(true);
    })
    .catch(err => {
      console.error(err);
      setStatus(`STOP: ${err.message}`);
      setControlsEnabled(false);
    });

  window.addEventListener("echo-proof:viewchange", event => {
    if (event.detail?.view !== "listen" && playbackActive) stopAll("");
  });
  window.addEventListener("beforeunload", () => stopAll(""));
})();
