// ⚠️ URL DEPLOYMENT APPS SCRIPT WEB APP
const API_URL = "https://script.google.com/macros/s/AKfycbxR0bwVJCXQY5DQKawqOBQO6vNwU8UMFLJ3AuBytSRgQR3TW9rJZ0r58JGkL2u_HxYMhw/exec";

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

// Master untuk dalam baris tabel (pakai warna)
const masterStatusList = [
  { value: '', label: '-- Pilih Status --', class: 'status-kosong' },
  { value: 'Tepat Waktu', label: 'Tepat Waktu', class: 'status-hadir' },
  { value: 'Terlambat', label: 'Terlambat', class: 'status-terlambat' },
  { value: 'Sangat Terlambat', label: 'Sangat Terlambat', class: 'status-terlambat-berat' },
  { value: 'Sangat Terlambat Sekali', label: 'Sangat Terlambat Sekali', class: 'status-terlambat-ekstrem' },
  { value: 'Sakit', label: 'Sakit', class: 'status-sakit' },
  { value: 'Izin', label: 'Izin', class: 'status-izin' },
  { value: 'Alpa', label: 'Alpa', class: 'status-alpa' },
  { value: 'Hadir Tidak Presensi', label: 'Hadir Tidak Presensi', class: 'status-htp' },
  { value: 'Libur', label: 'Libur', class: 'status-libur' },
  { value: 'Prakerin', label: 'Prakerin', class: 'status-prakerin' }
];

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

function initFormPiket() {
  const user = JSON.parse(localStorage.getItem("piket_user"));
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  setPetugasPiket(user.nama);
  setRoleUser(user.role);
  updatePendingBadge();

  if (user.role === "Admin") {
    const adminFilter = document.getElementById("adminFilter");
    if (adminFilter) adminFilter.style.display = "block";

    const dateInput = document.getElementById("selectedDate");
    if (dateInput && !dateInput.value) {
      const today = new Date();
      const local = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
      dateInput.value = local.toISOString().split("T")[0];
    }
    fetchData(dateInput.value);
  } else {
    fetchData();
  }

  // Jalankan Auto Polling background
  startAutoPolling();
}

function refreshData() {
  const user = JSON.parse(localStorage.getItem("piket_user"));
  if (user && user.role === "Admin") {
    const selectedDate = document.getElementById("selectedDate")?.value;
    fetchData(selectedDate);
  } else {
    fetchData();
  }
}

async function fetchData(selectedDate) {
  showLoading("Memuat data...");
  const user = JSON.parse(localStorage.getItem("piket_user"));
  const tanggalPresensi = document.getElementById("tanggalPresensi");
  const dateVal = selectedDate || document.getElementById("selectedDate")?.value || new Date().toISOString().split("T")[0];

  if (tanggalPresensi) {
    let tanggalObj = (user && user.role === "Admin") ? new Date(dateVal) : new Date();
    tanggalPresensi.textContent = tanggalObj.toLocaleDateString("id-ID", {
      weekday: "long", day: "numeric", month: "long", year: "numeric"
    });
  }

  try {
    let url = `${API_URL}?action=getSiswaHariIni`;
    if (user && user.role === "Admin" && dateVal) {
      url = `${API_URL}?action=getSiswaByTanggal&tanggal=${dateVal}`;
    }

    const response = await fetch(url);
    const data = await response.json();
    renderTable(Array.isArray(data) ? data : []);
  } catch (err) {
    console.error(err);
    showToast("Gagal terhubung ke server Backend API", "error");
    hideLoading();
  }
}

function renderTable(data) {
  dataSiswa = data;
  populateFilterKelas(data);
  populateFilterStatus(data);
  
  document.getElementById("filterKelas").value = lastFilter.kelas || "";
  document.getElementById("filterTingkat").value = lastFilter.tingkat || "";
  document.getElementById("filterStatus").value = lastFilter.status || "";
  
  applyFilter();
  hideLoading();
}

/**
 * 💡 POPULATE DROPDOWN KELAS DINAMIS (URUTAN TINGKAT X -> XI -> XII)
 */
