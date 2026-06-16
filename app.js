const EXCEL_FILE = "Blood_Pressuer.xlsx";
const SHEET_NAME = "記録";

let records = [];
let chart = null;

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

function excelSerialDateToDate(value) {
  if (value === undefined || value === null || value === "") return "";

  if (value instanceof Date) {
    return formatDate(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(trimmed)) {
      const date = new Date(trimmed.replaceAll("/", "-"));
      if (!Number.isNaN(date.getTime())) return formatDate(date);
    }
    const serial = Number(trimmed);
    if (!Number.isNaN(serial)) return excelSerialDateToDate(serial);
    return trimmed;
  }

  const serial = Number(value);
  if (!Number.isFinite(serial)) return "";

  // Excelの1900日付シリアル値をJavaScriptの日付へ変換
  const utcDays = serial - 25569;
  const utcValue = utcDays * 86400;
  const date = new Date(utcValue * 1000);
  return formatDate(date);
}

function formatDate(date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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
  const match = text.match(/(\d{1,2})[:時](\d{1,2})?/);
  if (match) {
    return `${String(match[1]).padStart(2, "0")}:${String(match[2] || "0").padStart(2, "0")}`;
  }
  return text.slice(0, 5);
}

function toNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(String(value).replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0)));
  return Number.isFinite(number) ? number : null;
}

function addRecord(date, period, time, systolic, diastolic, pulse) {
  if (!date) return;
  if (systolic === null && diastolic === null && pulse === null) return;
  records.push({ date, period, time, systolic, diastolic, pulse });
}

function parseRecordSheet(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: true,
    blankrows: false
  });

  records = [];

  // 添付Excelは1行目が空、2行目に見出し、B列から記録が始まる構造。
  // B:日付 C:朝時間 D:朝最高 E:朝最低 F:朝心拍 G:夜時間 H:夜最高 I:夜最低 J:夜心拍
  rows.forEach((row, index) => {
    if (index < 2) return;

    const date = excelSerialDateToDate(row[1]);
    if (!date) return;

    addRecord(date, "朝", normalizeTime(row[2]), toNumber(row[3]), toNumber(row[4]), toNumber(row[5]));
    addRecord(date, "夜", normalizeTime(row[6]), toNumber(row[7]), toNumber(row[8]), toNumber(row[9]));
  });
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

    records.sort((a, b) => `${a.date} ${a.time} ${a.period}`.localeCompare(`${b.date} ${b.time} ${b.period}`));
    renderTable();
    renderChart();

    const firstDate = records[0]?.date || "";
    const lastDate = records[records.length - 1]?.date || "";
    statusEl.textContent = records.length
      ? `${records.length}件を読み込みました（${firstDate} 〜 ${lastDate}）`
      : "記録が見つかりませんでした";
  } catch (error) {
    statusEl.textContent = `エラー: ${error.message}`;
    console.error(error);
  }
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
    toNumber(document.getElementById("pulse").value)
  );

  records.sort((a, b) => `${a.date} ${a.time} ${a.period}`.localeCompare(`${b.date} ${b.time} ${b.period}`));
  renderTable();
  renderChart();
  statusEl.textContent = `${records.length}件を表示中（一時追加を含む。Excelには未保存）`;
  form.reset();
  setDefaultDateTime();
});

document.getElementById("reloadButton").addEventListener("click", loadExcel);

setupTabs();
setDefaultDateTime();
loadExcel();
