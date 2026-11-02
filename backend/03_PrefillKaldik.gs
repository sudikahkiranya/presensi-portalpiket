/**
 * ============================================================================
 * 03_PREFILLKALDIK.GS — AUTOMATION ENGINE: DAILY PREFILL & KALENDER PENDIDIKAN
 * ============================================================================
 */

function injectPrefillPresensiHarian() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = Utilities.formatDate(today, TZ, "dd/MM/yyyy");

  // 1. CEK WEEKEND (HARD STOP)
  const day = today.getDay(); // 0 = Minggu, 6 = Sabtu
  if (day === 0 || day === 6) {
    Logger.log("⏸ Prefill dilewati: WEEKEND");
    tulisLogPrefill(todayStr, 0);
    return;
  }

  const ssMaster = SpreadsheetApp.getActiveSpreadsheet();

  // 2. CEK MODE HARI INI (KALDIK)
  const modeHari = getModeHariIni(today);
  if (modeHari !== "AKTIF") {
    Logger.log(`⏸ Prefill dilewati, mode hari ini: ${modeHari}`);
    tulisLogPrefill(todayStr, 0);
    return;
  }

  // 3. AMBIL CONFIG SEMESTER
  const activeSemester = getSemesterConfig(today);
  if (!activeSemester) {
    Logger.log(`❌ Prefill Gagal: Konfigurasi semester tidak ditemukan di '${SHEETS.CONFIG_SEMESTER}'!`);
    return;
  }

  const targetSpreadsheetId = (activeSemester.file_id_spreadsheet && String(activeSemester.file_id_spreadsheet).trim() !== "")
    ? activeSemester.file_id_spreadsheet.trim()
    : ssMaster.getId();
  
  const sheetName = SHEETS.MASTER_PRESENSI || "master_presensi";

  // 4. CEK DUPLIKASI HARI VIA SHEETS API
  const rangeCheck = `'${sheetName}'!A:A`;
  try {
    const responseDates = Sheets.Spreadsheets.Values.get(targetSpreadsheetId, rangeCheck);
    const dateValues = responseDates.values || [];

    if (dateValues.length > 1) {
      const lastVal = dateValues[dateValues.length - 1][0];
      const lastDateObj = parseToDate(lastVal);
      
      if (lastDateObj) {
        lastDateObj.setHours(0, 0, 0, 0);
        const lastDateStr = Utilities.formatDate(lastDateObj, TZ, "dd/MM/yyyy");
        if (lastDateStr === todayStr) {
          Logger.log(`⏸ Prefill dilewati: ${todayStr} sudah ada`);
          tulisLogPrefill(todayStr, 0);
          return;
        }
      }
    }
  } catch (e) {
    Logger.log(`❌ Prefill Gagal: Tidak bisa membaca target sheet '${sheetName}'. Err: ${e.message}`);
    return;
  }

  // 5. BACA MASTER SISWA AKTIF
  const sheetSiswa = ssMaster.getSheetByName(SHEETS.MASTER_AKTIF);
  if (!sheetSiswa) {
    Logger.log(`❌ Prefill Gagal: Tab '${SHEETS.MASTER_AKTIF}' tidak ditemukan!`);
    return;
  }

  const siswaData = sheetSiswa.getDataRange().getValues();
  const h = siswaData[0].map(val => String(val).toLowerCase().trim());
  const rows = siswaData.slice(1);

  let idxId = h.indexOf("id_siswa");
  if (idxId === -1) idxId = h.indexOf("nis");

  const idx = {
    id_siswa: idxId,
    nama: h.indexOf("nama"),
    id_rombel: h.indexOf("id_rombel"),
    tingkat: h.indexOf("tingkat"),
    status: h.indexOf("status"),
    tanggal_keluar: h.indexOf("tanggal_keluar"),
  };

  // 6. STATUS KHUSUS (status_prefill)
  const sheetStatusKhusus = ssMaster.getSheetByName(SHEETS.STATUS_PREFILL);
  let sr = [];
  let idxS = {};

  if (sheetStatusKhusus) {
    const statusData = sheetStatusKhusus.getDataRange().getValues();
    const sh = statusData[0].map(val => String(val).toLowerCase().trim());
    sr = statusData.slice(1);

    idxS = {
      tanggal_mulai: sh.indexOf("tanggal_mulai"),
      tanggal_selesai: sh.indexOf("tanggal_selesai"),
      tingkat: sh.indexOf("tingkat"),
      id_rombel: sh.indexOf("id_rombel"),
      status: sh.indexOf("status"),
    };
  }

  function getStatusKhusus(tingkat, idRombel, todayDate, statusRows, idxStatus) {
    if (!statusRows || !statusRows.length) return "";
    
    for (let r of statusRows) {
      const mulai = parseToDate(r[idxStatus.tanggal_mulai]);
      const selesai = parseToDate(r[idxStatus.tanggal_selesai]);
      if (!mulai || !selesai) continue;

      mulai.setHours(0, 0, 0, 0);
      selesai.setHours(23, 59, 59, 999);

      const matchTanggal = todayDate >= mulai && todayDate <= selesai;
      if (!matchTanggal) continue;

      const valTingkat = (r[idxStatus.tingkat] || "").toString().trim().toUpperCase();
      const matchTingkat = !valTingkat || valTingkat === "SEMUA" || valTingkat === String(tingkat).toUpperCase();

      const valRombel = (r[idxStatus.id_rombel] || "").toString().trim().toUpperCase();
      const matchRombel = !valRombel || valRombel === "SEMUA" || valRombel === String(idRombel).toUpperCase();

      if (matchTingkat && matchRombel) {
        return r[idxStatus.status];
      }
    }
    return "";
  }

  // 7. BUILD DATA PREFILL
  const newRows = [];

  for (let r of rows) {
    const idSiswa = r[idx.id_siswa];
    if (!idSiswa) continue;

    const statusSiswa = (r[idx.status] || "").toString().trim().toLowerCase();
    if (statusSiswa === "keluar" || statusSiswa === "lulus") {
      const tgl = parseToDate(r[idx.tanggal_keluar]);
      if (!tgl || today >= tgl) continue;
    }

    const statusKhusus = getStatusKhusus(r[idx.tingkat], r[idx.id_rombel], today, sr, idxS);

    newRows.push([
      todayStr,                             // row[0] tanggal
      idSiswa,                              // row[1] id_siswa
      r[idx.nama],                          // row[2] nama
      r[idx.id_rombel],                     // row[3] id_rombel
      r[idx.tingkat],                       // row[4] tingkat
      activeSemester.id_semester,           // row[5] id_semester
      "",                                   // row[6] jam_masuk
      statusKhusus || "Belum Presensi",     // row[7] status_masuk
      "",                                   // row[8] jam_pulang
      statusKhusus || "Belum Presensi",     // row[9] status_pulang
      "",                                   // row[10] id_piket
      statusKhusus ? "Status Khusus" : ""   // row[11] keterangan
    ]);
  }

  // 8. APPEND DATA VIA SHEETS API
  if (newRows.length) {
    const valueRange = Sheets.newValueRange();
    valueRange.values = newRows;
    const rangeAppend = `'${sheetName}'!A1`;

    Sheets.Spreadsheets.Values.append(
      valueRange, 
      targetSpreadsheetId, 
      rangeAppend, 
      { 
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS"
      }
    );

    Logger.log(`⚡ [Sheets API] Prefill ${newRows.length} siswa (${todayStr}) selesai.`);
    tulisLogPrefill(todayStr, newRows.length);
  } else {
    Logger.log(`ℹ️ Tidak ada data diprefill (${todayStr})`);
    tulisLogPrefill(todayStr, 0);
  }
}

