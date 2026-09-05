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
    const action = e.parameter.action;
    let responseData = {};

    switch (action) {
      case "getSiswaHariIni":
        responseData = getSiswaHariIni();
        break;
      case "getSiswaByTanggal":
        responseData = getSiswaByTanggal(e.parameter.tanggal);
        break;
      case "cekStatusKosongHariIni":
        responseData = cekStatusKosongHariIni(e.parameter.tanggal);
        break;
      case "getDashboardKonfirmasiWaliKelas":
        responseData = getDashboardKonfirmasiWaliKelas();
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
 * HELPER: MENGAMBIL SPREADSHEET PRESENSI TA YANG AKTIF
 */
function getActivePresensiSpreadsheet() {
  const activeSemester = getActiveSemesterConfig();
  if (!activeSemester || !activeSemester.file_id_spreadsheet) {
    throw new Error("⚠️ Tidak ada Semester Aktif atau File ID Spreadsheet belum di-set di DB Master.");
  }
  return SpreadsheetApp.openById(activeSemester.file_id_spreadsheet);
}

function getSiswaHariIni() {
  // 💡 Buka Spreadsheet TA Aktif via OpenById
  const ss = getActivePresensiSpreadsheet();
  const sheet = ss.getSheetByName("master_presensi"); // Sesuaikan nama sheet presensi di TA
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

  const chunkData = sheet.getRange(startRow, 1, totalRows, 10).getDisplayValues();
  const resultData = [];

  for (let i = 0; i < chunkData.length; i++) {
    const row = chunkData[i];
    if (row[0] === todayStr) {
      resultData.push({
        rowIndex: startRow + i,
        nama: row[2],
        kelas: row[3],
        tingkat: row[4],
        jamMasuk: row[6],
        statusMasuk: row[7] || "",
        jamPulang: row[8],
        statusPulang: row[9] || "",
        tanggal: todayStr
      });
    }
  }
  return resultData;
}

function getSiswaByTanggal(tanggal) {
  // 💡 Buka Spreadsheet TA Aktif via OpenById
  const ss = getActivePresensiSpreadsheet();
  const sheet = ss.getSheetByName("master_presensi");
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  let filterTanggal = tanggal;
  if (tanggal && tanggal.includes("-")) {
    const [y, m, d] = tanggal.split("-");
    filterTanggal = `${d}/${m}/${y}`;
  }

  const finder = sheet.getRange("A2:A").createTextFinder(filterTanggal).matchEntireCell(true);
  const results = finder.findAll();
  if (results.length === 0) return [];

  const startRow = results[0].getRow();
  const endRow = results[results.length - 1].getRow();
  const totalRows = (endRow - startRow) + 1;

  const chunkData = sheet.getRange(startRow, 1, totalRows, 10).getDisplayValues();
  const resultData = [];

  for (let i = 0; i < chunkData.length; i++) {
    const row = chunkData[i];
    if (row[0] === filterTanggal) {
      resultData.push({
        rowIndex: startRow + i,
        tanggal: row[0],
        nama: row[2],
        kelas: row[3],
        tingkat: row[4],
        jamMasuk: row[6],
        statusMasuk: row[7] || "",
        jamPulang: row[8],
        statusPulang: row[9] || ""
      });
    }
  }
  return resultData;
}

function simpanStatusMasuk(payload) {
  if (!payload || !Array.isArray(payload) || payload.length === 0) return { success: true };

  // 💡 Buka Spreadsheet TA Aktif via OpenById
  const ss = getActivePresensiSpreadsheet();
  const sheet = ss.getSheetByName("master_presensi");
  if (!sheet) throw new Error("Sheet master_presensi tidak ditemukan.");

  const rowIndexes = payload.map(item => Number(item.rowIndex));
  const minRow = Math.min(...rowIndexes);
  const maxRow = Math.max(...rowIndexes);
  const numRows = (maxRow - minRow) + 1;

  // Sesuaikan range kolom jika di master_presensi status_masuk berada di Kolom H (8) dan id_piket di K (11)
  const range = sheet.getRange(minRow, 7, numRows, 5); 
  const values = range.getValues();

  payload.forEach(item => {
    const targetRow = Number(item.rowIndex);
    const arrayIndex = targetRow - minRow;
    
    const newStatus = item.statusMasuk || "";
    const piketID = item.piketID || "";

    if (["Sakit", "Izin", "Alpa"].includes(newStatus)) {
      values[arrayIndex][0] = ""; // Kosongkan jam masuk
    }
    values[arrayIndex][1] = newStatus; // Status Masuk
    values[arrayIndex][4] = piketID;    // ID Piket
  });

  range.setValues(values);
  return { success: true };
}

function cekStatusKosongHariIni(tanggal) {
  // 💡 Buka Spreadsheet TA Aktif via OpenById
  const ss = getActivePresensiSpreadsheet();
  const sheet = ss.getSheetByName("master_presensi"); // Disesuaikan ke master_presensi
  if (!sheet) return 0;

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return 0;

  const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const header = data[0].map(h => String(h).trim().toLowerCase()); // Case-insensitive header check
  
  const idxTanggal = header.indexOf("tanggal");
  const idxStatusMasuk = header.indexOf("status_masuk");

  if (idxTanggal === -1 || idxStatusMasuk === -1) return 0;

  let tanggalStr;
  if (typeof tanggal === "string") {
    if (tanggal.includes("-")) {
      const p = tanggal.split("-");
      tanggalStr = `${p[2]}/${p[1]}/${p[0]}`;
    } else {
      tanggalStr = tanggal;
    }
  } else if (tanggal instanceof Date) {
    tanggalStr = Utilities.formatDate(tanggal, Session.getScriptTimeZone(), "dd/MM/yyyy");
  } else {
    throw new Error("Parameter tanggal tidak valid");
  }

  let jumlahKosong = 0;
  // Reverse loop dari bawah
  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    const tglCell = row[idxTanggal];
    const tgl = tglCell instanceof Date 
      ? Utilities.formatDate(tglCell, Session.getScriptTimeZone(), "dd/MM/yyyy")
      : String(tglCell || "").trim();

    if (tgl === tanggalStr) {
      const status = String(row[idxStatusMasuk] || "").trim();
      if (!status) jumlahKosong++;
    } else if (jumlahKosong > 0) {
      // Sudah melewati blok tanggal target
      break;
    }
  }
  return jumlahKosong;
} 