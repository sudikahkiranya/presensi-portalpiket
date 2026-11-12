// ⚠️ URL DEPLOYMENT APPS SCRIPT WEB APP
const API_URL = "https://script.google.com/macros/s/AKfycbxR0bwVJCXQY5DQKawqOBQO6vNwU8UMFLJ3AuBytSRgQR3TW9rJZ0r58JGkL2u_HxYMhw/exec";

window.dataSiswa = [];
window.currentPage = 1;
window.rowsPerPage = 40;
window.lastFilter = { kelas: "", tingkat: "", status: "" };

const THEME_STORAGE_KEY = "sisensi_active_theme";

Object.defineProperty(window, 'isDirty', {
  get: function() {
    let queue = JSON.parse(localStorage.getItem("piket_pending_updates") || "[]");
    return queue.some(item => item.sent === false);
  },
  configurable: true
});

var SVG_PENCIL = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
var SVG_CLOSE = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

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
  { value: 'Dispensasi', label: 'Dispensasi', class: 'status-dispensasi' },
  { value: 'Libur', label: 'Libur', class: 'status-libur' },
  { value: 'Prakerin', label: 'Prakerin', class: 'status-prakerin' }
];

const manualStatusList = [
  { value: "", label: "-- Pilih Status --" },
  { value: "Hadir Tidak Presensi", label: "Hadir Tidak Presensi" },
  { value: "Alpa", label: "Alpa" },
  { value: "Sakit", label: "Sakit" },
  { value: "Izin", label: "Izin" },
  { value: "Dispensasi", label: "Dispensasi" },
  { value: "Libur", label: "Libur" }
];

window.systemConfig = {};

/* ==========================================================================
   1. SYSTEM CONFIG & THEME ENGINE
   ========================================================================== */
async function loadSystemConfig() {
  try {
    const response = await fetch(`${API_URL}?action=getSystemConfig`);
    const result = await response.json();

    if (result.success && result.data) {
      window.systemConfig = result.data;
      applySystemConfigToUI();
      initThemeEngine();
    }
  } catch (err) {
    console.warn("Gagal memuat system config:", err);
  }
}

function applySystemConfigToUI() {
  const config = window.systemConfig;
  if (!config) return;

  const logoUrl = config.logo_sekolah_direct_url || config.logo_sekolah_url;

  const logoEl = document.getElementById("appLogo");
  if (logoEl && logoUrl) {
    logoEl.src = logoUrl;
    logoEl.onload = function() { logoEl.classList.add("is-loaded"); };
    if (logoEl.complete) logoEl.classList.add("is-loaded");
  }

  const faviconEl = document.getElementById("appFavicon");
  if (faviconEl && logoUrl) faviconEl.href = logoUrl;

  const namaSekolahEl = document.getElementById("headerNamaSekolah");
  if (namaSekolahEl && config.nama_sekolah) {
    namaSekolahEl.textContent = config.nama_sekolah;
  }

  if (config.nama_sekolah) {
    document.title = `Portal Piket | ${config.nama_sekolah}`;
  }
}

function initThemeEngine() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  const globalTheme = (window.systemConfig && window.systemConfig.tema_warna) 
    ? window.systemConfig.tema_warna 
    : "burgundy";

  const themeToApply = savedTheme || String(globalTheme).toLowerCase() || "burgundy";
  selectTheme(themeToApply, false);
}

function toggleThemePopover(event) {
  if (event) event.stopPropagation();
  closeProfilePopover();
  const popover = document.getElementById("themePopover");
  if (popover) popover.classList.toggle("is-open");
}

function selectTheme(themeName, isUserAction = true) {
  const cleanTheme = String(themeName).toLowerCase();
  
  // Tempel atribut ke <html> dan <body> agar zero-flash 100% bekerja sempurna
  document.documentElement.setAttribute("data-theme", cleanTheme);
  document.body.setAttribute("data-theme", cleanTheme);

  // Update State Swatch
  document.querySelectorAll(".color-swatch").forEach(swatch => {
    swatch.classList.toggle("active", swatch.dataset.theme === cleanTheme);
  });

  if (isUserAction) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, cleanTheme);
    } catch (e) {}
    const popover = document.getElementById("themePopover");
    if (popover) popover.classList.remove("is-open");
    // Toast notifikasi sengaja dihilangkan agar pergantian tema terasa lebih clean & seamless
  }
}

/* ==========================================================================
   2. USER PROFILE POPOVER ENGINE
   ========================================================================== */
function toggleProfilePopover(event) {
  if (event) event.stopPropagation();
  const themePopover = document.getElementById("themePopover");
  if (themePopover) themePopover.classList.remove("is-open");
  
  const popover = document.getElementById("profilePopover");
  if (popover) popover.classList.toggle("is-open");
}

function closeProfilePopover() {
  const popover = document.getElementById("profilePopover");
  if (popover) popover.classList.remove("is-open");
}

document.addEventListener("click", function(e) {
  const themePopover = document.getElementById("themePopover");
  const themeBtn = document.getElementById("themePickerBtn");
  if (themePopover && themePopover.classList.contains("is-open")) {
    if (!themePopover.contains(e.target) && !themeBtn.contains(e.target)) {
      themePopover.classList.remove("is-open");
    }
  }

  const profilePopover = document.getElementById("profilePopover");
  const profileBtn = document.getElementById("userProfileBtn");
  if (profilePopover && profilePopover.classList.contains("is-open")) {
    if (!profilePopover.contains(e.target) && !profileBtn.contains(e.target)) {
      profilePopover.classList.remove("is-open");
    }
  }
});

/* ==========================================================================
   3. APP INITIALIZATION & FETCH DATA
   ========================================================================== */
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
    window.location.href = "index";
    return;
  }

  setPetugasPiket(user.nama);
  setRoleUser(user.role);
  initSyncStatus();
  updatePendingBadge();
  loadSystemConfig();

  if (user.role === "Admin") {
    const adminFilter = document.getElementById("adminFilter");
    if (adminFilter) adminFilter.style.display = "block";

    const dateInput = document.getElementById("selectedDate");

    if (dateInput) {
      const tanggalTersimpan = sessionStorage.getItem("piket_selected_date");
      if (tanggalTersimpan) {
        dateInput.value = tanggalTersimpan;
      } else if (!dateInput.value) {
        dateInput.value = getLocalDateString();
      }
      sessionStorage.setItem("piket_selected_date", dateInput.value);
      fetchData(dateInput.value);
    } else {
      fetchData();
    }
  } else {
    fetchData();
  }

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

