const API_URL = "https://script.google.com/macros/s/AKfycbxR0bwVJCXQY5DQKawqOBQO6vNwU8UMFLJ3AuBytSRgQR3TW9rJZ0r58JGkL2u_HxYMhw/exec";

// Auth Guard
const savedID = localStorage.getItem("piketID");
const savedDate = localStorage.getItem("loginDate");
const todayStr = new Date().toLocaleDateString("id-ID");

if (!savedID || savedDate !== todayStr) {
  localStorage.clear();
  window.location.href = "index.html";
}

window.dataSiswa = [];
window.currentPage = 1;
window.rowsPerPage = 40;
window.lastFilter = { kelas: "", tingkat: "", status: "" };

Object.defineProperty(window, 'isDirty', {
  get: function() {
    let queue = JSON.parse(localStorage.getItem("piket_pending_updates") || "[]");
    return queue.some(item => item.sent === false);
  },
  configurable: true
});

var SVG_PENCIL = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
var SVG_CLOSE = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

function showLoading(text = "Memproses...") {
  const el = document.getElementById("loadingOverlay");
  const label = document.getElementById("loadingText");
  if (label) label.textContent = text;
  if (el) el.classList.add("active");
}

function hideLoading() {
  const el = document.getElementById("loadingOverlay");
  if (el) el.classList.remove("active");
}

async function fetchData(selectedDate) {
  showLoading("Memuat data...");
  const role = localStorage.getItem("role");
  const dateVal = selectedDate || document.getElementById("selectedDate")?.value || new Date().toISOString().split("T")[0];

  const action = (role === "Admin") ? `getSiswaByTanggal&tanggal=${dateVal}` : "getSiswaHariIni";

  try {
    const res = await fetch(`${API_URL}?action=${action}`);
    const data = await res.json();
    renderTable(data);
  } catch (err) {
    hideLoading();
    showToast("Gagal mengambil data dari server.", "error");
  }
}

function renderTable(data) {
  dataSiswa = data;
  populateFilterKelas(data);
  document.getElementById("filterKelas").value = lastFilter.kelas || "";
  document.getElementById("filterTingkat").value = lastFilter.tingkat || "";
  document.getElementById("filterStatus").value = lastFilter.status || "";
  applyFilter();
  hideLoading();
}

function populateFilterKelas(data) {
  const kelasSet = new Set(data.map(s => s.kelas));
  const filterKelas = document.getElementById("filterKelas");
  filterKelas.innerHTML = `<option value="">Semua</option>`;
  [...kelasSet].sort().forEach(kelas => {
    const opt = document.createElement("option");
    opt.value = kelas;
    opt.textContent = kelas;
    filterKelas.appendChild(opt);
  });
}

function applyFilter() {
  const kelas = document.getElementById("filterKelas").value;
  const tingkat = document.getElementById("filterTingkat").value;
  const status = document.getElementById("filterStatus").value;
  const nama = document.getElementById("filterNama")?.value.toLowerCase() || "";
  const tbody = document.getElementById("tbodySiswa");
  tbody.innerHTML = "";

  if (!applyFilter.keepPage) currentPage = 1;
  applyFilter.keepPage = false;

  const filtered = dataSiswa
    .filter(s => (!kelas || s.kelas === kelas))
    .filter(s => (!tingkat || s.tingkat === tingkat))
    .filter(s => {
      if (!status) return true;
      if (status === "Kosong") return !s.statusMasuk;
      return s.statusMasuk === status;
    })
    .filter(s => !nama || s.nama.toLowerCase().includes(nama));

  const startIndex = (currentPage - 1) * rowsPerPage;
  const pageData = filtered.slice(startIndex, startIndex + rowsPerPage);

  if (pageData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6">Tidak ada data.</td></tr>`;
    document.getElementById("jumlahData").textContent = "0";
    return;
  }

  const fragment = document.createDocumentFragment();
  pageData.forEach((s, idx) => {
    const tr = document.createElement("tr");
    const index = startIndex + idx;
    const value = s.statusMasuk || "";

    tr.innerHTML = `
      <td>${s.nama}</td>
      <td>${s.kelas}</td>
      <td>${s.tingkat || "-"}</td>
      <td>${s.jamMasuk || "-"}</td>
      <td id="status-${index}" data-row-index="${s.rowIndex}" data-status-masuk="${value}">
        ${value 
          ? `<span class="status ${getStatusClass(value)}">${value}</span>
             <button type="button" class="button-small" onclick="editStatus(${index}, '${value}', ${s.rowIndex})">${SVG_PENCIL}</button>`
          : getDropdownHTML(index, "", s.rowIndex)}
      </td>
      <td>${s.jamPulang || "-"}</td>
    `;
    fragment.appendChild(tr);
  });

  tbody.appendChild(fragment);
  document.getElementById("jumlahData").textContent = `${filtered.length}`;
}

function getDropdownHTML(index, selected, rowIndex) {
  const opsi = ["", "Sakit", "Izin", "Alpa", "Hadir Tidak Presensi", "Libur"];
  return `
    <select name="statusMasuk" onchange="processStatusSelect(${index}, this.value, ${rowIndex})">
      ${opsi.map(o => `<option value="${o}" ${o === selected ? "selected" : ""}>${o || "-- Pilih Status --"}</option>`).join('')}
    </select>
  `;
}

function processStatusSelect(index, newValue, rowIndex) {
  const td = document.getElementById(`status-${index}`);
  td.innerHTML = `
    <span class="status ${getStatusClass(newValue)}">${newValue || "-- Pilih Status --"}</span>
    <button type="button" class="button-small" onclick="editStatus(${index}, '${newValue}', ${rowIndex})">${SVG_PENCIL}</button>
  `;
  processStatusChange(rowIndex, newValue);
}

function processStatusChange(rowIndex, newValue) {
  const piketID = localStorage.getItem("piketID");
  const timestamp = new Date().toISOString();

  let queue = JSON.parse(localStorage.getItem("piket_pending_updates") || "[]");
  queue.push({ rowIndex: parseInt(rowIndex, 10), statusMasuk: newValue, piketID: piketID, timestamp: timestamp, sent: false });
  localStorage.setItem("piket_pending_updates", JSON.stringify(queue));
  
  syncPendingData();
}

async function syncPendingData() {
  let queue = JSON.parse(localStorage.getItem("piket_pending_updates") || "[]");
  let pendingItems = queue.filter(item => item.sent === false);
  if (pendingItems.length === 0) return;

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "simpanStatusMasuk", payload: pendingItems })
    });
    const result = await res.json();
    if (result.success) {
      localStorage.setItem("piket_pending_updates", "[]");
      showToast("Data berhasil disinkronkan!", "success");
    }
  } catch (e) {
    showToast("Tersimpan di offline browser.", "info");
  }
}

function getStatusClass(status) {
  if (!status) return "status-kosong";
  const s = status.toLowerCase();
  if (s.includes("tepat waktu")) return "status-hadir";
  if (s.includes("terlambat")) return "status-terlambat";
  if (s.includes("sakit")) return "status-sakit";
  if (s.includes("izin")) return "status-izin";
  if (s.includes("alpa")) return "status-alpa";
  return "";
}

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 3000);
}

function logout() {
  showLoading("Keluar...");
  setTimeout(() => {
    localStorage.clear();
    window.location.href = "index.html";
  }, 500);
}

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('petugasPiket').textContent = `👤 ${localStorage.getItem("namaPetugas") || "-"}`;
  fetchData();
});