function populateFilterKelas(data) {
  const filterKelas = document.getElementById("filterKelas");
  filterKelas.innerHTML = `<option value="">Semua</option>`;
  
  const kelasMap = new Map();
  data.forEach(s => {
    if (s.kelas && !kelasMap.has(s.kelas)) {
      kelasMap.set(s.kelas, formatNamaKelas(s.kelas, s.tingkat));
    }
  });

  const parseLabel = (label) => {
    const parts = label.split(" "); 
    const jurusan = parts[0] || "";
    const sisa = parts[1] || ""; 
    const [tingkat, sub] = sisa.split("-"); 

    let weight = 99;
    if (tingkat === "X") weight = 1;
    else if (tingkat === "XI") weight = 2;
    else if (tingkat === "XII") weight = 3;

    return { jurusan, weight, sub: sub || "" };
  };

  const sortedKeys = [...kelasMap.keys()].sort((a, b) => {
    const labelA = kelasMap.get(a);
    const labelB = kelasMap.get(b);

    const pA = parseLabel(labelA);
    const pB = parseLabel(labelB);

    if (pA.jurusan !== pB.jurusan) {
      return pA.jurusan.localeCompare(pB.jurusan);
    }
    if (pA.weight !== pB.weight) {
      return pA.weight - pB.weight;
    }
    return pA.sub.localeCompare(pB.sub);
  });

  sortedKeys.forEach(idRombel => {
    const opt = document.createElement("option");
    opt.value = idRombel; 
    opt.textContent = kelasMap.get(idRombel); 
    filterKelas.appendChild(opt);
  });
}

/**
 * 💡 POPULATE DROPDOWN STATUS MASUK DINAMIS
 */
function populateFilterStatus(data) {
  const container = document.getElementById("filterStatus");
  const currentVal = container.getAttribute("data-value") || "";
  
  const statusSet = new Set(data.map(s => s.statusMasuk).filter(Boolean));
  let dynamicOptions = [{ value: "", label: "Semua", class: "" }, { value: "Kosong", label: "Kosong", class: "" }];

  statusSet.forEach(st => {
    const match = masterStatusList.find(m => m.value === st);
    dynamicOptions.push(match ? match : { value: st, label: st, class: "" });
  });

  createCustomDropdown(container, dynamicOptions, currentVal, function(val) {
    lastFilter.status = val;
    applyFilter();
  });
}

/**
 * 💡 DROPDOWN EDIT STATUS DALAM TABEL (LENGKAP)
 */
function getDropdownHTML(index, selected, rowIndex) {
  const opsiStatus = [
    "", 
    "Tepat Waktu", 
    "Terlambat", 
    "Sangat Terlambat", 
    "Sangat Terlambat Sekali", 
    "Sakit", 
    "Izin", 
    "Alpa", 
    "Hadir Tidak Presensi", 
    "Libur"
  ];

  return `
    <select name="statusMasuk" id="statusSelect-${index}">
      ${opsiStatus.map(o => `<option value="${o}" ${o === selected ? "selected" : ""}>${o || "-- Pilih Status --"}</option>`).join('')}
    </select>
    <input type="hidden" name="rowIndex" value="${rowIndex}">
  `;
}

function initFilters(data) {
  // 1. Filter Kelas
  const kelasContainer = document.getElementById("filterKelas");
  const uniqueKelas = [...new Set(data.map(s => s.kelas).filter(Boolean))].sort();
  const kelasOptions = [{ value: "", label: "Semua" }, ...uniqueKelas.map(k => ({ value: k, label: formatNamaKelas(k, '') }))];
  
  createCustomDropdown(kelasContainer, kelasOptions, "", function(val) {
    applyFilter();
  });

  // 2. Filter Tingkat
  const tingkatContainer = document.getElementById("filterTingkat");
  const uniqueTingkat = [...new Set(data.map(s => s.tingkat).filter(Boolean))].sort();
  const tingkatOptions = [{ value: "", label: "Semua" }, ...uniqueTingkat.map(t => ({ value: t, label: t }))];
  
  createCustomDropdown(tingkatContainer, tingkatOptions, "", function(val) {
    applyFilter();
  });

  // 3. Filter Status (Polos tanpa class warna)
  const statusContainer = document.getElementById("filterStatus");
  const statusOptions = [
    { value: "", label: "Semua" },
    { value: "Kosong", label: "Kosong" },
    { value: "Belum Presensi", label: "Belum Presensi" },
    { value: "Alpa", label: "Alpa" },
    { value: "Tepat Waktu", label: "Tepat Waktu" },
    { value: "Terlambat", label: "Terlambat" },
    { value: "Prakerin", label: "Prakerin" },
    { value: "Sangat Terlambat", label: "Sangat Terlambat" }
  ];

  createCustomDropdown(statusContainer, statusOptions, "", function(val) {
    applyFilter();
  });
}