function getLocalDateString() {
  const today = new Date();
  const local = new Date(today.getTime() - (today.getTimezoneOffset() * 60000));
  return local.toISOString().split("T")[0];
}

async function fetchData(selectedDate) {
  if (!document.querySelector("#filterKelas .dropdown-selected") ||
      !document.querySelector("#filterTingkat .dropdown-selected") ||
      !document.querySelector("#filterStatus .dropdown-selected")) {
    initFilters();
  }

  showLoading("Memuat data...");

  const user = JSON.parse(localStorage.getItem("piket_user"));
  const dateInput = document.getElementById("selectedDate");

  const dateVal = selectedDate || dateInput?.value || sessionStorage.getItem("piket_selected_date") || getLocalDateString();

  if (user && user.role === "Admin" && dateInput && dateVal) {
    dateInput.value = dateVal;
    sessionStorage.setItem("piket_selected_date", dateVal);
  }

  try {
    let url = `${API_URL}?action=getSiswaHariIni`;

    if (user && user.role === "Admin" && dateVal) {
      url = `${API_URL}?action=getSiswaByTanggal&tanggal=${dateVal}`;
    }

    const response = await fetch(url, { method: "GET", redirect: "follow" });

    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

    const data = await response.json();

    if (data && typeof data === "object" && !Array.isArray(data) && data.success === false) {
      throw new Error(data.message || "Gagal mengambil data dari server");
    }

    window.dataSiswa = Array.isArray(data) ? data : [];
    initFilters(window.dataSiswa);
    applyFilter();
    updateSyncStatus();
    refreshServerSyncStatus(dateVal);
    hideLoading();

  } catch (err) {
    console.error("Fetch Error:", err);
    showToast("Gagal terhubung ke server Backend API: " + (err.message || err), "error");
    hideLoading();
  }
}

function initFilters(data = null) {
  const isDataReady = Array.isArray(data);

  const kelasContainer = document.getElementById("filterKelas");
  const tingkatContainer = document.getElementById("filterTingkat");
  const statusContainer = document.getElementById("filterStatus");

  const previousKelas = kelasContainer?.getAttribute("data-value") || "";
  const previousTingkat = tingkatContainer?.getAttribute("data-value") || "";
  const previousStatus = statusContainer?.getAttribute("data-value") || "";

  const kelasMap = new Map();
  if (isDataReady) {
    data.forEach(s => {
      if (s.kelas && !kelasMap.has(s.kelas)) {
        kelasMap.set(s.kelas, formatNamaKelas(s.kelas, s.tingkat));
      }
    });
  }

  const parseLabel = label => {
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
    const pA = parseLabel(kelasMap.get(a));
    const pB = parseLabel(kelasMap.get(b));
    if (pA.jurusan !== pB.jurusan) return pA.jurusan.localeCompare(pB.jurusan);
    if (pA.weight !== pB.weight) return pA.weight - pB.weight;
    return pA.sub.localeCompare(pB.sub);
  });

  const kelasOptions = [
    { value: "", label: "Semua" },
    ...sortedKeys.map(idRombel => ({ value: idRombel, label: kelasMap.get(idRombel) }))
  ];

  if (kelasContainer) {
    const selectedKelas = kelasOptions.some(option => option.value === previousKelas) ? previousKelas : "";
    createCustomDropdown(kelasContainer, kelasOptions, selectedKelas, () => applyFilter());
  }

  const uniqueTingkat = isDataReady
    ? [...new Set(data.map(s => s.tingkat).filter(Boolean))].sort()
    : [];

  const tingkatOptions = [
    { value: "", label: "Semua" },
    ...uniqueTingkat.map(t => ({ value: t, label: t }))
  ];

  if (tingkatContainer) {
    const selectedTingkat = tingkatOptions.some(option => option.value === previousTingkat) ? previousTingkat : "";
    createCustomDropdown(tingkatContainer, tingkatOptions, selectedTingkat, () => applyFilter());
  }

  const availableStatuses = new Set();
  if (Array.isArray(data) && data.length > 0) {
    data.forEach(s => {
      const status = String(s.statusMasuk ?? "").trim();
      if (status) availableStatuses.add(status);
      else availableStatuses.add("Kosong");
    });
  }

  const sortedStatuses = [...availableStatuses].sort((a, b) => a.localeCompare(b, "id"));
  const statusOptions = [
    { value: "", label: "Semua" },
    ...sortedStatuses.map(status => ({ value: status, label: status }))
  ];

  if (statusContainer) {
    const selectedStatus = statusOptions.some(option => option.value === previousStatus) ? previousStatus : "";
    createCustomDropdown(statusContainer, statusOptions, selectedStatus, () => applyFilter());
  }
}

