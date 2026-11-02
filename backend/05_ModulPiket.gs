/**
 * ============================================================================
 * 05_MODULPIKET.GS — BACKEND LOGIKA OPERASIONAL PORTAL PIKET PRESENSI
 * ============================================================================
 */

/**
 * 1. VERIFIKASI LOGIN PIKET
 * Mengecek kecocokan Username, Password, dan Jadwal Hari Petugas Piket.
 */
function verifikasiLoginPiket(idInput, kodeInput) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.USER_PIKET);
  if (!sheet) return { success: false, message: "Sheet user_piket tidak ditemukan." };

  const data = sheet.getDataRange().getValues();
  const hariList = ["minggu", "senin", "selasa", "rabu", "kamis", "jumat", "sabtu"];
  const tz = TZ || "Asia/Jakarta";
  
  // Ambil hari ini berdasarkan timezone sekolah
  const now = new Date();
  const hariIndex = parseInt(Utilities.formatDate(now, tz, "u"), 10) % 7; // 1(Senin)..7(Minggu) -> %7: 0=Minggu
  const hariIni = hariList[hariIndex];

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
 * 2. GET SISWA HARI INI
 */
function getSiswaHariIni() {
  const ss = getSheetPresensi(); // Buka semester aktif
  const sheet = ss;
  const now = new Date();
  const todayStr = Utilities.formatDate(now, TZ, "dd/MM/yyyy");

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

/**
 * 3. GET SISWA BY TANGGAL (Untuk Admin)
 */
function getSiswaByTanggal(tanggal) {
  if (!tanggal) return [];

  const dateObj = parseToDate(tanggal);
  if (!dateObj) return [];

  const filterTanggal = Utilities.formatDate(dateObj, TZ, "dd/MM/yyyy");
  const sheet = getSheetPresensi(dateObj);

  const finder = sheet.getRange("A2:A").createTextFinder(filterTanggal).matchEntireCell(true);
  const results = finder.findAll();
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

/**
 * 4. SIMPAN STATUS MASUK (BATCH UPDATE)
 */
function simpanStatusMasuk(payload) {
  if (!payload || !Array.isArray(payload) || payload.length === 0) return { success: true };

  const sampleTanggal = payload[0]?.tanggal;
  const sheet = getSheetPresensi(sampleTanggal);

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
      values[arrayIndex][0] = ""; // Kosongkan jam masuk
    }
    values[arrayIndex][1] = newStatus; // status_masuk
    values[arrayIndex][4] = piketID;   // id_piket
  });

  range.setValues(values);

  // Catat waktu sinkronisasi ke Script Properties agar getSinkronisasiTerakhir akurat
  try {
    const nowIso = new Date().toISOString();
    const dateKey = sampleTanggal ? Utilities.formatDate(parseToDate(sampleTanggal) || new Date(), TZ, "yyyy-MM-dd") : "TODAY";
    PropertiesService.getScriptProperties().setProperty("SYNC_TIME_" + dateKey, nowIso);
  } catch (_) {}

  return { success: true };
}

/**
 * 5. GET SINKRONISASI TERAKHIR (Untuk Panel Dashboard FE)
 */
function getSinkronisasiTerakhir(tanggal) {
  try {
    const dateObj = parseToDate(tanggal) || new Date();
    const dateKey = Utilities.formatDate(dateObj, TZ, "yyyy-MM-dd");

    const savedIso = PropertiesService.getScriptProperties().getProperty("SYNC_TIME_" + dateKey);
    const timeObj = savedIso ? new Date(savedIso) : new Date();

    return {
      success: true,
      timestamp: timeObj.toISOString(),
      formatted: Utilities.formatDate(timeObj, TZ, "dd MMM yyyy, HH:mm:ss")
    };
  } catch (err) {
    return {
      success: true,
      timestamp: new Date().toISOString(),
      formatted: Utilities.formatDate(new Date(), TZ, "dd MMM yyyy, HH:mm:ss")
    };
  }
}

