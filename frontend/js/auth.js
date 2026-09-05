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

window.onload = function () {
  const savedID = localStorage.getItem("piketID");
  const savedNama = localStorage.getItem("namaPetugas");
  const savedDate = localStorage.getItem("loginDate");
  const today = new Date().toLocaleDateString("id-ID");

  if (savedDate !== today) {
    localStorage.clear();
    return;
  }

  if (savedID && savedNama) {
    window.location.href = "dashboard.html";
  }
};

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
      body: JSON.stringify({
        action: "login",
        idInput: id,
        kodeInput: kode
      })
    });

    const result = await response.json();

    if (result.success) {
      localStorage.setItem("piketID", id);
      localStorage.setItem("namaPetugas", result.nama);
      localStorage.setItem("loginDate", new Date().toLocaleDateString("id-ID"));
      localStorage.setItem("role", result.role);

      window.location.href = "dashboard.html";
    } else {
      hideLoading();
      errorMsg.textContent = "Username/Password salah atau tidak diizinkan.";
      errorMsg.style.display = "block";
    }
  } catch (err) {
    hideLoading();
    errorMsg.textContent = "Gagal terhubung ke server.";
    errorMsg.style.display = "block";
  }
}