function renderStatusBadge(statusTd, s, value) {
  const matchStatus = masterStatusList.find(m => m.value === value);
  const badgeClass = matchStatus ? matchStatus.class : "badge-default";

  const wrapper = document.createElement("div");
  wrapper.className = "badge-wrapper-cell";

  const badgeBtn = document.createElement("button");
  badgeBtn.className = `status-badge-btn ${badgeClass}`;
  badgeBtn.title = "Klik untuk ubah status";
  badgeBtn.innerHTML = `
    <span>${value || "-- Belum Diatur --"}</span>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
    </svg>
  `;

  badgeBtn.onclick = function(e) {
    e.stopPropagation();
    document.dispatchEvent(new CustomEvent('closeAllStatusDropdowns'));

    statusTd.innerHTML = "";
    const dropdownWrapper = document.createElement("div");
    dropdownWrapper.className = "status-dropdown-cell-wrapper";

    createCustomDropdown(dropdownWrapper, manualStatusList, value, function(newValue) {
      cleanupListeners();
      if (newValue && newValue !== value) {
        if (newValue === "Dispensasi") {
          // Kembalikan tampilan ke badge lama dulu sambil menunggu user isi modal
          statusTd.innerHTML = "";
          renderStatusBadge(statusTd, s, value);
          openDispensasiModal(statusTd, s, value);
          return;
        }
        processStatusChange(s.rowIndex, newValue, s.tanggal);
        statusTd.innerHTML = "";
        renderStatusBadge(statusTd, s, newValue);
      } else {
        statusTd.innerHTML = "";
        renderStatusBadge(statusTd, s, value);
      }
    });

    statusTd.appendChild(dropdownWrapper);
    openCustomDropdown(dropdownWrapper);

    const resetToBadge = function() {
      cleanupListeners();
      statusTd.innerHTML = "";
      renderStatusBadge(statusTd, s, s.statusMasuk || value);
    };

    const clickOutsideHandler = function(event) {
      if (!dropdownWrapper.contains(event.target)) resetToBadge();
    };

    const closeOtherHandler = function() { resetToBadge(); };

    const cleanupListeners = function() {
      document.removeEventListener('click', clickOutsideHandler);
      document.removeEventListener('closeAllStatusDropdowns', closeOtherHandler);
    };

    document.addEventListener('closeAllStatusDropdowns', closeOtherHandler);
    setTimeout(() => document.addEventListener('click', clickOutsideHandler), 10);
  };

  wrapper.appendChild(badgeBtn);
  statusTd.appendChild(wrapper);
}

// 💡 HANDLER MODAL KETERANGAN DISPENSASI
let pendingDispensasiContext = null;

function openDispensasiModal(statusTd, studentObj, oldValue) {
  pendingDispensasiContext = { statusTd, studentObj, oldValue };
  const modal = document.getElementById("dispensasiModal");
  const infoEl = document.getElementById("dispensasiStudentInfo");
  const inputEl = document.getElementById("inputKetDispensasi");

  if (infoEl) {
    infoEl.textContent = `Masukkan alasan/kegiatan dispensasi untuk ${studentObj.nama || "siswa"}:`;
  }
  if (inputEl) {
    inputEl.value = studentObj.keterangan || "";
  }
  if (modal) {
    modal.classList.add("active");
    setTimeout(() => inputEl && inputEl.focus(), 50);
  }
}

function closeDispensasiModal() {
  const modal = document.getElementById("dispensasiModal");
  if (modal) modal.classList.remove("active");
  pendingDispensasiContext = null;
}

function submitDispensasi() {
  const inputEl = document.getElementById("inputKetDispensasi");
  const keterangan = inputEl ? inputEl.value.trim() : "";

  if (!keterangan) {
    showToast("Keterangan dispensasi wajib diisi!", "error");
    if (inputEl) inputEl.focus();
    return;
  }

  if (pendingDispensasiContext) {
    const { statusTd, studentObj } = pendingDispensasiContext;
    studentObj.keterangan = keterangan;
    
    processStatusChange(studentObj.rowIndex, "Dispensasi", studentObj.tanggal, keterangan);
    statusTd.innerHTML = "";
    renderStatusBadge(statusTd, studentObj, "Dispensasi");
  }

  closeDispensasiModal();
}

function updateStatistik(data) {
  let hadir = 0;
  let tidakHadir = 0;
  let prakerin = 0;
  let dispensasi = 0;
  let libur = 0;

  data.forEach(s => {
    const status = String(s.statusMasuk ?? "").trim().toLowerCase();

    if (!status || status === "belum presensi" || status === "kosong") return;

    if (status === "libur") {
      libur++;
      return;
    }

    if (status.includes("prakerin") || status.includes("pkl")) {
      prakerin++;
      return;
    }

    if (["sakit", "izin", "alpa"].includes(status)) {
      tidakHadir++;
      return;
    }

    if (status.includes("dispensasi")) {
      dispensasi++;
      hadir++; // Dispensasi tetap dihitung sebagai Hadir (tugas sekolah)
      return;
    }

    if (
      status.includes("tepat waktu") ||
      status.includes("terlambat") ||
      status.includes("hadir tidak presensi") ||
      status === "htp"
    ) {
      hadir++;
    }
  });

  const jumlahDataEl = document.getElementById("jumlahData");
  const jumlahHadirEl = document.getElementById("jumlahHadir");
  const jumlahTidakHadirEl = document.getElementById("jumlahTidakHadir");
  const jumlahPrakerinEl = document.getElementById("jumlahPrakerin");
  const jumlahDispensasiEl = document.getElementById("jumlahDispensasi");
  const jumlahLiburEl = document.getElementById("jumlahLibur");

  if (jumlahDataEl) jumlahDataEl.textContent = data.length;
  if (jumlahHadirEl) jumlahHadirEl.textContent = hadir;
  if (jumlahTidakHadirEl) jumlahTidakHadirEl.textContent = tidakHadir;
  if (jumlahPrakerinEl) jumlahPrakerinEl.textContent = prakerin;
  if (jumlahDispensasiEl) jumlahDispensasiEl.textContent = dispensasi;
  if (jumlahLiburEl) jumlahLiburEl.textContent = libur;

  const boxPrakerin = document.getElementById("boxJumlahPrakerin");
  if (boxPrakerin) boxPrakerin.style.display = prakerin > 0 ? "" : "none";

  const boxDispensasi = document.getElementById("boxJumlahDispensasi");
  if (boxDispensasi) boxDispensasi.style.display = dispensasi > 0 ? "" : "none";

  const boxLibur = document.getElementById("boxJumlahLibur");
  if (boxLibur) boxLibur.style.display = libur > 0 ? "" : "none";
}