/**
 * 6. CEK STATUS KOSONG HARI INI (SHEETS API v4)
 */
function cekStatusKosongHariIni(tanggal) {
  try {
    const config = getSemesterConfig(tanggal);
    if (!config) return 0;

    const targetSpreadsheetId = (config.file_id_spreadsheet && String(config.file_id_spreadsheet).trim() !== "")
      ? config.file_id_spreadsheet.trim()
      : SpreadsheetApp.getActiveSpreadsheet().getId();

    const dateObj = parseToDate(tanggal) || new Date();
    const formattedDate = Utilities.formatDate(dateObj, TZ, "dd/MM/yyyy");

    const range = `'${SHEETS.MASTER_PRESENSI}'!A:J`;
    const response = Sheets.Spreadsheets.Values.get(targetSpreadsheetId, range);
    const data = response.values;
    if (!data || data.length <= 1) return 0;

    const header = data[0].map(val => String(val).toLowerCase().trim());
    const rows = data.slice(1);

    const colTanggal = header.indexOf("tanggal");
    let colStatus = header.indexOf("status_masuk");
    if (colStatus === -1) colStatus = header.indexOf("status masuk");

    if (colTanggal === -1 || colStatus === -1) return 0;

    let kosongCount = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r[colTanggal]) continue;

      let rDateStr = (r[colTanggal] instanceof Date)
        ? Utilities.formatDate(r[colTanggal], TZ, "dd/MM/yyyy")
        : String(r[colTanggal]).trim();

      if (rDateStr === formattedDate) {
        const valStatus = String(r[colStatus] || "").trim().toLowerCase();
        if (valStatus === "" || valStatus === "belum presensi") {
          kosongCount++;
        }
      }
    }

    return kosongCount;
  } catch (e) {
    Logger.log("❌ Error cekStatusKosongHariIni: " + e.message);
    return 0;
  }
}

/**
 * 7. MERGER PDF NATIVE MENGGUNAKAN PDF-LIB
 */
async function mergePdfBlobs(pdfBlobs) {
  try {
    if (!pdfBlobs || pdfBlobs.length === 0) return null;
    if (pdfBlobs.length === 1) return pdfBlobs[0];

    // Polyfill aman untuk runtime V8 Apps Script
    if (typeof globalThis.setTimeout === "undefined") {
      globalThis.setTimeout = function(callback, ms) {
        if (ms && ms > 0) Utilities.sleep(ms);
        callback();
        return 1;
      };
      globalThis.clearTimeout = function() {};
    }

    const cdnUrl = "https://cdn.jsdelivr.net/npm/pdf-lib/dist/pdf-lib.min.js";
    const jsContent = UrlFetchApp.fetch(cdnUrl).getContentText();
    eval(jsContent);

    const mergedPdf = await PDFLib.PDFDocument.create();

    for (let i = 0; i < pdfBlobs.length; i++) {
      const blob = pdfBlobs[i];
      const bytes = new Uint8Array(blob.getBytes());
      const pdfData = await PDFLib.PDFDocument.load(bytes);
      const pageIndices = pdfData.getPageIndices();
      const copiedPages = await mergedPdf.copyPages(pdfData, pageIndices);
      copiedPages.forEach(page => mergedPdf.addPage(page));
    }

    const mergedBytes = await mergedPdf.save();
    return Utilities.newBlob([...new Int8Array(mergedBytes)], "application/pdf");

  } catch (e) {
    Logger.log("❌ Error Engine PDF Merger: " + e.message);
    return pdfBlobs[0];
  }
}

/**
 * 8. GENERATOR REKAP PRESENSI HARIAN (PDF MULTI-PAGE LANDSCAPE + PORTRAIT)
 */
