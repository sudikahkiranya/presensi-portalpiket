/**
 * ============================================================================
 * 04_MODULSCANNER.GS — BACKEND WEB APP SCANNER PRESENSI (VERCEL)
 * ============================================================================
 */

const SCANNER_CONFIG = Object.freeze({
  POOL_SPREADSHEET_ID: "1tKktILVCm0MHtiogYHOGO_jzB1Xl9nsDZc6ibcLqNDA",
  POOL_SHEET_NAME: "pool_raw",
  MASTER_STUDENT_SHEET: "master_siswa_aktif",
  TEMP_STUDENT_SHEET: "master_siswa_temporer",
  SCHEDULE_SHEET: "config_waktu_presensi",
  SPECIAL_SCHEDULE_SHEET: "config_jadwal_khusus",
  CACHE_STUDENTS_KEY: "SCANNER_MASTER_SISWA_V1",
  CACHE_STUDENTS_TTL: 300,
  TIME_ZONE: "Asia/Jakarta"
});

function scannerGetPoolSheet_() {
  const ss = SpreadsheetApp.openById(SCANNER_CONFIG.POOL_SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SCANNER_CONFIG.POOL_SHEET_NAME);
  if (!sheet) {
    throw new Error("Sheet pool_raw tidak ditemukan pada spreadsheet Pool_RAW.");
  }
  return sheet;
}

