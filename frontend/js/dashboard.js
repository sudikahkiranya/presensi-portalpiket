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

// Daftar status khusus edit manual
const manualStatusList = [
  { value: "", label: "-- Pilih Status --" },
  { value: "Hadir Tidak Presensi", label: "Hadir Tidak Presensi" },
  { value: "Alpa", label: "Alpa" },
  { value: "Sakit", label: "Sakit" },
  { value: "Izin", label: "Izin" }
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

    if (dateInput) {
      // Ambil tanggal sebelumnya; jika belum ada, gunakan hari ini.
      const tanggalTersimpan = sessionStorage.getItem("piket_selected_date");

      if (tanggalTersimpan) {
        dateInput.value = tanggalTersimpan;
      } else if (!dateInput.value) {
        const today = new Date();
        const local = new Date(
          today.getTime() - today.getTimezoneOffset() * 60000
        );

        dateInput.value = local.toISOString().split("T")[0];
      }

      // Simpan tanggal yang digunakan sebelum mengambil data.
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


async function fetchData(selectedDate) {
  // Tampilkan filter lebih dulu jika elemen belum diinisialisasi.
  if (!document.querySelector("#filterKelas .dropdown-selected") ||
      !document.querySelector("#filterTingkat .dropdown-selected") ||
      !document.querySelector("#filterStatus .dropdown-selected")) {
    initFilters();
  }

  showLoading("Memuat data...");

  const user = JSON.parse(localStorage.getItem("piket_user"));
  const tanggalPresensi = document.getElementById("tanggalPresensi");
  const dateInput = document.getElementById("selectedDate");

  const dateVal =
    selectedDate ||
    dateInput?.value ||
    sessionStorage.getItem("piket_selected_date") ||
    (() => {
      const today = new Date();
      const local = new Date(
        today.getTime() - today.getTimezoneOffset() * 60000
      );
      return local.toISOString().split("T")[0];
    })();

  // Pertahankan tanggal pilihan admin saat reload
  if (user && user.role === "Admin" && dateInput && dateVal) {
    dateInput.value = dateVal;
    sessionStorage.setItem("piket_selected_date", dateVal);
  }

  if (tanggalPresensi) {
    const tanggalObj =
      user && user.role === "Admin" ? new Date(dateVal) : new Date();

    tanggalPresensi.textContent = tanggalObj.toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }

  try {
    let url = `${API_URL}?action=getSiswaHariIni`;

    if (user && user.role === "Admin" && dateVal) {
      url = `${API_URL}?action=getSiswaByTanggal&tanggal=${dateVal}`;
    }

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    
    const data = await response.json();
    window.dataSiswa = Array.isArray(data) ? data : [];

    console.log("Tanggal yang diminta:", dateVal);
    console.log("Jumlah data:", window.dataSiswa.length);

    console.table(
      window.dataSiswa.map(s => ({
        nama: s.nama,
        kelas: s.kelas,
        statusMasuk: JSON.stringify(s.statusMasuk),
        rowIndex: s.rowIndex
      }))
    );

    initFilters(window.dataSiswa);
    applyFilter();

    hideLoading();

  } catch (err) {
    console.error(err);
    showToast("Gagal terhubung ke server Backend API", "error");
    hideLoading();
  }
}


function initFilters(data = null) {
  const isDataReady = Array.isArray(data);

  // Simpan pilihan sebelumnya sebelum dropdown dibuat ulang.
  const kelasContainer = document.getElementById("filterKelas");
  const tingkatContainer = document.getElementById("filterTingkat");
  const statusContainer = document.getElementById("filterStatus");

  const previousKelas =
    kelasContainer?.getAttribute("data-value") || "";

  const previousTingkat =
    tingkatContainer?.getAttribute("data-value") || "";

  const previousStatus =
    statusContainer?.getAttribute("data-value") || "";

  // ==========================================
  // 1. FILTER KELAS
  // ==========================================
  const kelasMap = new Map();

  if (isDataReady) {
    data.forEach(s => {
      if (s.kelas && !kelasMap.has(s.kelas)) {
        kelasMap.set(
          s.kelas,
          formatNamaKelas(s.kelas, s.tingkat)
        );
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

    return {
      jurusan,
      weight,
      sub: sub || ""
    };
  };

  const sortedKeys = [...kelasMap.keys()].sort((a, b) => {
    const pA = parseLabel(kelasMap.get(a));
    const pB = parseLabel(kelasMap.get(b));

    if (pA.jurusan !== pB.jurusan) {
      return pA.jurusan.localeCompare(pB.jurusan);
    }

    if (pA.weight !== pB.weight) {
      return pA.weight - pB.weight;
    }

    return pA.sub.localeCompare(pB.sub);
  });

  const kelasOptions = [
    { value: "", label: "Semua" },
    ...sortedKeys.map(idRombel => ({
      value: idRombel,
      label: kelasMap.get(idRombel)
    }))
  ];

  if (kelasContainer) {
    const selectedKelas = kelasOptions.some(
      option => option.value === previousKelas
    ) ? previousKelas : "";

    createCustomDropdown(
      kelasContainer,
      kelasOptions,
      selectedKelas,
      () => applyFilter()
    );
  }

  // ==========================================
  // 2. FILTER TINGKAT
  // ==========================================
  const uniqueTingkat = isDataReady
    ? [...new Set(
        data.map(s => s.tingkat).filter(Boolean)
      )].sort()
    : [];

  const tingkatOptions = [
    { value: "", label: "Semua" },
    ...uniqueTingkat.map(t => ({
      value: t,
      label: t
    }))
  ];

  if (tingkatContainer) {
    const selectedTingkat = tingkatOptions.some(
      option => option.value === previousTingkat
    ) ? previousTingkat : "";

    createCustomDropdown(
      tingkatContainer,
      tingkatOptions,
      selectedTingkat,
      () => applyFilter()
    );
  }


  // ==========================================
  // 3. FILTER STATUS MASUK DINAMIS
  // ==========================================
  const availableStatuses = new Set();

  if (Array.isArray(data) && data.length > 0) {
    data.forEach(s => {
      const status = String(s.statusMasuk ?? "").trim();

      if (status) {
        availableStatuses.add(status);
      } else {
        availableStatuses.add("Kosong");
      }
    });
  }

  // Urutkan status secara alfabetis, tanpa daftar status hardcoded.
  const sortedStatuses = [...availableStatuses].sort((a, b) =>
    a.localeCompare(b, "id")
  );

  const statusOptions = [
    { value: "", label: "Semua" },
    ...sortedStatuses.map(status => ({
      value: status,
      label: status
    }))
  ];

  if (statusContainer) {
    const selectedStatus = statusOptions.some(
      option => option.value === previousStatus
    ) ? previousStatus : "";

    createCustomDropdown(
      statusContainer,
      statusOptions,
      selectedStatus,
      () => applyFilter()
    );
  }
}


function renderStatusBadge(statusTd, s, value) {
  const matchStatus = masterStatusList.find(m => m.value === value);
  const badgeClass = matchStatus ? matchStatus.class : "badge-default";

  const wrapper = document.createElement("div");
  wrapper.style.cssText = "display: flex; align-items: center; justify-content: center;";

  const badgeBtn = document.createElement("button");
  badgeBtn.className = `status-badge-btn ${badgeClass}`;
  badgeBtn.title = "Klik untuk ubah status";
  
  const BASE_STYLE = `
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: max-content;
    height: 32px;
    white-space: nowrap;
    padding: 6px 14px;
    border-radius: 12px;
    font-size: 12.5px;
    font-weight: 500;
    box-sizing: border-box;
  `;

  badgeBtn.style.cssText = BASE_STYLE + "border: 1px solid rgba(0,0,0,0.1); cursor: pointer; transition: all 0.2s ease;";
  badgeBtn.innerHTML = `
    <span>${value || "-- Belum Diatur --"}</span>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.7;">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
    </svg>
  `;

  badgeBtn.onclick = function(e) {
    e.stopPropagation();
    document.dispatchEvent(new CustomEvent('closeAllStatusDropdowns'));

    statusTd.innerHTML = "";
    const dropdownWrapper = document.createElement("div");
    dropdownWrapper.style.cssText = `
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      vertical-align: middle;
      height: 32px;
      margin: 0;
      padding: 0;
      border: none;
      background: transparent;
    `;

    createCustomDropdown(dropdownWrapper, manualStatusList, value, function(newValue) {
      cleanupListeners();
      if (newValue && newValue !== value) {
        processStatusChange(s.rowIndex, newValue, s.tanggal);
        statusTd.innerHTML = "";
        renderStatusBadge(statusTd, s, newValue);
      } else {
        statusTd.innerHTML = "";
        renderStatusBadge(statusTd, s, value);
      }
    });
    
    statusTd.appendChild(dropdownWrapper);

    const selectedBox = dropdownWrapper.querySelector('.dropdown-selected');
    if (selectedBox) {
      selectedBox.style.cssText = BASE_STYLE + `border: 1px solid #c5d3e8; background-color: #ffffff; cursor: pointer; color: #333;`;
    }

    
    const menuContainer = dropdownWrapper.querySelector(".dropdown-menu");

    if (menuContainer) {
      menuContainer.style.cssText = `
        text-align: center;
        border-radius: 12px;
        min-width: 100%;
        width: max-content;
        left: 50%;
        transform: translateX(-50%);
        box-shadow: 0 4px 14px rgba(0,0,0,0.12);
        border: 1px solid #e2e8f0;
        background: #ffffff;
        padding: 4px 0;
        box-sizing: border-box;
      `;

      menuContainer.querySelectorAll(".dropdown-item").forEach(item => {
        item.style.cssText = `
          background-color: transparent;
          color: #333;
          text-align: center;
          justify-content: center;
          display: flex;
          font-size: 12px;
          padding: 8px 12px;
          white-space: nowrap;
          cursor: pointer;
          transition: background-color 0.15s ease;
        `;

        item.onmouseenter = function() {
          this.style.backgroundColor = "#f1f5f9";
          this.style.color = "#1e293b";
        };

        item.onmouseleave = function() {
          this.style.backgroundColor = "transparent";
          this.style.color = "#333";
        };
      });
    }


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


function updateStatistik(data) {
  let hadir = 0;
  let tidakHadir = 0;
  let prakerin = 0;

  data.forEach(s => {
    const status = String(s.statusMasuk ?? "")
      .trim()
      .toLowerCase();

    // Status kosong atau belum presensi tidak dihitung.
    if (!status || status === "belum presensi") {
      return;
    }

    // Prakerin dihitung terpisah.
    if (status.includes("prakerin") || status.includes("pkl")) {
      prakerin++;
      return;
    }

    // Tidak hadir = Sakit + Izin + Alpa.
    if (["sakit", "izin", "alpa"].includes(status)) {
      tidakHadir++;
      return;
    }

    // Status yang menunjukkan siswa hadir.
    if (
      status.includes("tepat waktu") ||
      status.includes("terlambat") ||
      status.includes("hadir tidak presensi")
    ) {
      hadir++;
    }
  });

  const jumlahDataEl = document.getElementById("jumlahData");
  const jumlahHadirEl = document.getElementById("jumlahHadir");
  const jumlahTidakHadirEl =
    document.getElementById("jumlahTidakHadir");
  const jumlahPrakerinEl =
    document.getElementById("jumlahPrakerin");

  if (jumlahDataEl) jumlahDataEl.textContent = data.length;
  if (jumlahHadirEl) jumlahHadirEl.textContent = hadir;
  if (jumlahTidakHadirEl) {
    jumlahTidakHadirEl.textContent = tidakHadir;
  }
  if (jumlahPrakerinEl) {
    jumlahPrakerinEl.textContent = prakerin;
  }

  const boxPrakerin = document.getElementById("boxJumlahPrakerin");

  if (boxPrakerin) {
    boxPrakerin.style.display = prakerin > 0 ? "" : "none";
  }
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
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Tidak ada data.</td></tr>`;
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
    statusTd.style.textAlign = "center";
    statusTd.style.verticalAlign = "middle";
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

let syncTimer = null;

function processStatusChange(rowIndex, newValue, tanggal) {
  const user = JSON.parse(localStorage.getItem("piket_user"));
  const piketID = user ? user.nama : "Petugas";
  const timestamp = new Date().toISOString();

  const targetSiswa = window.dataSiswa.find(s => Number(s.rowIndex) === Number(rowIndex));
  if (targetSiswa) targetSiswa.statusMasuk = newValue;

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

  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => triggerAutoSync(), 1500); 
}

async function triggerAutoSync() {
  if (!navigator.onLine) {
    showToast("Offline: Perubahan tersimpan di perangkat", "info", 2000);
    return;
  }

  let queue = JSON.parse(localStorage.getItem("piket_pending_updates") || "[]");
  if (queue.length === 0) return;

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
    console.warn("[Auto-Sync Background] Server sibuk/koneksi terputus.");
    updatePendingBadge();
  }
}

window.addEventListener("online", () => {
  showToast("Koneksi terhubung kembali. Menyingkronkan data...", "info");
  triggerAutoSync();
});

window.addEventListener("offline", () => {
  showToast("Koneksi terputus. Mode Offline aktif.", "error");
});

function updatePendingBadge() {
  let queue = JSON.parse(
    localStorage.getItem("piket_pending_updates") || "[]"
  );

  const pendingCount = queue.length;

  const saveBtn = document.querySelector(
    "#absenForm button[type='submit']"
  );

  if (!saveBtn) return;

  // IKON DISKET - STATUS TERSIMPAN
  const iconDisket = `
    <svg xmlns="http://www.w3.org/2000/svg"
         width="16"
         height="16"
         viewBox="0 0 24 24"
         fill="none"
         stroke="currentColor"
         stroke-width="2"
         stroke-linecap="round"
         stroke-linejoin="round"
         aria-hidden="true">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
      <polyline points="17 21 17 13 7 13 7 21"></polyline>
      <polyline points="7 3 7 8 15 8"></polyline>
    </svg>
  `;

  // IKON REFRESH - STATUS SYNC
  const iconSync = `
  <svg
    xmlns="http://www.w3.org/2000/svg"
    class="sync-spinning"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <polyline points="23 4 23 10 17 10"></polyline>
    <polyline points="1 20 1 14 7 14"></polyline>
    <path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10"></path>
    <path d="M20.49 15a9 9 0 0 1-14.13 3.36L1 14"></path>
  </svg>
`;

  // ATUR STATUS TOMBOL
  saveBtn.disabled = pendingCount === 0;

  saveBtn.style.opacity = pendingCount > 0 ? "1" : "0.5";

  saveBtn.style.background = pendingCount > 0
    ? "#dd9787"
    : "#006D77";

  // ATUR POSISI IKON DAN TEKS
  saveBtn.style.display = "inline-flex";
  saveBtn.style.alignItems = "center";
  saveBtn.style.justifyContent = "center";
  saveBtn.style.gap = "8px";

  // PASTIKAN IKON TIDAK MENYUSUT
  saveBtn.style.whiteSpace = "nowrap";

  // TAMPILKAN IKON SESUAI STATUS
  if (pendingCount > 0) {
    saveBtn.innerHTML = `
      ${iconSync}
      <span>Sync (${pendingCount})</span>
    `;
  } else {
    saveBtn.innerHTML = `
      ${iconDisket}
      <span>Tersimpan</span>
    `;
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
    const result = await response.json();

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

let pollingTimer = null;
const POLLING_INTERVAL = 30000;

function startAutoPolling() {
  stopAutoPolling();
  pollingTimer = setInterval(() => {
    let queue = JSON.parse(localStorage.getItem("piket_pending_updates") || "[]");
    if (navigator.onLine && queue.length === 0) silentFetchData();
  }, POLLING_INTERVAL);
}

function stopAutoPolling() {
  if (pollingTimer) clearInterval(pollingTimer);
}

async function silentFetchData() {
  const user = JSON.parse(localStorage.getItem("piket_user"));
  const dateInput = document.getElementById("selectedDate");

  const dateVal =
    dateInput?.value ||
    sessionStorage.getItem("piket_selected_date") ||
    (() => {
      const today = new Date();
      const local = new Date(
        today.getTime() - today.getTimezoneOffset() * 60000
      );
      return local.toISOString().split("T")[0];
    })();

  // Pertahankan tanggal pilihan admin
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

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

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
  if (document.hidden) {
    stopAutoPolling();
  } else {
    silentFetchData();
    startAutoPolling();
  }
});

function setPetugasPiket(nama) {
  const el = document.getElementById('petugasPiket');
  if (el) el.textContent = `👤 ${nama || "-"}`;
}

function setRoleUser(role) {
  const roleLabel = { "Admin": "🟣 Admin Presensi", "Piket": "🟢 Petugas Piket" };
  const el = document.getElementById("roleUser");
  if (el) el.textContent = roleLabel[role] || "⚪ -";
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
  return "status-kosong";
}

function showToast(message, type = "info", duration = 3000) {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

function logout() {
  // Hentikan polling agar tidak ada proses background yang berjalan
  stopAutoPolling();

  // Hapus seluruh data sesi login
  localStorage.removeItem("piket_user");
  localStorage.removeItem("piketID");
  localStorage.removeItem("namaPetugas");
  localStorage.removeItem("role");
  localStorage.removeItem("loginDate");

  // Bersihkan tanggal pilihan admin
  sessionStorage.removeItem("piket_selected_date");

  // Kembali ke halaman login tanpa menyimpan dashboard di history
  window.location.replace("index.html");
}

function closeNotif() { document.getElementById("notifModal")?.classList.remove("active"); }
function closeError() { document.getElementById("errorModal")?.classList.remove("active"); }
function closeConfirm() { document.getElementById("confirmModal")?.classList.remove("active"); }

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

// Variable global untuk menampung URL PDF hasil pembuatan rekap terakhir
let latestPdfUrl = "";

async function cetakRekap() {
  const user = JSON.parse(localStorage.getItem("piket_user"));
  if (!user) {
    showToast("Silakan login terlebih dahulu", "error");
    return;
  }

  const namaPetugas = user.nama || user.username || "Petugas Piket";
  const dateVal = document.getElementById("selectedDate")?.value || new Date().toISOString().split("T")[0];

  // 1. Tentukan tanggal berdasarkan role (Admin pakai tanggal terpilih, selain Admin pakai hari ini)
  const tanggalSelected = (user.role === "Admin") 
    ? dateVal 
    : new Date().toISOString().split("T")[0];

  showLoading("Memeriksa kelengkapan data...");

  try {
    // 2. Cek status kosong terlebih dahulu
    const urlCek = `${API_URL}?action=cekStatusKosongHariIni&tanggal=${tanggalSelected}`;
    const resCek = await fetch(urlCek);
    const dataCek = await resCek.json();

    if (!dataCek.success) {
      throw new Error(dataCek.message || "Gagal memeriksa data presensi.");
    }

    // Jika masih ada baris status masuk yang belum terisi (> 0)
    if (dataCek.result > 0) {
      hideLoading();
      showToast(`Masih ada ${dataCek.result} data status masuk yang belum diisi!`, "error");
      return;
    }

    // 3. Proses pembuatan PDF jika data sudah lengkap
    showLoading("Membuat berkas PDF rekap...");
    const urlRekap = `${API_URL}?action=buatRekapPresensiHarian&namaPetugas=${encodeURIComponent(namaPetugas)}&tanggal=${tanggalSelected}`;
    const resRekap = await fetch(urlRekap);
    const dataRekap = await resRekap.json();

    if (!dataRekap.success) {
      throw new Error(dataRekap.message || "Gagal membuat rekap PDF.");
    }

    hideLoading();
    showToast("Berhasil membuat rekap PDF!", "success");

    // 4. AMBIL URL PDF (Mendukung format String maupun Object JSON)
    let pdfUrl = "";
    if (typeof dataRekap.result === "object" && dataRekap.result !== null) {
      pdfUrl = dataRekap.result.url || dataRekap.result.pdfUrl || dataRekap.result.downloadUrl || "";
    } else if (typeof dataRekap.result === "string") {
      pdfUrl = dataRekap.result;
    }

    if (!pdfUrl) {
      throw new Error("Link PDF tidak ditemukan dari server.");
    }

    // SIMPAN KE VARIABEL GLOBAL AGAR BISA DIPAKAI OLEH kirimRekapGrupWA
    latestPdfUrl = pdfUrl;

    // 5. HUBUNGKAN KE NOTIF MODAL HTML
    const pdfLinkEl = document.getElementById("pdfLink");
    const notifModalEl = document.getElementById("notifModal");

    if (pdfLinkEl) {
      pdfLinkEl.href = pdfUrl; // Pasang URL PDF ke elemen <a>
    }

    if (notifModalEl) {
      notifModalEl.classList.add("active"); // Tampilkan modal notifikasi
    } else {
      // Fallback jika modal tidak ditemukan, buka di tab baru
      window.open(pdfUrl, "_blank");
    }

  } catch (err) {
    console.error(err);
    showToast(`Gagal: ${err.message}`, "error");
    hideLoading();
  }
}

/**
 * FUNGSI UNTUK MENGIRIM REKAP KE GRUP WA PIKET
 * Dipanggil oleh tombol "Kirim Rekap ke Grup WA" di Modal / Dashboard
 */
async function kirimRekapGrupWA() {
  const user = JSON.parse(localStorage.getItem("piket_user"));
  if (!user) {
    showToast("Silakan login terlebih dahulu", "error");
    return;
  }

  const namaPetugas = user.nama || user.username || "Petugas Piket";
  const dateVal = document.getElementById("selectedDate")?.value || new Date().toISOString().split("T")[0];
  const tanggalSelected = (user.role === "Admin") ? dateVal : new Date().toISOString().split("T")[0];

  const pdfUrl = latestPdfUrl || "";

  showLoading("Sedang mengirim rekap presensi ke Grup WhatsApp...");

  try {
    const targetUrl = `${API_URL}?action=kirimRekapGrupWA&namaPetugas=${encodeURIComponent(namaPetugas)}&tanggal=${encodeURIComponent(tanggalSelected)}&pdfUrl=${encodeURIComponent(pdfUrl)}`;

    const response = await fetch(targetUrl);
    const result = await response.json();

    hideLoading();

    if (result.success) {
      showToast(result.message || "Rekap berhasil dikirim ke Grup WA!", "success");
    } else {
      showToast("Gagal mengirim WA: " + (result.message || "Terjadi kesalahan server."), "error");
    }
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
      <svg viewBox="0 0 24 24" width="13" height="13"
        stroke="currentColor" stroke-width="2" fill="none">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </div>
    <div class="dropdown-menu"></div>
  `;

  const textSpan = containerElement.querySelector(".dropdown-text");
  const menu = containerElement.querySelector(".dropdown-menu");
  const selectedBox = containerElement.querySelector(".dropdown-selected");

  const currentObj =
    optionsArray.find(opt => opt.value === selectedValue) || optionsArray[0];

  textSpan.innerText = currentObj.label;
  containerElement.setAttribute("data-value", currentObj.value);

  optionsArray.forEach(item => {
    const div = document.createElement("div");
    div.className = `dropdown-item ${item.class || ""}`;
    div.setAttribute("data-value", item.value);
    div.innerText = item.label;
    menu.appendChild(div);
  });

  selectedBox.onclick = function(e) {
    e.stopPropagation();

    if (containerElement.classList.contains("open")) {
      closeCustomDropdown(containerElement);
      return;
    }

    openCustomDropdown(containerElement);
  };

  menu.onclick = function(e) {
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
    if (el !== dropdown) {
      closeCustomDropdown(el);
    }
  });

  dropdown.classList.remove("drop-up");
  dropdown.classList.add("open");

  menu.style.setProperty("top", "calc(100% + 4px)", "important");
  menu.style.setProperty("bottom", "auto", "important");
  menu.style.setProperty("max-height", "250px", "important");
  menu.style.setProperty("overflow-y", "auto", "important");

  const rect = dropdown.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const spaceBelow = Math.max(0, viewportHeight - rect.bottom - 8);
  const spaceAbove = Math.max(0, rect.top - 8);
  const menuHeight = Math.min(menu.scrollHeight, 250);

  const openUp = spaceBelow < menuHeight && spaceAbove > spaceBelow;

  if (openUp) {
    dropdown.classList.add("drop-up");

    menu.style.setProperty("top", "auto", "important");
    menu.style.setProperty("bottom", "calc(100% + 4px)", "important");
  }

  const availableSpace = openUp ? spaceAbove : spaceBelow;

  if (availableSpace < menuHeight) {
    menu.style.setProperty(
      "max-height",
      Math.max(80, availableSpace) + "px",
      "important"
    );
  }
}

document.addEventListener("click", function(e) {
  if (e.target.closest(".custom-dropdown")) return;

  document.querySelectorAll(".custom-dropdown.open").forEach(function(el) {
    closeCustomDropdown(el);
  });
});

// Ganti seluruh event listener click custom-dropdown dengan ini:
document.addEventListener('click', function (e) {
  const dropdownToggle = e.target.closest('.custom-dropdown');

  // Jika klik terjadi DI LUAR custom-dropdown, tutup semua dropdown
  if (!dropdownToggle) {
    document.querySelectorAll('.custom-dropdown').forEach(el => {
      el.classList.remove('open', 'drop-up');
      const m = el.querySelector('.dropdown-menu');
      if (m) m.style.cssText = '';
    });
    return;
  }

  const menu = dropdownToggle.querySelector('.dropdown-menu');
  const isAlreadyOpen = dropdownToggle.classList.contains('open');

  // 1. Tutup semua dropdown lain terlebih dahulu
  document.querySelectorAll('.custom-dropdown').forEach(el => {
    if (el !== dropdownToggle) {
      el.classList.remove('open', 'drop-up');
      const m = el.querySelector('.dropdown-menu');
      if (m) m.style.cssText = '';
    }
  });

  // 2. Jika tadinya tertutup, sekarang kita buka dan hitung posisinya secara akurat
  if (!isAlreadyOpen) {
    // Ambil koordinat tombol presisi terhadap Layar (Viewport)
    const rect = dropdownToggle.getBoundingClientRect();
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    
    // Hitung jarak dari bawah tombol ke paling bawah layar
    const spaceBelow = windowHeight - rect.bottom;
    const menuHeight = 240; // Tinggi estimasi menu dropdown

    console.log("🔍 [DEBUG Dropdown] Jarak ke bawah layar:", spaceBelow, "px");

    // JIKA sisa ruang layar ke bawah < 240px, PAKSA DROP-UP!
    if (spaceBelow < menuHeight) {
      console.log("⬆️ [DEBUG Dropdown] Ruang sempit! Paksa Buka KE ATAS (Drop-Up)");
      dropdownToggle.classList.add('drop-up');
      
      if (menu) {
        menu.style.setProperty('top', 'auto', 'important');
        menu.style.setProperty('bottom', '100%', 'important');
        menu.style.setProperty('margin-bottom', '6px', 'important');
        menu.style.setProperty('box-shadow', '0 -8px 20px rgba(0, 0, 0, 0.18)', 'important');
      }
    } else {
      console.log("⬇️ [DEBUG Dropdown] Ruang cukup! Buka KE BAWAH");
      dropdownToggle.classList.remove('drop-up');
      
      if (menu) {
        menu.style.setProperty('top', '100%', 'important');
        menu.style.setProperty('bottom', 'auto', 'important');
        menu.style.setProperty('margin-top', '4px', 'important');
        menu.style.setProperty('box-shadow', '0 6px 16px rgba(0, 0, 0, 0.08)', 'important');
      }
    }

    dropdownToggle.classList.add('open');
  } else {
    // Jika diklik lagi saat terbuka, tutup
    dropdownToggle.classList.remove('open', 'drop-up');
    if (menu) menu.style.cssText = '';
  }

  // Hentikan propagasi agar tidak langsung tertutup oleh event listener lain
  e.stopPropagation();
});

document.addEventListener('DOMContentLoaded', initFormPiket);