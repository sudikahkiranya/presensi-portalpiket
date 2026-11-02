/**
 * ============================================================================
 * 01_ROUTER.GS — MAIN API ROUTER (doPost & doGet)
 * ============================================================================
 */

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    let responseData = {};

    switch (action) {
      // ==========================================
      // 1. PORTAL PIKET
      // ==========================================
      case "login":
        responseData = verifikasiLoginPiket(data.idInput, data.kodeInput);
        break;
      case "simpanStatusMasuk":
        responseData = simpanStatusMasuk(data.payload);
        break;
      case "kirimRekapGrupPiketDirect":
        responseData = kirimRekapPresensiWA(data.tanggal, data.namaPetugas, data.pdfUrl);
        break;
      case "cetakRekapPdf":
        responseData = { success: true, url: buatRekapPresensiHarian(data.namaPetugas, data.tanggal) };
        break;

      // ==========================================
      // 2. PORTAL SISWA
      // ==========================================
      case "loginSiswa":
      case "verifikasiLoginSiswa":
        responseData = verifikasiLoginSiswa(data.idSiswa || data.id, data.kodeAkses || data.kode);
        break;
      case "getMasterDataSiswaApi":
        responseData = getMasterDataSiswaApi(data.idSiswa || data.nis);
        break;

      // ==========================================
      // 3. SCANNER APP VERCEL
      // ==========================================
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
          ? scannerSetJamOverrideStatus(data.enabled, data.dateKey)
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

async function doGet(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};

    // ROUTE HTML: Portal Siswa
    if (params.page === "siswa" || (!params.page && !params.action)) {
      const template = HtmlService.createTemplateFromFile("fe_login_siswa");
      template.logoSekolah = "https://i.imgur.com/rXQPXZw.png"; 
      return template.evaluate()
        .setTitle("Portal Presensi Siswa | SMK MedikaCom")
        .setFaviconUrl("https://i.imgur.com/rXQPXZw.png")
        .addMetaTag("viewport", "width=device-width, initial-scale=1.0, maximum-scale=1.0");
    }

    // ROUTE HTML: Scanner Presensi
    if (params.page === "scanner") {
      return HtmlService
        .createHtmlOutputFromFile("Scanner")
        .setTitle("Presensi SMK MedikaCom")
        .setFaviconUrl("https://i.imgur.com/rXQPXZw.png")
        .addMetaTag("viewport", "width=device-width, initial-scale=1.0");
    }

    // ==========================================
    // ROUTING API JSON
    // ==========================================
    const action = params.action || "";
    let responseData = {};

    switch (action) {
      // 1. PORTAL SISWA
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

      // 2. PORTAL PIKET
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
          const pdfUrl = await buatRekapPresensiHarian(params.namaPetugas, params.tanggal);
          responseData = { success: true, result: pdfUrl };
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

      // 3. SCANNER
      case "scannerGetStudents":
        responseData = getScannerStudents(String(params.forceRefresh || "") === "true");
        break;
      case "scannerGetSchedule":
        responseData = scannerGetSchedule();
        break;

      default:
        responseData = { success: false, message: "Action GET tidak dikenali: " + action };
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