function scannerGetStudents_(forceRefresh) {
  const cache = CacheService.getScriptCache();
  const cacheKey = SCANNER_CONFIG.CACHE_STUDENTS_KEY;
  const metaKey = cacheKey + "_META";
  const cacheTTL = SCANNER_CONFIG.CACHE_STUDENTS_TTL;

  if (!forceRefresh) {
    try {
      const metaRaw = cache.get(metaKey);
      if (metaRaw) {
        const meta = JSON.parse(metaRaw);
        if (Number.isInteger(meta.parts) && meta.parts > 0 && meta.parts <= 100) {
          const parts = [];
          const keys = [];
          for (let i = 0; i < meta.parts; i++) keys.push(cacheKey + "_" + i);
          const cachedParts = cache.getAll(keys);
          for (let i = 0; i < keys.length; i++) {
            const part = cachedParts[keys[i]];
            if (typeof part !== "string") throw new Error("Cache siswa tidak lengkap.");
            parts.push(part);
          }
          const cachedStudents = JSON.parse(parts.join(""));
          if (cachedStudents && typeof cachedStudents === "object" && !Array.isArray(cachedStudents)) {
            return cachedStudents;
          }
        }
      }
    } catch (err) {
      Logger.log("Cache siswa tidak dapat dibaca: " + err.message);
    }
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = SCANNER_CONFIG.TIME_ZONE || "Asia/Jakarta";
  const students = {};

  const now = new Date();
  const todayDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  function formatPhotoUrl(photoUrl) {
    if (!photoUrl) return "";
    const fileMatch = String(photoUrl).match(/[-\w]{25,}/);
    if (fileMatch && /drive\.google\.com/i.test(photoUrl)) {
      return "https://lh3.googleusercontent.com/d/" + fileMatch[0] + "=s300";
    } else if (/^https?:\/\//i.test(photoUrl)) {
      return photoUrl;
    }
    return "";
  }

  function formatTimeVal(val) {
    if (val instanceof Date) return Utilities.formatDate(val, tz, "HH:mm");
    const s = String(val || "").trim();
    if (/^\d{1,2}:\d{2}/.test(s)) {
      const p = s.split(":");
      return String(p[0]).padStart(2, "0") + ":" + String(p[1]).padStart(2, "0");
    }
    return "";
  }

  function parseToDateOnlyTimestamp(val) {
    const d = parseToDate(val);
    return d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() : null;
  }

  // 1. BACA MASTER SISWA REGULER
  const mainSheet = ss.getSheetByName(SCANNER_CONFIG.MASTER_STUDENT_SHEET);
  if (mainSheet && mainSheet.getLastRow() >= 2) {
    const values = mainSheet.getDataRange().getDisplayValues();
    const headers = values[0].map(h => String(h || "").trim().toLowerCase());

    const index = {
      id: headers.indexOf("id_siswa"),
      nama: headers.indexOf("nama"),
      rombel: headers.indexOf("id_rombel"),
      tingkat: headers.indexOf("tingkat"),
      status: headers.indexOf("status"),
      foto: headers.indexOf("foto")
    };

    if (index.id !== -1 && index.nama !== -1 && index.rombel !== -1) {
      for (let i = 1; i < values.length; i++) {
        const row = values[i];
        const id = String(row[index.id] || "").trim();
        if (!id) continue;

        const status = index.status !== -1 ? String(row[index.status] || "").trim().toLowerCase() : "aktif";
        if (status && !["aktif", "active"].includes(status)) continue;

        const photoUrl = index.foto !== -1 ? String(row[index.foto] || "").trim() : "";

        students[id] = {
          idSiswa: id,
          name: String(row[index.nama] || "").trim(),
          class: String(row[index.rombel] || "").trim(),
          tingkat: index.tingkat !== -1 ? String(row[index.tingkat] || "").trim() : "",
          photo: formatPhotoUrl(photoUrl)
        };
      }
    }
  }

  // 2. BACA MASTER SISWA TEMPORER
  const tempSheetName = SCANNER_CONFIG.TEMP_STUDENT_SHEET || "master_siswa_temporer";
  const tempSheet = ss.getSheetByName(tempSheetName);

  if (tempSheet && tempSheet.getLastRow() >= 2) {
    const rawData = tempSheet.getDataRange().getValues();
    const headers = rawData[0].map(h => String(h || "").trim().toLowerCase());

    const idxT = {
      id: headers.indexOf("id_siswa"),
      nama: headers.indexOf("nama"),
      rombel: headers.indexOf("id_rombel"),
      tingkat: headers.indexOf("tingkat"),
      jMasuk: headers.indexOf("jam_masuk"),
      jPulang: headers.indexOf("jam_pulang"),
      tglMulai: headers.indexOf("tanggal_mulai"),
      tglAkhir: headers.indexOf("tanggal_berakhir")
    };

    if (idxT.id !== -1 && idxT.tglMulai !== -1 && idxT.tglAkhir !== -1) {
      for (let i = 1; i < rawData.length; i++) {
        const row = rawData[i];
        const id = String(row[idxT.id] || "").trim();
        if (!id) continue;

        const tsMulai = parseToDateOnlyTimestamp(row[idxT.tglMulai]);
        const tsAkhir = parseToDateOnlyTimestamp(row[idxT.tglAkhir]);

        const isMulaiValid = tsMulai === null || todayDateOnly >= tsMulai;
        const isAkhirValid = tsAkhir === null || todayDateOnly <= tsAkhir;

        if (isMulaiValid && isAkhirValid) {
          const customMasuk = idxT.jMasuk !== -1 ? formatTimeVal(row[idxT.jMasuk]) : "";
          const customPulang = idxT.jPulang !== -1 ? formatTimeVal(row[idxT.jPulang]) : "";
          const existingPhoto = students[id] ? students[id].photo : "";

          students[id] = {
            idSiswa: id,
            name: idxT.nama !== -1 ? String(row[idxT.nama] || "").trim() : "Siswa",
            class: idxT.rombel !== -1 ? String(row[idxT.rombel] || "").trim() : "",
            tingkat: idxT.tingkat !== -1 && row[idxT.tingkat] ? String(row[idxT.tingkat] || "").trim().toUpperCase() : "TKA",
            photo: existingPhoto,
            jamMasukKhusus: customMasuk,
            jamPulangKhusus: customPulang
          };
        }
      }
    }
  }

  // 3. CACHE RESULT
  try {
    const json = JSON.stringify(students);
    const chunkSize = 40000;
    const parts = [];
    for (let i = 0; i < json.length; i += chunkSize) parts.push(json.substring(i, i + chunkSize));

    cache.remove(metaKey);
    for (let i = 0; i < parts.length; i += 50) {
      const entries = {};
      for (let j = i; j < Math.min(i + 50, parts.length); j++) entries[cacheKey + "_" + j] = parts[j];
      cache.putAll(entries, cacheTTL);
    }
    cache.put(metaKey, JSON.stringify({ parts: parts.length }), cacheTTL);
  } catch (err) {
    Logger.log("Cache scanner error: " + err.message);
  }

  return students;
}

function scannerGetTodayAttendance_() {
  const result = {
    totalHadirAwal: 0,
    listHadirAwal: [],
    totalPulangAwal: 0,
    listPulangAwal: [],
    perJurusanAwal: {
      AKUNTANSI: 0, DKV: 0, FARMASI: 0, KULINER: 0, RPL: 0, TKR: 0, TKJ: 0, TPM: 0, TSM: 0
    }
  };

  const ss = SpreadsheetApp.openById(SCANNER_CONFIG.POOL_SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SCANNER_CONFIG.POOL_SHEET_NAME);
  if (!sheet) throw new Error("Sheet pool_raw tidak ditemukan.");

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return result;

  const maxRows = 5000;
  const startRow = Math.max(2, lastRow - maxRows + 1);
  const rows = sheet.getRange(startRow, 1, lastRow - startRow + 1, 5).getValues();

  const tz = SCANNER_CONFIG.TIME_ZONE || "Asia/Jakarta";
  const today = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");

  const masukById = new Map();
  const pulangIds = new Set();

  function normalisasiJurusanScanner_(kelas) {
    const s = String(kelas || "").trim().toUpperCase();
    if (s.includes("AKN") || s.includes("AKUNTANSI")) return "AKUNTANSI";
    if (s.includes("DKV")) return "DKV";
    if (s.includes("FAR")) return "FARMASI";
    if (s.includes("KLN") || s.includes("KULINER")) return "KULINER";
    if (s.includes("RPL")) return "RPL";
    if (s.includes("TKR")) return "TKR";
    if (s.includes("TKJ")) return "TKJ";
    if (s.includes("TPM")) return "TPM";
    if (s.includes("TSM")) return "TSM";
    return "";
  }

  rows.forEach(row => {
    const id = String(row[0] || "").trim();
    const kelas = String(row[2] || "").trim();
    const rawTimestamp = row[3];
    const status = String(row[4] || "").trim().toUpperCase();

    if (!id || !rawTimestamp) return;
    if (status !== "MASUK" && status !== "PULANG") return;

    const dateObj = rawTimestamp instanceof Date ? rawTimestamp : new Date(rawTimestamp);
    if (isNaN(dateObj.getTime())) return;

    const dateKey = Utilities.formatDate(dateObj, tz, "yyyy-MM-dd");
    if (dateKey !== today) return;

    if (status === "MASUK") {
      if (!masukById.has(id)) {
        masukById.set(id, {
          nis: id,
          time: Utilities.formatDate(dateObj, tz, "HH:mm:ss"),
          kelas: kelas,
          timestampMs: dateObj.getTime()
        });
      }
    } else {
      pulangIds.add(id);
    }
  });

  const listMasuk = Array.from(masukById.values()).sort((a, b) => a.timestampMs - b.timestampMs);
  listMasuk.forEach(item => {
    const key = normalisasiJurusanScanner_(item.kelas);
    if (key && Object.prototype.hasOwnProperty.call(result.perJurusanAwal, key)) {
      result.perJurusanAwal[key]++;
    }
  });

  result.totalHadirAwal = listMasuk.length;
  result.listHadirAwal = listMasuk.map(item => ({ nis: item.nis, time: item.time, kelas: item.kelas }));
  result.totalPulangAwal = pulangIds.size;
  result.listPulangAwal = Array.from(pulangIds);

  return result;
}

function getScannerDashboardData() {
  try {
    const students = scannerGetStudents_(false) || {};
    const studentIds = Object.keys(students);
    const attendance = scannerGetTodayAttendance_() || {};
    const scheduleResult = scannerGetSchedule() || {};
    const totalSiswaPerJurusan = {};

    studentIds.forEach(function (id) {
      const student = students[id];
      if (!student) return;
      const kelas = String(student.class || "").toUpperCase().trim();
      if (!kelas) return;

      if (kelas.includes("AKN")) totalSiswaPerJurusan["AKN"] = (totalSiswaPerJurusan["AKN"] || 0) + 1;
      else if (kelas.includes("MPLB")) totalSiswaPerJurusan["MPLB"] = (totalSiswaPerJurusan["MPLB"] || 0) + 1;
      else if (kelas.includes("PPLG")) totalSiswaPerJurusan["PPLG"] = (totalSiswaPerJurusan["PPLG"] || 0) + 1;
      else if (kelas.includes("TJKT")) totalSiswaPerJurusan["TJKT"] = (totalSiswaPerJurusan["TJKT"] || 0) + 1;
      else if (kelas.includes("DKV")) totalSiswaPerJurusan["DKV"] = (totalSiswaPerJurusan["DKV"] || 0) + 1;
    });

    return {
      success: true,
      students: students,
      totalSiswa: studentIds.length,
      totalSiswaPerJurusan: totalSiswaPerJurusan,
      totalHadirAwal: Number(attendance.totalHadirAwal) || 0,
      listHadirAwal: Array.isArray(attendance.listHadirAwal) ? attendance.listHadirAwal : [],
      totalPulangAwal: Number(attendance.totalPulangAwal) || 0,
      listPulangAwal: Array.isArray(attendance.listPulangAwal) ? attendance.listPulangAwal : [],
      perJurusanAwal: attendance.perJurusanAwal || {},
      configHariIni: scheduleResult.schedule || null
    };
  } catch (error) {
    return {
      success: false,
      message: error && error.message ? error.message : String(error)
    };
  }
}

function getScannerStudents(forceRefresh) {
  const students = scannerGetStudents_(!!forceRefresh);
  return {
    success: true,
    students: students,
    totalSiswa: Object.keys(students).length
  };
}

function scannerRecordScan(payload) {
  if (!payload) return { success: false, reason: "INVALID_PAYLOAD" };

  const idSiswa = String(payload.id_siswa || payload.idSiswa || "").trim();
  if (!idSiswa) return { success: false, reason: "EMPTY_ID" };

  const statusScan = String(payload.status_scan || payload.statusScan || "MASUK").trim().toUpperCase();
  if (!["MASUK", "PULANG"].includes(statusScan)) return { success: false, reason: "INVALID_STATUS_SCAN" };

  const statusPresensi = String(payload.status_presensi || payload.statusPresensi || "").trim().toUpperCase();

  const students = scannerGetStudents_(false);
  const student = students[idSiswa];
  if (!student) return { success: false, reason: "STUDENT_NOT_FOUND" };

  let timestamp = new Date();
  if (payload.timeISO) {
    const parsed = new Date(payload.timeISO);
    if (!isNaN(parsed.getTime())) timestamp = parsed;
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const sheet = scannerGetPoolSheet_();

    const batchId = Utilities.getUuid();
    const nextRow = sheet.getLastRow() + 1;

    sheet.getRange(nextRow, 1, 1, 8).setValues([[
      student.idSiswa,
      student.name,
      student.class,
      timestamp,
      statusScan,
      "PENDING",
      batchId,
      statusPresensi
    ]]);

    return {
      success: true,
      id_siswa: student.idSiswa,
      nama: student.name,
      id_rombel: student.class,
      tingkat: student.tingkat,
      foto: student.photo,
      timestamp: timestamp.toISOString(),
      status_scan: statusScan,
      status_proses: "PENDING",
      batch_id: batchId
    };
  } catch (err) {
    return { success: false, reason: "SYSTEM_ERROR", message: err.message };
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

function scannerGetSchedule() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = SCANNER_CONFIG.TIME_ZONE || "Asia/Jakarta";
  const todayStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");

  const fallbackDefault = {
    jamMasuk: "06:45",
    batasTerlambat: 30,
    batasSangatTerlambat: 60,
    batasSangatTerlambatSekali: 90,
    jamPulang: "11:00"
  };

  function toTimeStr(val, def) {
    if (val instanceof Date) return Utilities.formatDate(val, tz, "HH:mm");
    const s = String(val || "").trim();
    if (/^\d{1,2}:\d{2}/.test(s)) {
      const p = s.split(":");
      return String(p[0]).padStart(2, "0") + ":" + String(p[1]).padStart(2, "0");
    }
    return def;
  }

  let defaultSchedule = Object.assign({}, fallbackDefault);
  const regSheet = ss.getSheetByName(SCANNER_CONFIG.SCHEDULE_SHEET);
  if (regSheet && regSheet.getLastRow() >= 2) {
    const regData = regSheet.getDataRange().getValues();
    const regHeaders = regData[0].map(h => String(h || "").trim().toLowerCase());
    const idxH = regHeaders.indexOf("hari");
    const idxM = regHeaders.indexOf("jam_masuk");
    const idxP = regHeaders.indexOf("jam_pulang");
    const idxT = regHeaders.indexOf("batas_terlambat");
    const idxST = regHeaders.indexOf("batas_sangat_terlambat");
    const idxSTS = regHeaders.indexOf("batas_sangat_terlambat_sekali");

    const days = ["minggu", "senin", "selasa", "rabu", "kamis", "jumat", "sabtu"];
    const todayName = days[new Date().getDay()];
    const rowReg = regData.slice(1).find(r => String(r[idxH] || "").trim().toLowerCase() === todayName);

    if (rowReg) {
      defaultSchedule.jamMasuk = toTimeStr(rowReg[idxM], fallbackDefault.jamMasuk);
      defaultSchedule.jamPulang = toTimeStr(rowReg[idxP], fallbackDefault.jamPulang);
      if (idxT !== -1) defaultSchedule.batasTerlambat = Number(rowReg[idxT]) || 30;
      if (idxST !== -1) defaultSchedule.batasSangatTerlambat = Number(rowReg[idxST]) || 60;
      if (idxSTS !== -1) defaultSchedule.batasSangatTerlambatSekali = Number(rowReg[idxSTS]) || 90;
    }
  }

  const byLevel = {};
  let isKhusus = false;
  let keteranganHariIni = "";

  const specSheet = ss.getSheetByName(SCANNER_CONFIG.SPECIAL_SCHEDULE_SHEET);
  if (specSheet && specSheet.getLastRow() >= 2) {
    const specData = specSheet.getDataRange().getValues();
    const specHeaders = specData[0].map(h => String(h || "").trim().toLowerCase());
    const idxTgl = specHeaders.indexOf("tanggal");
    const idxTkt = specHeaders.indexOf("tingkat");
    const idxMasuk = specHeaders.indexOf("jam_masuk");
    const idxPulang = specHeaders.indexOf("jam_pulang");
    const idxKet = specHeaders.indexOf("keterangan");

    if (idxTgl !== -1 && idxTkt !== -1 && idxMasuk !== -1 && idxPulang !== -1) {
      specData.slice(1).forEach(r => {
        let rawDate = r[idxTgl];
        let rowDateStr = (rawDate instanceof Date) 
          ? Utilities.formatDate(rawDate, tz, "yyyy-MM-dd") 
          : String(rawDate || "").trim().substring(0, 10);

        if (rowDateStr === todayStr) {
          const tkt = String(r[idxTkt] || "").trim().toUpperCase();
          const jm = toTimeStr(r[idxMasuk], defaultSchedule.jamMasuk);
          const jp = toTimeStr(r[idxPulang], defaultSchedule.jamPulang);
          if (tkt && jm && jp) {
            byLevel[tkt] = { jamMasuk: jm, jamPulang: jp };
            isKhusus = true;
            if (idxKet !== -1 && r[idxKet]) keteranganHariIni = String(r[idxKet]).trim();
          }
        }
      });
    }
  }

  return {
    success: true,
    schedule: {
      isKhusus: isKhusus,
      keterangan: keteranganHariIni,
      default: defaultSchedule,
      byLevel: byLevel,
      allowedLevels: ["X", "XI", "XII"]
    }
  };
}

function scannerClearCache() {
  CacheService.getScriptCache().remove(SCANNER_CONFIG.CACHE_STUDENTS_KEY);
  return { success: true, message: "Cache siswa scanner dibersihkan." };
}

function scannerSha256Hex_(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? "0" + v : v;
  }).join("");
}