async function buatRekapPresensiHarian(namaPetugas, tanggal) {
  try {
    // 1. Cek status kosong
    const jumlahKosong = cekStatusKosongHariIni(tanggal);
    if (jumlahKosong > 0) {
      throw new Error(`Gagal membuat rekap! Masih ada ${jumlahKosong} siswa yang belum presensi.`);
    }

    // 2. Ambil Config Semester & Folder Drive
    const config = getSemesterConfig(tanggal);
    if (!config) throw new Error("Konfigurasi semester tidak ditemukan!");

    const targetSpreadsheetId = (config.file_id_spreadsheet && String(config.file_id_spreadsheet).trim() !== "")
      ? config.file_id_spreadsheet.trim()
      : SpreadsheetApp.getActiveSpreadsheet().getId();

    const sysConfig = (typeof getSystemConfig === "function") ? getSystemConfig() : {};
    const folderId = sysConfig.pdf_rekap_folder_id || "16TQT8GmnrYzmqam-UK59G4q6rfx6Lkoa";
    const folder = DriveApp.getFolderById(folderId);

    // 3. Normalisasi Tanggal
    const dateObj = parseToDate(tanggal) || new Date();
    const formattedDate = Utilities.formatDate(dateObj, TZ, "dd/MM/yyyy");
    const displayDate = formatTanggalIndonesia(dateObj);

    // 4. Ambil Data Master via Sheets API
    const rangeMaster = `'${SHEETS.MASTER_PRESENSI}'!A:L`;
    const resMaster = Sheets.Spreadsheets.Values.get(targetSpreadsheetId, rangeMaster);
    const dataMaster = resMaster.values;
    if (!dataMaster || dataMaster.length <= 1) throw new Error("Data master presensi kosong!");

    const header = dataMaster[0].map(val => String(val).toLowerCase().trim());
    const rows = dataMaster.slice(1);

    const colTanggal = header.indexOf("tanggal");
    const colNama    = header.indexOf("nama");
    const colKelas   = header.indexOf("id_rombel");
    const colTingkat = header.indexOf("tingkat");
    const colStatus  = header.indexOf("status_masuk");
    let colJam       = header.indexOf("jam_masuk");
    if (colJam === -1) colJam = header.indexOf("waktu");

    const hariIni = rows.filter(r => {
      if (!r[colTanggal]) return false;
      let rDateStr = (r[colTanggal] instanceof Date)
        ? Utilities.formatDate(r[colTanggal], TZ, "dd/MM/yyyy")
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
      if (st.includes("Terlambat")) return "Terlambat";
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

    // 8. Merge Blobs ke 1 File PDF
    const mergedBlob = await mergePdfBlobs([blobLandscape, blobPortrait]);
    const finalPdfBlob = mergedBlob.setName("Rekap Presensi " + formattedDate.replace(/\//g, "-") + ".pdf");

    const file = folder.createFile(finalPdfBlob);
    const fileUrl = file.getUrl();

    // 9. Catat Log ke Sheet laporan_presensi
    const ssMaster = SpreadsheetApp.getActiveSpreadsheet();
    let sheetLaporan = ssMaster.getSheetByName(SHEETS.LAPORAN_PRESENSI);
    if (!sheetLaporan) {
      sheetLaporan = ssMaster.insertSheet(SHEETS.LAPORAN_PRESENSI);
      sheetLaporan.appendRow(["timestamp", "user", "file_laporan"]);
    }

    const timestampStr = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm:ss");
    sheetLaporan.appendRow([timestampStr, namaPetugas, fileUrl]);

    return fileUrl;

  } catch (e) {
    Logger.log("❌ Error buatRekapPresensiHarian: " + e.message);
    throw e;
  }
}

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

    '<div class="header-title"><h2>Presensi Siswa SMK MedikaCom</h2><p>' + displayDate + '</p></div>' +
    '<div class="summary-wrap">' +
      '<div class="summary-box box-total"><span class="title">Total Siswa</span><span class="val">' + totalSiswaGlobal + '</span></div>' +
      '<div class="summary-box box-hadir"><span class="title">Hadir</span><span class="val">' + totalHadirGlobal + ' <small>(' + persenHadirGlobal + '%)</small></span></div>' +
      '<div class="summary-box box-tidak"><span class="title">Tidak Hadir</span><span class="val">' + totalTidakHadirGlobal + ' <small>(' + persenTidakHadirGlobal + '%)</small></span></div>' +
      '<div class="summary-box box-khusus"><span class="title">Status Khusus</span><span class="val">' + totalLainnyaGlobal + ' <small>(' + persenLainnyaGlobal + '%)</small></span></div>' +
    '</div>' +

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

    '<div class="signature-wrap"><div class="signature-title">Petugas Piket,</div><div class="signature-name">' + namaPetugas + '</div></div>' +
    '</body></html>';
}

function buildHtmlPortrait(data) {
  const { displayDate, siswaByKelas, kelasRekap, statusGroups } = data;
  const mapWali = getMapWaliKelas();

  let html = '<html><head><style>' +
    '@page { size: A4 portrait; margin: 8mm 10mm; }' +
    'body { font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 9px; color: #000; margin: 0; padding: 0; }' +
    '.page-container { width: 100%; margin: 0; }' +
    '.header-grid { display: table; width: 100%; margin-bottom: 14px; padding: 6px 10px 4px 10px; box-sizing: border-box; }' +
    '.header-left { display: table-cell; vertical-align: middle; text-align: left; }' +
    '.header-left h3 { font-size: 13.5px; font-weight: 800; margin: 0 0 3px 0; text-transform: uppercase; letter-spacing: 0.4px; }' +
    '.header-left p { font-size: 9px; font-weight: 600; margin: 0 0 1px 0; color: #334155; }' +
    '.header-right { display: table-cell; vertical-align: middle; text-align: right; }' +
    '.footnote-wrap { display: inline-block; padding: 5px 9px; background-color: #f8fafc; border: 1px dashed #64748b; border-radius: 5px; font-size: 8px; line-height: 1.5; text-align: left; }' +
    '.footnote-title { font-weight: 800; color: #0f172a; margin-bottom: 2px; text-transform: uppercase; font-size: 7.5px; letter-spacing: 0.3px; }' +
    '.footnote-row { margin-bottom: 1px; }' +
    '.sub-alert-warn { font-size: 7.5px; color: #b45309; background-color: #fef3c7; border: 1px solid #fde047; padding: 0px 4px; border-radius: 3px; font-weight: 700; margin-left: 3px; display: inline-block; }' +
    '.sub-alert-danger { font-size: 7.5px; color: #b91c1c; background-color: #fef2f2; border: 1px solid #fca5a5; padding: 0px 4px; border-radius: 3px; font-weight: 700; margin-left: 3px; display: inline-block; }' +
    '.table-section { display: table; margin: 0 auto; text-align: left; }' +
    'table { border-collapse: collapse; width: auto; font-size: 9px; margin-bottom: 10px; border: 1px solid #1e293b; }' +
    'th, td { padding: 3.5px 7px; text-align: center; vertical-align: middle; border: 1px solid #1e293b; white-space: nowrap; font-size: 9px; }' +
    'th { background-color: #e2e8f0; color: #000; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; }' +
    '.badge-status { padding: 1.5px 6px; border-radius: 3px; font-weight: 800; font-size: 8px; display: inline-block; }' +
    '.badge-tepat { background-color: #dcfce7; color: #15803d; border: 1px solid #86efac; }' +
    '.badge-terlambat { background-color: #fef9c3; color: #a16207; border: 1px solid #fde047; }' +
    '.badge-sangat-terlambat { background-color: #ffedd5; color: #c2410c; border: 1px solid #fdba74; }' +
    '.badge-sangat-terlambat-sekali { background-color: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }' +
    '.badge-tidak-presensi { background-color: #fff7ed; color: #ea580c; border: 1px solid #ffedd5; }' +
    '.badge-sakit-izin { background-color: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }' +
    '.badge-alpa { background-color: #fef2f2; color: #991b1b; border: 1px solid #f87171; }' +
    '.badge-khusus { background-color: #f3e8ff; color: #6b21a8; border: 1px solid #e9d5ff; }' +
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

    if (countTerlambatTotal > 0) html += '<span class="sub-alert-warn">⚠️ ' + countTerlambatTotal + ' Terlambat</span>';
    if (countTidakPresensi > 0) html += '<span class="sub-alert-warn">⚠️ ' + countTidakPresensi + ' Tidak Presensi</span>';

    html += '</div><div class="footnote-row"><strong>Tidak Hadir:</strong> ' + countTidakHadir + ' Siswa (' + pctTidakHadir + '%)';
    if (countAlpa > 0) html += '<span class="sub-alert-danger">🚨 ' + countAlpa + ' Alpa</span>';

    html += '</div></div></div></div>' +
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
        '<div class="signature-wrap">' +
          '<div class="signature-title">Wali Kelas,</div>' +
          '<div class="signature-name">' + namaWaliKelas + '</div>' +
        '</div>' +
      '</div></div>';
  });

  html += '</body></html>';
  return html;
}

function getLatestRekapUrl() {
  try {
    const ssMaster = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ssMaster.getSheetByName(SHEETS.LAPORAN_PRESENSI);
    if (!sheet) return null;

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return null;

    return String(sheet.getRange(lastRow, 3).getValue() || "").trim() || null;
  } catch (e) {
    Logger.log("Error getLatestRekapUrl: " + e.message);
    return null;
  }
}

/**
 * 9. KIRIM REKAP PRESENSI KE GRUP WHATSAPP
 */
function kirimRekapPresensiWA(tanggal, namaPetugas, pdfUrlInput) {
  try {
    const config = (typeof getSystemConfig === "function") ? getSystemConfig() : {};
    const ss = getSheetPresensi(tanggal);

    const idGrupPiket = config.wa_group_id_piket;
    if (!idGrupPiket) {
      return { success: false, message: "Gagal! 'wa_group_id_piket' belum diisi pada config_sistem." };
    }

    const pdfUrl = pdfUrlInput || getLatestRekapUrl() || "";
    const dateObj = parseToDate(tanggal) || new Date();
    const tanggalSheet = Utilities.formatDate(dateObj, TZ, "dd/MM/yyyy");
    const tanggalDisplay = formatTanggalIndonesia(dateObj);

    // 1. MAPPING WALI KELAS
    const waliMap = getMapWaliKelas();

    // 2. AMBIL DATA MASTER
    const rangeMaster = `'${SHEETS.MASTER_PRESENSI}'!A:L`;
    const resMaster = Sheets.Spreadsheets.Values.get(ss.getParent().getId(), rangeMaster);
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
      let tglStr = (tgl instanceof Date) ? Utilities.formatDate(tgl, TZ, "dd/MM/yyyy") : String(tgl || "").trim();
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

    // PESAN 1: SUMMARY GLOBAL
    const persenHadirGlobal = Math.round((totalHadirGlobal / totalSiswaGlobal) * 100);
    const persenTHGlobal    = Math.round((totalTidakHadirGlobal / totalSiswaGlobal) * 100);

    let pesanSummary = `Rekap Presensi Siswa, ${tanggalDisplay}\n`;
    pesanSummary += `Piket: ${namaPetugas || "Portal Piket"}\n`;
    pesanSummary += `===============================\n\n`;
    pesanSummary += `👥 *Total Siswa:* ${totalSiswaGlobal} Siswa\n`;
    pesanSummary += `✅ *Total Hadir:* ${totalHadirGlobal} Siswa (${persenHadirGlobal}%)\n`;
    pesanSummary += `❌ *Total Tidak Hadir:* ${totalTidakHadirGlobal} Siswa (${persenTHGlobal}%)\n`;
    
    if (totalPrakerinGlobal > 0) {
      pesanSummary += `💼 *Prakerin:* ${totalPrakerinGlobal} Siswa\n`;
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
    pesanSummary += `• ${totalTidakScanGlobal > 0 ? `${totalTidakScanGlobal} Siswa Tidak Scan` : "Seluruh Siswa Scan 🌟"}\n`;
    
    const totalLate = totalTerlambatGlobal + totalSangatGlobal + totalSangatSekaliGlobal;
    if (totalLate === 0) {
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

    // PESAN 2..N: RINCIAN PER KELAS
    daftarTingkat.forEach(tingkat => {
      const mapKelas = mapTingkat[tingkat];
      const daftarKelas = Object.keys(mapKelas).sort();
      const kelasAktif = daftarKelas.filter(k => mapKelas[k].hadir > 0 || mapKelas[k].tidakHadir > 0);
      if (kelasAktif.length === 0) return;

      let pesan = "";
      kelasAktif.forEach((idRombel, idx) => {
        const rec = mapKelas[idRombel];
        const namaDisplayKelas = formatNamaKelas(idRombel, tingkat);
        const namaWaliStr = waliMap[idRombel] ? ` (${waliMap[idRombel]})` : "";

        let pesanScan = (rec.tidakScan === 0) ? "Seluruh Siswa Scan 🌟" : `*${rec.tidakScan} SISWA TIDAK SCAN*`;

        let pesanTerlambat = "Seluruh Siswa Tepat Waktu 🌟";
        const sumLate = rec.terlambat + rec.sangatTerlambat + rec.sangatSekali;
        if (sumLate > 0) {
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

        if (idx < kelasAktif.length - 1) pesan += `\n\n`;
      });

      if (pesan.trim()) daftarPesanKirim.push(pesan.trim());
    });

    // KIRIM VIA sendWA DENGAN JEDA 5 DETIK
    let suksesKirim = 0;
    for (let i = 0; i < daftarPesanKirim.length; i++) {
      const teksPesan = daftarPesanKirim[i];
      const hasil = sendWA(idGrupPiket, teksPesan);
      if (hasil && hasil.success) suksesKirim++;
      if (i < daftarPesanKirim.length - 1) Utilities.sleep(5000);
    }

    return {
      success: suksesKirim > 0,
      message: `${suksesKirim} dari ${daftarPesanKirim.length} pesan berhasil dikirim ke WhatsApp!`
    };

  } catch (err) {
    return { success: false, message: err.message || err.toString() };
  }
}

/**
 * 10. HELPER MAP WALI KELAS
 */
function getMapWaliKelas() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.WALI_KELAS);
    const mapWali = {};
    if (!sheet) return mapWali;

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return mapWali;

    for (let i = 1; i < data.length; i++) {
      const idRombel = String(data[i][0] || "").trim().toUpperCase();
      const namaWali = String(data[i][1] || "").trim();
      if (idRombel) mapWali[idRombel] = namaWali;
    }
    return mapWali;
  } catch (e) {
    return {};
  }
}

/**
 * 11. PEMICU TARIK DATA DARI ENGINE POOL
 */
function pemicuTarikDataPool() {
  try {
    const config = (typeof getSystemConfig === "function") ? getSystemConfig() : {};
    const url = config.pool_sync_url || "https://script.google.com/macros/s/AKfycbw7WOTtW3AIv0dP_8U_NYl-khh2rP7MQhPMc23Pisq8nPnrXSOJ27PqFDtGm-Mj8kTR6w/exec?action=triggerSyncFromWeb";
    const response = UrlFetchApp.fetch(url);
    return JSON.parse(response.getContentText());
  } catch (err) {
    return { success: false, message: "Gagal memicu Engine Pool: " + err.toString() };
  }
}
