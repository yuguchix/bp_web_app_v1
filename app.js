let records = [];
let chart = null;

const statusEl = document.getElementById("status");
const tableBody = document.querySelector("#recordsTable tbody");
const form = document.getElementById("bpForm");

// Supabase 設定（必要に応じて変更してください）
const SUPABASE_URL = "https://agomsalvejvuuskjvhds.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_cT19NXsteZNyHp5QIZ-Mpg_doRfcUmm";
const TABLE_NAME = "bp_records"; // 実際のテーブル名に合わせてください

const supabase = (typeof supabase !== "undefined" && supabase.createClient)
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

function setDefaultDateTime() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  document.getElementById("date").value = `${yyyy}-${mm}-${dd}`;
  document.getElementById("time").value = now.toTimeString().slice(0, 5);
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

function addRecord(date, period, time, systolic, diastolic, pulse) {
  if (!date) return;
  if (systolic === null && diastolic === null && pulse === null) return;
  records.push({ date, period, time, systolic, diastolic, pulse });
}

async function loadRecords() {
  statusEl.textContent = "読み込み中...";
  try {
    if (!supabase) throw new Error("Supabase クライアントが初期化されていません。");
    const { data, error } = await supabase.from(TABLE_NAME).select("*").order("date", { ascending: true }).order("time", { ascending: true });
    if (error) throw error;
    records = (data || []).map((r) => ({
      date: r.date || "",
      period: r.period || (r.is_morning ? "朝" : "夜") || "",
      time: r.time || "",
      systolic: r.systolic ?? null,
      diastolic: r.diastolic ?? null,
      pulse: r.pulse ?? null
    }));
    records.sort((a, b) => `${a.date} ${a.time || "99:99"} ${a.period}`.localeCompare(`${b.date} ${b.time || "99:99"} ${b.period}`));
    renderTable();
    renderChart();
    setNextInputFromRecords();
    statusEl.textContent = `${records.length}件を読み込みました`;
    return true;
  } catch (err) {
    console.error(err);
    statusEl.textContent = `エラー: ${err.message || err}`;
    return false;
  }
}

async function saveRecordToSupabase(record) {
  try {
    if (!supabase) throw new Error("Supabase クライアントが初期化されていません。");
    const payload = {
      date: record.date,
      period: record.period,
      time: record.time,
      systolic: record.systolic,
      diastolic: record.diastolic,
      pulse: record.pulse
    };
    const { error } = await supabase.from(TABLE_NAME).insert(payload);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error(err);
    statusEl.textContent = `保存エラー: ${err.message || err}`;
    return false;
  }
}

function setNextInputFromRecords() {
  if (!records.length) {
    setDefaultDateTime();
    return;
  }
  const dateSet = [...new Set(records.map((r) => r.date))].sort();
  const lastDate = dateSet[dateSet.length - 1];
  const hasMorning = records.some((r) => r.date === lastDate && r.period === "朝");
  const hasNight = records.some((r) => r.date === lastDate && r.period === "夜");

  const periodEl = document.getElementById("period");
  const dateEl = document.getElementById("date");
  dateEl.value = lastDate;

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
  statusEl.textContent = `${records.length}件を表示中`;
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
        { label: "最高血圧", data: records.map((r) => r.systolic), spanGaps: true, tension: 0.25 },
        { label: "最低血圧", data: records.map((r) => r.diastolic), spanGaps: true, tension: 0.25 },
        { label: "心拍数", data: records.map((r) => r.pulse), spanGaps: true, tension: 0.25 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { position: "bottom" } },
      scales: { x: { ticks: { autoSkip: true, maxTicksLimit: 8, maxRotation: 0, callback: function(value) { const label = this.getLabelForValue(value); return label.split("\n"); } } }, y: { beginAtZero: false } }
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
  (async () => {
    const period = document.getElementById("period").value === "morning" ? "朝" : "夜";
    const record = {
      date: document.getElementById("date").value,
      period,
      time: document.getElementById("time").value,
      systolic: toNumber(document.getElementById("systolic").value),
      diastolic: toNumber(document.getElementById("diastolic").value),
      pulse: toNumber(document.getElementById("pulse").value)
    };

    statusEl.textContent = "保存中...";
    const ok = await saveRecordToSupabase(record);
    if (!ok) return;

    form.reset();
    await loadRecords();
    alert("保存しました");
  })();
});

setupTabs();
setDefaultDateTime();
// 初期読み込みはSupabaseから
loadRecords();