function scannerVerifySettingsPin(pin) {
  const hash = scannerSha256Hex_(String(pin || ""));
  const props = PropertiesService.getScriptProperties();
  const superHash = props.getProperty("SCANNER_SUPERADMIN_PIN_SHA256");
  const staffHash = props.getProperty("SCANNER_PETUGAS_PIN_SHA256");
  if (!staffHash || !superHash) return { success: false, message: "PIN belum disiapkan." };
  if (hash === superHash) return { success: true, role: "superadmin", token: scannerIssueAdminToken_() };
  if (hash === staffHash) return { success: true, role: "petugas" };
  return { success: false, message: "PIN salah." };
}

function scannerVerifySuperAdminPin(pin) {
  const props = PropertiesService.getScriptProperties();
  const expected = props.getProperty("SCANNER_SUPERADMIN_PIN_SHA256");
  if (!expected) return { success: false, message: "PIN Super Admin belum disiapkan." };
  const valid = scannerSha256Hex_(String(pin || "")) === expected;
  return valid ? { success: true, role: "superadmin", token: scannerIssueAdminToken_() } : { success: false, message: "PIN Super Admin salah." };
}

function scannerIssueAdminToken_() {
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put("SCANNER_ADMIN_TOKEN_" + token, "1", 1800);
  return token;
}

