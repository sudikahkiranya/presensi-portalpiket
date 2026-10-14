/**
 * BACKEND API HANDLER (Main Entry Point for Vercel/External Fetch)
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    let responseData = {};

    switch (action) {
      case "login":
        responseData = verifikasiLoginPiket(data.idInput, data.kodeInput);
        break;
      case "simpanStatusMasuk":
        responseData = simpanStatusMasuk(data.payload);
        break;
      case "buatBufferWaliKelas":
        responseData = buatBufferKonfirmasiWaliKelas(data.namaPetugas);
        break;
      case "prosesKirimWaliKelas":
        responseData = prosesKirimWaliKelas();
        break;
      case "kirimRekapGrupPiketDirect":
        responseData = kirimRekapGrupPiketDirect(data.tanggal, data.namaPetugas, data.pdfUrl);
        break;
      case "cetakRekapPdf":
        responseData = cetakRekapPdfDirect(data.tanggal, data.namaPetugas);
        break;
      default:  
        responseData = { success: false, message: "Action POST tidak dikenali." };
    }

    return ContentService
      .createTextOutput(JSON.stringify(responseData))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    const action = e.parameter ? e.parameter.action : "";
    let responseData = {};

    switch (action) {
      case "getSiswaHariIni":
        responseData = getSiswaHariIni();
        break;

      case "getSiswaByTanggal":
        responseData = getSiswaByTanggal(e.parameter.tanggal);
        break;

      case "cekStatusKosongHariIni":
        responseData = { 
          success: true, 
          result: cekStatusKosongHariIni(e.parameter.tanggal) 
        };
        break;

      case "buatRekapPresensiHarian":
        try {
          // 1. Panggil pembuat rekap (berjalan di background jika async)
          var pdfUrlResult = buatRekapPresensiHarian(e.parameter.namaPetugas, e.parameter.tanggal);
          
          // 2. Jika return-nya Promise (Async), langsung flush & tangkap link dari Sheet
          if (pdfUrlResult && typeof pdfUrlResult.then === 'function') {
            pdfUrlResult.catch(function(err) {
              Logger.log("❌ Error Background PDF: " + err);
            });

            // Beri dorongan sekali agar tugas langsung terdaftar di V8 Engine
            SpreadsheetApp.flush();

            // Ambil URL file PDF terbaru dari log sheet
            var latestUrl = getLatestRekapUrl();
            if (latestUrl) {
              responseData = { success: true, result: latestUrl };
            } else {
              // Fallback jika belum sempat tercatat dalam hitungan milidetik
              responseData = { 
                success: true, 
                result: "https://drive.google.com/drive/folders/16TQT8GmnrYzmqam-UK59G4q6rfx6Lkoa" 
              };
            }
          } else {
            responseData = { success: true, result: pdfUrlResult };
          }
        } catch (err) {
          responseData = { success: false, message: err.message || err.toString() };
        }
        break;

      case "kirimRekapGrupWA":
        try {
          const petugasWA = e.parameter.namaPetugas || "Petugas Piket";
          const tglWA = e.parameter.tanggal || "";
          const pdfWA = e.parameter.pdfUrl || "";
          
          responseData = kirimRekapPresensiWA(tglWA, petugasWA, pdfWA);
        } catch (err) {
          responseData = { success: false, message: err.message || err.toString() };
        }
        break;

      case "tarikDataEngine":
        responseData = pemicuTarikDataPool();
        break;

      default:
        responseData = { success: false, message: "Action GET tidak dikenali." };
    }

    return ContentService
      .createTextOutput(JSON.stringify(responseData))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * MEMBACA KONFIGURASI SISTEM DARI SHEET 'config_sistem' (KEY-VALUE VERTIKAL)
 * Dilengkapi CacheService (10 menit) untuk performa instan.
 * @return {object} Key-Value konfigurasi sistem
 */
