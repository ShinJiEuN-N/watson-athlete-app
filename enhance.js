(function () {
  function getPlayer() {
    return window.state?.selectedPlayer || state?.selectedPlayer || null;
  }

  function getHistory() {
    return JSON.parse(localStorage.getItem("watsonHistory") || "[]");
  }

  function setHistory(history) {
    localStorage.setItem("watsonHistory", JSON.stringify(history.slice(0, 12)));
  }

  function getSeasonRows(player) {
    return (player?.years || [])
      .map((item) => {
        const batting = item.batting || {};
        return { season: item.season, games: batting.games || "-", avg: batting.avg || "-", ops: batting.ops || "-", rbi: batting.rbi || "-", sb: batting.sb || "-" };
      })
      .filter((row) => row.season);
  }

  function hideSelfReportedBioPanel() {
    const panel = document.querySelector("#sleepHours")?.closest(".panel");
    if (panel) panel.hidden = true;
  }

  function setCompatStatus(id, text, tone) {
    const node = document.querySelector(`#${id}`);
    if (!node) return;
    node.textContent = text;
    const item = node.closest(".compat-item");
    item?.classList.remove("ok", "warn", "bad");
    if (tone) item?.classList.add(tone);
  }

  function detectDevice() {
    const ua = navigator.userAgent || "";
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(ua);
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    const isChrome = /Chrome|CriOS/i.test(ua);
    const device = isIOS ? "iPhone/iPad" : isAndroid ? "Android" : "기타";
    const browser = isSafari ? "Safari" : isChrome ? "Chrome" : "브라우저";
    return { isIOS, isAndroid, isSafari, isChrome, label: `${device} · ${browser}` };
  }

  function renderCompatibility() {
    const device = detectDevice();
    setCompatStatus("deviceStatus", device.label, device.isIOS || device.isAndroid ? "ok" : "warn");
    setCompatStatus("secureStatus", window.isSecureContext ? "HTTPS 정상" : "보안 연결 필요", window.isSecureContext ? "ok" : "bad");
    if (!navigator.mediaDevices?.getUserMedia) setCompatStatus("cameraStatus", "미지원", "bad");
    else setCompatStatus("cameraStatus", "확인 가능", "warn");
    if (typeof DeviceMotionEvent === "undefined") setCompatStatus("motionStatus", "미지원", "bad");
    else if (typeof DeviceMotionEvent.requestPermission === "function") setCompatStatus("motionStatus", "권한 필요", "warn");
    else setCompatStatus("motionStatus", "사용 가능", "ok");
    const note = document.querySelector("#compatNote");
    if (!note) return;
    note.textContent = device.isIOS
      ? "아이폰은 Safari에서 모션 권한을 먼저 허용해야 보행 측정이 안정적으로 동작합니다. 카메라 플래시는 기종에 따라 웹에서 제어되지 않을 수 있습니다."
      : device.isAndroid
        ? "안드로이드는 Chrome에서 가장 안정적입니다. 일부 기기는 카메라 플래시 제어가 제한될 수 있어 밝은 환경에서 측정하는 것이 좋습니다."
        : "모바일 Safari 또는 Chrome에서 접속하면 카메라와 모션 센서 측정이 가장 안정적으로 동작합니다.";
  }

  async function checkCameraCompatibility() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCompatStatus("cameraStatus", "미지원", "bad");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      const track = stream.getVideoTracks()[0];
      const capabilities = track?.getCapabilities?.() || {};
      setCompatStatus("cameraStatus", capabilities.torch ? "카메라 정상 · 플래시 가능" : "카메라 정상", "ok");
      stream.getTracks().forEach((item) => item.stop());
    } catch {
      setCompatStatus("cameraStatus", "권한 필요", "warn");
    }
  }

  async function checkMotionCompatibility() {
    if (typeof DeviceMotionEvent === "undefined") {
      setCompatStatus("motionStatus", "미지원", "bad");
      return;
    }
    if (typeof DeviceMotionEvent.requestPermission === "function") {
      try {
        const permission = await DeviceMotionEvent.requestPermission();
        setCompatStatus("motionStatus", permission === "granted" ? "허용됨" : "거부됨", permission === "granted" ? "ok" : "bad");
      } catch {
        setCompatStatus("motionStatus", "권한 실패", "bad");
      }
      return;
    }
    setCompatStatus("motionStatus", "센서 대기", "warn");
    let received = false;
    const handler = () => {
      received = true;
      window.removeEventListener("devicemotion", handler);
      setCompatStatus("motionStatus", "센서 정상", "ok");
    };
    window.addEventListener("devicemotion", handler, { once: true });
    window.setTimeout(() => {
      if (!received) {
        window.removeEventListener("devicemotion", handler);
        setCompatStatus("motionStatus", "권한/센서 확인", "warn");
      }
    }, 1600);
  }

  window.renderPlayerDetail = function renderPlayerDetail() {
    const node = document.querySelector("#playerDetail");
    const player = getPlayer();
    if (!node) return;
    if (!player) {
      node.textContent = "선수를 선택하면 학년 추정, 기록 흐름, 관리 포인트가 표시됩니다.";
      return;
    }
    const trend = player.trend || {};
    const trendLabel = trend.label || "확인 필요";
    const management = trendLabel.includes("상승")
      ? "상승 흐름입니다. 컨디션이 좋을 때 출전 기회를 넓히고 피로 누적을 같이 관리하세요."
      : trendLabel.includes("하락")
        ? "기록상 주의 신호가 있습니다. 타격감보다 통증, 수면, 훈련량 변화를 먼저 확인하세요."
        : "비교 데이터가 부족합니다. 오늘 측정값과 향후 누적 기록을 함께 보며 판단하세요.";
    const cards = [["학년(추정)", player.gradeEstimate || "확인 필요"], ["2026 OPS", trend.ops2026 || "-"], ["2026 타율", trend.avg2026 || "-"], ["흐름", trendLabel]];
    const rows = getSeasonRows(player);
    const seasonTable = rows.length
      ? `<div class="season-table" role="table" aria-label="시즌별 기록"><div class="season-row head" role="row"><span>연도</span><span>경기</span><span>타율</span><span>OPS</span><span>타점</span><span>도루</span></div>${rows.map((row) => `<div class="season-row" role="row"><span>${row.season}</span><span>${row.games}</span><span>${row.avg}</span><span>${row.ops}</span><span>${row.rbi}</span><span>${row.sb}</span></div>`).join("")}</div>`
      : `<p class="detail-note">시즌별 상세 기록은 다음 데이터 업데이트 때 확장됩니다.</p>`;
    node.innerHTML = `<div class="detail-cards">${cards.map(([label, value]) => `<div><small>${label}</small><strong>${value}</strong></div>`).join("")}</div>${seasonTable}<div class="detail-note"><strong>관리 포인트</strong><br />${management}</div>`;
  };

  const originalSnapshot = window.renderPlayerSnapshot;
  window.renderPlayerSnapshot = function renderPlayerSnapshotEnhanced() {
    originalSnapshot?.();
    window.renderPlayerDetail();
  };

  function enrichLatestResult() {
    const player = getPlayer();
    if (!player) return;
    const history = getHistory();
    if (!history.length) return;
    history[0] = { ...history[0], school: player.school || "", playerId: player.id || "", gradeEstimate: player.gradeEstimate || "", trendLabel: player.trend?.label || "" };
    delete history[0].bioScore;
    setHistory(history);
    window.renderHistory?.();
  }

  function escapeCsv(value) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }

  window.exportHistoryCsv = function exportHistoryCsv() {
    const history = getHistory();
    if (!history.length) {
      alert("다운로드할 저장 결과가 없습니다. 먼저 결과 저장을 눌러주세요.");
      return;
    }
    const headers = ["측정일", "학교", "선수명", "등번호", "포지션", "학년추정", "기록흐름", "경기준비도", "회복도", "피로도", "좌우균형", "리듬", "보행수"];
    const rows = history.map((item) => [item.date, item.school, item.athlete, item.number, item.position, item.gradeEstimate, item.trendLabel, item.readiness, item.recovery, item.fatigue, item.balance, item.rhythm, item.cadence]);
    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `watson-athlete-results-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  function renderInsightsFromSignals(hrv, gait, readiness) {
    const insights = [];
    if (readiness >= 85) insights.push("HRV와 보행 리듬이 모두 안정적입니다. 정상 훈련 또는 경기 투입 판단이 가능합니다.");
    else if (readiness >= 70) insights.push("경기 투입은 가능하지만 워밍업 중 회복도와 보행 균형을 한 번 더 확인하세요.");
    else insights.push("HRV 회복도 또는 보행 패턴에서 주의 신호가 있습니다. 출전 전 추가 점검이 필요합니다.");
    if (hrv.fatigue >= 55) insights.push("HRV 기반 피로도가 높게 측정됐습니다. 전날 훈련량과 회복 시간을 확인하세요.");
    if (gait.balance < 88) insights.push(`좌우 균형이 ${gait.balance}%로 낮습니다. 하체 불균형이나 통증 여부를 확인하세요.`);
    if (gait.rhythm < 78) insights.push("보행 리듬 변동이 큽니다. 급격한 방향 전환이나 스프린트 전 준비운동을 늘리는 편이 좋습니다.");
    if (hrv.source === "demo" || gait.source === "demo") insights.push("일부 값은 데모 데이터입니다. 실제 모바일 HTTPS 환경에서 다시 측정하세요.");
    document.querySelector("#insights").innerHTML = insights.map((text) => `<li>${text}</li>`).join("");
  }

  function renderPlayerContextFromSignals(readiness) {
    const player = getPlayer();
    const node = document.querySelector("#playerContext");
    if (!node) return;
    if (!player) {
      node.innerHTML = `<div class="context-item">선수를 선택하면 경기기록과 HRV/보행 측정값을 결합한 분석이 표시됩니다.</div>`;
      return;
    }
    const trend = player.trend || {};
    const trendLabel = trend.label || "확인 필요";
    const playerRisk = readiness < 70 ? "관리 필요" : trendLabel.includes("상승") ? "상승 흐름 유지" : "정상 관찰";
    node.innerHTML = `<div class="context-item"><small>선수 프로필</small><strong>${player.school} · ${player.gradeEstimate}</strong><br />${player.gradeEvidence || "학년은 기록 기반 추정값입니다."}</div><div class="context-item"><small>경기력 흐름</small><strong>${trendLabel}</strong><br />2026 OPS ${trend.ops2026 || "-"} · 타율 ${trend.avg2026 || "-"}</div><div class="context-item"><small>HRV + 보행 판단</small><strong>${playerRisk}</strong><br />경기 준비도 ${readiness}</div>`;
  }

  function installSignalOnlyAnalysis() {
    try {
      renderResult = function renderSignalOnlyResult() {
        const hrv = state.hrv || { recovery: 70, fatigue: 38, source: "fallback" };
        const gait = state.gait || { balance: 82, stability: 76, rhythm: 78, cadence: 0 };
        const gaitScore = Math.round((gait.balance + gait.stability + gait.rhythm) / 3);
        const playerAdjustment = computePlayerAdjustment?.(getPlayer()) || 0;
        const readiness = Math.max(0, Math.min(99, Math.round(hrv.recovery * 0.42 + gaitScore * 0.42 + (100 - hrv.fatigue) * 0.16 + playerAdjustment)));
        const label = readiness >= 85 ? "경기 준비 양호" : readiness >= 70 ? "관리하며 출전" : "컨디션 점검 필요";
        const athlete = document.querySelector("#athleteName").value.trim();
        document.querySelector("#resultName").textContent = athlete ? `${athlete} 선수 결과` : "측정 결과";
        document.querySelector("#readinessScore").textContent = readiness;
        document.querySelector("#readinessLabel").textContent = label;
        document.querySelector("#recoveryScore").textContent = hrv.recovery;
        document.querySelector("#fatigueScore").textContent = hrv.fatigue;
        document.querySelector("#balanceScore").textContent = gait.balance;
        document.querySelector("#rhythmScore").textContent = gait.rhythm;
        const player = getPlayer();
        state.result = { date: new Date().toLocaleString("ko-KR"), athlete: athlete || "이름 없음", number: document.querySelector("#athleteNo").value.trim(), position: document.querySelector("#position").value, school: player?.school || state.selectedSchool?.name || "", playerId: player?.id || "", gradeEstimate: player?.gradeEstimate || "", trendLabel: player?.trend?.label || "", readiness, recovery: hrv.recovery, fatigue: hrv.fatigue, balance: gait.balance, rhythm: gait.rhythm, cadence: gait.cadence, label };
        renderInsightsFromSignals(hrv, gait, readiness);
        renderPlayerContextFromSignals(readiness);
        window.renderHistory?.();
        showScreen("result");
      };
    } catch {}
  }

  document.querySelector("#saveResultBtn")?.addEventListener("click", enrichLatestResult);
  document.querySelector("#exportCsvBtn")?.addEventListener("click", (event) => { event.preventDefault(); event.stopImmediatePropagation(); window.exportHistoryCsv(); }, true);
  document.querySelector("#checkCameraBtn")?.addEventListener("click", checkCameraCompatibility);
  document.querySelector("#checkMotionBtn")?.addEventListener("click", checkMotionCompatibility);
  hideSelfReportedBioPanel();
  installSignalOnlyAnalysis();
  renderCompatibility();
  window.renderPlayerDetail();
})();