function scannerRequireAdminToken_(token) {
  if (!token || CacheService.getScriptCache().get("SCANNER_ADMIN_TOKEN_" + token) !== "1") {
    throw new Error("Akses ditolak. Verifikasi Super Admin diperlukan.");
  }
  return true;
}

function scannerGetProtectionSettings() {
  const raw = PropertiesService.getScriptProperties().getProperty("SCANNER_PROTECTION_CONFIG");
  let config = {};
  try { config = raw ? JSON.parse(raw) : {}; } catch (_) {}
  return { success: true, config: config };
}

function scannerSaveProtectionSettings(config, token) {
  scannerRequireAdminToken_(token);
  if (!config || typeof config !== "object") return { success: false, message: "Konfigurasi tidak valid." };
  const clean = {
    manualInput: config.manualInput === true,
    autoDelete: config.autoDelete === true,
    paste: config.paste === true,
    dragDrop: config.dragDrop === true,
    clipboardShortcut: config.clipboardShortcut === true
  };
  PropertiesService.getScriptProperties().setProperty("SCANNER_PROTECTION_CONFIG", JSON.stringify(clean));
  return { success: true, config: clean };
}

function scannerSetJamOverrideStatus(enabled, dateKey) {
  const today = Utilities.formatDate(new Date(), SCANNER_CONFIG.TIME_ZONE, "yyyy-MM-dd");
  if (String(dateKey || "") !== today) {
    return { success: false, message: "Tanggal konfigurasi sudah kedaluwarsa." };
  }
  const state = { date: today, enabled: (enabled === true), updatedAt: new Date().toISOString() };
  PropertiesService.getScriptProperties().setProperty("SCANNER_JAM_OVERRIDE_STATUS", JSON.stringify(state));
  return { success: true, state: state };
}