/**
 * Mengambil konfigurasi semester:
 * - Jika parameter tanggal diisi: cari berdasarkan rentang tanggal
 * - Jika tanpa tanggal / tidak ada yang cocok: ambil semester berstatus AKTIF
 */
function getSemesterConfig(tanggal) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetConfig = ss.getSheetByName(SHEETS.CONFIG_SEMESTER);
  if (!sheetConfig) return null;

  const data = sheetConfig.getDataRange().getValues();
  if (data.length < 2) return null;

  const h = data[0].map(val => String(val).toLowerCase().trim());
  const rows = data.slice(1);

  const idxStatus     = h.indexOf("status");
  const idxIdSem      = h.indexOf("id_semester");
  const idxFileId     = h.indexOf("file_id_spreadsheet");
  const idxTglMulai   = h.indexOf("tanggal_mulai");
  const idxTglSelesai = h.indexOf("tanggal_selesai");

  // 1. Cari berdasarkan rentang tanggal jika ada
  if (tanggal) {
    const targetDate = parseToDate(tanggal);
    if (targetDate) {
      targetDate.setHours(0, 0, 0, 0);

      for (let r of rows) {
        let tglMulai = parseToDate(r[idxTglMulai]);
        let tglSelesai = parseToDate(r[idxTglSelesai]);

        if (tglMulai && tglSelesai) {
          tglMulai.setHours(0, 0, 0, 0);
          tglSelesai.setHours(23, 59, 59, 999);

          if (targetDate >= tglMulai && targetDate <= tglSelesai) {
            return {
              id_semester: r[idxIdSem],
              file_id_spreadsheet: r[idxFileId]
            };
          }
        }
      }
    }
  }

  // 2. Fallback: Ambil semester berstatus "AKTIF"
  for (let r of rows) {
    if ((r[idxStatus] || "").toString().trim().toUpperCase() === "AKTIF") {
      return {
        id_semester: r[idxIdSem],
        file_id_spreadsheet: r[idxFileId]
      };
    }
  }

  return null;
}

