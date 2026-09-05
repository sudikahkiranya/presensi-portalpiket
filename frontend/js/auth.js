const API_URL = "https://script.google.com/macros/s/AKfycbxR0bwVJCXQY5DQKawqOBQO6vNwU8UMFLJ3AuBytSRgQR3TW9rJZ0r58JGkL2u_HxYMhw/exec";

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

// 🟢 Pengecekan Sesi Login Otomatis saat Halaman Di-load
window.addEventListener("DOMContentLoaded", function () {
  const savedID = localStorage.getItem("piketID");
  const savedNama = localStorage.getItem("namaPetugas");
  const savedDate = localStorage.getItem("loginDate");
  const today = new Date().toLocaleDateString("id-ID");

  // Jika beda hari, bersihkan sesi lama
  if (savedDate && savedDate !== today) {
    localStorage.clear();
    return;
  }

  // Jika sesi masih valid dan data lengkap, langsung lempar ke Dashboard
  if (savedID && savedNama && savedDate === today) {
    window.location.href = "dashboard.html";
  }
});

async function login() {
  const id = document.getElementById("idPiket").value.trim();
  const kode = document.getElementById("kodeAkses").value.trim();
  const errorMsg = document.getElementById("errorMsg");

  errorMsg.style.display = "none";
  errorMsg.textContent = "";

  if (!id || !kode) {
    errorMsg.textContent = "Username dan Password isi terlebih dahulu.";
    errorMsg.style.display = "block";
    return;
  }

  showLoading("Login...");

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "login",
        idInput: id,
        kodeInput: kode
      })
    });

    const result = await response.json();

    if (result.success) {
      const today = new Date().toLocaleDateString("id-ID");

      // 1. Simpan Data Individual (Untuk Dashboard v4.0)
      localStorage.setItem("piketID", id);
      localStorage.setItem("namaPetugas", result.nama);
      localStorage.setItem("role", result.role || "Piket");
      localStorage.setItem("loginDate", today);

      // 2. Simpan Format Objek (Untuk Kompatibilitas Ekstra)
      localStorage.setItem("piket_user", JSON.stringify({
        piketID: id,
        nama: result.nama,
        role: result.role || "Piket",
        loginDate: today
      }));

      // Pindah ke dashboard
      window.location.href = "dashboard.html";
    } else {
      hideLoading();
      errorMsg.textContent = result.message || "Username/Password salah atau tidak diizinkan.";
      errorMsg.style.display = "block";
    }
  } catch (err) {
    console.error("Login error:", err);
    hideLoading();
    errorMsg.textContent = "Gagal terhubung ke server.";
    errorMsg.style.display = "block";
  }
}