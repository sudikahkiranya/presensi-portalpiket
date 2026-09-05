// ⚠️ MASUKKAN URL DEPLOYMENT APPS SCRIPT TERBARU KAMU DI SINI
const API_URL = "https://script.google.com/macros/s/AKfycbxR0bwVJCXQY5DQKawqOBQO6vNwU8UMFLJ3AuBytSRgQR3TW9rJZ0r58JGkL2u_HxYMhw/exec"; 

let allData = [];
let currentUser = null;

document.addEventListener("DOMContentLoaded", () => {
  currentUser = JSON.parse(localStorage.getItem("piket_user"));
  if (!currentUser) {
    window.location.href = "index.html";
    return;
  }
  document.getElementById("userName").innerText = `👤 ${currentUser.nama} (${currentUser.role})`;
  
  // Load data presensi hari ini
  loadPresensiHariIni();
});

function logout() {
  localStorage.removeItem("piket_user");
  window.location.href = "index.html";
}

/**
 * MENGAMBIL DATA PRESENSI HARI INI VIA doGet (?action=getSiswaHariIni)
 */
async function loadPresensiHariIni() {
  const tbody = document.getElementById("tableBody");
  tbody.innerHTML = `<tr><td colspan="6" class="text-center">Memuat data presensi...</td></tr>`;

  try {
    const response = await fetch(`${API_URL}?action=getSiswaHariIni`);
    const result = await response.json();

    // Backend mengembalikan array siswa langsung
    if (Array.isArray(result)) {
      allData = result;
      populateKelasDropdown(allData);
      applyFilters();
    } else {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center">Gagal memuat data presensi.</td></tr>`;
    }
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="6" class="text-center">Error koneksi ke Backend API.</td></tr>`;
  }
}

/**
 * POPULATE DROPDOWN KELAS
 */
function populateKelasDropdown(data) {
  const selectKelas = document.getElementById("filterKelas");
  const kelasSet = new Set(data.map(item => item.kelas).filter(Boolean));
  
  selectKelas.innerHTML = `<option value="">Semua Kelas</option>`;
  kelasSet.forEach(kelas => {
    selectKelas.innerHTML += `<option value="${kelas}">${kelas}</option>`;
  });
}

/**
 * FILTERING DATA LOKAL (KELAS, TINGKAT, STATUS, NAMA)
 */
function applyFilters() {
  const kelas = document.getElementById("filterKelas").value;
  const tingkat = document.getElementById("filterTingkat").value;
  const status = document.getElementById("filterStatus").value;
  const query = document.getElementById("searchNama").value.toLowerCase();

  const filtered = allData.filter(item => {
    const matchKelas = !kelas || item.kelas === kelas;
    const matchTingkat = tingkat === "Semua" || item.tingkat === tingkat;
    const matchStatus = status === "Semua" || item.statusMasuk === status;
    const matchNama = !query || String(item.nama).toLowerCase().includes(query);

    return matchKelas && matchTingkat && matchStatus && matchNama;
  });

  renderTable(filtered);
}

/**
 * RENDER TABEL & INTEGRASI SIMPAN STATUS
 */
function renderTable(data) {
  const tbody = document.getElementById("tableBody");
  document.getElementById("totalCount").innerText = data.length;

  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center">Tidak ada data siswa ditemukan.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(item => `
    <tr>
      <td><strong>${item.nama || '-'}</strong></td>
      <td>${item.kelas || '-'}</td>
      <td>${item.tingkat || '-'}</td>
      <td>${item.jamMasuk || '-'}</td>
      <td>
        <select onchange="updateStatusSiswa(${item.rowIndex}, this.value)" class="status-select">
          <option value="" ${!item.statusMasuk ? 'selected' : ''}>- Belum -</option>
          <option value="Hadir" ${item.statusMasuk === 'Hadir' ? 'selected' : ''}>Hadir</option>
          <option value="Sakit" ${item.statusMasuk === 'Sakit' ? 'selected' : ''}>Sakit</option>
          <option value="Izin" ${item.statusMasuk === 'Izin' ? 'selected' : ''}>Izin</option>
          <option value="Alpa" ${item.statusMasuk === 'Alpa' ? 'selected' : ''}>Alpa</option>
        </select>
      </td>
      <td>${item.jamPulang || '-'}</td>
    </tr>
  `).join('');
}

/**
 * MENYIMPAN STATUS MASUK SIKAS VIA doPost ({ action: "simpanStatusMasuk" })
 */
async function updateStatusSiswa(rowIndex, newStatus) {
  const payloadData = {
    action: "simpanStatusMasuk",
    payload: [
      {
        rowIndex: rowIndex,
        statusMasuk: newStatus,
        piketID: currentUser ? currentUser.nama : "Petugas Piket"
      }
    ]
  };

  try {
    // Karena GAS butuh no-cors / text plain JSON payload
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payloadData)
    });
    
    const resText = await response.text();
    const result = JSON.parse(resText);

    if (result.success) {
      // Update data di local array agar sync
      const target = allData.find(d => d.rowIndex === rowIndex);
      if (target) target.statusMasuk = newStatus;
    } else {
      alert("Gagal menyimpan status: " + (result.message || "Unknown error"));
    }
  } catch (err) {
    console.error("Error saving status:", err);
    alert("Gagal terhubung ke server saat menyimpan status.");
  }
}