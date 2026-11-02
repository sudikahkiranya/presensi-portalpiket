/**
 * ============================================================================
 * MAIN BACKEND APPS SCRIPT (PORTAL PIKET, SCANNER VERCEL, & PORTAL SISWA)
 * ============================================================================
 */

/* =========================================================
   1. MAIN API HANDLERS (doPost & doGet)
========================================================= */

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    let responseData = {};

    switch (action) {
      // --- PORTAL PIKET ---
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

      // --- PORTAL SISWA ---
      case "loginSiswa":
      case "verifikasiLoginSiswa":
        responseData = verifikasiLoginSiswa(data.idSiswa || data.id, data.kodeAkses || data.kode);
        break;
      case "getMasterDataSiswaApi":
        responseData = getMasterDataSiswaApi(data.idSiswa || data.nis);
        break;

      // --- SCANNER APP VERCEL ---
      case "getScannerDashboardData":
        responseData = typeof getScannerDashboardData === "function" 
          ? getScannerDashboardData() 
          : { success: false, message: "Fungsi getScannerDashboardData belum dibuat" };
        break;
      case "scannerRecordScan":
        responseData = typeof scannerRecordScan === "function"
          ? scannerRecordScan(data.payload)
          : { success: false, message: "Fungsi scannerRecordScan belum dibuat" };
        break;
      case "scannerGetStudents":
        responseData = typeof getScannerStudents === "function"
          ? getScannerStudents(!!data.forceRefresh)
          : { success: false, message: "Fungsi getScannerStudents belum dibuat" };
        break;
      case "scannerVerifySettingsPin":
        responseData = typeof scannerVerifySettingsPin === "function"
          ? scannerVerifySettingsPin(data.pin)
          : { success: false, message: "Fungsi scannerVerifySettingsPin belum dibuat" };
        break;
      case "scannerVerifySuperAdminPin":
        responseData = typeof scannerVerifySuperAdminPin === "function"
          ? scannerVerifySuperAdminPin(data.pin)
          : { success: false, message: "Fungsi scannerVerifySuperAdminPin belum dibuat" };
        break;
      case "scannerGetProtectionSettings":
        responseData = typeof scannerGetProtectionSettings === "function"
          ? scannerGetProtectionSettings()
          : { success: false, message: "Fungsi scannerGetProtectionSettings belum dibuat" };
        break;
      case "scannerSaveProtectionSettings":
        responseData = typeof scannerSaveProtectionSettings === "function"
          ? scannerSaveProtectionSettings(data.config, data.token)
          : { success: false, message: "Fungsi scannerSaveProtectionSettings belum dibuat" };
        break;
      case "scannerSetJamOverrideStatus":
        responseData = typeof scannerSetJamOverrideStatus === "function"
          ? scannerSetJamOverrideStatus(data.enabled, data.dateKey, data.token)
          : { success: false, message: "Fungsi scannerSetJamOverrideStatus belum dibuat" };
        break;

      default:  
        responseData = { success: false, message: "Action POST tidak dikenali: " + action };
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
    const params = (e && e.parameter) ? e.parameter : {};

    // Route: Portal Siswa
    if (params.page === "siswa" || (!params.page && !params.action)) {
      const template = HtmlService.createTemplateFromFile("fe_login_siswa");
      template.logoSekolah = "https://i.imgur.com/rXQPXZw.png"; 
      
      return template.evaluate()
        .setTitle("Portal Presensi Siswa | SMK MedikaCom")
        .setFaviconUrl("https://i.imgur.com/rXQPXZw.png")
        .addMetaTag("viewport", "width=device-width, initial-scale=1.0, maximum-scale=1.0");
    }

    // Route: Scanner Presensi
    if (params.page === "scanner") {
      return HtmlService
        .createHtmlOutputFromFile("Scanner")
        .setTitle("Presensi SMK MedikaCom")
        .setFaviconUrl("https://i.imgur.com/rXQPXZw.png")
        .addMetaTag("viewport", "width=device-width, initial-scale=1.0");
    }

    // ROUTING API JSON
    const action = params.action || "";
    let responseData = {};

    switch (action) {
      // --- PORTAL SISWA ---
      case "getPresensiHariIniSiswa":
      case "getPresensiHariIni":
        responseData = getPresensiHariIni(params.nis || params.idSiswa);
        break;

      case "getRekapTotalByNIS":
        responseData = getRekapTotalByNIS(params.nis || params.idSiswa);
        break;

      case "getSemuaPresensiSiswa":
        responseData = getSemuaPresensiSiswa(params.nis || params.idSiswa);
        break;

      case "getMasterDataSiswaApi":
        responseData = getMasterDataSiswaApi(params.nis || params.idSiswa);
        break;

      // --- PORTAL PIKET & ENGINE ---
      case "getSiswaHariIni":
        responseData = getSiswaHariIni();
        break;

      case "getSiswaByTanggal":
        responseData = getSiswaByTanggal(params.tanggal);
        break;

      case "getSinkronisasiTerakhir":
        responseData = getSinkronisasiTerakhir(params.tanggal);
        break;

      case "cekStatusKosongHariIni":
        responseData = {
          success: true,
          result: cekStatusKosongHariIni(params.tanggal)
        };
        break;

      case "buatRekapPresensiHarian":
        try {
          const pdfUrlResult = buatRekapPresensiHarian(params.namaPetugas, params.tanggal);
          if (pdfUrlResult && typeof pdfUrlResult.then === "function") {
            pdfUrlResult.catch(function(err) { Logger.log("❌ Error Background PDF: " + err); });
            SpreadsheetApp.flush();
            const latestUrl = getLatestRekapUrl();
            responseData = { success: true, result: latestUrl || "https://drive.google.com/drive/folders/16TQT8GmnrYzmqam-UK59G4q6rfx6Lkoa" };
          } else {
            responseData = { success: true, result: pdfUrlResult };
          }
        } catch (err) {
          responseData = { success: false, message: err.message || err.toString() };
        }
        break;

      case "kirimRekapGrupWA":
        try {
          responseData = kirimRekapPresensiWA(params.tanggal || "", params.namaPetugas || "Petugas Piket", params.pdfUrl || "");
        } catch (err) {
          responseData = { success: false, message: err.message || err.toString() };
        }
        break;

      case "tarikDataEngine":
        responseData = pemicuTarikDataPool();
        break;

      case "scannerGetStudents":
        responseData = getScannerStudents(String(params.forceRefresh || "") === "true");
        break;

      case "scannerGetSchedule":
        responseData = scannerGetSchedule();
        break;

      default:
        responseData = { success: false, message: "Action GET tidak dikenali." };
    }

    return ContentService
      .createTextOutput(JSON.stringify(responseData))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, message: err.message || err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/* =========================================================
   2. HELPER LOADER HTML PORTAL SISWA
========================================================= */

function loadFormSiswa() {
  const assets = typeof getAssets === "function" ? getAssets() : {};
  const config = typeof getSystemConfig === "function" ? getSystemConfig() : {};
  
  const template = HtmlService.createTemplateFromFile("fe_portal_siswa");
  
  template.templateQr = assets.templateQr || config.template_qr_url || "https://i.imgur.com/hqZ98He.jpeg";
  template.logoPolos = config.logo_sekolah_url || "https://i.imgur.com/rXQPXZw.png";
  
  return template.evaluate().getContent();
}

function loadFormLoginSiswa() {
  const config = typeof getSystemConfig === "function" ? getSystemConfig() : {};
  const template = HtmlService.createTemplateFromFile("fe_login_siswa");
  
  template.logoSekolah = config.logo_sekolah_url || "https://i.imgur.com/rXQPXZw.png";
  
  return template.evaluate().getContent();
}

/* =========================================================
   3. LOGIKA SPESIFIK PORTAL SISWA (100% SHEETS API v4)
========================================================= */

/**
 * Dynamic Column Finder Helper
 */
function findDynamicIdx_(headers, candidateNames) {
  if (!headers || !Array.isArray(headers)) return -1;
  return headers.findIndex(h => candidateNames.includes(String(h).trim().toLowerCase()));
}

/**
 * 1. VERIFIKASI LOGIN SISWA (Sheets API v4)
 */
function verifikasiLoginSiswa(idSiswa, kodeAkses) {
  try {
    const masterSpreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
    const range = "master_siswa_aktif!A1:Z";
    
    const response = Sheets.Spreadsheets.Values.get(masterSpreadsheetId, range);
    const rows = response.values;
    
    if (!rows || rows.length <= 1) {
      return { success: false, message: "Sheet master_siswa_aktif kosong/tidak ditemukan." };
    }

    const headers = rows[0];
    const idxSiswaId = findDynamicIdx_(headers, ["id_siswa", "nis", "nisn", "no_siswa"]);
    const idxNama = findDynamicIdx_(headers, ["nama", "nama_siswa", "nama_lengkap"]);
    const idxRombel = findDynamicIdx_(headers, ["id_rombel", "rombel", "kelas"]);
    const idxTingkat = findDynamicIdx_(headers, ["tingkat", "level"]);
    const idxStatus = findDynamicIdx_(headers, ["status", "status_siswa"]);
    const idxKode = findDynamicIdx_(headers, ["kode_akses", "password", "pin", "kode"]);
    const idxNoSiswa = findDynamicIdx_(headers, ["no_siswa", "hp_siswa", "telepon_siswa"]);
    const idxNoOrtu = findDynamicIdx_(headers, ["no_ortu", "hp_ortu", "telepon_ortu"]);
    const idxFoto = findDynamicIdx_(headers, ["foto", "foto_siswa", "url_foto"]);

    const searchId = String(idSiswa || "").trim();
    const searchKode = String(kodeAkses || "").trim();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const cId = idxSiswaId !== -1 ? String(row[idxSiswaId] || "").trim() : "";
      const cKode = idxKode !== -1 ? String(row[idxKode] || "").trim() : "";
      const cStatus = idxStatus !== -1 ? String(row[idxStatus] || "").trim().toLowerCase() : "aktif";

      if (cId === searchId && cKode === searchKode && cStatus === "aktif") {
        const idRombelVal = idxRombel !== -1 ? String(row[idxRombel] || "") : "";
        const tingkatVal = idxTingkat !== -1 ? String(row[idxTingkat] || "") : "";

        return {
          success: true,
          siswa: {
            id_siswa: cId,
            nama: idxNama !== -1 ? String(row[idxNama] || "") : "Siswa",
            id_rombel: idRombelVal,
            kelas: formatNamaKelas(idRombelVal, tingkatVal),
            tingkat: tingkatVal,
            noSiswa: idxNoSiswa !== -1 ? String(row[idxNoSiswa] || "") : "-",
            noOrtu: idxNoOrtu !== -1 ? String(row[idxNoOrtu] || "") : "-",
            foto: idxFoto !== -1 ? String(row[idxFoto] || "") : ""
          }
        };
      }
    }

    return { success: false, message: "ID Siswa atau Password salah!" };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

/**
 * 2. GET PRESENSI HARI INI (Sheets API v4 - Ultra Fast)
 */
function getPresensiHariIni(idSiswa) {
  try {
    const masterSpreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
    
    // Step A: Baca config_semester via Sheets API v4
    const configResponse = Sheets.Spreadsheets.Values.get(masterSpreadsheetId, "config_semester!A1:H");
    const configRows = configResponse.values;
    if (!configRows || configRows.length <= 1) return buildEmptyResponseSiswa_();

    const cHeaders = configRows[0];
    const idxStatus = findDynamicIdx_(cHeaders, ["status", "status_semester"]);
    const idxFileId = findDynamicIdx_(cHeaders, ["file_id_spreadsheet", "file_id", "spreadsheet_id"]);
    
    let activeFileId = "";
    for (let i = 1; i < configRows.length; i++) {
      const st = idxStatus !== -1 ? String(configRows[i][idxStatus] || "").toUpperCase() : "";
      if (st === "AKTIF") {
        activeFileId = idxFileId !== -1 ? String(configRows[i][idxFileId] || "").trim() : "";
        break;
      }
    }

    if (!activeFileId) return buildEmptyResponseSiswa_();

    // Step B: Baca Meta Sheet Pertama dari Target Spreadsheet via Sheets API
    const targetMeta = Sheets.Spreadsheets.get(activeFileId);
    const targetSheetName = targetMeta.sheets[0].properties.title;

    // Step C: Read data transaksi via Sheets API
    const presensiResponse = Sheets.Spreadsheets.Values.get(activeFileId, `'${targetSheetName}'!A1:Z`, {
      valueRenderOption: "FORMATTED_VALUE"
    });
    const rows = presensiResponse.values;
    if (!rows || rows.length <= 1) return buildEmptyResponseSiswa_();

    const pHeaders = rows[0];
    const idxNIS = findDynamicIdx_(pHeaders, ["nis", "id_siswa", "nisn", "no_siswa"]);
    const idxTanggal = findDynamicIdx_(pHeaders, ["tanggal", "date", "tgl"]);
    const idxNama = findDynamicIdx_(pHeaders, ["nama", "nama_siswa"]);
    const idxRombel = findDynamicIdx_(pHeaders, ["id_rombel", "rombel", "kelas"]);
    const idxTingkat = findDynamicIdx_(pHeaders, ["tingkat", "level"]);
    const idxMasuk = findDynamicIdx_(pHeaders, ["jam masuk", "jam_masuk", "masuk"]);
    const idxStatusMasuk = findDynamicIdx_(pHeaders, ["status masuk", "status_masuk", "status"]);
    const idxPulang = findDynamicIdx_(pHeaders, ["jam pulang", "jam_pulang", "pulang"]);
    const idxStatusPulang = findDynamicIdx_(pHeaders, ["status pulang", "status_pulang"]);
    const idxKet = findDynamicIdx_(pHeaders, ["keterangan", "ket"]);

    const tz = Session.getScriptTimeZone() || "Asia/Jakarta";
    const now = new Date();
    const todayStr = Utilities.formatDate(now, tz, "dd/MM/yyyy");
    const searchNis = String(idSiswa || "").trim();

    // Loop reverse untuk mendapatkan record transaksi terbaru hari ini
    for (let j = rows.length - 1; j >= 1; j--) {
      const r = rows[j];
      const cellNis = idxNIS !== -1 ? String(r[idxNIS] || "").trim() : "";
      const cellTgl = idxTanggal !== -1 ? String(r[idxTanggal] || "").trim() : "";

      if (cellNis === searchNis) {
        return {
          success: true,
          tanggalFormatted: cellTgl || formatTanggalIndonesia(now),
          nama: idxNama !== -1 ? String(r[idxNama] || "") : "",
          kelas: formatNamaKelas(idxRombel !== -1 ? r[idxRombel] : "", idxTingkat !== -1 ? r[idxTingkat] : ""),
          jamMasuk: idxMasuk !== -1 ? (r[idxMasuk] || "-") : "-",
          statusMasuk: idxStatusMasuk !== -1 ? (r[idxStatusMasuk] || "-") : "-",
          jamPulang: idxPulang !== -1 ? (r[idxPulang] || "-") : "-",
          statusPulang: idxStatusPulang !== -1 ? (r[idxStatusPulang] || "Belum Presensi") : "Belum Presensi",
          keterangan: idxKet !== -1 ? (r[idxKet] || "-") : "-"
        };
      }
    }

  } catch (err) {
    Logger.log("❌ Error getPresensiHariIni (Sheets API): " + err.toString());
  }

  return buildEmptyResponseSiswa_();
}

/**
 * 3. GET REKAP TOTAL STATISTIK BY NIS (Sheets API v4)
 */
function getRekapTotalByNIS(idSiswa) {
  try {
    const masterSpreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
    
    // Ambil file_id_spreadsheet semester aktif via Sheets API
    const configResponse = Sheets.Spreadsheets.Values.get(masterSpreadsheetId, "config_semester!A1:H");
    const configRows = configResponse.values;
    if (!configRows || configRows.length <= 1) return { sukses: false, message: "Config semester kosong." };

    const cHeaders = configRows[0];
    const idxStatus = findDynamicIdx_(cHeaders, ["status", "status_semester"]);
    const idxFileId = findDynamicIdx_(cHeaders, ["file_id_spreadsheet", "file_id", "spreadsheet_id"]);

    let activeFileId = "";
    for (let i = 1; i < configRows.length; i++) {
      if (idxStatus !== -1 && String(configRows[i][idxStatus] || "").toUpperCase() === "AKTIF") {
        activeFileId = idxFileId !== -1 ? String(configRows[i][idxFileId] || "").trim() : "";
        break;
      }
    }

    if (!activeFileId) return { sukses: false, message: "Semester aktif tidak ditemukan." };

    const targetMeta = Sheets.Spreadsheets.get(activeFileId);
    const targetSheetName = targetMeta.sheets[0].properties.title;

    const response = Sheets.Spreadsheets.Values.get(activeFileId, `'${targetSheetName}'!A1:Z`, {
      valueRenderOption: "FORMATTED_VALUE"
    });

    const rows = response.values;
    if (!rows || rows.length <= 1) return { sukses: false, message: "Data presensi kosong." };

    const pHeaders = rows[0];
    const idxNIS = findDynamicIdx_(pHeaders, ["nis", "id_siswa", "nisn", "no_siswa"]);
    const idxStatusMasuk = findDynamicIdx_(pHeaders, ["status masuk", "status_masuk", "status"]);

    const searchNis = String(idSiswa || "").trim();
    let tepatWaktu = 0, terlambat = 0, htp = 0, sakit = 0, izin = 0, alpa = 0, prakerin = 0;

    for (let j = 1; j < rows.length; j++) {
      const row = rows[j];
      if (idxNIS !== -1 && String(row[idxNIS] || "").trim() === searchNis) {
        const st = idxStatusMasuk !== -1 ? String(row[idxStatusMasuk] || "").trim().toLowerCase() : "";
        
        if (st === "tepat waktu" || st.includes("tepat")) tepatWaktu++;
        else if (st.includes("terlambat")) terlambat++;
        else if (st.includes("tidak presensi")) htp++;
        else if (st.includes("sakit")) sakit++;
        else if (st.includes("izin")) izin++;
        else if (st.includes("alpa")) alpa++;
        else if (st.includes("prakerin") || st.includes("pkl") || st.includes("dispensasi")) prakerin++;
      }
    }

    return {
      sukses: true,
      tepatWaktu: tepatWaktu,
      terlambat: terlambat,
      tidakPresensi: htp,
      daring: prakerin,
      totalHadir: tepatWaktu + terlambat + htp,
      sakit: sakit,
      izin: izin,
      alpa: alpa,
      totalTidakHadir: sakit + izin + alpa
    };
  } catch (err) {
    return { sukses: false, message: err.toString() };
  }
}

/**
 * 4. GET SEMUA PRESENSI SISWA (Sheets API v4)
 */
function getSemuaPresensiSiswa(idSiswa) {
  try {
    const collectorRes = getMasterDataSiswaApi(idSiswa);
    if (collectorRes && collectorRes.success) {
      return collectorRes.rawPresensi.reverse();
    }
  } catch (err) {
    Logger.log("❌ Error getSemuaPresensiSiswa: " + err.toString());
  }
  return [];
}

function buildEmptyResponseSiswa_() {
  return {
    success: true,
    tanggalFormatted: formatTanggalIndonesia(new Date()),
    nama: "",
    kelas: "-",
    jamMasuk: "-",
    statusMasuk: "Belum Presensi",
    jamPulang: "-",
    statusPulang: "Belum Presensi",
    keterangan: "-"
  };
}

/**
 * Helper: Konversi ID Rombel (misal: AKN-A26) -> Nama Kelas Resmi (misal: AKN X-A)
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
 * HELPER FORMAT TANGGAL INDONESIA
 */
function formatTanggalIndonesia(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    date = new Date();
  }
  const hari = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const bulan = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni", 
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  return hari[date.getDay()] + ", " + date.getDate() + " " + bulan[date.getMonth()] + " " + date.getFullYear();
}

/**
 * Collector Utama Menggunakan Google Sheets API (100% Dynamic Header Matcher & Multi-Semester)
 */
function getMasterDataSiswaApi(idSiswa) {
  const logTracker = [];
  
  try {
    const masterSpreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
    
    // STEP 1: READ PROFIL SISWA DARI master_siswa_aktif
    const masterRange = "master_siswa_aktif!A1:Z";
    const masterResponse = Sheets.Spreadsheets.Values.get(masterSpreadsheetId, masterRange);
    const masterRows = masterResponse.values;

    if (!masterRows || masterRows.length <= 1) {
      throw new Error("Sheet master_siswa_aktif kosong/tidak ditemukan.");
    }

    const mHeaders = masterRows[0];
    const idxSiswaId = findDynamicIdx_(mHeaders, ["id_siswa", "nis", "nisn", "no_siswa"]);
    const idxRombel = findDynamicIdx_(mHeaders, ["id_rombel", "rombel", "kelas"]);

    let idRombelSiswa = "";
    for (let i = 1; i < masterRows.length; i++) {
      if (idxSiswaId !== -1 && String(masterRows[i][idxSiswaId]).trim() === String(idSiswa).trim()) {
        idRombelSiswa = idxRombel !== -1 ? String(masterRows[i][idxRombel]).trim() : "";
        break;
      }
    }

    let tahunMasukSiswa = 0;
    if (idRombelSiswa) {
      const matchYear = idRombelSiswa.match(/\d{2}$/);
      if (matchYear) {
        tahunMasukSiswa = parseInt("20" + matchYear[0], 10);
      }
    }

    logTracker.push(`👤 [PROFIL] Siswa ID: ${idSiswa} | Rombel: '${idRombelSiswa}' | Tahun Masuk: ${tahunMasukSiswa || 'Auto-detect'}`);

    // STEP 2: READ & FILTER config_semester
    const configRange = "config_semester!A1:H";
    const configResponse = Sheets.Spreadsheets.Values.get(masterSpreadsheetId, configRange);
    const configRows = configResponse.values;

    if (!configRows || configRows.length <= 1) {
      throw new Error("Sheet config_semester kosong/tidak ditemukan.");
    }

    const configHeaders = configRows[0];
    const idxTa = findDynamicIdx_(configHeaders, ["tahun_ajaran", "ta", "thn_ajaran"]);
    const idxSemName = findDynamicIdx_(configHeaders, ["nama_semester", "semester", "sem"]);
    const idxStatus = findDynamicIdx_(configHeaders, ["status", "status_semester"]);
    const idxFileId = findDynamicIdx_(configHeaders, ["file_id_spreadsheet", "file_id", "spreadsheet_id"]);

    const taSet = new Set();
    const semesterMap = {};
    const semesterList = [];
    let activeSemesterConfig = null;

    for (let i = 1; i < configRows.length; i++) {
      const row = configRows[i];
      const ta = idxTa !== -1 ? row[idxTa] : null;
      const sem = idxSemName !== -1 ? row[idxSemName] : null;
      const status = idxStatus !== -1 ? row[idxStatus] : null;
      const fileId = idxFileId !== -1 ? row[idxFileId] : null;

      if (!ta || !sem) continue;

      const startYearTa = parseInt(String(ta).split("/")[0], 10);

      if (tahunMasukSiswa > 0 && startYearTa < tahunMasukSiswa) {
        continue;
      }

      taSet.add(ta);
      if (!semesterMap[ta]) semesterMap[ta] = [];
      if (!semesterMap[ta].includes(sem)) semesterMap[ta].push(sem);

      const semItem = {
        idSemester: row[0],
        tahunAjaran: ta,
        namaSemester: sem,
        status: status,
        fileIdSpreadsheet: fileId
      };

      semesterList.push(semItem);

      if (String(status).toUpperCase() === "AKTIF") {
        activeSemesterConfig = semItem;
      }
    }

    const sortedTA = Array.from(taSet).sort().reverse();
    logTracker.push(`✅ [CONFIG FILTERED] ${semesterList.length} semester & ${sortedTA.length} Tahun Ajaran valid untuk angkatan ${tahunMasukSiswa}.`);

    // STEP 3: EXECUTE SHEET API TARGET
    let rawPresensi = [];

    for (const semConfig of semesterList) {
      if (!semConfig.fileIdSpreadsheet) continue;

      const targetSpreadsheetId = semConfig.fileIdSpreadsheet;
      
      try {
        const targetMeta = Sheets.Spreadsheets.get(targetSpreadsheetId);
        const targetSheetName = targetMeta.sheets[0].properties.title;
        
        const presensiRange = `${targetSheetName}!A1:Z`; 
        const presensiResponse = Sheets.Spreadsheets.Values.get(targetSpreadsheetId, presensiRange);
        const presensiRows = presensiResponse.values;

        if (presensiRows && presensiRows.length > 1) {
          const pHeaders = presensiRows[0];

          const idxNIS = findDynamicIdx_(pHeaders, ["nis", "id_siswa", "nisn", "no_siswa"]);
          const idxTanggal = findDynamicIdx_(pHeaders, ["tanggal", "date", "tgl"]);
          const idxMasuk = findDynamicIdx_(pHeaders, ["jam masuk", "jam_masuk", "masuk"]);
          const idxStatusMasuk = findDynamicIdx_(pHeaders, ["status masuk", "status_masuk", "status"]);
          const idxPulang = findDynamicIdx_(pHeaders, ["jam pulang", "jam_pulang", "pulang"]);
          const idxKet = findDynamicIdx_(pHeaders, ["keterangan", "ket"]);
          const idxIdSemester = findDynamicIdx_(pHeaders, ["id_semester", "idsemester", "semester_id"]);

          let countPerSem = 0;
          for (let j = 1; j < presensiRows.length; j++) {
            const pRow = presensiRows[j];
            if (idxNIS !== -1 && String(pRow[idxNIS]).trim() === String(idSiswa).trim()) {
              
              const rawIdSemester = idxIdSemester !== -1 ? String(pRow[idxIdSemester]).trim() : "";
              
              let normalizedSem = semConfig.namaSemester;
              if (rawIdSemester.endsWith("1")) {
                normalizedSem = "Ganjil";
              } else if (rawIdSemester.endsWith("2")) {
                normalizedSem = "Genap";
              }

              rawPresensi.push({
                tanggal: idxTanggal !== -1 ? (pRow[idxTanggal] || "-") : "-",
                jamMasuk: idxMasuk !== -1 ? (pRow[idxMasuk] || "-") : "-",
                statusMasuk: idxStatusMasuk !== -1 ? (pRow[idxStatusMasuk] || "-") : "-",
                jamPulang: idxPulang !== -1 ? (pRow[idxPulang] || "-") : "-",
                keterangan: idxKet !== -1 ? (pRow[idxKet] || "-") : "-",
                tahunAjaran: semConfig.tahunAjaran,
                semester: normalizedSem,
                idSemester: rawIdSemester
              });
              countPerSem++;
            }
          }

          logTracker.push(`✅ [PRESENSI] TA ${semConfig.tahunAjaran} (${semConfig.namaSemester}): Loaded ${countPerSem} baris.`);
        }
      } catch (e) {
        logTracker.push(`⚠️ [PRESENSI WARNING] Gagal membaca File ID (${targetSpreadsheetId}) TA ${semConfig.tahunAjaran}: ${e.message}`);
      }
    }

    return {
      success: true,
      logs: logTracker,
      filterOptions: {
        taList: sortedTA,
        semesterMap: semesterMap,
        rawSemesterList: semesterList
      },
      activeSemester: activeSemesterConfig,
      rawPresensi: rawPresensi
    };

  } catch (err) {
    logTracker.push(`❌ [FATAL ERROR] ${err.toString()}`);
    return { success: false, logs: logTracker, message: err.toString() };
  }
}