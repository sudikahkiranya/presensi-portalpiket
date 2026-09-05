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
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("user_piket");
  if (!sheet) return { success: false, message: "Sheet user_piket tidak ditemukan." };

  const data = sheet.getDataRange().getValues();
  
  const hariList = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const now = new Date();
  const hariIni = hariList[now.getDay()];

  for (let i = 1; i < data.length; i++) {
    const hari = (data[i][0] || "").toString().trim().toLowerCase();
    const nama = (data[i][1] || "").toString().trim();
    const id = (data[i][2] || "").toString().trim().toUpperCase();
    const kode = (data[i][3] || "").toString().trim();
    const role = (data[i][4] || "").toString().trim();

    // 💡 Mengecek nama hari ATAU "setiap hari"
    if (
      (hari === hariIni.toLowerCase() || hari === "setiap hari") &&
      id === idInput.toUpperCase() &&
      kode === kodeInput
    ) {
      return { success: true, nama: nama, role: role };
    }
  }
  return { success: false };
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

/* =========================================================
   HELPER & WALI KELAS NOTIFICATION FUNCTIONS
========================================================= */

function buatBufferKonfirmasiWaliKelas(namaPetugas) {
  const BUFFER_ID = "1lLcUABGJxYFjt7j1XmsYPGsHN0N6LtCyuH2Gkdf77co";
  const BUFFER_SHEET = "BufferWaliKelas";
  const WALI_SHEET = "DataWaliKelas";

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetPresensi = ss.getSheetByName("MasterPresensi");

  const bufferSS = SpreadsheetApp.openById(BUFFER_ID);
  const sheetWali = bufferSS.getSheetByName(WALI_SHEET);
  const bufferSheet = bufferSS.getSheetByName(BUFFER_SHEET);

  if (!sheetPresensi || !sheetWali || !bufferSheet) {
    return { success: false, message: "Sheet data wali kelas / buffer tidak ditemukan." };
  }

  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const todayStr = Utilities.formatDate(now, tz, "dd/MM/yyyy");
  const timestamp = Utilities.formatDate(now, tz, "dd/MM/yyyy HH:mm:ss");
  const batchId = "WK-" + Utilities.formatDate(now, tz, "yyyyMMdd-HHmmss");

  const dataPresensi = sheetPresensi.getDataRange().getValues();
  const headerP = dataPresensi[0];
  const idxTanggal = headerP.indexOf("Tanggal");
  const idxNama    = headerP.indexOf("Nama");
  const idxKelas   = headerP.indexOf("Kelas");
  const idxStatus  = headerP.indexOf("Status Masuk");

  const kosongMap = {};
  for (let i = dataPresensi.length - 1; i >= 1; i--) {
    const row = dataPresensi[i];
    const tgl = String(row[idxTanggal] || "").trim();
    if (tgl !== todayStr) break;

    const status = String(row[idxStatus] || "").trim();
    if (status) continue;

    const kelas = String(row[idxKelas] || "").trim().toUpperCase();
    const nama  = String(row[idxNama] || "").trim();
    if (!kelas || !nama) continue;

    if (!kosongMap[kelas]) kosongMap[kelas] = [];
    kosongMap[kelas].push(nama);
  }

  const daftarKosong = Object.keys(kosongMap);
  daftarKosong.forEach(kelas => {
    kosongMap[kelas].sort((a, b) => a.localeCompare(b, "id", { sensitivity: "base" }));
  });

  if (daftarKosong.length === 0) {
    return { success: false, message: "Tidak ada status presensi kosong hari ini." };
  }

  const existingMap = {};
  if (bufferSheet.getLastRow() >= 2) {
    const dataBuffer = bufferSheet.getRange(2, 1, bufferSheet.getLastRow() - 1, 13).getValues();
    for (let i = dataBuffer.length - 1; i >= 0; i--) {
      const row = dataBuffer[i];
      const valTgl = row[2];
      const tgl = valTgl instanceof Date ? Utilities.formatDate(valTgl, tz, "dd/MM/yyyy") : String(valTgl || "").trim();
      if (tgl !== todayStr) continue;

      const kelas = String(row[4] || "").trim().toUpperCase();
      const status = String(row[8] || "").trim().toLowerCase();
      if (!kelas) continue;
      if (!existingMap[kelas]) existingMap[kelas] = status;
    }
  }

  const dataWali = sheetWali.getDataRange().getValues();
  const headerW = dataWali[0];
  const idxNamaWali  = headerW.indexOf("Nama");
  const idxKelasWali = headerW.indexOf("Kelas");
  const idxNoHp      = headerW.indexOf("No HP");

  const rowsToInsert = [];
  let totalSkip = 0;

  for (let i = 1; i < dataWali.length; i++) {
    const row = dataWali[i];
    const namaWali = String(row[idxNamaWali] || "").trim();
    const noHp = normalisasiWa(row[idxNoHp]);
    const kelasCell = String(row[idxKelasWali] || "").trim();
    if (!namaWali || !noHp || !kelasCell) continue;

    const kelasList = kelasCell.split(",").map(k => k.trim().toUpperCase());
    kelasList.forEach(kelas => {
      const siswaKosong = kosongMap[kelas];
      if (!siswaKosong || siswaKosong.length === 0) return;

      const statusLama = existingMap[kelas];
      if (["pending", "berhasil", "sent", "terkirim"].includes(statusLama)) {
        totalSkip++;
        return;
      }

      const jumlahKosong = siswaKosong.length;
      const tanggalLengkap = formatTanggalLengkap(now);
      const pesan =
        `Semangat pagi 👋\n\n` +
        `Berikut daftar siswa kelas *${kelas}* yang status presensinya masih kosong pada hari *${tanggalLengkap}*:\n\n` +
        siswaKosong.map((n, idx) => `${idx + 1}. ${n}`).join("\n") +
        `\n\nSilakan konfirmasi di grup piket sebelum pukul *14.30 WIB*.\n\n` +
        `Apabila tidak ada konfirmasi, status presensi akan otomatis tercatat *Alpa* oleh sistem.\n\n` +
        `Terima kasih.`;

      rowsToInsert.push([
        timestamp, batchId, todayStr, namaWali, kelas,
        jumlahKosong, noHp, pesan, "Pending", "", "", 0,
        namaPetugas || "Portal Piket"
      ]);
      existingMap[kelas] = "pending";
    });
  }

  if (rowsToInsert.length > 0) {
    bufferSheet.getRange(bufferSheet.getLastRow() + 1, 1, rowsToInsert.length, rowsToInsert[0].length).setValues(rowsToInsert);
  }

  return {
    success: true,
    total: rowsToInsert.length,
    skip: totalSkip,
    message: rowsToInsert.length > 0 ? `${rowsToInsert.length} pesan dibuat, ${totalSkip} dilewati.` : `Tidak ada pesan baru. ${totalSkip} sudah tersedia.`
  };
}