function applyFilter() {
  const kelas = document.getElementById("filterKelas")?.getAttribute("data-value") || "";
  const tingkat = document.getElementById("filterTingkat")?.getAttribute("data-value") || "";
  const status = document.getElementById("filterStatus")?.getAttribute("data-value") || "";
  const nama = document.getElementById("filterNama")?.value.toLowerCase() || "";
  const tbody = document.getElementById("tbodySiswa");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!applyFilter.keepPage) currentPage = 1;
  applyFilter.keepPage = false;

  const filtered = window.dataSiswa
      .filter(s => (!kelas || s.kelas === kelas))
      .filter(s => (!tingkat || String(s.tingkat).trim().toLowerCase() === String(tingkat).trim().toLowerCase()))
      .filter(s => {
        if (!status) return true;
        if (status === "Kosong") return !s.statusMasuk;
        return s.statusMasuk === status;
      })
      .filter(s => !nama || (s.nama && s.nama.toLowerCase().includes(nama)));
  
  updateStatistik(filtered);

  const startIndex = (currentPage - 1) * rowsPerPage;
  const pageData = filtered.slice(startIndex, startIndex + rowsPerPage);

  if (pageData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center-cell">Tidak ada data.</td></tr>`;
    document.getElementById("jumlahData").textContent = "0";
    renderPagination(0);
    return;
  }

  const fragment = document.createDocumentFragment();
  pageData.forEach((s) => {
    const tr = document.createElement("tr");
    const namaTd = document.createElement("td"); namaTd.textContent = s.nama || "-";
    const kelasTd = document.createElement("td"); kelasTd.textContent = formatNamaKelas(s.kelas, s.tingkat);
    const tingkatTd = document.createElement("td"); tingkatTd.textContent = s.tingkat || "-";
    const jamMasukTd = document.createElement("td"); jamMasukTd.textContent = s.jamMasuk || "-";
    const jamPulangTd = document.createElement("td"); jamPulangTd.textContent = s.jamPulang || "-";

    const statusTd = document.createElement("td");
    statusTd.className = "status-cell-center";
    const value = s.statusMasuk || "";

    statusTd.dataset.rowIndex = s.rowIndex;
    statusTd.dataset.statusMasuk = value;

    renderStatusBadge(statusTd, s, value);

    tr.appendChild(namaTd);
    tr.appendChild(kelasTd);
    tr.appendChild(tingkatTd);
    tr.appendChild(jamMasukTd);
    tr.appendChild(statusTd);
    tr.appendChild(jamPulangTd);
    fragment.appendChild(tr);
  });

  tbody.appendChild(fragment);
  const jumlahEl = document.getElementById("jumlahData");
  if (jumlahEl) jumlahEl.textContent = `${filtered.length}`;
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

/* ==========================================================================
   4. SYNC & SERVER DATA HANDLING
   ========================================================================== */
let syncTimer = null;
let syncInProgress = false;
let currentSyncStudent = "";
let lastSuccessfulSyncByDate = {};
let serverSyncStatusByDate = {};
let syncStatusRequestId = 0;

function getSelectedAttendanceDate() {
  const user = JSON.parse(localStorage.getItem("piket_user") || "null");
  if (user && user.role === "Admin") {
    const dateInput = document.getElementById("selectedDate");
    if (dateInput && dateInput.value) return dateInput.value;
    const savedDate = sessionStorage.getItem("piket_selected_date");
    if (savedDate) return savedDate;
  }
  return getLocalDateString();
}

function formatSyncDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("id-ID", {
    day:"2-digit", month:"short", year:"numeric",
    hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false
  }).replace(/\./g, ":");
}

function setSyncStatus(state, label, caption, detail, showRetry = false) {
  const panel = document.getElementById("syncStatusPanel");
  if (!panel) return;
  const icon = document.getElementById("syncStatusIcon");
  const labelEl = document.getElementById("syncStatusLabel");
  const captionEl = document.getElementById("syncStatusCaption");
  const detailEl = document.getElementById("syncLastUpdated");
  const retry = document.getElementById("retrySyncButton");
  panel.dataset.state = state;
  if (icon) {
    if (state === "syncing") {
      icon.innerHTML = '<span class="sync-mini-spinner" aria-hidden="true"></span>';
    } else {
      const iconNames = { saved: "check", offline: "wifi-off", error: "alert-circle", pending: "clock" };
      const iconName = iconNames[state] || "clock";
      icon.innerHTML = `<i data-lucide="${iconName}"></i>`;
      if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
      }
    }
  }
  if (labelEl) labelEl.textContent = label;
  if (captionEl) captionEl.textContent = state === "syncing" ? "\u00a0" : (caption || "\u00a0");
  if (detailEl) {
    detailEl.textContent = detail || "";
    detailEl.hidden = !detail;
  }
  if (retry) retry.hidden = !showRetry;
}

function updateSyncStatus() {
  const queue = JSON.parse(localStorage.getItem("piket_pending_updates") || "[]");
  const date = getSelectedAttendanceDate();
  const pendingForDate = queue.filter(item => !item.tanggal || normalizeDateKey(item.tanggal) === normalizeDateKey(date)).length;
  const serverStatus = serverSyncStatusByDate[normalizeDateKey(date)];
  const lastSync = serverStatus?.timestamp || null;
  const online = navigator.onLine;
  const lastText = lastSync ? formatSyncDateTime(lastSync) : (serverStatus ? serverStatus.formatted : "Memuat riwayat…");

  if (!online) {
    setSyncStatus("offline", "Offline", pendingForDate ? `${pendingForDate} perubahan menunggu koneksi` : `Sinkronisasi terakhir: ${lastText}`, "", pendingForDate > 0);
  } else if (syncInProgress) {
    const activeCount = Math.max(queue.length, 1);
    setSyncStatus("syncing", `Menyimpan ${activeCount} data...`, "", currentSyncStudent ? `Memproses: ${currentSyncStudent}` : "", false);
  } else if (pendingForDate > 0) {
    setSyncStatus("syncing", `Menyimpan ${pendingForDate} data...`, pendingForDate > 1 ? `${pendingForDate} data sedang menunggu giliran pengiriman` : "Mengirim perubahan ke server...", "", false);
  } else {
    setSyncStatus("saved", "Tersimpan", `Sinkronisasi terakhir: ${lastText}`, "", false);
  }
}

function normalizeDateKey(value) {
  if (!value) return "";
  const raw = String(value).trim();
  let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
  match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return `${match[3]}-${String(match[2]).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`;
  return raw;
}