function applyFilter() {
  const kelas = document.getElementById("filterKelas").getAttribute("data-value") || "";
  const tingkat = document.getElementById("filterTingkat").getAttribute("data-value") || "";
  const status = document.getElementById("filterStatus").getAttribute("data-value") || "";
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
    .filter(s => !nama || (s.nama && s.nama.toLowerCase().includes(nama)));

  const startIndex = (currentPage - 1) * rowsPerPage;
  const pageData = filtered.slice(startIndex, startIndex + rowsPerPage);

  if (pageData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6">Tidak ada data.</td></tr>`;
    document.getElementById("jumlahData").textContent = "0";
    renderPagination(0);
    return;
  }

  const fragment = document.createDocumentFragment();
  pageData.forEach((s, idx) => {
    const tr = document.createElement("tr");
    const namaTd = document.createElement("td"); namaTd.textContent = s.nama || "-";
    const kelasTd = document.createElement("td"); kelasTd.textContent = formatNamaKelas(s.kelas, s.tingkat);
    const tingkatTd = document.createElement("td"); tingkatTd.textContent = s.tingkat || "-";
    const jamMasukTd = document.createElement("td"); jamMasukTd.textContent = s.jamMasuk || "-";
    const jamPulangTd = document.createElement("td"); jamPulangTd.textContent = s.jamPulang || "-";

    const statusTd = document.createElement("td");
    statusTd.style.textAlign = "center";
    statusTd.style.verticalAlign = "middle";
    const index = startIndex + idx;
    statusTd.id = `status-${index}`;
    const value = s.statusMasuk || "";

    statusTd.dataset.rowIndex = s.rowIndex;
    statusTd.dataset.statusMasuk = value;

    // 💡 Terapkan Custom Dropdown Reusable untuk setiap baris status siswa
    const dropdownWrapper = document.createElement("div");
    createCustomDropdown(dropdownWrapper, masterStatusList, value, function(newValue) {
      processStatusChange(s.rowIndex, newValue, s.tanggal);
    });
    
    statusTd.appendChild(dropdownWrapper);

    tr.appendChild(namaTd);
    tr.appendChild(kelasTd);
    tr.appendChild(tingkatTd);
    tr.appendChild(jamMasukTd);
    tr.appendChild(statusTd);
    tr.appendChild(jamPulangTd);
    fragment.appendChild(tr);
  });

  tbody.appendChild(fragment);
  document.getElementById("jumlahData").textContent = `${filtered.length}`;
  renderPagination(filtered.length);
}

function renderPagination(total) {
  const container = document.getElementById("pagination");
  if (!container) return;
  container.innerHTML = "";

  const totalPages = Math.ceil(total / rowsPerPage);
  if (totalPages <= 1) return;

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.textContent = "«";
  prevBtn.disabled = currentPage <= 1;
  prevBtn.onclick = () => { currentPage--; applyFilter.keepPage = true; applyFilter(); };
  container.appendChild(prevBtn);

  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = i;
    if (i === currentPage) { btn.disabled = true; btn.classList.add("active"); }
    else { btn.onclick = () => { currentPage = i; applyFilter.keepPage = true; applyFilter(); }; }
    container.appendChild(btn);
  }

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.textContent = "»";
  nextBtn.disabled = currentPage >= totalPages;
  nextBtn.onclick = () => { currentPage++; applyFilter.keepPage = true; applyFilter(); };
  container.appendChild(nextBtn);
}

