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
        return {
          season: item.season,
          games: batting.games || "-",
          avg: batting.avg || "-",
          ops: batting.ops || "-",
          rbi: batting.rbi || "-",
          sb: batting.sb || "-",
        };
      })
      .filter((row) => row.season);
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

    const cards = [
      ["학년(추정)", player.gradeEstimate || "확인 필요"],
      ["2026 OPS", trend.ops2026 || "-"],
      ["2026 타율", trend.avg2026 || "-"],
      ["흐름", trendLabel],
    ];
    const rows = getSeasonRows(player);
    const seasonTable = rows.length
      ? `<div class="season-table" role="table" aria-label="시즌별 기록">
          <div class="season-row head" role="row"><span>연도</span><span>경기</span><span>타율</span><span>OPS</span><span>타점</span><span>도루</span></div>
          ${rows
            .map(
              (row) =>
                `<div class="season-row" role="row"><span>${row.season}</span><span>${row.games}</span><span>${row.avg}</span><span>${row.ops}</span><span>${row.rbi}</span><span>${row.sb}</span></div>`,
            )
            .join("")}
        </div>`
      : `<p class="detail-note">시즌별 상세 기록은 다음 데이터 업데이트 때 확장됩니다.</p>`;

    node.innerHTML = `
      <div class="detail-cards">${cards
        .map(([label, value]) => `<div><small>${label}</small><strong>${value}</strong></div>`)
        .join("")}</div>
      ${seasonTable}
      <div class="detail-note"><strong>관리 포인트</strong><br />${management}</div>
    `;
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
    history[0] = {
      ...history[0],
      school: player.school || "",
      playerId: player.id || "",
      gradeEstimate: player.gradeEstimate || "",
      trendLabel: player.trend?.label || "",
    };
    setHistory(history);
    window.renderHistory?.();
  }

  function escapeCsv(value) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }

  const hasNativeExport = typeof window.exportHistoryCsv === "function";

  window.exportHistoryCsv =
    window.exportHistoryCsv ||
    function exportHistoryCsv() {
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

  document.querySelector("#saveResultBtn")?.addEventListener("click", enrichLatestResult);
  if (!hasNativeExport) {
    document.querySelector("#exportCsvBtn")?.addEventListener("click", window.exportHistoryCsv);
  }
  window.renderPlayerDetail();
})();