function normalisasiWa(nohp) {
  let hp = String(nohp || "").replace(/\D/g, "");
  if (!hp) return "";
  if (hp.startsWith("0")) hp = "62" + hp.substring(1);
  if (!hp.startsWith("62")) hp = "62" + hp;
  return hp;
}

function getDashboardKonfirmasiWaliKelas() {
  const BUFFER_ID   = "1lLcUABGJxYFjt7j1XmsYPGsHN0N6LtCyuH2Gkdf77co";
  const MASTER_SHEET = "MasterPresensi";
  const BUFFER_SHEET = "BufferWaliKelas";

  const tz = Session.getScriptTimeZone();
  const todayStr = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetMaster = ss.getSheetByName(MASTER_SHEET);
  const bufferSS = SpreadsheetApp.openById(BUFFER_ID);
  const sheetBuffer = bufferSS.getSheetByName(BUFFER_SHEET);

  if (!sheetMaster) return { success: false, message: "Sheet MasterPresensi tidak ditemukan." };

  const data = sheetMaster.getDataRange().getValues();
  const header = data[0];
  const idxTanggal = header.indexOf("Tanggal");
  const idxKelas   = header.indexOf("Kelas");
  const idxStatus  = header.indexOf("Status Masuk");

  const kosongMap = {};
  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    const tgl = String(row[idxTanggal] || "").trim();
    if (tgl !== todayStr) break;

    const status = String(row[idxStatus] || "").trim();
    if (status) continue;

    const kelas = String(row[idxKelas] || "").trim().toUpperCase();
    if (!kelas) continue;
    kosongMap[kelas] = (kosongMap[kelas] || 0) + 1;
  }

  const statusMap = {};
  if (sheetBuffer && sheetBuffer.getLastRow() >= 2) {
    const dataBuffer = sheetBuffer.getRange(2, 1, sheetBuffer.getLastRow() - 1, 13).getValues();
    for (let i = dataBuffer.length - 1; i >= 0; i--) {
      const row = dataBuffer[i];
      const valTgl = row[2];
      const tgl = valTgl instanceof Date ? Utilities.formatDate(valTgl, tz, "dd/MM/yyyy") : String(valTgl).trim();
      if (tgl !== todayStr) continue;

      const kelas = String(row[4] || "").trim().toUpperCase();
      const status = String(row[8] || "Pending").trim();
      if (!kelas) continue;
      if (!statusMap[kelas]) statusMap[kelas] = status;
    }
  }

  const allKelas = Object.keys(kosongMap).sort();
  if (allKelas.length === 0) {
    return { success: true, totalKelas: 0, totalKosong: 0, canGenerate: false, data: [] };
  }

  let totalKosong = 0;
  let canGenerate = false;

  const rows = allKelas.map(kelas => {
    const jumlah = kosongMap[kelas];
    totalKosong += jumlah;

    let status = statusMap[kelas] || "Belum Dibuat";
    let statusClass = "pending";
    const s = status.toLowerCase();

    if (s === "berhasil" || s === "sent") {
      statusClass = "success";
      status = "Terkirim";
    } else if (s === "gagal" || s === "failed") {
      statusClass = "error";
      status = "Gagal";
      canGenerate = true;
    } else if (s === "pending") {
      statusClass = "pending";
      status = "Pending";
    } else if (s === "belum dibuat") {
      statusClass = "neutral";
      status = "Belum Dibuat";
      canGenerate = true;
    }

    return { kelas: kelas, jumlah: jumlah, status: status, statusClass: statusClass };
  });

  return { success: true, totalKelas: rows.length, totalKosong: totalKosong, canGenerate: canGenerate, data: rows };
}