// Mode Edit: Dropdown Otomatis tanpa Tombol [X]
function editStatus(index, originalValue, rowIndex) {
  const td = document.getElementById(`status-${index}`);
  
  td.innerHTML = `
    <select id="statusSelect-${index}" class="inline-select" onblur="cancelEdit(${index}, '${originalValue}', ${rowIndex})">
      ${getDropdownOptionsHTML(originalValue)}
    </select>
  `;

  const select = document.getElementById(`statusSelect-${index}`);
  select.focus();

  select.addEventListener("change", () => {
    const newValue = select.value;
    const targetSiswa = dataSiswa.find(s => Number(s.rowIndex) === Number(rowIndex));
    const tgl = targetSiswa ? targetSiswa.tanggal : "";

    td.innerHTML = `
      <div class="status-chip ${getStatusClass(newValue)}" onclick="editStatus(${index}, '${newValue}', ${rowIndex})" title="Klik untuk ubah status">
        <span>${newValue || "Belum diisi"}</span>
        ${SVG_PENCIL}
      </div>
    `;
    processStatusChange(rowIndex, newValue, tgl);
  });
}

function cancelEdit(index, originalValue, rowIndex) {
  const td = document.getElementById(`status-${index}`);
  // Hanya cancel jika select tidak sedang berganti nilai
  setTimeout(() => {
    if (document.activeElement?.id !== `statusSelect-${index}`) {
      td.innerHTML = `
        <div class="status-chip ${getStatusClass(originalValue)}" onclick="editStatus(${index}, '${originalValue}', ${rowIndex})" title="Klik untuk ubah status">
          <span>${originalValue || "Belum diisi"}</span>
          ${SVG_PENCIL}
        </div>
      `;
    }
  }, 150);
}

function getDropdownOptionsHTML(selected) {
  const opsiStatus = ["", "Tepat Waktu", "Terlambat", "Sangat Terlambat", "Sangat Terlambat Sekali", "Sakit", "Izin", "Alpa", "Hadir Tidak Presensi", "Libur"];
  return opsiStatus.map(o => `<option value="${o}" ${o === selected ? "selected" : ""}>${o || "-- Pilih Status --"}</option>`).join('');
}

let syncTimer = null; // Timer untuk Debounce

/**
 * 💡 FUNGSI UTAMA: Catat Perubahan + Trigger Debounced Auto-Sync
 */
function processStatusChange(rowIndex, newValue, tanggal) {
  const user = JSON.parse(localStorage.getItem("piket_user"));
  const piketID = user ? user.nama : "Petugas";
  const timestamp = new Date().toISOString();

  // 1. Update data di memori aplikasi
  const targetSiswa = dataSiswa.find(s => Number(s.rowIndex) === Number(rowIndex));
  if (targetSiswa) targetSiswa.statusMasuk = newValue;

  // 2. Simpan / Perbarui Antrean di LocalStorage
  let queue = JSON.parse(localStorage.getItem("piket_pending_updates") || "[]");
  const existingIdx = queue.findIndex(item => Number(item.rowIndex) === Number(rowIndex));

  if (existingIdx > -1) {
    queue[existingIdx].statusMasuk = newValue;
    queue[existingIdx].timestamp = timestamp;
    if (tanggal) queue[existingIdx].tanggal = tanggal;
  } else {
    queue.push({
      rowIndex: parseInt(rowIndex, 10),
      statusMasuk: newValue,
      piketID: piketID,
      tanggal: tanggal || (targetSiswa ? targetSiswa.tanggal : ""),
      timestamp: timestamp
    });
  }

  localStorage.setItem("piket_pending_updates", JSON.stringify(queue));
  updatePendingBadge();

  // 3. ⚡ DEBOUNCE AUTO-SYNC: Tunggu 1.5 detik setelah editan terakhir
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    triggerAutoSync();
  }, 1500); 
}

/**
 * ⚡ Eksekutor Auto-Sync ke Server
 */
async function triggerAutoSync() {
  if (!navigator.onLine) {
    showToast("Offline: Perubahan tersimpan di perangkat", "info", 2000);
    return;
  }

  let queue = JSON.parse(localStorage.getItem("piket_pending_updates") || "[]");
  if (queue.length === 0) return;

  const saveBtn = document.querySelector("#absenForm button[type='submit']");
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = `Syncing (${queue.length})...`;
  }

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "simpanStatusMasuk", payload: queue })
    });

    const result = await response.json();

    if (result.success) {
      localStorage.setItem("piket_pending_updates", "[]");
      updatePendingBadge();
      showToast("Data tersimpan otomatis ke server", "success", 2000);
    }
  } catch (err) {
    console.warn("[Auto-Sync Background] Server sibuk/koneksi terputus. Data tersimpan di LocalStorage.");
    updatePendingBadge();
  }
}