function getSystemConfig() {
  try {
    const cache = CacheService.getScriptCache();
    const cachedConfig = cache.get("system_config");

    // 1. Jika config tersimpan di cache, langsung gunakan data cache (Super Fast!)
    if (cachedConfig) {
      return JSON.parse(cachedConfig);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("config_sistem");
    if (!sheet) throw new Error("Sheet 'config_sistem' tidak ditemukan!");

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return {};

    // 2. Baca Kolom A (Key) dan Kolom B (Value)
    const data = sheet.getRange("A2:B" + lastRow).getValues();
    const config = {};

    data.forEach(row => {
      const key = String(row[0] || "").trim();
      const val = String(row[1] || "").trim();
      if (key) {
        config[key] = val;
      }
    });

    // 3. Ekstraksi Otomatis Google Drive File ID dari logo_sekolah_url
    if (config.logo_sekolah_url) {
      const urlStr = config.logo_sekolah_url;
      let fileId = "";

      if (urlStr.includes("/d/")) {
        fileId = urlStr.split("/d/")[1].split("/")[0];
      } else if (urlStr.includes("id=")) {
        fileId = urlStr.split("id=")[1].split("&")[0];
      } else if (!urlStr.startsWith("http")) {
        fileId = urlStr; // Jika yang diinput langsung File ID
      }

      config.logo_sekolah_id = fileId;
    }

    // 4. Simpan hasil parsing ke CacheService selama 10 menit (600 detik)
    cache.put("system_config", JSON.stringify(config), 600);

    return config;

  } catch (err) {
    Logger.log("❌ Error getSystemConfig: " + err.message);
    return {};
  }
}

/**
 * HELPER OPSIONAL: MEMBERSIHKAN CACHE CONFIG
 * Panggil fungsi ini jika kamu baru saja mengubah isi sheet 'config_sistem' 
 * agar perubahan langsung terasa tanpa menunggu 10 menit.
 */
function clearSystemConfigCache() {
  const cache = CacheService.getScriptCache();
  cache.remove("system_config");
  Logger.log("🧹 Cache config_sistem berhasil dibersihkan!");
}

// 💡 HELPER FUNCTION UNTUK MINTA ENGINE POOL JALANKAN UPDATE
function pemicuTarikDataPool() {
  try {
    // 🔥 Tambahkan ?action=triggerSyncFromWeb di akhir URL
    const URL_POOL_WEBAPP = "https://script.google.com/macros/s/AKfycbw7WOTtW3AIv0dP_8U_NYl-khh2rP7MQhPMc23Pisq8nPnrXSOJ27PqFDtGm-Mj8kTR6w/exec?action=triggerSyncFromWeb";
    
    const response = UrlFetchApp.fetch(URL_POOL_WEBAPP);
    return JSON.parse(response.getContentText());
  } catch (err) {
    return { success: false, message: "Gagal memicu Engine Pool: " + err.toString() };
  }
}

/* =========================================================
   FUNGSI LOGIKA DASAR (VERIFIKASI & PRESENSI)
========================================================= */

function verifikasiLoginPiket(idInput, kodeInput) {
  // Buka Sheet Master Tempat user_piket Berada
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("user_piket");
  if (!sheet) return { success: false, message: "Sheet user_piket tidak ditemukan." };

  const data = sheet.getDataRange().getValues();
  
  const hariList = ["minggu", "senin", "selasa", "rabu", "kamis", "jumat", "sabtu"];
  const now = new Date();
  const hariIni = hariList[now.getDay()];

  const cleanID = String(idInput || "").trim().toUpperCase();
  const cleanKode = String(kodeInput || "").trim();

  for (let i = 1; i < data.length; i++) {
    const hari = String(data[i][0] || "").trim().toLowerCase();
    const nama = String(data[i][1] || "").trim();
    const id = String(data[i][2] || "").trim().toUpperCase();
    const kode = String(data[i][3] || "").trim();
    const role = String(data[i][4] || "").trim();

    const isHariMatch = (hari === hariIni || hari === "setiap hari" || hari === "everyday");
    const isUserMatch = (id === cleanID && kode === cleanKode);

    if (isHariMatch && isUserMatch) {
      return { success: true, nama: nama, role: role };
    }
  }
  return { success: false, message: "Username/Password salah atau jadwal hari tidak sesuai." };
}

/**
 * 💡 HELPER MASTER: Ambil Config Seluruh Semester dengan Caching (1 Jam)
 * Disesuaikan dengan struktur kolom config_semester
 */
/**
 * 💡 1. AMBIL CONFIG ALL SEMESTERS (Mendukung Tipe Cell Date Google Sheets)
 */
function getAllSemestersConfig() {
  const cache = CacheService.getScriptCache();
  const cachedData = cache.get("ALL_SEMESTERS_CONFIG");

  if (cachedData) {
    return JSON.parse(cachedData);
  }

  const ssMaster = SpreadsheetApp.getActiveSpreadsheet(); 
  const sheet = ssMaster.getSheetByName("config_semester");
  if (!sheet) return [];

  // Gunakan getValues() untuk mengambil nilai asli/objek Date
  const rawData = sheet.getDataRange().getValues();
  const displayData = sheet.getDataRange().getDisplayValues();
  
  rawData.shift();     // Hapus Header
  displayData.shift(); // Hapus Header

  const tz = ssMaster.getSpreadsheetTimeZone() || Session.getScriptTimeZone();

  const semesters = rawData.map((row, idx) => {
    const displayRow = displayData[idx];

    // Helper sakti: mengubah tipe Date object / String apapun ke Integer YYYYMMDD
    const cellToDateNum = (rawVal, displayVal) => {
      let dateObj = null;

      if (rawVal instanceof Date && !isNaN(rawVal.getTime())) {
        dateObj = rawVal;
      } else if (displayVal && typeof displayVal === "string") {
        const clean = displayVal.trim();
        if (clean.includes("/")) {
          const [d, m, y] = clean.split("/");
          return Number(`${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`);
        } else if (clean.includes("-")) {
          const [y, m, d] = clean.split("-");
          return Number(`${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`);
        }
      }

      if (dateObj) {
        // Format ke "yyyyMMdd" menggunakan TimeZone spreadsheet
        const formatted = Utilities.formatDate(dateObj, tz, "yyyyMMdd");
        return Number(formatted);
      }

      return 0;
    };

    return {
      id_semester: displayRow[0],
      tahun_ajaran: displayRow[1],
      nama_semester: displayRow[2],
      startNum: cellToDateNum(row[3], displayRow[3]), // Kolom D: tanggal_mulai
      endNum: cellToDateNum(row[4], displayRow[4]),   // Kolom E: tanggal_selesai
      status: String(displayRow[5] || "").toUpperCase().trim(),
      file_id_spreadsheet: String(displayRow[6] || "").trim()
    };
  });

  // Simpan di Cache RAM selama 1 jam
  cache.put("ALL_SEMESTERS_CONFIG", JSON.stringify(semesters), 3600);
  return semesters;
}

/**
 * 💡 LOADER SPREADSHEET DENGAN CONSOLE LOGGING DETIL
 */
function getPresensiSpreadsheet(tanggal) {
  const semesters = getAllSemestersConfig();
  Logger.log("=========================================");
  Logger.log("🔍 [DEBUG] Parameter Tanggal Diterima: " + tanggal);
  Logger.log("📚 [DEBUG] Total Config Semester Terload: " + semesters.length);

  if (tanggal && semesters.length > 0) {
    let targetNum = 0;

    if (typeof tanggal === "string") {
      let clean = tanggal.trim();
      if (clean.includes("-")) { // Format ISO: YYYY-MM-DD
        const [y, m, d] = clean.split("-");
        targetNum = Number(`${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`);
      } else if (clean.includes("/")) { // Format Indo: DD/MM/YYYY
        const [d, m, y] = clean.split("/");
        targetNum = Number(`${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`);
      }
    }

    Logger.log("🔢 [DEBUG] Parsed Target Date Integer: " + targetNum);

    if (targetNum > 0) {
      const matched = semesters.find(sem => {
        const isMatch = targetNum >= sem.startNum && targetNum <= sem.endNum;
        Logger.log(`   -> Cek Semester: ID [${sem.id_semester}] | Range: [${sem.startNum} s/d ${sem.endNum}] | Status Match: ${isMatch}`);
        return isMatch;
      });

      if (matched && matched.file_id_spreadsheet) {
        Logger.log("✅ [DEBUG] MATCH FOUND! Buka Spreadsheet Semester ID: " + matched.id_semester + " | File ID: " + matched.file_id_spreadsheet);
        return SpreadsheetApp.openById(matched.file_id_spreadsheet);
      } else {
        Logger.log("⚠️ [DEBUG] Tanggal cocok dengan semester, tapi file_id_spreadsheet KOSONG di config!");
      }
    }
  }

  // Fallback
  Logger.log("⚠️ [DEBUG] NO MATCH FOUND / FALLBACK! Membuka Spreadsheet Semester Aktif...");
  const activeSemester = semesters.find(s => s.status === "AKTIF");
  if (!activeSemester || !activeSemester.file_id_spreadsheet) {
    throw new Error("⚠️ Tidak ada Semester Aktif atau File ID Spreadsheet belum di-set di DB Master.");
  }

  Logger.log("📌 [DEBUG] Buka Spreadsheet Semester Aktif: " + activeSemester.id_semester + " | File ID: " + activeSemester.file_id_spreadsheet);
  return SpreadsheetApp.openById(activeSemester.file_id_spreadsheet);
}

/* ==========================================================================
   FUNGSI OPERASIONAL (Sudah Disesuaikan ke getPresensiSpreadsheet)
   ========================================================================== */

function getSiswaHariIni() {
  // Tanpa parameter = Langsung fallback super cepat ke Semester Aktif
  const ss = getPresensiSpreadsheet();
  const sheet = ss.getSheetByName("master_presensi");
  if (!sheet) return [];

  const now = new Date();
  const d = String(now.getDate()).padStart(2, "0");
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const y = now.getFullYear();
  const todayStr = `${d}/${m}/${y}`;

  const finder = sheet.getRange("A2:A").createTextFinder(todayStr).matchEntireCell(true);
  const results = finder.findAll();
  if (results.length === 0) return [];

  const startRow = results[0].getRow();
  const endRow = results[results.length - 1].getRow();
  const totalRows = (endRow - startRow) + 1;

  const chunkData = sheet.getRange(startRow, 1, totalRows, 12).getDisplayValues();
  const resultData = [];

  for (let i = 0; i < chunkData.length; i++) {
    const row = chunkData[i];
    if (row[0] === todayStr) {
      resultData.push({
        rowIndex: startRow + i,
        tanggal: todayStr,
        idSiswa: row[1],
        nama: row[2],
        kelas: row[3],       // id_rombel (AKN-A26)
        tingkat: row[4],     // tingkat (X, XI, XII)
        jamMasuk: row[6],    // jam_masuk
        statusMasuk: row[7] || "",
        jamPulang: row[8],   // jam_pulang
        statusPulang: row[9] || "",
        idPiket: row[10],    // id_piket
        keterangan: row[11]  // keterangan
      });
    }
  }
  return resultData;
}

/**
 * 💡 GET SISWA BY TANGGAL DENGAN LOGGING DETIL
 */
function getSiswaByTanggal(tanggal) {
  if (!tanggal) return [];

  let filterTanggal = "";
  if (typeof tanggal === "string") {
    if (tanggal.includes("-")) {
      const [y, m, d] = tanggal.split("-");
      filterTanggal = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
    } else {
      filterTanggal = tanggal.trim();
    }
  }

  Logger.log("🎯 [DEBUG] Mencari String Tanggal di Sheet: '" + filterTanggal + "'");

  const ss = getPresensiSpreadsheet(tanggal);
  Logger.log("📖 [DEBUG] Nama Spreadsheet Terbuka: " + ss.getName());

  const sheet = ss.getSheetByName("master_presensi");
  if (!sheet) {
    Logger.log("❌ [DEBUG] ERROR: Sheet 'master_presensi' TIDAK DITEMUKAN di Spreadsheet ini!");
    return [];
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log("⚠️ [DEBUG] Sheet 'master_presensi' KOSONG (Last Row < 2)");
    return [];
  }

  const finder = sheet.getRange("A2:A").createTextFinder(filterTanggal).matchEntireCell(true);
  const results = finder.findAll();
  
  Logger.log("📊 [DEBUG] Hasil Pencarian TextFinder: Ditemukan " + results.length + " baris data.");

  if (results.length === 0) return [];

  const startRow = results[0].getRow();
  const endRow = results[results.length - 1].getRow();
  const totalRows = (endRow - startRow) + 1;

  const chunkData = sheet.getRange(startRow, 1, totalRows, 12).getDisplayValues();
  const resultData = [];

  for (let i = 0; i < chunkData.length; i++) {
    const row = chunkData[i];
    if (row[0] === filterTanggal) {
      resultData.push({
        rowIndex: startRow + i,
        tanggal: row[0],
        idSiswa: row[1],
        nama: row[2],
        kelas: row[3],       
        tingkat: row[4],     
        jamMasuk: row[6],    
        statusMasuk: row[7] || "",
        jamPulang: row[8],   
        statusPulang: row[9] || "",
        idPiket: row[10],    
        keterangan: row[11]  
      });
    }
  }
  return resultData;
}

function simpanStatusMasuk(payload) {
  if (!payload || !Array.isArray(payload) || payload.length === 0) return { success: true };

  // Ambil tanggal sampel dari payload jika ada untuk menentukan spreadsheet
  const sampleTanggal = payload[0]?.tanggal;
  const ss = getPresensiSpreadsheet(sampleTanggal);
  const sheet = ss.getSheetByName("master_presensi");
  if (!sheet) throw new Error("Sheet master_presensi tidak ditemukan.");

  const rowIndexes = payload.map(item => Number(item.rowIndex));
  const minRow = Math.min(...rowIndexes);
  const maxRow = Math.max(...rowIndexes);
  const numRows = (maxRow - minRow) + 1;

  const range = sheet.getRange(minRow, 7, numRows, 5); 
  const values = range.getValues();

  payload.forEach(item => {
    const targetRow = Number(item.rowIndex);
    const arrayIndex = targetRow - minRow;
    
    const newStatus = item.statusMasuk || "";
    const piketID = item.piketID || "";

    if (["Sakit", "Izin", "Alpa", "Libur"].includes(newStatus)) {
      values[arrayIndex][0] = ""; 
    }
    values[arrayIndex][1] = newStatus; 
    values[arrayIndex][4] = piketID;    
  });

  range.setValues(values);
  return { success: true };
}

/**
 * Memeriksa jumlah data presensi yang belum memiliki Status Masuk / masih "Belum Presensi" pada tanggal tertentu.
 * DIOPTIMASI: Menggunakan Sheets API (Super Fast)
 */
function cekStatusKosongHariIni(tanggal) {
  try {
    const startTime = new Date().getTime();

    // 1. Ambil config semester (ID File & ID Semester)
    const config = getSemesterConfig(tanggal);
    if (!config) return 0;

    const targetSpreadsheetId = (config.file_id_spreadsheet && String(config.file_id_spreadsheet).trim() !== "")
      ? config.file_id_spreadsheet.trim()
      : SpreadsheetApp.getActiveSpreadsheet().getId();

    const sheetName = SHEETS.MASTER_PRESENSI || "master_presensi";

    // 2. Format tanggal acuan ke format DD/MM/YYYY
    let dateObj;
    if (!tanggal) {
      dateObj = new Date();
    } else if (tanggal instanceof Date) {
      dateObj = tanggal;
    } else {
      const strTgl = String(tanggal).trim();
      if (strTgl.includes("-")) {
        const parts = strTgl.split("-");
        dateObj = (parts[0].length === 4)
          ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
          : new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
      } else if (strTgl.includes("/")) {
        const parts = strTgl.split("/");
        dateObj = (parts[2].length === 4)
          ? new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]))
          : new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      } else {
        dateObj = new Date(strTgl);
      }
    }

    const formattedDate = Utilities.formatDate(dateObj, TZ || "Asia/Jakarta", "dd/MM/yyyy");

    // 3. AMBIL DATA VIA SHEETS API (Gantinya getDataRange().getValues())
    const range = `'${sheetName}'!A:J`; // Hanya ambil Kolom A sampai J
    const response = Sheets.Spreadsheets.Values.get(targetSpreadsheetId, range);
    const data = response.values;

    if (!data || data.length <= 1) return 0;

    // 4. Cari indeks kolom dari Header
    const header = data[0].map(val => String(val).toLowerCase().trim());
    const rows = data.slice(1);

    const colTanggal = header.indexOf("tanggal");
    let colStatus = header.indexOf("status_masuk");
    if (colStatus === -1) colStatus = header.indexOf("status masuk");

    if (colTanggal === -1 || colStatus === -1) return 0;

    // 5. Filter & Hitung yang kosong / "belum presensi"
    let kosongCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r[colTanggal]) continue;

      let rDateStr = "";
      // Jika Sheets API mengembalikan format date atau string
      if (r[colTanggal] instanceof Date) {
        rDateStr = Utilities.formatDate(r[colTanggal], TZ || "Asia/Jakarta", "dd/MM/yyyy");
      } else {
        rDateStr = String(r[colTanggal]).trim();
      }

      if (rDateStr === formattedDate) {
        const valStatus = String(r[colStatus] || "").trim().toLowerCase();
        if (valStatus === "" || valStatus === "belum presensi") {
          kosongCount++;
        }
      }
    }

    const elapsed = (new Date().getTime() - startTime) / 1000;
    Logger.log(`⚡ [Sheets API] Cek status kosong ${formattedDate}: ${kosongCount} siswa (Waktu: ${elapsed} detik)`);

    return kosongCount;

  } catch (e) {
    Logger.log(`❌ Error pada cekStatusKosongHariIni: ${e.message}`);
    return 0;
  }
}