function prosesKirimWaliKelas() {
  const BUFFER_ID = "1lLcUABGJxYFjt7j1XmsYPGsHN0N6LtCyuH2Gkdf77co";
  const SHEET_NAME = "BufferWaliKelas";

  const ss = SpreadsheetApp.openById(BUFFER_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return { success: false, message: "Tidak ada data pesan untuk dikirim." };

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 13).getValues();
  const rowsToProcess = [];

  for (let i = 0; i < data.length; i++) {
    const status = String(data[i][8] || "").trim().toLowerCase();
    if (["pending", "failed", "gagal"].includes(status)) {
      rowsToProcess.push({
        rowIndex: i + 2,
        noHp: data[i][6],
        pesan: data[i][7],
        retry: Number(data[i][11] || 0)
      });
    }
  }

  if (rowsToProcess.length === 0) return { success: true, message: "Tidak ada pesan Pending/Failed." };

  const tz = Session.getScriptTimeZone();
  let sukses = 0, gagal = 0;

  rowsToProcess.forEach(item => {
    const hasil = kirimOneSenderWaliKelas_(item.noHp, item.pesan);
    const waktu = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy HH:mm:ss");

    if (hasil.success) {
      sheet.getRange(item.rowIndex, 9).setValue("Berhasil");
      sheet.getRange(item.rowIndex, 10).setValue(waktu);
      sheet.getRange(item.rowIndex, 11).setValue(hasil.response);
      sukses++;
    } else {
      sheet.getRange(item.rowIndex, 9).setValue("Gagal");
      sheet.getRange(item.rowIndex, 10).setValue(waktu);
      sheet.getRange(item.rowIndex, 11).setValue(hasil.response);
      sheet.getRange(item.rowIndex, 12).setValue(item.retry + 1);
      gagal++;
    }
    Utilities.sleep(1200);
  });

  return { success: true, sukses: sukses, gagal: gagal, total: rowsToProcess.length, message: `${sukses} berhasil, ${gagal} gagal dari ${rowsToProcess.length} pesan.` };
}

function kirimOneSenderWaliKelas_(idTujuan, ucapan) {
  idTujuan = String(idTujuan || "").trim();
  ucapan   = String(ucapan || "").trim();

  if (!idTujuan || !ucapan) return { success: false, response: "Data tidak lengkap." };

  const url = "https://wa5717.oneapi.my.id/api/v1/messages";
  const token = "u3bc8fd0cb829466.f144ce696aea4ec78567cf4eab20bfd2";
  const isGroup = idTujuan.includes("@g.us");

  const payload = {
    recipient_type: isGroup ? "group" : "individual",
    to: idTujuan,
    type: "text",
    text: { body: ucapan }
  };

  const options = {
    method: "post",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const res = UrlFetchApp.fetch(url, options);
    const code = res.getResponseCode();
    return { success: code >= 200 && code < 300, response: res.getContentText() };
  } catch (err) {
    return { success: false, response: err.toString() };
  }
}