/**
 * 🌐 EVENT LISTENERS: Auto-Sync Saat Online
 */
window.addEventListener("online", () => {
  showToast("Koneksi terhubung kembali. Menyingkronkan data...", "info");
  triggerAutoSync();
});

window.addEventListener("offline", () => {
  showToast("Koneksi terputus. Mode Offline aktif.", "error");
});

function updatePendingBadge() {
  let queue = JSON.parse(localStorage.getItem("piket_pending_updates") || "[]");
  let pendingCount = queue.length;
  const saveBtn = document.querySelector("#absenForm button[type='submit']");
  if (!saveBtn) return;

  if (pendingCount > 0) {
    saveBtn.disabled = false;
    saveBtn.style.opacity = "1";
    saveBtn.style.background = "#dd9787";
    saveBtn.innerHTML = `Sync (${pendingCount})`;
  } else {
    saveBtn.disabled = true;
    saveBtn.style.opacity = "0.5";
    saveBtn.style.background = "#006D77";
    saveBtn.innerHTML = `Tersimpan`;
  }
}

async function handleSubmit(e) {
  if (e) e.preventDefault();
  let queue = JSON.parse(localStorage.getItem("piket_pending_updates") || "[]");

  if (queue.length === 0) {
    showToast("Tidak ada perubahan data yang perlu disinkronkan.", "info");
    return;
  }

  showLoading(`Menyinkronkan ${queue.length} data ke server...`);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "simpanStatusMasuk", payload: queue })
    });
    const resText = await response.text();
    const result = JSON.parse(resText);

    hideLoading();
    if (result.success) {
      localStorage.setItem("piket_pending_updates", "[]");
      updatePendingBadge();
      showToast("Semua perubahan berhasil disinkronkan!", "success");
    } else {
      showToast("Gagal menyimpan data ke server", "error");
    }
  } catch (err) {
    hideLoading();
    showToast("Gagal terhubung ke server API", "error");
  }
}

/**
 * 🔄 AUTO POLLING BACKGROUND (SETIAP 30 DETIK)
 */
let pollingTimer = null;
const POLLING_INTERVAL = 30000;

function startAutoPolling() {
  stopAutoPolling();
  pollingTimer = setInterval(() => {
    let queue = JSON.parse(localStorage.getItem("piket_pending_updates") || "[]");
    if (navigator.onLine && queue.length === 0) {
      silentFetchData();
    }
  }, POLLING_INTERVAL);
}

function stopAutoPolling() {
  if (pollingTimer) clearInterval(pollingTimer);
}

async function silentFetchData() {
  const user = JSON.parse(localStorage.getItem("piket_user"));
  const dateVal = document.getElementById("selectedDate")?.value || new Date().toISOString().split("T")[0];

  try {
    let url = `${API_URL}?action=getSiswaHariIni`;
    if (user && user.role === "Admin" && dateVal) {
      url = `${API_URL}?action=getSiswaByTanggal&tanggal=${dateVal}`;
    }

    const response = await fetch(url);
    const newData = await response.json();

    if (Array.isArray(newData) && newData.length > 0) {
      dataSiswa = newData;
      applyFilter.keepPage = true; 
      applyFilter();
    }
  } catch (err) {
    console.warn("[Auto-Polling] Gagal menarik data background.");
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopAutoPolling();
  } else {
    silentFetchData();
    startAutoPolling();
  }
});

function setPetugasPiket(nama) {
  document.getElementById('petugasPiket').textContent = `👤 ${nama || "-"}`;
}

function setRoleUser(role) {
  const roleLabel = { "Admin": "🟣 Admin Presensi", "Piket": "🟢 Petugas Piket" };
  document.getElementById("roleUser").textContent = roleLabel[role] || "⚪ -";
}

