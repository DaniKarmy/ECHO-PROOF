(() => {
  "use strict";

  const CONFIG = Object.freeze({
    mappingVersion: "EP-MAP-1.0",
    transferVersion: "NL-TRANSFER-1",
    width: 1920,
    height: 1080,
    cols: 6,
    rows: 4,
    cellWidth: 320,
    cellHeight: 270,
    lumaThreshold: 128,
    freqBase: 220,
    freqSpan: 660,
    panByCol: [-0.75, -0.45, -0.15, 0.15, 0.45, 0.75],
    toneMs: 180,
    gapMs: 40
  });

  const SOURCE = Object.freeze({
    A: {
      year: "2012",
      file: "nightlights_only_lights_2012_transfer_1920x1080.png",
      sourcePage: "https://svs.gsfc.nasa.gov/5276/"
    },
    B: {
      year: "2023",
      file: "nightlights_only_lights_2023_transfer_1920x1080.png",
      sourcePage: "https://svs.gsfc.nasa.gov/5276/"
    }
  });

  const EXPECTED = Object.freeze({
    changedCells: 18,
    meanAbsDeltaP: 0.00036314,
    maxAbsDeltaP: 0.00265046,
    meanAbsDeltaF: 0.2397,
    maxAbsDeltaF: 1.7493,
    maxCell: 11
  });

  const el = id => document.getElementById(id);
  const imgA = el("nlImgA");
  const imgB = el("nlImgB");
  const gridA = el("nlGridA");
  const gridB = el("nlGridB");
  const status = el("nlStatus");
  const currentCell = el("nlCurrentCell");
  const receiptCurrentCell = el("nlReceiptCurrentCell");
  const receiptBody = el("nlReceiptBody");
  const playMatched = el("nlPlayMatched");
  const playA = el("nlPlayA");
  const playB = el("nlPlayB");
  const pauseButton = el("nlPause");
  const stopButton = el("nlStop");
  const muteButton = el("nlMute");
  const volume = el("nlVolume");

  if (!imgA || !imgB) return;

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
  let verifiedMetrics = null;

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

  function readyMessage() {
    const maxDelta = verifiedMetrics?.maxAbsDeltaF ?? EXPECTED.maxAbsDeltaF;
    return `Ready · ${CONFIG.mappingVersion} / ${CONFIG.transferVersion} · 24 cells · max |Δf| ${maxDelta.toFixed(1)} Hz.`;
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
    gridA.querySelectorAll(".grid-cell.active").forEach(x => x.classList.remove("active"));
    gridB.querySelectorAll(".grid-cell.active").forEach(x => x.classList.remove("active"));
    receiptBody?.querySelectorAll("tr.active").forEach(x => x.classList.remove("active"));
    if (index == null) return;

    if (side === "both" || side === "A") gridA.children[index]?.classList.add("active");
    if (side === "both" || side === "B") gridB.children[index]?.classList.add("active");
    receiptBody?.children[index]?.classList.add("active");

    const a = receipts.A[index];
    const b = receipts.B[index];
    const message = `Cell ${index + 1} · r${a.row} c${a.col} · 2012 ${a.freq.toFixed(1)} Hz · 2023 ${b.freq.toFixed(1)} Hz · Δ ${(b.freq - a.freq).toFixed(1)} Hz`;
    currentCell.textContent = message;
    if (receiptCurrentCell) receiptCurrentCell.textContent = message;
  }

  function loadImage(img) {
    return new Promise((resolve, reject) => {
      if (img.complete && img.naturalWidth) return resolve();
      img.addEventListener("load", resolve, { once: true });
      img.addEventListener("error", () => reject(new Error(`Night Lights asset missing: ${img.getAttribute("src")}`)), { once: true });
    });
  }

  function computeReceipt(img, canvas, source) {
    if (img.naturalWidth !== CONFIG.width || img.naturalHeight !== CONFIG.height) {
      throw new Error(`Frozen Night Lights image size mismatch: expected ${CONFIG.width}×${CONFIG.height}, got ${img.naturalWidth}×${img.naturalHeight}.`);
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
          mappingVersion: CONFIG.mappingVersion,
          transferVersion: CONFIG.transferVersion,
          sourceYear: source.year,
          sourceFile: source.file,
          row: r + 1,
          col: c + 1,
          scanIndex: r * CONFIG.cols + c + 1,
          cellBounds: { x0, y0, x1: x0 + CONFIG.cellWidth, y1: y0 + CONFIG.cellHeight },
          lumaFormula: "Y'=0.2126R+0.7152G+0.0722B",
          threshold: CONFIG.lumaThreshold,
          brightPixelCount: bright,
          totalPixelCount: total,
          p,
          freq: CONFIG.freqBase + CONFIG.freqSpan * p,
          pan: CONFIG.panByCol[c],
          toneMs: CONFIG.toneMs,
          gapMs: CONFIG.gapMs,
          normalization: "none"
        });
      }
    }
    return receipt;
  }

  function renderFullReceipt() {
    if (!receiptBody || !receipts.A || !receipts.B) return;
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
  }

  function summarizeAndVerify() {
    const deltasP = receipts.A.map((a, i) => receipts.B[i].p - a.p);
    const deltasF = receipts.A.map((a, i) => receipts.B[i].freq - a.freq);
    const absP = deltasP.map(Math.abs);
    const absF = deltasF.map(Math.abs);
    const changedCells = deltasP.filter(x => x !== 0).length;
    const meanAbsDeltaP = absP.reduce((a, b) => a + b, 0) / absP.length;
    const maxAbsDeltaP = Math.max(...absP);
    const meanAbsDeltaF = absF.reduce((a, b) => a + b, 0) / absF.length;
    const maxAbsDeltaF = Math.max(...absF);
    const maxCell = absF.indexOf(maxAbsDeltaF) + 1;

    const actual = { changedCells, meanAbsDeltaP, maxAbsDeltaP, meanAbsDeltaF, maxAbsDeltaF, maxCell };
    const close = (a, b, tol) => Math.abs(a - b) <= tol;
    const ok =
      actual.changedCells === EXPECTED.changedCells &&
      actual.maxCell === EXPECTED.maxCell &&
      close(actual.meanAbsDeltaP, EXPECTED.meanAbsDeltaP, 5e-8) &&
      close(actual.maxAbsDeltaP, EXPECTED.maxAbsDeltaP, 5e-8) &&
      close(actual.meanAbsDeltaF, EXPECTED.meanAbsDeltaF, 5e-4) &&
      close(actual.maxAbsDeltaF, EXPECTED.maxAbsDeltaF, 5e-4);

    if (!ok) {
      throw new Error(
        `NL-TRANSFER-1 metric verification failed. Expected 18 changed cells and max |Δf| 1.7493 Hz; got ${changedCells} and ${maxAbsDeltaF.toFixed(4)} Hz.`
      );
    }

    verifiedMetrics = actual;
    el("nlChangedCells").textContent = `changed cells ${changedCells}/24`;
    el("nlMeanDelta").textContent = `mean |Δf| ${meanAbsDeltaF.toFixed(4)} Hz`;
    el("nlMaxDelta").textContent = `max |Δf| ${maxAbsDeltaF.toFixed(4)} Hz · cell ${maxCell}`;

    const meanA = receipts.A.reduce((s, x) => s + x.freq, 0) / receipts.A.length;
    const meanB = receipts.B.reduce((s, x) => s + x.freq, 0) / receipts.B.length;
    el("nlMetricA").textContent = `mean ${meanA.toFixed(1)} Hz`;
    el("nlMetricB").textContent = `mean ${meanB.toFixed(1)} Hz`;
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
        audioCtx.resume().catch(() => { audioUnavailable = true; });
      }
      return true;
    } catch (error) {
      console.error("Night Lights audio unavailable:", error);
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
    if (receiptCurrentCell) receiptCurrentCell.textContent = "No cell playing.";
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
    if (receiptCurrentCell) receiptCurrentCell.textContent = "No cell playing.";
    if (message) setStatus(message);
  }

  async function tone(freq, pan, durationMs, token) {
    if (token !== playToken) return false;
    if (!ensureAudio()) {
      setStatus(`Audio unavailable · visual sequence remains available · ${CONFIG.mappingVersion} / ${CONFIG.transferVersion}.`);
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
    const year = side === "A" ? "2012" : "2023";
    beginPlayback(`Playing ${year} annual average · ${CONFIG.mappingVersion} / ${CONFIG.transferVersion}.`);
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
    beginPlayback(`Matched A/B: same cell, 2012 then 2023 · ${CONFIG.mappingVersion} / ${CONFIG.transferVersion} unchanged.`);

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
      console.error("Night Lights resume unavailable:", error);
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
    setStatus(receipts.A && receipts.B ? readyMessage() : "Ready.");
  });

  playMatched.addEventListener("click", playMatchedAB);
  playA.addEventListener("click", () => playSingle("A"));
  playB.addEventListener("click", () => playSingle("B"));

  Promise.all([loadImage(imgA), loadImage(imgB)])
    .then(() => {
      receipts.A = computeReceipt(imgA, el("nlMeasureA"), SOURCE.A);
      receipts.B = computeReceipt(imgB, el("nlMeasureB"), SOURCE.B);
      summarizeAndVerify();
      renderFullReceipt();
      setStatus(readyMessage());
      setControlsEnabled(true);
    })
    .catch(err => {
      console.error(err);
      setStatus(`STOP: ${err.message}`);
      setControlsEnabled(false);
    });

  window.addEventListener("echo-proof:viewchange", event => {
    if (event.detail?.view !== "nightlights" && playbackActive) stopAll("");
  });
  window.addEventListener("beforeunload", () => stopAll(""));
})();
