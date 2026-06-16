const EXCEL_FILE = "Blood_Pressuer.xlsx";
const SHEET_NAME = "記録";
const START_ROW = 3; // Excel上のB3から記録開始

let records = [];
let chart = null;
let originalRecordsCount = 0;

const statusEl = document.getElementById("status");
const tableBody = document.querySelector("#recordsTable tbody");
const form = document.getElementById("bpForm");

function setDefaultDateTime() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  document.getElementById("date").value = `${yyyy}-${mm}-${dd}`;
  document.getElementById("time").value = now.toTimeString().slice(0, 5);
}

function formatDateLocal(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateUTC(date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function excelSerialDateToDate(value) {
  if (value === undefined || value === null || value === "") return "";

  if (value instanceof Date) return formatDateLocal(value);

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const match = trimmed.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
    if (match) {
      return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
    }
    const serial = Number(trimmed);
    if (!Number.isNaN(serial)) return excelSerialDateToDate(serial);
    return trimmed;
  }

  const serial = Number(value);
  if (!Number.isFinite(serial)) return "";

  // Excel 1900日付シリアル。UTCで計算して日付ズレを避ける。
  const utcDays = Math.floor(serial - 25569);
  const date = new Date(utcDays * 86400 * 1000);
  return formatDateUTC(date);
}

function normalizeTime(value) {
  if (value === undefined || value === null || value === "") return "";

  if (value instanceof Date) {
    return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  }

  if (typeof value === "number") {
    const totalMinutes = Math.round(value * 24 * 60);
    const hours = String(Math.floor(totalMinutes / 60) % 24).padStart(2, "0");
    const minutes = String(totalMinutes % 60).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  const text = String(value).trim();
  if (!text) return "";
  const match = text.match(/(\d{1,2})[:時](\d{1,2})?/);
  if (match) {
    return `${String(match[1]).padStart(2, "0")}:${String(match[2] || "0").padStart(2, "0")}`;
  }
  return text.slice(0, 5);
}

function toNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = String(value).replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0));
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function getCellValue(sheet, address) {
  const cell = sheet[address];
  if (!cell) return "";
  return cell.v ?? "";
}

function getCellDisplay(sheet, address) {
  const cell = sheet[address];
  if (!cell) return "";
  return cell.w ?? cell.v ?? "";
}

function addRecord(date, period, time, systolic, diastolic, pulse, sourceRow) {
  if (!date) return;
  if (systolic === null && diastolic === null && pulse === null) return;
  records.push({ date, period, time, systolic, diastolic, pulse, sourceRow });
}

function parseRecordSheet(sheet) {
  records = [];

  if (!sheet["!ref"]) return;
  const range = XLSX.utils.decode_range(sheet["!ref"]);

  // Blood_Pressuer.xlsx の「記録」シートは以下の固定レイアウト。
  // B列:日付 / C-F列:朝（時間,最高,最低,心拍） / G-J列:夜（時間,最高,最低,心拍）
  // データ開始はB3。B25の2026/6/16朝まで読み取り、夜欄が空なら朝だけ表示する。
  for (let row = START_ROW; row <= range.e.r + 1; row += 1) {
    const rawDate = getCellValue(sheet, `B${row}`);
    const date = excelSerialDateToDate(rawDate);
    if (!date) continue;

    addRecord(
      date,
      "朝",
      normalizeTime(getCellValue(sheet, `C${row}`) || getCellDisplay(sheet, `C${row}`)),
      toNumber(getCellValue(sheet, `D${row}`)),
      toNumber(getCellValue(sheet, `E${row}`)),
      toNumber(getCellValue(sheet, `F${row}`)),
      row
    );

    addRecord(
      date,
      "夜",
      normalizeTime(getCellValue(sheet, `G${row}`) || getCellDisplay(sheet, `G${row}`)),
      toNumber(getCellValue(sheet, `H${row}`)),
      toNumber(getCellValue(sheet, `I${row}`)),
      toNumber(getCellValue(sheet, `J${row}`)),
      row
    );
  }
}