async function refreshServerSyncStatus(date = getSelectedAttendanceDate()) {
  if (!date) return;
  const requestId = ++syncStatusRequestId;
  try {
    const response = await fetch(`${API_URL}?action=getSinkronisasiTerakhir&tanggal=${encodeURIComponent(date)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    if (!result || result.success !== true) throw new Error(result?.message || "Respons riwayat tidak valid");
    serverSyncStatusByDate[normalizeDateKey(date)] = {
      timestamp: result.timestamp || null,
      formatted: result.formatted || "Belum ada perubahan tersimpan"
    };
    if (requestId === syncStatusRequestId && date === getSelectedAttendanceDate()) updateSyncStatus();
  } catch (err) {
    console.warn("[Sync] Gagal mengambil riwayat dari log_presensi:", err);
    serverSyncStatusByDate[normalizeDateKey(date)] = { timestamp: null, error: true, formatted: "Riwayat belum dapat dimuat" };
    if (requestId === syncStatusRequestId && date === getSelectedAttendanceDate()) {
      setSyncStatus("error", "Riwayat tidak tersedia", "Gagal membaca log_presensi", "", true);
    }
  }
}

function updateConnectionStatus() { updateSyncStatus(); }

function recordSuccessfulSync(item) {
  const date = (item && item.tanggal) || getSelectedAttendanceDate();
  void refreshServerSyncStatus(date);
  updateSyncStatus();
}

function initSyncStatus() {
  updateConnectionStatus();
  updateSyncStatus();
  refreshServerSyncStatus(getSelectedAttendanceDate());
}

function processStatusChange(rowIndex, newValue, tanggal, keterangan = "") {
  const user = JSON.parse(localStorage.getItem("piket_user"));
  const piketID = user ? user.nama : "Petugas";
  const timestamp = new Date().toISOString();

  const targetSiswa = window.dataSiswa.find(s => Number(s.rowIndex) === Number(rowIndex));
  if (targetSiswa) {
    targetSiswa.statusMasuk = newValue;
    targetSiswa.keterangan = keterangan;
  }

  let queue = JSON.parse(localStorage.getItem("piket_pending_updates") || "[]");
  const existingIdx = queue.findIndex(item => Number(item.rowIndex) === Number(rowIndex));

  if (existingIdx > -1) {
    queue[existingIdx].statusMasuk = newValue;
    queue[existingIdx].keterangan = keterangan;
    queue[existingIdx].timestamp = timestamp;
    if (targetSiswa) queue[existingIdx].namaSiswa = targetSiswa.nama || targetSiswa.Nama || targetSiswa.namaSiswa || queue[existingIdx].namaSiswa || "Siswa";
    if (tanggal) queue[existingIdx].tanggal = tanggal;
  } else {
    queue.push({
      rowIndex: parseInt(rowIndex, 10),
      statusMasuk: newValue,
      keterangan: keterangan,
      piketID: piketID,
      tanggal: tanggal || (targetSiswa ? targetSiswa.tanggal : ""),
      namaSiswa: targetSiswa ? (targetSiswa.nama || targetSiswa.Nama || targetSiswa.namaSiswa || "Siswa") : "Siswa",
      timestamp: timestamp
    });
  }

  localStorage.setItem("piket_pending_updates", JSON.stringify(queue));
  updatePendingBadge();
  applyFilter();
  updateSyncStatus();

  clearTimeout(syncTimer);
  syncTimer = null;
  void triggerAutoSync();
}

async function triggerAutoSync() {
  if (!navigator.onLine) {
    updateSyncStatus();
    showToast("Offline: Perubahan tersimpan di perangkat", "info", 2000);
    return;
  }

  if (syncInProgress) {
    updateSyncStatus();
    return;
  }

  const result = await syncPendingUpdates(false);
  if (result.success && result.synced > 0) {
    showToast("Data tersimpan otomatis ke server", "success", 2000);
  }
}

async function syncPendingUpdates(showOverlay = false) {
  if (syncInProgress) return { success: false, synced: 0, busy: true };

  let queue = JSON.parse(localStorage.getItem("piket_pending_updates") || "[]");
  if (queue.length === 0) {
    updatePendingBadge();
    return { success: true, synced: 0 };
  }

  if (!navigator.onLine) {
    updatePendingBadge();
    return { success: false, synced: 0, offline: true };
  }

  syncInProgress = true;
  let synced = 0;
  const syncedNames = [];
  let failed = false;
  updateSyncStatus();

  if (showOverlay) showLoading(`Menyinkronkan ${queue.length} data ke server...`);

  try {
    while (true) {
      queue = JSON.parse(localStorage.getItem("piket_pending_updates") || "[]");
      if (queue.length === 0) break;
      if (!navigator.onLine) { failed = true; break; }

      const item = queue[0];
      const totalRemaining = queue.length;
      currentSyncStudent = item.namaSiswa || item.nama || "data siswa";
      setSyncStatus("syncing", totalRemaining > 1 ? `Menyimpan ${totalRemaining} data...` : "Menyimpan 1 data...", "", `Memproses: ${currentSyncStudent}`, false);

      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "simpanStatusMasuk", payload: [item] })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();

      if (!result || result.success !== true) { failed = true; break; }

      const currentQueue = JSON.parse(localStorage.getItem("piket_pending_updates") || "[]");
      const index = currentQueue.findIndex(current =>
        Number(current.rowIndex) === Number(item.rowIndex) &&
        current.timestamp === item.timestamp &&
        current.statusMasuk === item.statusMasuk
      );

      if (index !== -1) {
        currentQueue.splice(index, 1);
        localStorage.setItem("piket_pending_updates", JSON.stringify(currentQueue));
      }

      recordSuccessfulSync(item);
      synced++;
      const syncedName = item.namaSiswa || item.nama || "Siswa";
      syncedNames.push(syncedName);
      showToast(`Update data ${syncedName} berhasil disimpan.`, "success", 3500);

      updatePendingBadge();
      const remainingNow = JSON.parse(localStorage.getItem("piket_pending_updates") || "[]").length;
      if (remainingNow > 0) {
        setSyncStatus("syncing", `Menyimpan ${remainingNow} data...`, "", "", false);
      } else {
        setSyncStatus("syncing", "Menyimpan...", "", "", false);
      }

      if (showOverlay) {
        const remaining = JSON.parse(localStorage.getItem("piket_pending_updates") || "[]").length;
        const label = document.getElementById("loadingText");
        if (label) {
          label.textContent = remaining > 0 ? `Tersinkron ${synced}. Sisa ${remaining} data...` : "Semua data berhasil disinkronkan!";
        }
      }
    }
  } catch (err) {
    console.warn("[Sync] Gagal menyinkronkan antrean:", err);
    failed = true;
  } finally {
    syncInProgress = false;
    currentSyncStudent = "";
    if (showOverlay) hideLoading();
    updatePendingBadge();
    updateConnectionStatus();
    updateSyncStatus();
  }

  if (synced > 0) await refreshServerSyncStatus(getSelectedAttendanceDate());

  const remaining = JSON.parse(localStorage.getItem("piket_pending_updates") || "[]").length;
  if (!failed && remaining > 0 && navigator.onLine) {
    queueMicrotask(() => triggerAutoSync());
  }

  return { success: !failed && remaining === 0, synced, remaining, syncedNames };
}

async function handleSubmit(e) {
  if (e) e.preventDefault();
  const queue = JSON.parse(localStorage.getItem("piket_pending_updates") || "[]");

  if (queue.length === 0) {
    showToast("Tidak ada perubahan data yang perlu disinkronkan.", "info");
    return;
  }

  if (syncInProgress) {
    showToast("Sinkronisasi sedang berjalan. Tunggu sebentar ya, bro!", "info");
    return;
  }

  const result = await syncPendingUpdates(true);
  const remaining = JSON.parse(localStorage.getItem("piket_pending_updates") || "[]").length;

  if (result.success) {
    // Handling sukses
  } else if (!navigator.onLine || result.offline) {
    showToast(`Offline. ${remaining} data tetap tersimpan di perangkat.`, "error");
  } else {
    showToast(`${result.synced} data berhasil disinkronkan. ${remaining} data masih antre.`, "error");
  }
}

window.addEventListener("online", () => {
  updateConnectionStatus();
  showToast("Koneksi terhubung kembali. Menyingkronkan data...", "info");
  triggerAutoSync();
});

window.addEventListener("offline", () => {
  updateConnectionStatus();
  showToast("Koneksi terputus. Mode Offline aktif.", "error");
});

function updatePendingBadge() { updateSyncStatus(); }

let pollingTimer = null;
const POLLING_INTERVAL = 30000;

function startAutoPolling() {
  stopAutoPolling();
  pollingTimer = setInterval(() => {
    let queue = JSON.parse(localStorage.getItem("piket_pending_updates") || "[]");
    if (navigator.onLine && queue.length === 0) silentFetchData();
  }, POLLING_INTERVAL);
}

function stopAutoPolling() { if (pollingTimer) clearInterval(pollingTimer); }

async function silentFetchData() {
  const user = JSON.parse(localStorage.getItem("piket_user"));
  const dateInput = document.getElementById("selectedDate");
  const dateVal = dateInput?.value || sessionStorage.getItem("piket_selected_date") || getLocalDateString();

  if (user && user.role === "Admin" && dateVal) {
    if (dateInput) dateInput.value = dateVal;
    sessionStorage.setItem("piket_selected_date", dateVal);
  }

  try {
    let url = `${API_URL}?action=getSiswaHariIni`;
    if (user && user.role === "Admin" && dateVal) {
      url = `${API_URL}?action=getSiswaByTanggal&tanggal=${dateVal}`;
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
    const newData = await response.json();

    if (Array.isArray(newData)) {
      window.dataSiswa = newData;
      applyFilter.keepPage = true;
      applyFilter();
    }
  } catch (err) {
    console.warn("[Auto-Polling] Gagal menarik data background.", err);
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopAutoPolling();
  else { silentFetchData(); startAutoPolling(); }
});

function setPetugasPiket(nama) {
  const el = document.getElementById('petugasPiket');
  if (el) el.textContent = nama || "-";
}

function setRoleUser(role) {
  const roleLabel = { "Admin": "Admin Presensi", "Piket": "Petugas Piket" };
  const el = document.getElementById("roleUser");
  if (el) el.textContent = roleLabel[role] || "Petugas";
}

let toastTimeout = null;

function showToast(message, type = "info", duration = 3000) {
  const toast = document.getElementById("appToast");
  const titleEl = document.getElementById("toastTitle");
  const msgEl = document.getElementById("toastMessage");
  const iconBg = document.getElementById("toastIconBg");

  if (!toast) return;

  toast.setAttribute("data-type", type);
  
  if (type === "success") {
    if (titleEl) titleEl.textContent = "Sukses";
    if (iconBg) iconBg.textContent = "✓";
  } else if (type === "error") {
    if (titleEl) titleEl.textContent = "Gagal";
    if (iconBg) iconBg.textContent = "✕";
  } else {
    if (titleEl) titleEl.textContent = "Informasi";
    if (iconBg) iconBg.textContent = "ℹ";
  }

  if (msgEl) msgEl.textContent = message;

  toast.classList.add("is-visible");

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { hideAppToast(); }, duration);
}

function hideAppToast() {
  const toast = document.getElementById("appToast");
  if (toast) toast.classList.remove("is-visible");
}

function logout() {
  stopAutoPolling();
  localStorage.removeItem("piket_user");
  localStorage.removeItem("piketID");
  localStorage.removeItem("namaPetugas");
  localStorage.removeItem("role");
  localStorage.removeItem("loginDate");
  sessionStorage.removeItem("piket_selected_date");
  window.location.replace("/");
}

function showSyncResultModal(names = [], count = 0) {
  const modal = document.getElementById("notifModal");
  const title = document.getElementById("notifTitle");
  const message = document.getElementById("notifMessage");
  const pdfLink = document.getElementById("pdfLink");
  const waButton = document.getElementById("btnKirimWA");
  if (!modal) {
    showToast(`Berhasil menyimpan ${count} data.`, "success");
    return;
  }
  if (title) title.textContent = count === 1 ? "✅ Data berhasil disimpan" : `✅ ${count} data berhasil disimpan`;
  if (message) {
    const uniqueNames = [...new Set(names.filter(Boolean))];
    message.textContent = uniqueNames.length === 1
      ? `Update data ${uniqueNames[0]} berhasil disimpan.`
      : uniqueNames.length > 1
        ? `Berhasil menyimpan data: ${uniqueNames.join(", ")}.`
        : `Berhasil menyimpan ${count} data.`;
  }
  if (pdfLink) pdfLink.parentElement.hidden = true;
  if (waButton) waButton.hidden = true;
  modal.dataset.mode = "sync-result";
  modal.classList.add("active");
}

function closeNotif() {
  const modal = document.getElementById("notifModal");
  if (!modal) return;
  if (modal.dataset.mode === "sync-result") {
    const pdfLink = document.getElementById("pdfLink");
    const waButton = document.getElementById("btnKirimWA");
    if (pdfLink) pdfLink.parentElement.hidden = false;
    if (waButton) waButton.hidden = false;
    delete modal.dataset.mode;
  }
  modal.classList.remove("active");
}
function closeError() { document.getElementById("errorModal")?.classList.remove("active"); }
function closeConfirm() { document.getElementById("confirmModal")?.classList.remove("active"); }
function handleConfirmYes() {
  if (typeof window.onConfirmCallback === "function") window.onConfirmCallback();
  closeConfirm();
}

async function tarikDataPresensi() {
  showLoading("Menarik & memproses data presensi dari Pool...");
  try {
    const response = await fetch(`${API_URL}?action=tarikDataEngine`);
    const result = await response.json();

    if (result.success) {
      const selectedDate = document.getElementById("selectedDate")?.value;
      await fetchData(selectedDate);
      showToast(result.message || "Data presensi berhasil diperbarui!", "success");
    } else {
      hideLoading();
      showToast("Gagal Tarik Data: " + result.message, "error");
    }
  } catch (err) {
    console.error(err);
    hideLoading();
    showToast("Terjadi kesalahan jaringan saat tarik data", "error");
  }
}

let latestPdfUrl = "";

async function cetakRekap() {
  const user = JSON.parse(localStorage.getItem("piket_user"));
  if (!user) {
    showToast("Silakan login terlebih dahulu", "error");
    return;
  }

  const namaPetugas = user.nama || user.username || "Petugas Piket";
  const dateVal = document.getElementById("selectedDate")?.value || getLocalDateString();
  const tanggalSelected = (user.role === "Admin") ? dateVal : getLocalDateString();

  showLoading("Memeriksa kelengkapan data...");

  try {
    const urlCek = `${API_URL}?action=cekStatusKosongHariIni&tanggal=${tanggalSelected}`;
    const resCek = await fetch(urlCek);
    const dataCek = await resCek.json();

    if (!dataCek.success) throw new Error(dataCek.message || "Gagal memeriksa data presensi.");

    if (dataCek.result > 0) {
      hideLoading();
      showToast(`Masih ada ${dataCek.result} data status masuk yang belum diisi!`, "error");
      return;
    }

    showLoading("Membuat berkas PDF rekap...");
    const urlRekap = `${API_URL}?action=buatRekapPresensiHarian&namaPetugas=${encodeURIComponent(namaPetugas)}&tanggal=${tanggalSelected}`;
    const resRekap = await fetch(urlRekap);
    const dataRekap = await resRekap.json();

    if (!dataRekap.success) throw new Error(dataRekap.message || "Gagal membuat rekap PDF.");

    hideLoading();
    showToast("Berhasil membuat rekap PDF!", "success");

    let pdfUrl = "";
    if (typeof dataRekap.result === "object" && dataRekap.result !== null) {
      pdfUrl = dataRekap.result.url || dataRekap.result.pdfUrl || dataRekap.result.downloadUrl || "";
    } else if (typeof dataRekap.result === "string") {
      pdfUrl = dataRekap.result;
    }

    if (!pdfUrl) throw new Error("Link PDF tidak ditemukan dari server.");

    latestPdfUrl = pdfUrl;

    const pdfLinkEl = document.getElementById("pdfLink");
    const notifModalEl = document.getElementById("notifModal");

    if (pdfLinkEl) pdfLinkEl.href = pdfUrl;
    if (notifModalEl) notifModalEl.classList.add("active");
    else window.open(pdfUrl, "_blank");

  } catch (err) {
    console.error(err);
    showToast(`Gagal: ${err.message}`, "error");
    hideLoading();
  }
}

async function kirimRekapGrupWA() {
  const user = JSON.parse(localStorage.getItem("piket_user"));
  if (!user) {
    showToast("Silakan login terlebih dahulu", "error");
    return;
  }

  const namaPetugas = user.nama || user.username || "Petugas Piket";
  const dateVal = document.getElementById("selectedDate")?.value || getLocalDateString();
  const tanggalSelected = (user.role === "Admin") ? dateVal : getLocalDateString();
  const pdfUrl = latestPdfUrl || "";

  showLoading("Sedang mengirim rekap presensi ke Grup WhatsApp...");

  try {
    const targetUrl = `${API_URL}?action=kirimRekapGrupWA&namaPetugas=${encodeURIComponent(namaPetugas)}&tanggal=${encodeURIComponent(tanggalSelected)}&pdfUrl=${encodeURIComponent(pdfUrl)}`;
    const response = await fetch(targetUrl);
    const result = await response.json();

    hideLoading();
    if (result.success) showToast(result.message || "Rekap berhasil dikirim ke Grup WA!", "success");
    else showToast("Gagal mengirim WA: " + (result.message || "Terjadi kesalahan server."), "error");
  } catch (err) {
    hideLoading();
    console.error("❌ Error kirimRekapGrupWA:", err);
    showToast("Terjadi kesalahan koneksi saat mengirim ke WA.", "error");
  }
}

function formatNamaKelas(idRombel, tingkat) {
  if (!idRombel || typeof idRombel !== "string") return "-";
  const parts = idRombel.trim().split("-");
  const jurusan = parts[0] || "";
  const subPart = parts[1] || "";
  const subKelas = subPart.replace(/[0-9]/g, "").trim(); 
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
      <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </div>
    <div class="dropdown-menu">
      <div class="dropdown-menu-inner"></div>
    </div>
  `;

  const textSpan = containerElement.querySelector(".dropdown-text");
  const menuOuter = containerElement.querySelector(".dropdown-menu");
  const menuInner = containerElement.querySelector(".dropdown-menu-inner");
  const selectedBox = containerElement.querySelector(".dropdown-selected");

  const currentObj = optionsArray.find(opt => opt.value === selectedValue) || optionsArray[0];

  textSpan.innerText = currentObj.label;
  containerElement.setAttribute("data-value", currentObj.value);

  optionsArray.forEach(item => {
    const div = document.createElement("div");
    div.className = `dropdown-item ${item.class || ""}`;
    div.setAttribute("data-value", item.value);
    div.innerText = item.label;
    menuInner.appendChild(div);
  });

  selectedBox.onclick = function(e) {
    e.stopPropagation();
    if (containerElement.classList.contains("open")) {
      closeCustomDropdown(containerElement);
      return;
    }
    openCustomDropdown(containerElement);
  };

  menuOuter.onclick = function(e) {
    e.stopPropagation();
    const item = e.target.closest(".dropdown-item");
    if (!item) return;

    const value = item.getAttribute("data-value");
    const label = item.innerText;

    textSpan.innerText = label;
    containerElement.setAttribute("data-value", value);

    closeCustomDropdown(containerElement);

    if (typeof onSelectCallback === "function") {
      onSelectCallback(value, label);
    }
  };
}

function closeCustomDropdown(dropdown) {
  if (!dropdown) return;
  dropdown.classList.remove("open", "drop-up");

  const menu = dropdown.querySelector(".dropdown-menu");
  if (!menu) return;

  menu.style.removeProperty("top");
  menu.style.removeProperty("bottom");
  menu.style.removeProperty("margin-top");
  menu.style.removeProperty("margin-bottom");
  menu.style.removeProperty("max-height");
  menu.style.removeProperty("overflow-y");
}

function openCustomDropdown(dropdown) {
  if (!dropdown) return;

  const menu = dropdown.querySelector(".dropdown-menu");
  if (!menu) return;

  document.querySelectorAll(".custom-dropdown.open").forEach(function(el) {
    if (el !== dropdown) closeCustomDropdown(el);
  });

  dropdown.classList.remove("drop-up");
  dropdown.classList.add("open");

  const tr = dropdown.closest("tr");
  const tbody = tr ? tr.closest("tbody") : null;
  
  let isLastRow = false;
  if (tbody && tr) {
    const rows = Array.from(tbody.querySelectorAll("tr"));
    const currentIndex = rows.indexOf(tr);
    const totalRows = rows.length;
    if (currentIndex >= totalRows - 2 || (totalRows <= 4 && currentIndex === totalRows - 1)) {
      isLastRow = true;
    }
  }

  const rect = dropdown.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const spaceBelow = Math.max(0, viewportHeight - rect.bottom - 8);
  const spaceAbove = Math.max(0, rect.top - 8);
  const menuHeight = Math.min(menu.scrollHeight || 180, 250);

  const openUp = isLastRow || (spaceBelow < menuHeight && spaceAbove > spaceBelow);

  if (openUp) {
    dropdown.classList.add("drop-up");
    menu.style.setProperty("top", "auto", "important");
    menu.style.setProperty("bottom", "calc(100% + 4px)", "important");
    menu.style.setProperty("box-shadow", "0 -6px 18px rgba(0,0,0,0.15)", "important");
  } else {
    menu.style.setProperty("top", "calc(100% + 4px)", "important");
    menu.style.setProperty("bottom", "auto", "important");
    menu.style.setProperty("box-shadow", "0 6px 16px rgba(0,0,0,0.08)", "important");
  }

  menu.style.setProperty("max-height", "250px", "important");
  menu.style.setProperty("overflow-y", "auto", "important");
}

// ⚡ FUNGSI CLEAR CACHE INSTAN TANPA CONFIRM ALERT
async function clearSystemCache() {
  const loadingOverlay = document.getElementById("loadingOverlay");
  if (loadingOverlay) loadingOverlay.classList.add("active");

  // Tutup popover
  const profilePopover = document.getElementById("profilePopover");
  if (profilePopover) profilePopover.classList.remove("is-open");

  try {
    // Post ke BE GAS (API_URL)
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "clearSystemConfigCache" })
    });

    if (response.ok) {
      await response.json();
    }
  } catch (err) {
    console.warn("Soft warning clear cache BE:", err);
  } finally {
    // Langsung hard reload halaman tanpa mengubah localStorage user/login
    window.location.reload(true);
  }
}

