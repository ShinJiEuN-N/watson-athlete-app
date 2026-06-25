const state = {
  screen: "profile",
  hrv: null,
  gait: null,
  cameraStream: null,
  hrvSamples: [],
  hrvBeats: [],
  gaitSamples: [],
  timers: [],
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const screens = ["profile", "hrv", "gait", "result"];

function showScreen(name) {
  state.screen = name;
  screens.forEach((id) => {
    $(`#${id}`).classList.toggle("active", id === name);
    $(`.step[data-step="${id}"]`)?.classList.toggle("active", id === name);
  });
  $("#modeLabel").textContent = {
    profile: "대기",
    hrv: "HRV",
    gait: "보행",
    result: "결과",
  }[name];
}

function setTimer(id, seconds, onTick, onDone) {
  let left = seconds;
  $(id).textContent = left;
  const timer = setInterval(() => {
    left -= 1;
    $(id).textContent = Math.max(left, 0);
    onTick?.(left);
    if (left <= 0) {
      clearInterval(timer);
      onDone?.();
    }
  }, 1000);
  state.timers.push(timer);
  return timer;
}

function clearTimers() {
  state.timers.forEach(clearInterval);
  state.timers = [];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function avg(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function std(values) {
  const mean = avg(values);
  return values.length
    ? Math.sqrt(avg(values.map((value) => (value - mean) ** 2)))
    : 0;
}

function drawField() {
  const canvas = $("#fieldCanvas");
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#18242e");
  sky.addColorStop(1, "#101214");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#1f2f3d";
  ctx.beginPath();
  ctx.moveTo(0, h * 0.55);
  ctx.quadraticCurveTo(w / 2, h * 0.25, w, h * 0.55);
  ctx.lineTo(w, h * 0.67);
  ctx.quadraticCurveTo(w / 2, h * 0.42, 0, h * 0.67);
  ctx.closePath();
  ctx.fill();

  for (let i = 0; i < 4; i += 1) {
    ctx.strokeStyle = `rgba(255,255,255,${0.08 - i * 0.01})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, h * (0.58 + i * 0.045));
    ctx.quadraticCurveTo(w / 2, h * (0.34 + i * 0.045), w, h * (0.58 + i * 0.045));
    ctx.stroke();
  }

  const grass = ctx.createLinearGradient(0, h * 0.6, 0, h);
  grass.addColorStop(0, "#2c7c46");
  grass.addColorStop(1, "#174d32");
  ctx.fillStyle = grass;
  ctx.fillRect(0, h * 0.62, w, h * 0.38);

  ctx.fillStyle = "rgba(255,255,255,0.07)";
  for (let x = -80; x < w; x += 180) {
    ctx.beginPath();
    ctx.moveTo(x, h * 0.62);
    ctx.lineTo(x + 90, h);
    ctx.lineTo(x + 170, h);
    ctx.lineTo(x + 80, h * 0.62);
    ctx.closePath();
    ctx.fill();
  }

  const cx = w / 2;
  const cy = h * 0.78;
  ctx.fillStyle = "#b87a42";
  ctx.beginPath();
  ctx.moveTo(cx, cy - 70);
  ctx.lineTo(cx + 105, cy);
  ctx.lineTo(cx, cy + 55);
  ctx.lineTo(cx - 105, cy);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#f1dbb2";
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = "#f7f1e8";
  [[cx, cy - 70], [cx + 105, cy], [cx, cy + 55], [cx - 105, cy]].forEach(([x, y]) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-7, -7, 14, 14);
    ctx.restore();
  });

  ctx.fillStyle = "rgba(78,156,255,0.5)";
  ctx.fillRect(116, 68, 114, 42);
  ctx.fillStyle = "rgba(82,210,115,0.7)";
  ctx.fillRect(130, 80, 30, 8);
  ctx.fillRect(130, 94, 54, 8);
}

function drawWave(canvas, values, color) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();

  const slice = values.slice(-120);
  const min = Math.min(...slice, 0);
  const max = Math.max(...slice, 1);
  const range = max - min || 1;

  slice.forEach((value, index) => {
    const x = (index / Math.max(slice.length - 1, 1)) * width;
    const y = height - 10 - ((value - min) / range) * (height - 20);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

async function startHrv() {
  clearTimers();
  showScreen("hrv");
  state.hrvSamples = [];
  state.hrvBeats = [];
  $("#bpm").textContent = "--";

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
    state.cameraStream = stream;
    $("#cameraPreview").srcObject = stream;
    await $("#cameraPreview").play();
    sampleCamera();
  } catch {
    useDemoHrv(false);
  }

  setTimer("#hrvTimer", 30, null, finishHrv);
}

function sampleCamera() {
  const video = $("#cameraPreview");
  const hidden = document.createElement("canvas");
  hidden.width = 48;
  hidden.height = 48;
  const ctx = hidden.getContext("2d", { willReadFrequently: true });
  const started = performance.now();

  function tick() {
    if (state.screen !== "hrv" || !state.cameraStream) return;
    try {
      ctx.drawImage(video, 0, 0, hidden.width, hidden.height);
      const pixels = ctx.getImageData(0, 0, hidden.width, hidden.height).data;
      let red = 0;
      for (let i = 0; i < pixels.length; i += 4) red += pixels[i];
      const value = red / (pixels.length / 4);
      const t = (performance.now() - started) / 1000;
      state.hrvSamples.push(value);
      detectBeat(value, t);
      drawWave($("#hrvWave"), state.hrvSamples, "#ff6464");
    } catch {
      // Camera frame can be temporarily unavailable.
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function detectBeat(value, time) {
  const recent = state.hrvSamples.slice(-30);
  const mean = avg(recent);
  const deviation = std(recent) || 1;
  const last = state.hrvBeats.at(-1) ?? -10;
  if (value > mean + deviation * 0.65 && time - last > 0.38) {
    state.hrvBeats.push(time);
    if (state.hrvBeats.length > 1) {
      const interval = time - state.hrvBeats.at(-2);
      const bpm = Math.round(60 / interval);
      if (bpm >= 42 && bpm <= 180) $("#bpm").textContent = bpm;
    }
  }
}

function finishHrv() {
  stopCamera();
  const intervals = [];
  for (let i = 1; i < state.hrvBeats.length; i += 1) {
    const ms = (state.hrvBeats[i] - state.hrvBeats[i - 1]) * 1000;
    if (ms > 320 && ms < 1500) intervals.push(ms);
  }

  if (intervals.length < 5) {
    useDemoHrv(true);
    return;
  }

  const mean = avg(intervals);
  let squared = 0;
  for (let i = 1; i < intervals.length; i += 1) {
    squared += (intervals[i] - intervals[i - 1]) ** 2;
  }

  const rmssd = Math.round(Math.sqrt(squared / Math.max(intervals.length - 1, 1)));
  const bpm = Math.round(60000 / mean);
  const recovery = clamp(Math.round((rmssd / 70) * 100), 20, 99);
  const fatigue = clamp(100 - recovery + 8, 8, 94);
  state.hrv = { bpm, rmssd, recovery, fatigue, source: "camera" };
  showScreen("gait");
}

function stopCamera() {
  state.cameraStream?.getTracks().forEach((track) => track.stop());
  state.cameraStream = null;
}

function useDemoHrv(goNext = true) {
  stopCamera();
  state.hrv = {
    bpm: 68,
    rmssd: 52,
    recovery: 74,
    fatigue: 31,
    source: "demo",
  };
  $("#bpm").textContent = "68";
  const values = Array.from({ length: 120 }, (_, index) => 120 + Math.sin(index * 0.34) * 14);
  drawWave($("#hrvWave"), values, "#ff6464");
  if (goNext) showScreen("gait");
}

async function startGait() {
  clearTimers();
  showScreen("gait");
  state.gaitSamples = [];
  $("#stepCount").textContent = "0";

  const permissionGranted = await requestMotionPermission();
  if (!permissionGranted) {
    useDemoGait();
    return;
  }

  const started = performance.now();
  const handler = (event) => {
    const acc = event.accelerationIncludingGravity || event.acceleration;
    if (!acc) return;
    const item = {
      t: (performance.now() - started) / 1000,
      x: acc.x || 0,
      y: acc.y || 0,
      z: acc.z || 0,
    };
    state.gaitSamples.push(item);
    updateLiveStep(item);
    drawWave($("#gaitWave"), state.gaitSamples.map((sample) => sample.y), "#4e9cff");
  };

  window.addEventListener("devicemotion", handler);
  setTimer("#gaitTimer", 20, null, () => {
    window.removeEventListener("devicemotion", handler);
    finishGait();
  });
}

async function requestMotionPermission() {
  if (typeof DeviceMotionEvent === "undefined") return false;
  if (typeof DeviceMotionEvent.requestPermission === "function") {
    try {
      return (await DeviceMotionEvent.requestPermission()) === "granted";
    } catch {
      return false;
    }
  }
  return true;
}

let lastStepAt = 0;
let liveStep = 0;

function updateLiveStep(sample) {
  const magnitude = Math.sqrt(sample.x ** 2 + sample.y ** 2 + sample.z ** 2);
  const recent = state.gaitSamples
    .slice(-20)
    .map((item) => Math.sqrt(item.x ** 2 + item.y ** 2 + item.z ** 2));
  if (magnitude > avg(recent) + 1.2 && sample.t - lastStepAt > 0.32) {
    lastStepAt = sample.t;
    liveStep += 1;
    $("#stepCount").textContent = liveStep;
    flashFoot(liveStep % 2 ? "left" : "right");
  }
}

function flashFoot(side) {
  const node = side === "left" ? $("#leftFoot") : $("#rightFoot");
  node.classList.add("active");
  window.setTimeout(() => node.classList.remove("active"), 150);
}

function finishGait() {
  const samples = state.gaitSamples;
  if (samples.length < 30) {
    useDemoGait();
    return;
  }

  const axes = ["x", "y", "z"].map((axis) => ({
    axis,
    deviation: std(samples.map((sample) => sample[axis])),
  }));
  axes.sort((a, b) => b.deviation - a.deviation);

  const vertical = axes[0].axis;
  const lateral = axes[1].axis;
  const verticalValues = samples.map((sample) => sample[vertical]);
  const lateralValues = samples.map((sample) => sample[lateral]);
  const mean = avg(verticalValues);
  const threshold = std(verticalValues) * 0.58;
  const peaks = [];
  let lastPeak = -999;

  verticalValues.forEach((value, index) => {
    if (
      value - mean > threshold &&
      value >= (verticalValues[index - 1] ?? value) &&
      value > (verticalValues[index + 1] ?? value) &&
      index - lastPeak > 7
    ) {
      peaks.push(index);
      lastPeak = index;
    }
  });

  if (peaks.length < 4) {
    useDemoGait();
    return;
  }

  const left = [];
  const right = [];
  peaks.forEach((index, order) => {
    const value = Math.abs(lateralValues[index] - avg(lateralValues));
    if (order % 2 === 0) left.push(value);
    else right.push(value);
  });

  const leftAvg = avg(left) || 1;
  const rightAvg = avg(right) || 1;
  const leftShare = Math.round((leftAvg / (leftAvg + rightAvg)) * 100);
  const rightShare = 100 - leftShare;
  const balance = Math.round(100 - Math.abs(leftShare - rightShare));

  const duration = samples.at(-1).t - samples[0].t;
  const cadence = Math.round((peaks.length / duration) * 60);
  const stability = clamp(Math.round(100 - (std(lateralValues) / (avg(lateralValues.map(Math.abs)) || 1)) * 18), 40, 99);
  const rhythm = computeRhythm(peaks, samples.length ? duration / samples.length : 0.04);

  state.gait = {
    steps: peaks.length,
    leftShare,
    rightShare,
    balance,
    cadence,
    stability,
    rhythm,
    source: "sensor",
  };
  renderResult();
}

function computeRhythm(peaks, intervalSeconds) {
  const intervals = [];
  for (let i = 1; i < peaks.length; i += 1) intervals.push((peaks[i] - peaks[i - 1]) * intervalSeconds);
  const cv = std(intervals) / (avg(intervals) || 1);
  return clamp(Math.round(100 - cv * 120), 40, 99);
}

function useDemoGait() {
  clearTimers();
  const values = Array.from({ length: 140 }, (_, index) => Math.sin(index * 0.42) * 10 + Math.random() * 1.5);
  drawWave($("#gaitWave"), values, "#4e9cff");
  $("#stepCount").textContent = "35";
  state.gait = {
    steps: 35,
    leftShare: 48,
    rightShare: 52,
    balance: 96,
    cadence: 112,
    stability: 82,
    rhythm: 86,
    source: "demo",
  };
  renderResult();
}

function renderResult() {
  const hrv = state.hrv || { recovery: 70, fatigue: 38, source: "fallback" };
  const gait = state.gait || { balance: 82, stability: 76, rhythm: 78, cadence: 0 };
  const gaitScore = Math.round((gait.balance + gait.stability + gait.rhythm) / 3);
  const readiness = clamp(Math.round(hrv.recovery * 0.42 + gaitScore * 0.42 + (100 - hrv.fatigue) * 0.16), 0, 99);

  const label = readiness >= 85 ? "경기 준비 양호" : readiness >= 70 ? "관리하며 출전" : "컨디션 점검 필요";
  const athlete = $("#athleteName").value.trim();

  $("#resultName").textContent = athlete ? `${athlete} 선수 결과` : "측정 결과";
  $("#readinessScore").textContent = readiness;
  $("#readinessLabel").textContent = label;
  $("#recoveryScore").textContent = hrv.recovery;
  $("#fatigueScore").textContent = hrv.fatigue;
  $("#balanceScore").textContent = gait.balance;
  $("#rhythmScore").textContent = gait.rhythm;

  state.result = {
    date: new Date().toLocaleString("ko-KR"),
    athlete: athlete || "이름 없음",
    number: $("#athleteNo").value.trim(),
    position: $("#position").value,
    readiness,
    recovery: hrv.recovery,
    fatigue: hrv.fatigue,
    balance: gait.balance,
    rhythm: gait.rhythm,
    cadence: gait.cadence,
    label,
  };

  renderInsights(hrv, gait, readiness);
  renderHistory();
  showScreen("result");
}

function renderInsights(hrv, gait, readiness) {
  const insights = [];
  if (readiness >= 85) insights.push("전체 준비도가 높습니다. 정상 훈련 또는 경기 투입 판단이 가능합니다.");
  else if (readiness >= 70) insights.push("경기 투입은 가능하지만 워밍업과 회복 상태 확인이 필요합니다.");
  else insights.push("피로 누적 또는 균형 저하 가능성이 있어 출전 전 추가 점검이 필요합니다.");

  if (hrv.fatigue >= 55) insights.push("피로도가 높게 측정됐습니다. 수면, 수분, 전날 훈련량을 확인하세요.");
  if (gait.balance < 88) insights.push(`좌우 균형이 ${gait.balance}%로 낮습니다. 하체 불균형이나 통증 여부를 확인하세요.`);
  if (gait.rhythm < 78) insights.push("보행 리듬 변동이 큽니다. 급격한 방향 전환이나 스프린트 전 준비운동을 늘리는 편이 좋습니다.");
  if (hrv.source === "demo" || gait.source === "demo") insights.push("일부 값은 데모 데이터입니다. 실제 모바일 HTTPS 환경에서 다시 측정하세요.");

  $("#insights").innerHTML = insights.map((text) => `<li>${text}</li>`).join("");
}

function saveResult() {
  if (!state.result) return;
  const history = JSON.parse(localStorage.getItem("watsonHistory") || "[]");
  history.unshift(state.result);
  localStorage.setItem("watsonHistory", JSON.stringify(history.slice(0, 12)));
  renderHistory();
}

function renderHistory() {
  const history = JSON.parse(localStorage.getItem("watsonHistory") || "[]");
  $("#historyList").innerHTML = history.length
    ? history
        .map(
          (item) => `
            <div class="history-item">
              <div><strong>${item.athlete}</strong><br />${item.date}</div>
              <strong>${item.readiness}</strong>
            </div>
          `,
        )
        .join("")
    : `<div class="history-item">저장된 측정 결과가 없습니다.</div>`;
}

function resetApp() {
  clearTimers();
  stopCamera();
  state.hrv = null;
  state.gait = null;
  state.result = null;
  state.hrvSamples = [];
  state.gaitSamples = [];
  liveStep = 0;
  lastStepAt = 0;
  $("#stepCount").textContent = "0";
  $("#hrvTimer").textContent = "30";
  $("#gaitTimer").textContent = "20";
  $("#bpm").textContent = "--";
  showScreen("profile");
}

function bindEvents() {
  $$(".step").forEach((button) => button.addEventListener("click", () => showScreen(button.dataset.step)));
  $("#startHrvBtn").addEventListener("click", startHrv);
  $("#demoProfileBtn").addEventListener("click", () => {
    state.hrv = { bpm: 68, rmssd: 52, recovery: 74, fatigue: 31, source: "demo" };
    state.gait = { steps: 35, leftShare: 48, rightShare: 52, balance: 96, cadence: 112, stability: 82, rhythm: 86, source: "demo" };
    renderResult();
  });
  $("#skipHrvBtn").addEventListener("click", () => useDemoHrv(true));
  $("#stopHrvBtn").addEventListener("click", finishHrv);
  $("#startGaitBtn").addEventListener("click", startGait);
  $("#skipGaitBtn").addEventListener("click", useDemoGait);
  $("#saveResultBtn").addEventListener("click", saveResult);
  $("#resetBtn").addEventListener("click", resetApp);
}

drawField();
bindEvents();
renderHistory();
