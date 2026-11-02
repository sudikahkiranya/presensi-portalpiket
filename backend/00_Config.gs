/**
 * ============================================================================
 * 00_CONFIG.GS — KONFIGURASI GLOBAL & HELPER DASAR SISTEM PRESENSI
 * ============================================================================
 */

// 1. ZONA WAKTU RESMI
const TZ = "Asia/Jakarta";

// 2. MASTER DAFTAR NAMA SHEET (SNAKE_CASE STANDARD)
const SHEETS = Object.freeze({
  // Master Data Siswa
  MASTER_AKTIF: "master_siswa_aktif",
  MASTER_NONAKTIF: "master_siswa_nonaktif",
  MASTER_TEMPORER: "master_siswa_temporer",
  
  // Transaksi Presensi Harian
  MASTER_PRESENSI: "master_presensi",
  
  // Konfigurasi & Kalender
  CONFIG_SEMESTER: "config_semester",
  CONFIG_SISTEM: "config_sistem",
  CONFIG_JADWAL: "config_waktu_presensi",
  CONFIG_JADWAL_KHUSUS: "config_jadwal_khusus",
  KALDIK: "kaldik",
  STATUS_PREFILL: "status_prefill",
  LOG_PREFILL: "log_prefill",

  // Portal Piket & Notifikasi
  USER_PIKET: "user_piket",
  WALI_KELAS: "wali_kelas",
  LAPORAN_PRESENSI: "laporan_presensi"
});

/**
 * Membaca sheet 'config_sistem' (Key-Value) dengan CacheService (10 menit).
 * @return {object} Key-Value konfigurasi sistem
 */
function getSystemConfig() {
  try {
    const cache = CacheService.getScriptCache();
    const cachedConfig = cache.get("SYSTEM_CONFIG_CACHE");

    if (cachedConfig) {
      return JSON.parse(cachedConfig);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.CONFIG_SISTEM);
    if (!sheet) return {};

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return {};

    const data = sheet.getRange("A2:B" + lastRow).getValues();
    const config = {};

    data.forEach(row => {
      const key = String(row[0] || "").trim();
      const val = String(row[1] || "").trim();
      if (key) config[key] = val;
    });

    // Auto extract Drive File ID jika ada logo sekolah
    if (config.logo_sekolah_url) {
      const urlStr = config.logo_sekolah_url;
      let fileId = "";
      if (urlStr.includes("/d/")) {
        fileId = urlStr.split("/d/")[1].split("/")[0];
      } else if (urlStr.includes("id=")) {
        fileId = urlStr.split("id=")[1].split("&")[0];
      } else if (!urlStr.startsWith("http")) {
        fileId = urlStr;
      }
      config.logo_sekolah_id = fileId;
    }

    cache.put("SYSTEM_CONFIG_CACHE", JSON.stringify(config), 600);
    return config;

  } catch (err) {
    Logger.log("⚠️ Error getSystemConfig: " + err.message);
    return {};
  }
}

function clearSystemConfigCache() {
  CacheService.getScriptCache().remove("SYSTEM_CONFIG_CACHE");
  Logger.log("🧹 Cache config_sistem berhasil dibersihkan!");
}

/**
 * HELPER ROBUST: Mengubah Date object / DD/MM/YYYY / YYYY-MM-DD ke Date object yang valid
 */
function parseToDate(val) {
  if (!val && val !== 0) return null;
  if (Object.prototype.toString.call(val) === '[object Date]') {
    return isNaN(val.getTime()) ? null : val;
  }

  const s = String(val).trim();
  if (!s) return null;

  // Format DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) {
    const p = s.split("/");
    const d = parseInt(p[0], 10);
    const m = parseInt(p[1], 10) - 1;
    const y = parseInt(p[2], 10);
    if (!isNaN(d + m + y)) return new Date(y, m, d);
  }

  // Format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const p = s.split("-");
    const y = parseInt(p[0], 10);
    const m = parseInt(p[1], 10) - 1;
    const d = parseInt(p[2], 10);
    if (!isNaN(d + m + y)) return new Date(y, m, d);
  }

  const dObj = new Date(s);
  return isNaN(dObj.getTime()) ? null : dObj;
}

/**
 * Helper format tanggal Indonesia (contoh: Senin, 21 September 2026)
 */
function formatTanggalIndonesia(date) {
  const d = (date instanceof Date && !isNaN(date.getTime())) ? date : parseToDate(date) || new Date();
  const hari = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const bulan = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  return hari[d.getDay()] + ", " + d.getDate() + " " + bulan[d.getMonth()] + " " + d.getFullYear();
}

/**
 * Helper format ID Rombel (misal: "AKN-A26", "X") -> "AKN X-A"
 */
function formatNamaKelas(idRombel, tingkatOptional) {
  if (!idRombel || typeof idRombel !== "string") return "-";
  const parts = idRombel.trim().split("-");
  if (parts.length < 2) return idRombel;

  const jurusan = parts[0].toUpperCase();
  const subPart = parts[1].toUpperCase();
  const subKelas = subPart.replace(/[0-9]/g, "").trim();
  const angkatanCode = subPart.replace(/[^0-9]/g, "").trim();

  let tingkat = tingkatOptional;
  if (!tingkat && angkatanCode) {
    const angkatanNum = parseInt(angkatanCode, 10);
    if (angkatanNum === 26) tingkat = "X";
    else if (angkatanNum === 25) tingkat = "XI";
    else if (angkatanNum === 24) tingkat = "XII";
  }

  if (jurusan && tingkat && subKelas) {
    return `${jurusan} ${tingkat.toUpperCase()}-${subKelas}`;
  }
  return idRombel;
}