// 💡 PERBAIKAN POPOVER TOGGLE & SAFE CLICK OUTSIDE LISTENER
function toggleThemePopover(e) {
  if (e) e.stopPropagation();
  const themePopover = document.getElementById("themePopover");
  const profilePopover = document.getElementById("profilePopover");
  
  if (profilePopover) profilePopover.classList.remove("is-open");
  if (themePopover) themePopover.classList.toggle("is-open");
}

function toggleProfilePopover(e) {
  if (e) e.stopPropagation();
  const themePopover = document.getElementById("themePopover");
  const profilePopover = document.getElementById("profilePopover");

  if (themePopover) themePopover.classList.remove("is-open");
  if (profilePopover) profilePopover.classList.toggle("is-open");
}

// Global click outside handler dengan Null-Checking (Bebas error TypeError)
document.addEventListener("click", function (e) {
  const themePopover = document.getElementById("themePopover");
  const themeBtn = document.getElementById("themePickerBtn");
  const profilePopover = document.getElementById("profilePopover");
  const profileBtn = document.getElementById("profilePickerBtn");

  if (themePopover && themeBtn) {
    if (!themePopover.contains(e.target) && !themeBtn.contains(e.target)) {
      themePopover.classList.remove("is-open");
    }
  }

  if (profilePopover && profileBtn) {
    if (!profilePopover.contains(e.target) && !profileBtn.contains(e.target)) {
      profilePopover.classList.remove("is-open");
    }
  }
});

document.addEventListener("click", function(e) {
  if (e.target.closest(".custom-dropdown")) return;
  document.querySelectorAll(".custom-dropdown.open").forEach(function(el) {
    closeCustomDropdown(el);
  });
});

document.addEventListener('DOMContentLoaded', initFormPiket);