/**
 * Membaca sheet 'wali_kelas' dan mengembalikan Map: id_rombel -> nama_wali_kelas
 */
function getMapWaliKelas() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("wali_kelas");
    const mapWali = {};
    if (!sheet) return mapWali;
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return mapWali;
    for (let i = 1; i < data.length; i++) {
      const idRombel = String(data[i][0] || "").trim();
      const namaWali = String(data[i][1] || "").trim();
      if (idRombel) mapWali[idRombel] = namaWali;
    }
    return mapWali;
  } catch (e) {
    Logger.log("⚠️ Warning getMapWaliKelas: " + e.message);
    return {};
  }
}

/**
 * Konversi ID Rombel (contoh: AKN-A26) -> Nama Kelas Resmi (contoh: AKN X-A)
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
    return `${jurusan} ${tingkat}-${subKelas}`;
  }
  return idRombel;
}

/**
 * Engine Merger PDF Native menggunakan pdf-lib (dengan Polyfill setTimeout untuk Apps Script)
 */
async function mergePdfBlobs(pdfBlobs) {
  try {
    if (!pdfBlobs || pdfBlobs.length === 0) return null;
    if (pdfBlobs.length === 1) return pdfBlobs[0];

    Logger.log("🔄 Memuat engine pdf-lib dari CDN...");

    // 1. Polyfill setTimeout & clearTimeout khusus untuk Google Apps Script Environment
    if (typeof setTimeout === "undefined") {
      this.setTimeout = function (callback, ms) {
        if (ms && ms > 0) Utilities.sleep(ms);
        callback();
        return 1;
      };
      this.clearTimeout = function () {};
    }

    // 2. Fetch library pdf-lib
    const cdnUrl = "https://cdn.jsdelivr.net/npm/pdf-lib/dist/pdf-lib.min.js";
    const jsContent = UrlFetchApp.fetch(cdnUrl).getContentText();
    
    // Evaluasi ke runtime GAS
    eval(jsContent);

    // 3. Buat dokumen PDF gabungan baru
    const mergedPdf = await PDFLib.PDFDocument.create();

    // 4. Salin halaman dari setiap PDF (Landscape + Portrait)
    for (let i = 0; i < pdfBlobs.length; i++) {
      const blob = pdfBlobs[i];
      const bytes = new Uint8Array(blob.getBytes());
      
      const pdfData = await PDFLib.PDFDocument.load(bytes);
      const pageIndices = pdfData.getPageIndices();
      const copiedPages = await mergedPdf.copyPages(pdfData, pageIndices);
      
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    // 5. Export ke Blob PDF tunggal
    const mergedBytes = await mergedPdf.save();
    const resultBlob = Utilities.newBlob([...new Int8Array(mergedBytes)], "application/pdf");

    Logger.log("✅ Engine berhasil menggabungkan PDF Landscape + Portrait!");
    return resultBlob;

  } catch (e) {
    Logger.log("❌ Error Engine PDF Merger: " + e.message);
    return pdfBlobs[0];
  }
}


/**
 * Main Function: Generator Laporan Presensi Harian
 */
// =========================================================================
// FUNGSI UTAMA: BUAT REKAP PRESENSI HARIAN (SYNCHRONOUS FOR GAS COMPATIBILITY)
// =========================================================================
async function buatRekapPresensiHarian(namaPetugas, tanggal) {
  try {
    const startTime = new Date().getTime();

    // 1. Cek status kosong
    const jumlahKosong = cekStatusKosongHariIni(tanggal);
    if (jumlahKosong > 0) {
      throw new Error(`Gagal membuat rekap! Masih ada ${jumlahKosong} siswa yang belum presensi hari ini.`);
    }

    // 2. Ambil Config Semester & Folder Drive
    const config = getSemesterConfig(tanggal);
    if (!config) throw new Error("Konfigurasi semester tidak ditemukan!");

    const targetSpreadsheetId = (config.file_id_spreadsheet && String(config.file_id_spreadsheet).trim() !== "")
      ? config.file_id_spreadsheet.trim()
      : SpreadsheetApp.getActiveSpreadsheet().getId();

    const sheetMasterName = SHEETS.MASTER_PRESENSI || "master_presensi";
    const folderId = "16TQT8GmnrYzmqam-UK59G4q6rfx6Lkoa";
    const folder = DriveApp.getFolderById(folderId);

    // 3. Normalisasi Tanggal
    let dateObj;
    if (!tanggal) dateObj = new Date();
    else if (tanggal instanceof Date) dateObj = tanggal;
    else {
      const strTgl = String(tanggal).trim();
      if (strTgl.includes("-")) {
        const parts = strTgl.split("-");
        dateObj = (parts[0].length === 4)
          ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
          : new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
      } else if (strTgl.includes("/")) {
        const parts = strTgl.split("/");
        dateObj = (parts[2].length === 4)
          ? new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]))
          : new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      } else {
        dateObj = new Date(strTgl);
      }
    }

    const formattedDate = Utilities.formatDate(dateObj, TZ || "Asia/Jakarta", "dd/MM/yyyy");
    const displayDate = typeof formatTanggalIndonesia === 'function' ? formatTanggalIndonesia(dateObj) : formattedDate;

    // 4. Ambil Data Master
    const rangeMaster = `'${sheetMasterName}'!A:L`;
    const resMaster = Sheets.Spreadsheets.Values.get(targetSpreadsheetId, rangeMaster);
    const dataMaster = resMaster.values;
    if (!dataMaster || dataMaster.length <= 1) throw new Error("Data master presensi kosong!");

    const header = dataMaster[0].map(val => String(val).toLowerCase().trim());
    const rows = dataMaster.slice(1);

    const colTanggal  = header.indexOf("tanggal");
    const colNama     = header.indexOf("nama");
    const colKelas    = header.indexOf("id_rombel");
    const colTingkat  = header.indexOf("tingkat");
    const colStatus   = header.indexOf("status_masuk");
    let colJam        = header.indexOf("jam_masuk");
    if (colJam === -1) colJam = header.indexOf("waktu");
    if (colJam === -1) colJam = header.indexOf("timestamp");

    if (colTanggal === -1 || colKelas === -1 || colNama === -1 || colTingkat === -1 || colStatus === -1) {
      throw new Error(`Kolom header tidak cocok pada sheet '${sheetMasterName}'!`);
    }

    const hariIni = rows.filter(r => {
      if (!r[colTanggal]) return false;
      let rDateStr = (r[colTanggal] instanceof Date)
        ? Utilities.formatDate(r[colTanggal], TZ || "Asia/Jakarta", "dd/MM/yyyy")
        : String(r[colTanggal]).trim();
      return rDateStr === formattedDate;
    });

    if (hariIni.length === 0) {
      throw new Error("Tidak ada data presensi untuk tanggal " + formattedDate);
    }

    // 5. Agregasi Data
    const statusGroups = {
      "Hadir": ["Tepat Waktu", "Terlambat", "Hadir Tidak Presensi"],
      "Tidak Hadir": ["Sakit", "Izin", "Alpa"],
      "Lainnya": ["Daring", "Prakerin", "Libur"]
    };
    const statusList = [].concat.apply([], Object.values(statusGroups));

    function normalizeStatus(st) {
      st = String(st || "").trim();
      if (st === "Terlambat" || st === "Sangat Terlambat" || st === "Sangat Terlambat Sekali") {
        return "Terlambat";
      }
      return st;
    }

    let tingkatRekap = {}, kelasRekap = {}, siswaByKelas = {};
    let totalRekap = {};
    statusList.forEach(s => { totalRekap[s] = 0; });

    hariIni.forEach(r => {
      const tingkat = r[colTingkat] || "-";
      const kelas = r[colKelas] || "-";
      const nama = r[colNama] || "-";
      const rawStatus = String(r[colStatus] || "-").trim();
      const st = normalizeStatus(rawStatus);
      const jamMasuk = colJam !== -1 ? String(r[colJam] || "-").trim() : "-";

      if (!tingkatRekap[tingkat]) {
        tingkatRekap[tingkat] = {};
        statusList.forEach(s => { tingkatRekap[tingkat][s] = 0; });
      }
      if (tingkatRekap[tingkat][st] !== undefined) tingkatRekap[tingkat][st]++;

      if (!kelasRekap[kelas]) {
        kelasRekap[kelas] = { tingkat: tingkat };
        statusList.forEach(s => { kelasRekap[kelas][s] = 0; });
      }
      if (kelasRekap[kelas][st] !== undefined) kelasRekap[kelas][st]++;

      if (!siswaByKelas[kelas]) siswaByKelas[kelas] = [];
      siswaByKelas[kelas].push({
        nama: nama,
        jam_masuk: jamMasuk,
        status: rawStatus
      });

      if (totalRekap[st] !== undefined) totalRekap[st]++;
    });

    // 6. Build HTML Landscape & Portrait
    const htmlLandscape = buildHtmlLandscape({ displayDate, namaPetugas, tingkatRekap, kelasRekap, totalRekap, statusGroups, statusList });
    const htmlPortrait = buildHtmlPortrait({ displayDate, siswaByKelas, kelasRekap, statusGroups });

    // 7. Render Blobs
    const blobLandscape = Utilities.newBlob(htmlLandscape, "text/html").getAs("application/pdf");
    const blobPortrait = Utilities.newBlob(htmlPortrait, "text/html").getAs("application/pdf");

    // 8. Merge Blobs ke dalam 1 File PDF Final
    const mergedBlob = await mergePdfBlobs([blobLandscape, blobPortrait]);
    const finalPdfBlob = mergedBlob.setName("Rekap Presensi " + formattedDate.replace(/\//g, "-") + ".pdf");

    // =========================================================
    // 📍 DISINI TEMPAT MENYIMPAN KODE TERSEBUT:
    // =========================================================
    const file = folder.createFile(finalPdfBlob);
    const fileUrl = file.getUrl(); // <-- Ambil URL File Google Drive yang baru dibuat

    // 9. Catat Log ke Sheet
    const timestampStr = Utilities.formatDate(new Date(), TZ || "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss");
    const ssMaster = SpreadsheetApp.getActiveSpreadsheet();
    const masterSpreadsheetId = ssMaster.getId();
    const sheetLaporanName = SHEETS.LAPORAN_PRESENSI || "laporan_presensi";

    let sheetLaporan = ssMaster.getSheetByName(sheetLaporanName);
    if (!sheetLaporan) {
      sheetLaporan = ssMaster.insertSheet(sheetLaporanName);
      sheetLaporan.appendRow(["timestamp", "user", "file_laporan"]);
      SpreadsheetApp.flush();
    }

    const valueRange = Sheets.newValueRange();
    valueRange.values = [[timestampStr, namaPetugas, fileUrl]];
    Sheets.Spreadsheets.Values.append(
      valueRange, masterSpreadsheetId, `'${sheetLaporanName}'!A:C`,
      { valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS" }
    );

    const elapsed = (new Date().getTime() - startTime) / 1000;
    Logger.log(`⚡ [Merged PDF] Berhasil buat PDF gabungan (Waktu: ${elapsed}s)`);

    // 📍 KEMBALIKAN fileUrl SEBAGAI HASIL AKHIR DARI FUNGSI
    return fileUrl; 

  } catch (e) {
    Logger.log(`❌ Error pada buatRekapPresensiHarian: ${e.message}`);
    throw e;
  }
}

// ==========================================
// RENDERER 1: HTML LANDSCAPE (HAL 1 & LAMPIRAN 1 - CONTINUOUS)
// ==========================================
function buildHtmlLandscape(data) {
  const { displayDate, namaPetugas, tingkatRekap, kelasRekap, totalRekap, statusGroups, statusList } = data;

  const totalSiswaGlobal = Object.values(totalRekap).reduce((a, b) => a + b, 0);
  const totalHadirGlobal = statusGroups["Hadir"].reduce((sum, s) => sum + (totalRekap[s] || 0), 0);
  const totalTidakHadirGlobal = statusGroups["Tidak Hadir"].reduce((sum, s) => sum + (totalRekap[s] || 0), 0);
  const totalLainnyaGlobal = statusGroups["Lainnya"].reduce((sum, s) => sum + (totalRekap[s] || 0), 0);

  const persenHadirGlobal = totalSiswaGlobal ? ((totalHadirGlobal / totalSiswaGlobal) * 100).toFixed(1) : "0.0";
  const persenTidakHadirGlobal = totalSiswaGlobal ? ((totalTidakHadirGlobal / totalSiswaGlobal) * 100).toFixed(1) : "0.0";
  const persenLainnyaGlobal = totalSiswaGlobal ? ((totalLainnyaGlobal / totalSiswaGlobal) * 100).toFixed(1) : "0.0";

  return '<html><head><style>' +
    '@page { size: A4 landscape; margin: 8mm 10mm; }' +
    'body { font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 9.5px; color: #000; margin: 0; padding: 0; }' +
    '.header-title { text-align: center; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 2px solid #000; }' +
    '.header-title h2 { font-size: 16px; margin: 0 0 3px 0; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 800; }' +
    '.header-title p { font-size: 10px; margin: 0; color: #334155; font-weight: 700; }' +
    '.summary-wrap { display: table; width: 100%; table-layout: fixed; margin-bottom: 14px; border-spacing: 6px; }' +
    '.summary-box { display: table-cell; border-radius: 6px; padding: 8px; text-align: center; vertical-align: middle; }' +
    '.summary-box .title { font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 800; display: block; margin-bottom: 2px; }' +
    '.summary-box .val { font-size: 14px; font-weight: 800; }' +
    '.box-total { background-color: #f8fafc; border: 2px solid #64748b; color: #0f172a; }' +
    '.box-hadir { background-color: #f0fdf4; border: 2px solid #16a34a; color: #15803d; }' +
    '.box-tidak { background-color: #fef2f2; border: 2px solid #dc2626; color: #b91c1c; }' +
    '.box-khusus { background-color: #fffbeb; border: 2px solid #d97706; color: #b45309; }' +
    'h3.section-title { font-size: 11px; margin: 12px 0 6px 0; color: #000; border-left: 4px solid #0284c7; padding-left: 8px; font-weight: 800; }' +
    'table { border-collapse: collapse; width: 100%; font-size: 9.5px; margin-bottom: 12px; border: 1px solid #1e293b; }' +
    'th, td { padding: 5px 4px; text-align: center; vertical-align: middle; border: 1px solid #1e293b; }' +
    'th { background-color: #e2e8f0; color: #000; font-weight: 800; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.3px; }' +
    '.total-row { font-weight: 800; background-color: #cbd5e1 !important; color: #000; }' +
    '.total-row td { border-top: 2px solid #000; }' +
    '.signature-wrap { width: 220px; margin-left: auto; margin-top: 20px; text-align: center; page-break-inside: avoid; }' +
    '.signature-title { font-size: 10px; color: #000; margin-bottom: 45px; font-weight: 600; }' +
    '.signature-name { font-size: 11px; font-weight: 800; color: #000; }' +
    'td.col-kelas { white-space: nowrap !important; text-align: left !important; padding-left: 6px !important; font-weight: 700; }' +
    'th.col-summary, td.col-summary { width: 48px !important; }' +
    '.txt-danger { color: #dc2626; font-weight: 700; }' +
    '.txt-warning { color: #d97706; font-weight: 700; }' +
    '.txt-success { color: #16a34a; font-weight: 800; }' +
    '</style></head><body>' +

    '<!-- 1. HEADER UTAMA -->' +
    '<div class="header-title"><h2>Presensi Siswa SMK MedikaCom</h2><p>' + displayDate + '</p></div>' +
    '<div class="summary-wrap">' +
      '<div class="summary-box box-total"><span class="title">Total Siswa</span><span class="val">' + totalSiswaGlobal + '</span></div>' +
      '<div class="summary-box box-hadir"><span class="title">Hadir</span><span class="val">' + totalHadirGlobal + ' <small>(' + persenHadirGlobal + '%)</small></span></div>' +
      '<div class="summary-box box-tidak"><span class="title">Tidak Hadir</span><span class="val">' + totalTidakHadirGlobal + ' <small>(' + persenTidakHadirGlobal + '%)</small></span></div>' +
      '<div class="summary-box box-khusus"><span class="title">Status Khusus</span><span class="val">' + totalLainnyaGlobal + ' <small>(' + persenLainnyaGlobal + '%)</small></span></div>' +
    '</div>' +

    '<!-- 2. REKAP PER TINGKAT -->' +
    '<h3 class="section-title">Rekap Presensi Seluruh Tingkat</h3>' +
    '<table><thead>' +
    '<tr><th rowspan="2">Tingkat</th><th rowspan="2">Jumlah Siswa</th><th colspan="3">Hadir</th><th rowspan="2">Jumlah Hadir</th><th rowspan="2">% Hadir</th><th colspan="3">Tidak Hadir</th><th rowspan="2">Jumlah Tidak Hadir</th><th rowspan="2">% Tidak Hadir</th><th colspan="3">Status Khusus</th><th rowspan="2">% Khusus</th></tr>' +
    '<tr><th>Tepat Waktu</th><th>Terlambat</th><th>Tidak Presensi</th><th>Sakit</th><th>Izin</th><th>Alpa</th><th>Daring</th><th>Prakerin</th><th>Libur</th></tr>' +
    '</thead><tbody>' +
    Object.keys(tingkatRekap).map((tingkat) => {
      const row = tingkatRekap[tingkat];
      const jmlSiswa = Object.values(row).reduce((a, b) => a + b, 0);
      const jmlHadir = statusGroups.Hadir.reduce((sum, s) => sum + (row[s] || 0), 0);
      const jmlTH = statusGroups["Tidak Hadir"].reduce((sum, s) => sum + (row[s] || 0), 0);
      const jmlKhusus = statusGroups.Lainnya.reduce((sum, s) => sum + (row[s] || 0), 0);
      return '<tr><td><strong>' + tingkat + '</strong></td><td>' + jmlSiswa + '</td><td>' + (row["Tepat Waktu"] || 0) + '</td><td>' + (row["Terlambat"] || 0) + '</td><td>' + (row["Hadir Tidak Presensi"] || 0) + '</td><td><strong>' + jmlHadir + '</strong></td><td>' + (jmlSiswa ? ((jmlHadir / jmlSiswa) * 100).toFixed(1) : "-") + '%</td><td>' + (row["Sakit"] || 0) + '</td><td>' + (row["Izin"] || 0) + '</td><td>' + (row["Alpa"] || 0) + '</td><td><strong>' + jmlTH + '</strong></td><td>' + (jmlSiswa ? ((jmlTH / jmlSiswa) * 100).toFixed(1) : "-") + '%</td><td>' + (row["Daring"] || 0) + '</td><td>' + (row["Prakerin"] || 0) + '</td><td>' + (row["Libur"] || 0) + '</td><td>' + (jmlSiswa ? ((jmlKhusus / jmlSiswa) * 100).toFixed(1) : "-") + '%</td></tr>';
    }).join('') +
    '<tr class="total-row"><td>JUMLAH</td><td>' + totalSiswaGlobal + '</td><td>' + (totalRekap["Tepat Waktu"] || 0) + '</td><td>' + (totalRekap["Terlambat"] || 0) + '</td><td>' + (totalRekap["Hadir Tidak Presensi"] || 0) + '</td><td>' + totalHadirGlobal + '</td><td>' + persenHadirGlobal + '%</td><td>' + (totalRekap["Sakit"] || 0) + '</td><td>' + (totalRekap["Izin"] || 0) + '</td><td>' + (totalRekap["Alpa"] || 0) + '</td><td>' + totalTidakHadirGlobal + '</td><td>' + persenTidakHadirGlobal + '%</td><td>' + (totalRekap["Daring"] || 0) + '</td><td>' + (totalRekap["Prakerin"] || 0) + '</td><td>' + (totalRekap["Libur"] || 0) + '</td><td>' + persenLainnyaGlobal + '%</td></tr>' +
    '</tbody></table>' +

    '<!-- 3. LANGSUNG MENYAMBUNG: LAMPIRAN 1 (REKAP PER KELAS) -->' +
    '<h3 class="section-title">Rekap Presensi Seluruh Kelas</h3>' +
    '<table><thead>' +
    '<tr><th rowspan="2">No</th><th rowspan="2">Kelas</th><th rowspan="2">Jumlah Siswa</th><th colspan="3">Hadir</th><th rowspan="2">Jumlah Hadir</th><th rowspan="2">% Hadir</th><th colspan="3">Tidak Hadir</th><th rowspan="2">Jumlah Tidak Hadir</th><th rowspan="2">% Tidak Hadir</th><th colspan="3">Status Khusus</th><th rowspan="2">% Khusus</th></tr>' +
    '<tr><th>Tepat Waktu</th><th>Terlambat</th><th>Tidak Presensi</th><th>Sakit</th><th>Izin</th><th>Alpa</th><th>Daring</th><th>Prakerin</th><th>Libur</th></tr>' +
    '</thead><tbody>' +
    Object.keys(kelasRekap).map((kelasKey, i) => {
      const row = kelasRekap[kelasKey];
      const jmlSiswa = statusList.reduce((sum, s) => sum + (Number(row[s]) || 0), 0);
      const jmlHadir = statusGroups.Hadir.reduce((sum, s) => sum + (Number(row[s]) || 0), 0);
      const jmlTH = statusGroups["Tidak Hadir"].reduce((sum, s) => sum + (Number(row[s]) || 0), 0);
      const jmlKhusus = statusGroups.Lainnya.reduce((sum, s) => sum + (Number(row[s]) || 0), 0);

      const namaKelasFormatted = formatNamaKelas(kelasKey, row.tingkat);
      const strTerlambat = (row["Terlambat"] || 0) > 0 ? `<span class="txt-danger">${row["Terlambat"]}</span>` : '0';
      const strTidakPresensi = (row["Hadir Tidak Presensi"] || 0) > 0 ? `<span class="txt-warning">${row["Hadir Tidak Presensi"]}</span>` : '0';
      const strAlpa = (row["Alpa"] || 0) > 0 ? `<span class="txt-danger">${row["Alpa"]}</span>` : '0';

      const persenHadirVal = jmlSiswa ? ((jmlHadir / jmlSiswa) * 100).toFixed(1) : "0.0";
      const strPersenHadir = parseFloat(persenHadirVal) === 100.0 ? `<span class="txt-success">${persenHadirVal}%</span>` : `${persenHadirVal}%`;

      return '<tr><td>' + (i + 1) + '</td><td class="col-kelas">' + namaKelasFormatted + '</td><td class="col-summary">' + jmlSiswa + '</td><td>' + (row["Tepat Waktu"] || 0) + '</td><td>' + strTerlambat + '</td><td>' + strTidakPresensi + '</td><td class="col-summary"><strong>' + jmlHadir + '</strong></td><td>' + strPersenHadir + '</td><td>' + (row["Sakit"] || 0) + '</td><td>' + (row["Izin"] || 0) + '</td><td>' + strAlpa + '</td><td class="col-summary"><strong>' + jmlTH + '</strong></td><td>' + (jmlSiswa ? ((jmlTH / jmlSiswa) * 100).toFixed(1) : "0.0") + '%</td><td>' + (row["Daring"] || 0) + '</td><td>' + (row["Prakerin"] || 0) + '</td><td>' + (row["Libur"] || 0) + '</td><td>' + (jmlSiswa ? ((jmlKhusus / jmlSiswa) * 100).toFixed(1) : "0.0") + '%</td></tr>';
    }).join('') +
    '<tr class="total-row"><td colspan="2">JUMLAH</td><td>' + totalSiswaGlobal + '</td><td>' + (totalRekap["Tepat Waktu"] || 0) + '</td><td>' + (totalRekap["Terlambat"] || 0) + '</td><td>' + (totalRekap["Hadir Tidak Presensi"] || 0) + '</td><td>' + totalHadirGlobal + '</td><td>' + persenHadirGlobal + '%</td><td>' + (totalRekap["Sakit"] || 0) + '</td><td>' + (totalRekap["Izin"] || 0) + '</td><td>' + (totalRekap["Alpa"] || 0) + '</td><td>' + totalTidakHadirGlobal + '</td><td>' + persenTidakHadirGlobal + '%</td><td>' + (totalRekap["Daring"] || 0) + '</td><td>' + (totalRekap["Prakerin"] || 0) + '</td><td>' + (totalRekap["Libur"] || 0) + '</td><td>' + persenLainnyaGlobal + '%</td></tr>' +
    '</tbody></table>' +

    '<!-- 4. TANDA TANGAN PETUGAS PIKET DI PALING AKHIR MOVED HERE -->' +
    '<div class="signature-wrap"><div class="signature-title">Petugas Piket,</div><div class="signature-name">' + namaPetugas + '</div></div>' +

    '</body></html>';
}

// ==========================================
// RENDERER 2: HTML PORTRAIT (LAMPIRAN 2 - NORMAL CASE STATUS & BIGGER SIGNATURE SPACE)
// ==========================================
function buildHtmlPortrait(data) {
  const { displayDate, siswaByKelas, kelasRekap, statusGroups } = data;
  const mapWali = getMapWaliKelas();

  let html = '<html><head><style>' +
    '@page { size: A4 portrait; margin: 8mm 10mm; }' +
    'body { font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 9px; color: #000; margin: 0; padding: 0; }' +
    
    '/* Container Utama */' +
    '.page-container { width: 100%; margin: 0; }' +

    '/* Header Grid Dua Kolom (Judul Kiri, Ringkasan Kanan) */' +
    '.header-grid { display: table; width: 100%; margin-bottom: 14px; padding: 6px 10px 4px 10px; box-sizing: border-box; }' +
    '.header-left { display: table-cell; vertical-align: middle; text-align: left; }' +
    '.header-left h3 { font-size: 13.5px; font-weight: 800; margin: 0 0 3px 0; text-transform: uppercase; letter-spacing: 0.4px; }' +
    '.header-left p { font-size: 9px; font-weight: 600; margin: 0 0 1px 0; color: #334155; }' +
    
    '.header-right { display: table-cell; vertical-align: middle; text-align: right; }' +

    '/* Footnote Box/Ringkasan Header Compact Auto-fit */' +
    '.footnote-wrap { display: inline-block; padding: 5px 9px; background-color: #f8fafc; border: 1px dashed #64748b; border-radius: 5px; font-size: 8px; line-height: 1.5; text-align: left; }' +
    '.footnote-title { font-weight: 800; color: #0f172a; margin-bottom: 2px; text-transform: uppercase; font-size: 7.5px; letter-spacing: 0.3px; }' +
    '.footnote-row { margin-bottom: 1px; }' +
    '.sub-alert-warn { font-size: 7.5px; color: #b45309; background-color: #fef3c7; border: 1px solid #fde047; padding: 0px 4px; border-radius: 3px; font-weight: 700; margin-left: 3px; display: inline-block; }' +
    '.sub-alert-danger { font-size: 7.5px; color: #b91c1c; background-color: #fef2f2; border: 1px solid #fca5a5; padding: 0px 4px; border-radius: 3px; font-weight: 700; margin-left: 3px; display: inline-block; }' +

    '/* Wrapper khusus Tabel + TTD Rata Tengah sebagai satu kesatuan */' +
    '.table-section { display: table; margin: 0 auto; text-align: left; }' +

    '/* Tabel Data Siswa */' +
    'table { border-collapse: collapse; width: auto; font-size: 9px; margin-bottom: 10px; border: 1px solid #1e293b; }' +
    'th, td { padding: 3.5px 7px; text-align: center; vertical-align: middle; border: 1px solid #1e293b; white-space: nowrap; font-size: 9px; }' +
    'th { background-color: #e2e8f0; color: #000; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; }' +

    '/* Status Badge/Pill (text-transform: none agar tidak uppercase) */' +
    '.badge-status { padding: 1.5px 6px; border-radius: 3px; font-weight: 800; font-size: 8px; text-transform: none !important; display: inline-block; }' +
    '.badge-tepat { background-color: #dcfce7; color: #15803d; border: 1px solid #86efac; }' +
    '.badge-terlambat { background-color: #fef9c3; color: #a16207; border: 1px solid #fde047; }' +
    '.badge-sangat-terlambat { background-color: #ffedd5; color: #c2410c; border: 1px solid #fdba74; }' +
    '.badge-sangat-terlambat-sekali { background-color: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }' +
    '.badge-tidak-presensi { background-color: #fff7ed; color: #ea580c; border: 1px solid #ffedd5; }' +
    '.badge-sakit-izin { background-color: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }' +
    '.badge-alpa { background-color: #fef2f2; color: #991b1b; border: 1px solid #f87171; }' +
    '.badge-khusus { background-color: #f3e8ff; color: #6b21a8; border: 1px solid #e9d5ff; }' +

    '/* TTD Nempel di Kanan Bawah Tabel (Jarak TTD Dinaikkan ke 55px) */' +
    '.signature-wrap { width: 160px; margin-left: auto; margin-right: 20px; text-align: center; page-break-inside: avoid; }' +
    '.signature-title { font-size: 8.5px; color: #000; margin-bottom: 55px; font-weight: 600; line-height: 1.3; }' +
    '.signature-name { font-size: 9px; font-weight: 800; color: #000; }' +
    '</style></head><body>';

  const classKeys = Object.keys(siswaByKelas);

  classKeys.forEach((idRombel, idx) => {
    const listSiswa = siswaByKelas[idRombel] || [];
    const namaKelasFormatted = formatNamaKelas(idRombel, kelasRekap[idRombel] ? kelasRekap[idRombel].tingkat : undefined);
    const namaWaliKelas = mapWali[idRombel] || "-";

    const totalSiswaKelas = listSiswa.length;
    let countHadir = 0, countTerlambatTotal = 0, countTidakPresensi = 0;
    let countTidakHadir = 0, countAlpa = 0;

    listSiswa.forEach(s => {
      const st = (s.status || "").toLowerCase();
      if (st.includes("terlambat") || st === "tepat waktu" || st === "hadir tidak presensi") {
        countHadir++;
        if (st.includes("terlambat")) countTerlambatTotal++;
        if (st === "hadir tidak presensi") countTidakPresensi++;
      } else if (st === "sakit" || st === "izin" || st === "alpa") {
        countTidakHadir++;
        if (st === "alpa") countAlpa++;
      }
    });

    const pctHadir = totalSiswaKelas ? ((countHadir / totalSiswaKelas) * 100).toFixed(1) : "0.0";
    const pctTidakHadir = totalSiswaKelas ? ((countTidakHadir / totalSiswaKelas) * 100).toFixed(1) : "0.0";

    if (idx > 0) {
      html += '<div style="page-break-before: always; break-before: page;"></div>';
    }

    html += '<div class="page-container">' +
      '<!-- HEADER DUA KOLOM -->' +
      '<div class="header-grid">' +
        '<div class="header-left">' +
          '<h3>REKAP PRESENSI KELAS ' + namaKelasFormatted + '</h3>' +
          '<p>Hari, Tanggal: ' + displayDate + '</p>' +
          '<p>Wali Kelas: ' + namaWaliKelas + '</p>' +
        '</div>' +
        '<div class="header-right">' +
          '<div class="footnote-wrap">' +
            '<div class="footnote-title">📌 Ringkasan Kehadiran:</div>' +
            '<div class="footnote-row"><strong>Hadir:</strong> ' + countHadir + ' Siswa (' + pctHadir + '%)';
            
    if (countTerlambatTotal > 0) {
      html += '<span class="sub-alert-warn">⚠️ ' + countTerlambatTotal + ' Terlambat</span>';
    }
    if (countTidakPresensi > 0) {
      html += '<span class="sub-alert-warn">⚠️ ' + countTidakPresensi + ' Tidak Presensi</span>';
    }

    html += '</div>' +
            '<div class="footnote-row"><strong>Tidak Hadir:</strong> ' + countTidakHadir + ' Siswa (' + pctTidakHadir + '%)';

    if (countAlpa > 0) {
      html += '<span class="sub-alert-danger">🚨 ' + countAlpa + ' Alpa</span>';
    }

    html += '</div></div>' +
        '</div>' +
      '</div>' +

      '<!-- WRAPPER TABEL + TTD KE SIKU KANAN TABEL -->' +
      '<div class="table-section">' +
        '<table><thead><tr>' +
          '<th style="width: 28px;">No</th>' +
          '<th style="text-align: left; padding-left: 6px;">Nama Siswa</th>' +
          '<th style="width: 75px;">Jam Masuk</th>' +
          '<th style="width: 130px;">Status Presensi</th>' +
        '</tr></thead><tbody>';

    listSiswa.forEach((siswa, sIdx) => {
      const jamMasuk = siswa.jam_masuk || "-";
      const statusRaw = siswa.status || "-";
      let badgeClass = "badge-sakit-izin";

      const stLower = statusRaw.toLowerCase();
      if (stLower === "tepat waktu") badgeClass = "badge-tepat";
      else if (stLower === "terlambat") badgeClass = "badge-terlambat";
      else if (stLower === "sangat terlambat") badgeClass = "badge-sangat-terlambat";
      else if (stLower === "sangat terlambat sekali") badgeClass = "badge-sangat-terlambat-sekali";
      else if (stLower === "hadir tidak presensi") badgeClass = "badge-tidak-presensi";
      else if (stLower === "alpa") badgeClass = "badge-alpa";
      else if (stLower === "daring" || stLower === "prakerin" || stLower === "libur") badgeClass = "badge-khusus";

      html += '<tr>' +
        '<td>' + (sIdx + 1) + '</td>' +
        '<td style="text-align: left; padding-left: 6px;"><strong>' + siswa.nama + '</strong></td>' +
        '<td>' + jamMasuk + '</td>' +
        '<td><span class="badge-status ' + badgeClass + '">' + statusRaw + '</span></td>' +
      '</tr>';
    });

    html += '</tbody></table>' +

        '<!-- TTD NEMPEL DI KANAN TABEL -->' +
        '<div class="signature-wrap">' +
          '<div class="signature-title">Wali Kelas,</div>' +
          '<div class="signature-name">' + namaWaliKelas + '</div>' +
        '</div>' +
      '</div>' + // Close .table-section

    '</div>'; // Close .page-container
  });

  html += '</body></html>';
  return html;
}

function getLatestRekapUrl() {
  try {
    const ssMaster = SpreadsheetApp.getActiveSpreadsheet();
    const sheetLaporanName = SHEETS.LAPORAN_PRESENSI || "laporan_presensi";
    const sheet = ssMaster.getSheetByName(sheetLaporanName);
    
    if (!sheet) return null;
    
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return null; // Belum ada data selain header
    
    // Ambil URL di kolom C (file_laporan) pada baris terakhir
    const fileUrl = sheet.getRange(lastRow, 3).getValue();
    return String(fileUrl).trim();
  } catch (e) {
    Logger.log("Error getLatestRekapUrl: " + e.message);
    return null;
  }
}

/**
 * Helper untuk mengetes rekap & validasi status kosong hari ini (22/09/2026)
 */
function tesBuatRekapHariIni() {
  try {
    const hariIniStr = Utilities.formatDate(new Date(), TZ || "Asia/Jakarta", "yyyy-MM-dd");
    Logger.log(`🔄 [1/2] Mengecek status kosong untuk hari ini (${hariIniStr})...`);

    // 1. Tes Cek Status Kosong
    const jumlahKosong = cekStatusKosongHariIni(hariIniStr);
    Logger.log(`📊 Hasil Cek Kosong: Ada ${jumlahKosong} siswa yang belum presensi / kosong.`);

    // 2. Tes Generate Rekap PDF
    Logger.log(`🔄 [2/2] Memulai generate rekap PDF hari ini...`);
    const namaPetugas = "Admin Piket (Test Hari Ini)";
    const urlPdf = buatRekapPresensiHarian(namaPetugas, hariIniStr);

    Logger.log(`✅ SUKSES! Link PDF Rekap Hari Ini (${hariIniStr}):`);
    Logger.log(urlPdf);

  } catch (e) {
    Logger.log(`❌ Gagal jalankan tes: ${e.message}`);
  }
}

/**
 * Format Date ke String Indonesia (e.g. Senin, 21 September 2026)
 */
function formatTanggalIndonesia(date) {
  const hari = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const bulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  return hari[date.getDay()] + ", " + date.getDate() + " " + bulan[date.getMonth()] + " " + date.getFullYear();
}

/**
 * HELPER CONVERT ID_ROMBEL + TINGKAT -> NAMA KELAS DISPLAY
 * Contoh: ("AKN-A25", "XI") -> "AKN XI-A"
 */
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

/**
 * MENGOLAH DATA MASTER & MENGIRIM REKAP KE GRUP WA PIKET
 */
function kirimRekapPresensiWA(tanggal, namaPetugas, pdfUrlInput) {
  try {
    const config = getSystemConfig();
    const ss = getPresensiSpreadsheet(tanggal);
    
    const sheetMasterName = (typeof SHEETS !== 'undefined' && SHEETS.MASTER_PRESENSI) ? SHEETS.MASTER_PRESENSI : "master_presensi";
    const sheetMaster = ss.getSheetByName(sheetMasterName);

    if (!sheetMaster) {
      return { success: false, message: `Sheet '${sheetMasterName}' tidak ditemukan.` };
    }

    const idGrupPiket = config.wa_group_id_piket;
    if (!idGrupPiket) {
      return { success: false, message: "Gagal! 'wa_group_id_piket' belum diisi pada sheet 'config_sistem'." };
    }

    const pdfUrl = pdfUrlInput || (typeof getLatestRekapUrl === 'function' ? getLatestRekapUrl() : "") || "";

    let dateObj;
    if (tanggal && String(tanggal).includes("-")) {
      const p = String(tanggal).split("-");
      dateObj = (p[0].length === 4) 
        ? new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]))
        : new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]));
    } else {
      dateObj = new Date();
    }

    const tz = (typeof TZ !== 'undefined') ? TZ : Session.getScriptTimeZone() || "Asia/Jakarta";
    const tanggalSheet = Utilities.formatDate(dateObj, tz, "dd/MM/yyyy");
    const tanggalDisplay = (typeof formatTanggalIndonesia === 'function') ? formatTanggalIndonesia(dateObj) : tanggalSheet;

    /* =====================================
       1. MAPPING WALI KELAS (Key: id_rombel)
    ===================================== */
    const sheetWaliName = (typeof SHEETS !== 'undefined' && SHEETS.WALI_KELAS) ? SHEETS.WALI_KELAS : "wali_kelas";
    const sheetWali = ss.getSheetByName(sheetWaliName);
    const waliMap = {}; // Key-nya id_rombel (contoh: "AKN-A25")

    if (sheetWali) {
      const dataWali = sheetWali.getDataRange().getValues();
      if (dataWali.length > 1) {
        const headerW = dataWali.shift();
        const headerWClean = headerW.map(h => String(h || "").toLowerCase().trim());
        
        const idxKelas = headerWClean.indexOf("id_rombel") !== -1 
          ? headerWClean.indexOf("id_rombel") 
          : headerWClean.indexOf("kelas");
          
        const idxNama = headerWClean.indexOf("nama_wali_kelas") !== -1 
          ? headerWClean.indexOf("nama_wali_kelas") 
          : headerWClean.indexOf("nama wali kelas");

        if (idxKelas !== -1 && idxNama !== -1) {
          dataWali.forEach(row => {
            const rombel = String(row[idxKelas] || "").trim().toUpperCase();
            const nama   = String(row[idxNama] || "").trim();
            if (rombel && nama) {
              waliMap[rombel] = nama;
            }
          });
        }
      }
    }

    /* =====================================
       2. AMBIL & HITUNG DATA MASTER
    ===================================== */
    const rangeMaster = `'${sheetMasterName}'!A:L`;
    const resMaster = Sheets.Spreadsheets.Values.get(ss.getId(), rangeMaster);
    const dataMaster = resMaster ? resMaster.values : null;

    if (!dataMaster || dataMaster.length <= 1) {
      return { success: false, message: "Data master presensi kosong!" };
    }

    const header = dataMaster[0].map(h => String(h).toLowerCase().trim());
    const rows = dataMaster.slice(1);

    const idxTanggal = header.indexOf("tanggal");
    const idxKelas   = header.indexOf("id_rombel") !== -1 ? header.indexOf("id_rombel") : header.indexOf("kelas");
    const idxTingkat = header.indexOf("tingkat");
    const idxStatus  = header.indexOf("status_masuk");

    if (idxTanggal === -1 || idxKelas === -1 || idxStatus === -1) {
      return { success: false, message: "Header kolom pada master presensi tidak lengkap." };
    }

    const mapTingkat = {};
    let totalSiswaGlobal = 0, totalHadirGlobal = 0, totalTidakHadirGlobal = 0;
    let totalPrakerinGlobal = 0, totalTidakScanGlobal = 0;
    let totalTerlambatGlobal = 0, totalSangatGlobal = 0, totalSangatSekaliGlobal = 0;
    let totalAlpaGlobal = 0, totalSakitGlobal = 0, totalIzinGlobal = 0;

    rows.forEach(row => {
      let tgl = row[idxTanggal];
      let tglStr = (tgl instanceof Date) ? Utilities.formatDate(tgl, tz, "dd/MM/yyyy") : String(tgl || "").trim();
      if (tglStr !== tanggalSheet) return;

      const idRombel = String(row[idxKelas] || "").trim().toUpperCase();
      let tingkat = idxTingkat !== -1 ? String(row[idxTingkat] || "").trim().toUpperCase() : "";
      const st = String(row[idxStatus] || "").trim();

      if (!idRombel) return;

      if (!tingkat) {
        if (idRombel.includes(" X-") || idRombel.includes(" X ")) tingkat = "X";
        else if (idRombel.includes(" XI-") || idRombel.includes(" XI ")) tingkat = "XI";
        else if (idRombel.includes(" XII-") || idRombel.includes(" XII ")) tingkat = "XII";
        else tingkat = "LAINNYA";
      }

      if (!mapTingkat[tingkat]) mapTingkat[tingkat] = {};
      if (!mapTingkat[tingkat][idRombel]) {
        mapTingkat[tingkat][idRombel] = {
          total: 0, hadir: 0, tidakScan: 0, terlambat: 0, sangatTerlambat: 0, sangatSekali: 0,
          tidakHadir: 0, alpa: 0, sakit: 0, izin: 0, prakerin: 0, libur: 0
        };
      }

      const rec = mapTingkat[tingkat][idRombel];
      rec.total++;
      totalSiswaGlobal++;

      if (["Tepat Waktu", "Terlambat", "Sangat Terlambat", "Sangat Terlambat Sekali", "Hadir Tidak Presensi"].includes(st)) {
        rec.hadir++;
        totalHadirGlobal++;

        if (st === "Hadir Tidak Presensi") {
          rec.tidakScan++;
          totalTidakScanGlobal++;
        } else if (st === "Terlambat") {
          rec.terlambat++;
          totalTerlambatGlobal++;
        } else if (st === "Sangat Terlambat") {
          rec.sangatTerlambat++;
          totalSangatGlobal++;
        } else if (st === "Sangat Terlambat Sekali") {
          rec.sangatSekali++;
          totalSangatSekaliGlobal++;
        }
      } else if (["Sakit", "Izin", "Alpa"].includes(st)) {
        rec.tidakHadir++;
        totalTidakHadirGlobal++;
        if (st === "Alpa") { rec.alpa++; totalAlpaGlobal++; }
        if (st === "Sakit") { rec.sakit++; totalSakitGlobal++; }
        if (st === "Izin") { rec.izin++; totalIzinGlobal++; }
      } else if (st.toLowerCase().includes("prakerin") || st.toLowerCase().includes("pkl")) {
        rec.prakerin++;
        totalPrakerinGlobal++;
      } else if (st === "Libur") {
        rec.libur++;
      }
    });

    const daftarTingkat = Object.keys(mapTingkat).sort();
    if (daftarTingkat.length === 0 || totalSiswaGlobal === 0) {
      return { success: false, message: "Tidak ada data presensi untuk tanggal ini." };
    }

    const daftarPesanKirim = [];

    /* =====================================
       3. PESAN 1: SUMMARY GLOBAL UTAMA
    ===================================== */
    const persenHadirGlobal    = Math.round((totalHadirGlobal / totalSiswaGlobal) * 100);
    const persenTHGlobal       = Math.round((totalTidakHadirGlobal / totalSiswaGlobal) * 100);
    const persenPrakerinGlobal = Math.round((totalPrakerinGlobal / totalSiswaGlobal) * 100);

    let pesanSummary = `Rekap Presensi Siswa, ${tanggalDisplay}\n`;
    pesanSummary += `Piket: ${namaPetugas || "Portal Piket"}\n`;
    pesanSummary += `===============================\n\n`;
    pesanSummary += `👥 *Total Siswa:* ${totalSiswaGlobal} Siswa\n`;
    pesanSummary += `✅ *Total Hadir:* ${totalHadirGlobal} Siswa (${persenHadirGlobal}%)\n`;
    pesanSummary += `❌ *Total Tidak Hadir:* ${totalTidakHadirGlobal} Siswa (${persenTHGlobal}%)\n`;
    
    if (totalPrakerinGlobal > 0) {
      pesanSummary += `💼 *Prakerin:* ${totalPrakerinGlobal} Siswa (${persenPrakerinGlobal}%)\n`;
    }
    
    pesanSummary += `\n*Rincian Ketidakhadiran:*\n`;
    if (totalTidakHadirGlobal === 0) {
      pesanSummary += `• Seluruh Siswa Hadir 🌟\n\n`;
    } else {
      pesanSummary += `• ${totalAlpaGlobal} Alpa\n`;
      pesanSummary += `• ${totalSakitGlobal} Sakit\n`;
      pesanSummary += `• ${totalIzinGlobal} Izin\n\n`;
    }

    pesanSummary += `*Rincian Kehadiran:*\n`;
    const scanStr = totalTidakScanGlobal > 0 ? `${totalTidakScanGlobal} Siswa Tidak Scan` : "Seluruh Siswa Scan 🌟";
    pesanSummary += `• ${scanStr}\n`;
    
    const totalLateGlobal = totalTerlambatGlobal + totalSangatGlobal + totalSangatSekaliGlobal;
    if (totalLateGlobal === 0) {
      pesanSummary += `• Seluruh Siswa Tepat Waktu 🌟\n\n`;
    } else {
      pesanSummary += `• ${totalTerlambatGlobal} Terlambat\n`;
      pesanSummary += `• ${totalSangatGlobal} Sangat Terlambat\n`;
      pesanSummary += `• ${totalSangatSekaliGlobal} Sangat Terlambat Sekali\n\n`;
    }

    pesanSummary += `===============================\n`;
    if (pdfUrl) pesanSummary += `📄 *PDF Rekap:* ${pdfUrl}\n`;
    pesanSummary += `🌐 *Portal Monitoring:* s.id/PresensiMedCom-Monitoring`;

    daftarPesanKirim.push(pesanSummary);

    /* =====================================
       4. PESAN RINCIAN PER KELAS (FORMAT DENGAN WALI & NAMA KELAS)
    ===================================== */
    daftarTingkat.forEach(tingkat => {
      const mapKelas = mapTingkat[tingkat];
      const daftarKelas = Object.keys(mapKelas).sort();
      const kelasAktif = daftarKelas.filter(k => mapKelas[k].hadir > 0);
      if (kelasAktif.length === 0) return;

      let pesan = "";
      kelasAktif.forEach((idRombel, idx) => {
        const rec = mapKelas[idRombel];
        
        // 🔥 GUnakan formatNamaKelas agar id_rombel "AKN-A25" berubah jadi "AKN XI-A"
        const namaDisplayKelas = formatNamaKelas(idRombel, tingkat);
        
        // 🔥 Cari Wali Kelas berdasarkan id_rombel ("AKN-A25")
        const namaWaliStr = waliMap[idRombel] ? ` (${waliMap[idRombel]})` : "";
        
        let pesanScan = (rec.tidakScan === 0) ? "Seluruh Siswa Scan 🌟" : `*${rec.tidakScan} SISWA TIDAK SCAN*`;

        let pesanTerlambat = "";
        const totalLate = rec.terlambat + rec.sangatTerlambat + rec.sangatSekali;
        if (totalLate === 0) {
          pesanTerlambat = "Seluruh Siswa Tepat Waktu 🌟";
        } else {
          const arrLate = [];
          if (rec.terlambat > 0) arrLate.push(`${rec.terlambat} Terlambat`);
          if (rec.sangatTerlambat > 0) arrLate.push(`${rec.sangatTerlambat} Sangat Terlambat`);
          if (rec.sangatSekali > 0) arrLate.push(`${rec.sangatSekali} Sangat Terlambat Sekali`);
          pesanTerlambat = arrLate.join(", ");
        }

        let rincianTidakHadir = "";
        if (rec.tidakHadir > 0) {
          const arrTH = [];
          if (rec.alpa > 0) arrTH.push(`*${rec.alpa} ALPA*`);
          if (rec.sakit > 0) arrTH.push(`${rec.sakit} Sakit`);
          if (rec.izin > 0) arrTH.push(`${rec.izin} Izin`);
          rincianTidakHadir = `\n• ${arrTH.join(", ")}`;
        }

        let rawPersen = rec.total > 0 ? (rec.hadir / rec.total) * 100 : 0;
        let persenStr = (rawPersen === 100) ? "100% 🌟" : `${rawPersen.toFixed(1)}%`;

        pesan += `*${namaDisplayKelas}*${namaWaliStr}\n`;
        pesan += `*Total Hadir:* ${rec.hadir} Siswa\n`;
        pesan += `• ${pesanScan}\n`;
        pesan += `• ${pesanTerlambat}\n`;
        pesan += `*Total Tidak Hadir:* ${rec.tidakHadir} Siswa${rincianTidakHadir}\n`;
        pesan += `*Persentase Kehadiran:* ${persenStr}`;

        if (idx < kelasAktif.length - 1) {
          pesan += `\n\n`;
        }
      });

      if (pesan.trim()) {
        daftarPesanKirim.push(pesan.trim());
      }
    });

    /* =====================================
       5. KIRIM VIA ENGINE sendWA (JEDA SINKRON)
    ===================================== */
    let suksesKirim = 0;
    let gagalKirim = 0;

    for (let i = 0; i < daftarPesanKirim.length; i++) {
      const teksPesan = daftarPesanKirim[i];
      const hasil = sendWA(idGrupPiket, teksPesan);
      if (hasil && hasil.success) {
        suksesKirim++;
      } else {
        gagalKirim++;
      }

      if (i < daftarPesanKirim.length - 1) {
        Utilities.sleep(5000); // Jeda 5 detik
      }
    }

    if (suksesKirim > 0) {
      return { 
        success: true, 
        message: `${suksesKirim} dari ${daftarPesanKirim.length} rekap pesan berhasil dikirim beruntutan ke WhatsApp!` 
      };
    } else {
      return { 
        success: false, 
        message: "Gagal mengirim rekap pesan ke WhatsApp." 
      };
    }

  } catch (err) {
    Logger.log("❌ Error kirimRekapPresensiWA: " + err.message);
    return { 
      success: false, 
      message: err.message || err.toString() 
    };
  }
}