function getStatusClass(status) {
  if (!status || status.trim() === "" || status === "Belum Presensi") return "status-kosong";
  const s = status.toLowerCase();
  if (s.includes("tepat waktu")) return "status-hadir";
  if (s.includes("sangat terlambat sekali")) return "status-terlambat-ekstrem";
  if (s.includes("sangat terlambat")) return "status-terlambat-berat";
  if (s.includes("terlambat")) return "status-terlambat";
  if (s.includes("hadir tidak presensi")) return "status-htp";
  if (s.includes("sakit")) return "status-sakit";
  if (s.includes("izin")) return "status-izin";
  if (s.includes("alpa")) return "status-alpa";
  if (s.includes("libur")) return "status-libur";
  if (s.includes("prakerin") || s.includes("pkl")) return "status-prakerin";
  return "status-kosong"; // Default fallback jika ada string lain yang tidak dikenal
}

function showToast(message, type = "info", duration = 3000) {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.remove(); }, duration);
}

function logout() {
  localStorage.removeItem("piket_user");
  window.location.href = "index.html";
}

function closeNotif() { document.getElementById("notifModal").classList.remove("active"); }
function closeError() { document.getElementById("errorModal").classList.remove("active"); }
function closeConfirm() { document.getElementById("confirmModal").classList.remove("active"); }

document.addEventListener('DOMContentLoaded', initFormPiket);

function tarikDataPresensi() {
  showLoading("Memperbarui data presensi...");
  setTimeout(() => {
    hideLoading();
    showToast("Data presensi berhasil diperbarui", "success");
    fetchData();
  }, 1000);
}

function cetakRekap() {
  const user = JSON.parse(localStorage.getItem("piket_user"));
  if (!user) return;
  showLoading("Membuat rekap PDF...");
  setTimeout(() => {
    hideLoading();
    showToast("Fitur rekap siap diproses via Apps Script", "info");
  }, 1200);
}

function formatNamaKelas(idRombel, tingkat) {
  if (!idRombel || typeof idRombel !== "string") return "-";

  const parts = idRombel.trim().split("-");
  const jurusan = parts[0] || "";
  const subKelas = parts[1] ? parts[1].replace(/[0-9]/g, "") : ""; 
  const tkt = tingkat || "";

  if (jurusan && tkt && subKelas) {
    return `${jurusan.toUpperCase()} ${tkt.toUpperCase()}-${subKelas.toUpperCase()}`;
  }

  return idRombel;
}

function createCustomDropdown(containerElement, optionsArray, selectedValue, onSelectCallback) {
  containerElement.className = "custom-dropdown";
  containerElement.innerHTML = `
    <div class="dropdown-selected">
      <span class="dropdown-text"></span>
      <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><polyline points="6 9 12 15 18 9"></polyline></svg>
    </div>
    <div class="dropdown-menu"></div>
  `;

  const textSpan = containerElement.querySelector('.dropdown-text');
  const menuContainer = containerElement.querySelector('.dropdown-menu');

  // Cari label awal
  const currentObj = optionsArray.find(opt => opt.value === selectedValue) || optionsArray[0];
  textSpan.innerText = currentObj.label;
  containerElement.setAttribute('data-value', currentObj.value);

  // Render list opsi secara dinamis
  optionsArray.forEach(item => {
    const div = document.createElement('div');
    div.className = `dropdown-item ${item.class || ''}`;
    div.setAttribute('data-value', item.value);
    div.innerText = item.label;
    menuContainer.appendChild(div);
  });

  // Event buka/tutup
  const selectedBox = containerElement.querySelector('.dropdown-selected');
  selectedBox.onclick = (e) => {
    e.stopPropagation();
    document.querySelectorAll('.custom-dropdown').forEach(el => {
      if (el !== containerElement) el.classList.remove('open');
    });
    containerElement.classList.toggle('open');
  };

  // Event pilih item
  menuContainer.onclick = (e) => {
    const itemDiv = e.target.closest('.dropdown-item');
    if (!itemDiv) return;

    const val = itemDiv.getAttribute('data-value');
    const lbl = itemDiv.innerText;

    textSpan.innerText = lbl;
    containerElement.setAttribute('data-value', val);
    containerElement.classList.remove('open');

    if (typeof onSelectCallback === 'function') {
      onSelectCallback(val, lbl);
    }
  };
}

// Tutup dropdown kalau klik di luar area
document.addEventListener('click', (e) => {
  if (!e.target.closest('.custom-dropdown')) {
    document.querySelectorAll('.custom-dropdown').forEach(el => el.classList.remove('open'));
  }
});