function getSheetPresensi(tanggal) {
  const config = getSemesterConfig(tanggal);
  if (!config) {
    throw new Error("Konfigurasi semester tidak ditemukan di sheet " + SHEETS.CONFIG_SEMESTER);
  }

  const ssPresensi = (config.file_id_spreadsheet && String(config.file_id_spreadsheet).trim() !== "")
    ? SpreadsheetApp.openById(config.file_id_spreadsheet.trim())
    : SpreadsheetApp.getActiveSpreadsheet();

  const targetSheetName = SHEETS.MASTER_PRESENSI || "master_presensi";
  const sheetMaster = ssPresensi.getSheetByName(targetSheetName);

  if (!sheetMaster) {
    throw new Error(`Sheet presensi '${targetSheetName}' tidak ditemukan.`);
  }

  return sheetMaster;
}

function getModeHariIni(today) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.KALDIK);
  if (!sheet) return "AKTIF";

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return "AKTIF";

  const h = data[0].map(val => String(val).toLowerCase().trim());
  const rows = data.slice(1);

  const idxMulai = h.indexOf("tanggal_mulai");
  const idxSelesai = h.indexOf("tanggal_selesai");
  const idxMode = h.indexOf("mode");

  if (idxMulai === -1 || idxSelesai === -1 || idxMode === -1) return "AKTIF";

  const targetDate = today ? parseToDate(today) : new Date();
  if (!targetDate) return "AKTIF";
  targetDate.setHours(0, 0, 0, 0);

  for (let r of rows) {
    const mulai = parseToDate(r[idxMulai]);
    const selesai = parseToDate(r[idxSelesai]);
    const mode = (r[idxMode] || "").toString().trim().toUpperCase();

    if (!mulai || !selesai || !mode) continue;

    mulai.setHours(0, 0, 0, 0);
    selesai.setHours(23, 59, 59, 999);

    if (targetDate >= mulai && targetDate <= selesai) {
      return mode;
    }
  }

  return "AKTIF";
}

function tulisLogPrefill(tanggal, jumlah) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEETS.LOG_PREFILL);
    if (!sheet) {
      sheet = ss.insertSheet(SHEETS.LOG_PREFILL);
      sheet.appendRow(["tanggal", "jumlah_prefill", "created_at"]);
    }
    sheet.appendRow([tanggal, jumlah, new Date()]);
  } catch (e) {
    Logger.log("Log prefill error: " + e.message);
  }
}
