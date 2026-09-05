// ⚠️ MASUKKAN URL DEPLOYMENT APPS SCRIPT LENGKAP KAMU DI SINI
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

function showLoading(text = "Memproses...") {
  const el = document.getElementById("loadingOverlay");
  const label = document.getElementById("loadingText");
  if (label) label.textContent = text;
  el.classList.add("active");
}

function hideLoading() {
  document.getElementById("loadingOverlay").classList.remove("active");
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
  populateFilterStatus(data); // 💡 Populate status secara dinamis
  
  document.getElementById("filterKelas").value = lastFilter.kelas || "";
  document.getElementById("filterTingkat").value = lastFilter.tingkat || "";
  document.getElementById("filterStatus").value = lastFilter.status || "";
  
  applyFilter();
  hideLoading();
}

/**
 * POPULATE DROPDOWN KELAS DINAMIS
 */
function populateFilterKelas(data) {
  const kelasSet = new Set(data.map(s => s.kelas).filter(Boolean));
  const filterKelas = document.getElementById("filterKelas");
  filterKelas.innerHTML = `<option value="">Semua</option>`;
  [...kelasSet].sort().forEach(kelas => {
    const opt = document.createElement("option");
    opt.value = kelas;
    opt.textContent = kelas;
    filterKelas.appendChild(opt);
  });
}

/**
 * 💡 POPULATE DROPDOWN STATUS MASUK DINAMIS
 */
function populateFilterStatus(data) {
  const filterStatus = document.getElementById("filterStatus");
  const currentVal = filterStatus.value;
  
  // Ambil semua status unique yang ada di data
  const statusSet = new Set(data.map(s => s.statusMasuk).filter(Boolean));
  
  // Urutan standar sebagai acuan jika ada di data
  const defaultOrder = [
    "Tepat Waktu", "Terlambat", "Sangat Terlambat", 
    "Sangat Terlambat Sekali", "Sakit", "Izin", 
    "Alpa", "Hadir Tidak Presensi", "Libur"
  ];

  // Gabungkan status dari data dengan urutan standar
  const sortedStatus = [...statusSet].sort((a, b) => {
    let idxA = defaultOrder.indexOf(a);
    let idxB = defaultOrder.indexOf(b);
    if (idxA === -1) idxA = 99;
    if (idxB === -1) idxB = 99;
    return idxA - idxB;
  });

  filterStatus.innerHTML = `
    <option value="">Semua</option>
    <option value="Kosong">Kosong</option>
  `;

  sortedStatus.forEach(st => {
    const opt = document.createElement("option");
    opt.value = st;
    opt.textContent = st;
    filterStatus.appendChild(opt);
  });

  filterStatus.value = currentVal;
}

/**
 * 💡 DROPDOWN EDIT STATUS DALAM TABEL (DINAMIS & LENGKAP)
 */