function formatTanggalLengkap(dateObj) {
  const d = dateObj || new Date();
  const hariList = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const bulanList = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  return `${hariList[d.getDay()]}, ${d.getDate()} ${bulanList[d.getMonth()]} ${d.getFullYear()}`;
}

function kirimRekapGrupPiketDirect(tanggal, namaPetugas, pdfUrl) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetMaster = ss.getSheetByName("MasterPresensi");
  const sheetWali = ss.getSheetByName("WaliKelas") || SpreadsheetApp.openById("1lLcUABGJxYFjt7j1XmsYPGsHN0N6LtCyuH2Gkdf77co").getSheetByName("WaliKelas");

  if (!sheetMaster) return { success: false, message: "Sheet MasterPresensi tidak ditemukan." };

  const tz = Session.getScriptTimeZone();
  let dateObj = (tanggal && tanggal.includes("-")) ? new Date(tanggal.split("-")[0], tanggal.split("-")[1]-1, tanggal.split("-")[2]) : new Date();

  const tanggalSheet = Utilities.formatDate(dateObj, tz, "dd/MM/yyyy");
  const tanggalDisplay = formatTanggalLengkap(dateObj);
  const idGrupPiket = "6285659953357-1469965723@g.us";

  const waliMap = {};
  if (sheetWali) {
    const dataWali = sheetWali.getDataRange().getValues();
    const headerW = dataWali.shift() || [];
    const idxKelas = headerW.indexOf("Kelas");
    const idxNama  = headerW.indexOf("Nama Wali Kelas");

    if (idxKelas !== -1 && idxNama !== -1) {
      dataWali.forEach(row => {
        const kelas = String(row[idxKelas] || "").trim().toUpperCase();
        const nama  = String(row[idxNama] || "").trim();
        if (kelas && nama) waliMap[kelas] = nama;
      });
    }
  }

  const data = sheetMaster.getDataRange().getValues();
  const header = data.shift();
  const idxTanggal = header.indexOf("Tanggal");
  const idxKelas   = header.indexOf("Kelas");
  const idxTingkat = header.indexOf("Tingkat");
  const idxStatus  = header.indexOf("Status Masuk");

  const mapTingkat = {};
  let totalSiswaGlobal = 0, totalHadirGlobal = 0, totalTidakHadirGlobal = 0, totalPrakerinGlobal = 0, totalTidakScanGlobal = 0;
  let totalTerlambatGlobal = 0, totalSangatGlobal = 0, totalSangatSekaliGlobal = 0;
  let totalAlpaGlobal = 0, totalSakitGlobal = 0, totalIzinGlobal = 0;

  data.forEach(row => {
    const tgl = String(row[idxTanggal] || "").trim();
    if (tgl !== tanggalSheet) return;

    const kelas = String(row[idxKelas] || "").trim().toUpperCase();
    let tingkat = String(row[idxTingkat] || "").trim().toUpperCase();
    const st = String(row[idxStatus] || "").trim();
    if (!kelas) return;

    if (!tingkat) {
      if (kelas.includes(" X-") || kelas.includes(" X ")) tingkat = "X";
      else if (kelas.includes(" XI-") || kelas.includes(" XI ")) tingkat = "XI";
      else if (kelas.includes(" XII-") || kelas.includes(" XII ")) tingkat = "XII";
      else tingkat = "LAINNYA";
    }

    if (!mapTingkat[tingkat]) mapTingkat[tingkat] = {};
    if (!mapTingkat[tingkat][kelas]) {
      mapTingkat[tingkat][kelas] = { total: 0, hadir: 0, tidakScan: 0, terlambat: 0, sangatTerlambat: 0, sangatSekali: 0, tidakHadir: 0, alpa: 0, sakit: 0, izin: 0, prakerin: 0, libur: 0 };
    }

    const rec = mapTingkat[tingkat][kelas];
    rec.total++;
    totalSiswaGlobal++;

    if (["Tepat Waktu", "Terlambat", "Sangat Terlambat", "Sangat Terlambat Sekali", "Hadir Tidak Presensi"].includes(st)) {
      rec.hadir++;
      totalHadirGlobal++;
      if (st === "Hadir Tidak Presensi") { rec.tidakScan++; totalTidakScanGlobal++; }
      else if (st === "Terlambat") { rec.terlambat++; totalTerlambatGlobal++; }
      else if (st === "Sangat Terlambat") { rec.sangatTerlambat++; totalSangatGlobal++; }
      else if (st === "Sangat Terlambat Sekali") { rec.sangatSekali++; totalSangatSekaliGlobal++; }
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
  const persenHadirGlobal = Math.round((totalHadirGlobal / totalSiswaGlobal) * 100);
  const persenTHGlobal    = Math.round((totalTidakHadirGlobal / totalSiswaGlobal) * 100);
  const persenPrakerinGlobal = Math.round((totalPrakerinGlobal / totalSiswaGlobal) * 100);

  let pesanSummary = `Rekap Presensi Siswa, ${tanggalDisplay}\n`;
  pesanSummary += `Piket: ${namaPetugas || "Portal Piket"}\n`;
  pesanSummary += `===============================\n\n`;
  pesanSummary += `👥 *Total Siswa:* ${totalSiswaGlobal} Siswa\n`;
  pesanSummary += `✅ *Total Hadir:* ${totalHadirGlobal} Siswa (${persenHadirGlobal}%)\n`;
  pesanSummary += `❌ *Total Tidak Hadir:* ${totalTidakHadirGlobal} Siswa (${persenTHGlobal}%)\n`;
  if (totalPrakerinGlobal > 0) pesanSummary += `💼 *Prakerin:* ${totalPrakerinGlobal} Siswa (${persenPrakerinGlobal}%)\n`;

  pesanSummary += `\n*Rincian Ketidakhadiran:*\n`;
  if (totalTidakHadirGlobal === 0) {
    pesanSummary += `• Seluruh Siswa Hadir 🌟\n\n`;
  } else {
    pesanSummary += `• ${totalAlpaGlobal} Alpa\n• ${totalSakitGlobal} Sakit\n• ${totalIzinGlobal} Izin\n\n`;
  }

  pesanSummary += `*Rincian Kehadiran:*\n`;
  pesanSummary += `• ${totalTidakScanGlobal > 0 ? `${totalTidakScanGlobal} Siswa Tidak Scan` : "Seluruh Siswa Scan 🌟"}\n`;
  
  const totalLateGlobal = totalTerlambatGlobal + totalSangatGlobal + totalSangatSekaliGlobal;
  if (totalLateGlobal === 0) {
    pesanSummary += `• Seluruh Siswa Tepat Waktu 🌟\n\n`;
  } else {
    pesanSummary += `• ${totalTerlambatGlobal} Terlambat\n• ${totalSangatGlobal} Sangat Terlambat\n• ${totalSangatSekaliGlobal} Sangat Terlambat Sekali\n\n`;
  }

  pesanSummary += `===============================\n`;
  if (pdfUrl) pesanSummary += `📄 *PDF Rekap:* ${pdfUrl}\n`;
  pesanSummary += `🌐 *Portal Monitoring:* s.id/PresensiMedCom-Monitoring`;

  daftarPesanKirim.push(pesanSummary);

  daftarTingkat.forEach(tingkat => {
    const mapKelas = mapTingkat[tingkat];
    const daftarKelas = Object.keys(mapKelas).sort();
    const kelasAktif = daftarKelas.filter(k => mapKelas[k].hadir > 0);
    if (kelasAktif.length === 0) return;

    let pesan = "";
    kelasAktif.forEach((kelas, idx) => {
      const rec = mapKelas[kelas];
      const namaWali = waliMap[kelas] ? ` (${waliMap[kelas]})` : "";
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

      pesan += `*${kelas}*${namaWali}\n`;
      pesan += `*Total Hadir:* ${rec.hadir} Siswa\n`;
      pesan += `• ${pesanScan}\n`;
      pesan += `• ${pesanTerlambat}\n`;
      pesan += `*Total Tidak Hadir:* ${rec.tidakHadir} Siswa${rincianTidakHadir}\n`;
      pesan += `*Persentase Kehadiran:* ${persenStr}`;

      if (idx < kelasAktif.length - 1) pesan += `\n\n`;
    });

    if (pesan.trim()) daftarPesanKirim.push(pesan.trim());
  });

  let suksesKirim = 0, gagalKirim = 0;
  daftarPesanKirim.forEach((teksPesan, index) => {
    const hasil = kirimOneSenderWaliKelas_(idGrupPiket, teksPesan);
    if (hasil.success) suksesKirim++;
    else gagalKirim++;
    if (index < daftarPesanKirim.length - 1) Utilities.sleep(5000);
  });

  return { success: suksesKirim > 0, message: suksesKirim > 0 ? `${suksesKirim} rekap pesan berhasil dikirim ke WhatsApp!` : "Gagal mengirim rekap pesan." };
}