async function loadExcel() {
  statusEl.textContent = "Excelを読み込み中...";
  tableBody.innerHTML = "";

  try {
    const response = await fetch(`${EXCEL_FILE}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`${EXCEL_FILE} が見つかりません。index.html と同じ階層に置いてください。`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: false });
    const sheet = workbook.Sheets[SHEET_NAME];
    if (!sheet) throw new Error(`シート「${SHEET_NAME}」が見つかりません`);

    parseRecordSheet(sheet);

    records.sort((a, b) => `${a.date} ${a.time || "99:99"} ${a.period}`.localeCompare(`${b.date} ${b.time || "99:99"} ${b.period}`));
    originalRecordsCount = records.length;
    renderTable();
    renderChart();
    setNextInputFromRecords();

    const firstDate = records[0]?.date || "";
    const lastDate = records[records.length - 1]?.date || "";
    const lastRow = Math.max(...records.map((record) => record.sourceRow || 0));
    statusEl.textContent = records.length
      ? `${records.length}件を読み込みました（B${START_ROW}開始 / 最終行B${lastRow} / ${firstDate} 〜 ${lastDate}）`
      : "記録が見つかりませんでした。B3:J列の記録を確認してください。";
  } catch (error) {
    statusEl.textContent = `エラー: ${error.message}`;
    console.error(error);
  }
}

function setNextInputFromRecords() {
  if (!records.length) {
    setDefaultDateTime();
    return;
  }

  const dateSet = [...new Set(records.map((record) => record.date))].sort();
  const lastDate = dateSet[dateSet.length - 1];
  const hasMorning = records.some((record) => record.date === lastDate && record.period === "朝");
  const hasNight = records.some((record) => record.date === lastDate && record.period === "夜");

  const periodEl = document.getElementById("period");
  const dateEl = document.getElementById("date");
  dateEl.value = lastDate;

  // 最終日が朝だけなら、次の入力候補は同日の夜。
  if (hasMorning && !hasNight) {
    periodEl.value = "night";
  } else {
    periodEl.value = "morning";
  }

  const now = new Date();
  document.getElementById("time").value = now.toTimeString().slice(0, 5);
}

function renderTable() {
  tableBody.innerHTML = "";

  const fragment = document.createDocumentFragment();
  records.forEach((record) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${record.date}</td>
      <td>${record.period}</td>
      <td>${record.time}</td>
      <td>${record.systolic ?? ""}</td>
      <td>${record.diastolic ?? ""}</td>
      <td>${record.pulse ?? ""}</td>
    `;
    fragment.appendChild(tr);
  });
  tableBody.appendChild(fragment);
}

function renderChart() {
  const ctx = document.getElementById("bpChart");
  const labels = records.map((record) => `${record.date}\n${record.period}`);

  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "最高血圧",
          data: records.map((record) => record.systolic),
          spanGaps: true,
          tension: 0.25
        },
        {
          label: "最低血圧",
          data: records.map((record) => record.diastolic),
          spanGaps: true,
          tension: 0.25
        },
        {
          label: "心拍数",
          data: records.map((record) => record.pulse),
          spanGaps: true,
          tension: 0.25
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            title: (items) => items[0].label.replace(",", " ")
          }
        }
      },
      scales: {
        x: {
          ticks: {
            autoSkip: true,
            maxTicksLimit: 8,
            maxRotation: 0,
            callback: function(value) {
              const label = this.getLabelForValue(value);
              return label.split("\n");
            }
          }
        },
        y: { beginAtZero: false }
      }
    }
  });
}

function setupTabs() {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab-button").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".screen").forEach((screen) => screen.classList.remove("active"));
      button.classList.add("active");
      document.getElementById(button.dataset.screen).classList.add("active");

      if (button.dataset.screen === "chartScreen" && chart) {
        setTimeout(() => chart.resize(), 50);
      }
    });
  });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const period = document.getElementById("period").value === "morning" ? "朝" : "夜";
  addRecord(
    document.getElementById("date").value,
    period,
    document.getElementById("time").value,
    toNumber(document.getElementById("systolic").value),
    toNumber(document.getElementById("diastolic").value),
    toNumber(document.getElementById("pulse").value),
    null
  );

  records.sort((a, b) => `${a.date} ${a.time || "99:99"} ${a.period}`.localeCompare(`${b.date} ${b.time || "99:99"} ${b.period}`));
  renderTable();
  renderChart();
  statusEl.textContent = `${records.length}件を表示中（Excel読込${originalRecordsCount}件 + 一時追加${records.length - originalRecordsCount}件。Excelには未保存）`;
  form.reset();
  setNextInputFromRecords();
});

document.getElementById("reloadButton").addEventListener("click", loadExcel);

setupTabs();
setDefaultDateTime();
loadExcel();
