const EXCEL_FILE = "Blood_Pressuer.xlsx";
const SHEET_NAME = "記録";

let records = [];
let chart = null;

const statusEl = document.getElementById("status");
const tableBody = document.querySelector("#recordsTable tbody");
const form = document.getElementById("bpForm");

function setDefaultDateTime() {
  const now = new Date();
  document.getElementById("date").value = now.toISOString().slice(0, 10);
  document.getElementById("time").value = now.toTimeString().slice(0, 5);
}

function excelSerialDateToDate(serial) {
  if (!serial && serial !== 0) return "";
  if (typeof serial === "string" && serial.includes("-")) return serial;
  const utcDays = Number(serial) - 25569;
  const utcValue = utcDays * 86400;
  const dateInfo = new Date(utcValue * 1000);
  return dateInfo.toISOString().slice(0, 10);
}

function normalizeTime(value) {
  if (!value && value !== 0) return "";
  if (typeof value === "number") {
    const totalSeconds = Math.round(value * 24 * 60 * 60);
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
    return `${hours}:${minutes}`;
  }
  return String(value).slice(0, 5);
}

function toNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function addRecord(date, period, time, systolic, diastolic, pulse) {
  if (systolic === null && diastolic === null && pulse === null) return;
  records.push({ date, period, time, systolic, diastolic, pulse });
}

async function loadExcel() {
  statusEl.textContent = "読み込み中...";
  records = [];

  try {
    const response = await fetch(`${EXCEL_FILE}?v=${Date.now()}`);
    if (!response.ok) throw new Error(`${EXCEL_FILE} が見つかりません`);

    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: false });
    const sheet = workbook.Sheets[SHEET_NAME];
    if (!sheet) throw new Error(`シート「${SHEET_NAME}」が見つかりません`);

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    rows.forEach((row) => {
      const date = excelSerialDateToDate(row["日付"]);

      addRecord(
        date,
        "朝",
        normalizeTime(row["時間"]),
        toNumber(row["最高血圧"]),
        toNumber(row["最低血圧"]),
        toNumber(row["心拍数"])
      );

      addRecord(
        date,
        "夜",
        normalizeTime(row["時間.1"]),
        toNumber(row["最高血圧.1"]),
        toNumber(row["最低血圧.1"]),
        toNumber(row["心拍数.1"])
      );
    });

    records.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    renderTable();
    renderChart();
    statusEl.textContent = `${records.length}件を読み込みました`;
  } catch (error) {
    statusEl.textContent = `エラー: ${error.message}`;
    console.error(error);
  }
}

function renderTable() {
  tableBody.innerHTML = "";

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
    tableBody.appendChild(tr);
  });
}

function renderChart() {
  const ctx = document.getElementById("bpChart");
  const labels = records.map((record) => `${record.date} ${record.period}`);

  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "最高血圧",
          data: records.map((record) => record.systolic),
          tension: 0.25
        },
        {
          label: "最低血圧",
          data: records.map((record) => record.diastolic),
          tension: 0.25
        },
        {
          label: "心拍数",
          data: records.map((record) => record.pulse),
          tension: 0.25
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          position: "bottom"
        }
      },
      scales: {
        x: {
          ticks: {
            maxRotation: 60,
            minRotation: 30
          }
        },
        y: {
          beginAtZero: false
        }
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

  records.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  renderTable();
  renderChart();
  statusEl.textContent = `${records.length}件を表示中（一時追加を含む）`;
});

document.getElementById("reloadButton").addEventListener("click", loadExcel);

setupTabs();
setDefaultDateTime();
loadExcel();
