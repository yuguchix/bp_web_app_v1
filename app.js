const SUPABASE_URL = "https://agomsalvejvuuskjvhds.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_cT19NXsteZNyHp5QIZ-Mpg_doRfcUmm";

let db = null;

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

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function loadRecords() {
  statusEl.textContent = "Supabaseから読み込み中...";
  tableBody.innerHTML = "";

  if (!db) {
    statusEl.textContent = "Supabase クライアント初期化中...";
    // ensureSupabaseClient is defined later; wait up to 5s
    if (typeof ensureSupabaseClient === "function") {
      const ok = await ensureSupabaseClient(5000);
      if (!ok) {
        statusEl.textContent = "Supabase SDK の読み込みに失敗しました。ネットワークやスクリプト読み込みを確認してください。";
        return;
      }
    } else {
      statusEl.textContent = "Supabase 初期化関数が見つかりません。";
      return;
    }
  }

  const { data, error } = await db
    .from("blood_pressure_records")
    .select("*")
    .order("measured_date", { ascending: true })
    .order("measured_time", { ascending: true });

  if (error) {
    console.error(error);
    statusEl.textContent = `読み込みエラー: ${error.message}`;
    return;
  }

  records = data.map((row) => ({
    id: row.id,
    date: row.measured_date,
    period: row.period,
    time: row.measured_time?.slice(0, 5),
    systolic: row.systolic,
    diastolic: row.diastolic,
    pulse: row.pulse,
    memo: row.memo || ""
  }));

  renderTable();
  renderChart();
  setNextInputFromRecords();

  statusEl.textContent = `${records.length}件を読み込みました`;
}

async function saveRecord(record) {
  const { error } = await db.from("blood_pressure_records").insert({
    measured_date: record.date,
    period: record.period,
    measured_time: record.time,
    systolic: record.systolic,
    diastolic: record.diastolic,
    pulse: record.pulse
  });

  if (error) {
    console.error(error);
    alert(`保存に失敗しました: ${error.message}`);
    return false;
  }

  return true;
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

  document.getElementById("date").value = lastDate;

  if (hasMorning && !hasNight) {
    document.getElementById("period").value = "night";
  } else {
    document.getElementById("period").value = "morning";
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
        legend: { position: "bottom" }
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

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const record = {
    date: document.getElementById("date").value,
    period: document.getElementById("period").value === "morning" ? "朝" : "夜",
    time: document.getElementById("time").value,
    systolic: toNumber(document.getElementById("systolic").value),
    diastolic: toNumber(document.getElementById("diastolic").value),
    pulse: toNumber(document.getElementById("pulse").value)
  };

  const ok = await saveRecord(record);
  if (!ok) return;

  form.reset();
  await loadRecords();
  alert("保存しました");
});

const reloadBtn = document.getElementById("reloadButton");
if (reloadBtn) reloadBtn.addEventListener("click", loadRecords);

// initialize after DOM and ensure Supabase SDK is loaded
window.addEventListener("DOMContentLoaded", async () => {
  try {
    setupTabs();
    setDefaultDateTime();
    if (typeof ensureSupabaseClient === "function") await ensureSupabaseClient(5000);
    await loadRecords();
  } catch (err) {
    console.error(err);
    statusEl.textContent = `初期化エラー: ${err.message || err}`;
  }
});

// Supabase SDK の読み込みを待って db を初期化するユーティリティ
async function ensureSupabaseClient(timeout = 5000) {
  if (db) return true;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (window.supabase && window.supabase.createClient) {
      try {
        db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        return true;
      } catch (e) {
        console.error('supabase createClient error', e);
        return false;
      }
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}