function getDropdownHTML(index, selected, rowIndex) {
  // Opsi pilihan status saat petugas/admin mengubah status siswa
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

function populateFilterKelas(data) {
  const kelasSet = new Set(data.map(s => s.kelas).filter(Boolean));
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
    const kelasTd = document.createElement("td"); kelasTd.textContent = s.kelas || "-";
    const tingkatTd = document.createElement("td"); tingkatTd.textContent = s.tingkat || "-";
    const jamMasukTd = document.createElement("td"); jamMasukTd.textContent = s.jamMasuk || "-";
    const jamPulangTd = document.createElement("td"); jamPulangTd.textContent = s.jamPulang || "-";

    const statusTd = document.createElement("td");
    const index = startIndex + idx;
    statusTd.id = `status-${index}`;
    const value = s.statusMasuk || "";

    statusTd.dataset.rowIndex = s.rowIndex;
    statusTd.dataset.statusMasuk = value;

    if (value) {
      statusTd.innerHTML = `
        <span id="statusText-${index}" class="status ${getStatusClass(value)}">
          ${value || "Belum diisi"}
        </span>
        <button type="button" class="button-small" onclick="editStatus(${index}, '${value}', ${s.rowIndex})" title="Edit Status">${SVG_PENCIL}</button>
      `;
    } else {
      statusTd.classList.add("status-kosong-cell");
      statusTd.innerHTML = getDropdownHTML(index, "", s.rowIndex);

      const select = statusTd.querySelector("select[name=statusMasuk]");
      select.addEventListener("change", () => {
        statusTd.classList.remove("status-kosong-cell");
        const newValue = select.value;
        statusTd.innerHTML = `
          <span id="statusText-${index}" class="status ${getStatusClass(newValue)}">
            ${newValue || "-- Pilih Status --"}
          </span>
          <button type="button" class="button-small" onclick="editStatus(${index}, '${newValue}', ${s.rowIndex})" title="Edit Status">${SVG_PENCIL}</button>
        `;
        statusTd.dataset.statusMasuk = newValue;
        processStatusChange(s.rowIndex, newValue);
      });
    }

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

function editStatus(index, originalValue, rowIndex) {
  const td = document.getElementById(`status-${index}`);
  td.dataset.rowIndex = rowIndex;
  td.innerHTML = `
    ${getDropdownHTML(index, originalValue, rowIndex)}
    <button type="button" class="button-small" onclick="cancelEdit(${index}, '${originalValue}', ${rowIndex})" title="Batal">${SVG_CLOSE}</button>
  `;

  const select = td.querySelector("select[name=statusMasuk]");
  select.addEventListener("change", () => {
    const newValue = select.value;
    td.innerHTML = `
      <span id="statusText-${index}" class="status ${getStatusClass(newValue)}">
        ${newValue || "-- Pilih Status --"}
      </span>
      <button type="button" class="button-small" onclick="editStatus(${index}, '${newValue}', ${rowIndex})" title="Edit Status">${SVG_PENCIL}</button>
    `;
    td.dataset.statusMasuk = newValue;
    processStatusChange(rowIndex, newValue);
  });
}

function cancelEdit(index, originalValue, rowIndex) {
  const td = document.getElementById(`status-${index}`);
  td.innerHTML = `
    <span id="statusText-${index}" class="status ${getStatusClass(originalValue)}">
      ${originalValue || "-- Pilih Status --"}
    </span>
    <button type="button" class="button-small" onclick="editStatus(${index}, '${originalValue}', ${rowIndex})" title="Edit Status">${SVG_PENCIL}</button>
  `;
}

function getDropdownHTML(index, selected, rowIndex) {
  const opsi = ["", "Sakit", "Izin", "Alpa", "Libur"];
  return `
    <select name="statusMasuk" id="statusSelect-${index}">
      ${opsi.map(o => `<option value="${o}" ${o === selected ? "selected" : ""}>${o || "-- Pilih Status --"}</option>`).join('')}
    </select>
    <input type="hidden" name="rowIndex" value="${rowIndex}">
  `;
}

function processStatusChange(rowIndex, newValue) {
  const user = JSON.parse(localStorage.getItem("piket_user"));
  const piketID = user ? user.nama : "Petugas";
  const timestamp = new Date().toISOString();

  const targetSiswa = dataSiswa.find(s => Number(s.rowIndex) === Number(rowIndex));
  if (targetSiswa) targetSiswa.statusMasuk = newValue;

  let queue = JSON.parse(localStorage.getItem("piket_pending_updates") || "[]");
  const existingIdx = queue.findIndex(item => Number(item.rowIndex) === Number(rowIndex));

  if (existingIdx > -1) {
    queue[existingIdx].statusMasuk = newValue;
    queue[existingIdx].timestamp = timestamp;
    queue[existingIdx].sent = false;
  } else {
    queue.push({ rowIndex: parseInt(rowIndex, 10), statusMasuk: newValue, piketID: piketID, timestamp: timestamp, sent: false });
  }

  localStorage.setItem("piket_pending_updates", JSON.stringify(queue));
  updatePendingBadge();
}

function updatePendingBadge() {
  let queue = JSON.parse(localStorage.getItem("piket_pending_updates") || "[]");
  let pendingCount = queue.filter(item => item.sent === false).length;
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
  let pendingItems = queue.filter(item => item.sent === false);

  if (pendingItems.length === 0) {
    showToast("Tidak ada perubahan data yang perlu disinkronkan.", "info");
    return;
  }

  showLoading(`Menyinkronkan ${pendingItems.length} data ke server...`);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "simpanStatusMasuk", payload: pendingItems })
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

function setPetugasPiket(nama) {
  document.getElementById('petugasPiket').textContent = `👤 ${nama || "-"}`;
}

function setRoleUser(role) {
  const roleLabel = { "Admin": "🟣 Admin Presensi", "Piket": "🟢 Petugas Piket" };
  document.getElementById("roleUser").textContent = roleLabel[role] || "⚪ -";
}

function getStatusClass(status) {
  if (!status) return "status-kosong";
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
  return "";
}

function showToast(message, type = "info", duration = 3000) {
  const container = document.getElementById("toastContainer");
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

// HANDLER NATIVE UNTUK TOMBOL BARU
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

/**
 * Konversi Dinamis gabungan id_rombel & tingkat
 * Contoh: idRombel="AKN-A26", tingkat="X" -> Output: "AKN X-A"
 */
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

// 💡 Update pada Rendering Baris Tabel
// Di dalam loop applyFilter():
const kelasTd = document.createElement("td"); 
kelasTd.textContent = formatNamaKelas(s.kelas, s.tingkat);

// 💡 Update pada Populating Dropdown Filter Kelas
function populateFilterKelas(data) {
  const filterKelas = document.getElementById("filterKelas");
  filterKelas.innerHTML = `<option value="">Semua</option>`;
  
  const kelasMap = new Map();
  data.forEach(s => {
    if (s.kelas && !kelasMap.has(s.kelas)) {
      kelasMap.set(s.kelas, formatNamaKelas(s.kelas, s.tingkat));
    }
  });

  [...kelasMap.keys()].sort().forEach(idRombel => {
    const opt = document.createElement("option");
    opt.value = idRombel; 
    opt.textContent = kelasMap.get(idRombel); 
    filterKelas.appendChild(opt);
  });
}