/* ==========================================================================
   RIWAYAT PRESENSI WIDGET ENGINE (PORTAL SISWA & PORTAL PIKET)
   ========================================================================== */
(function (global) {
  const RiwayatWidget = {
    apiUrl: "",
    mode: "siswa", // "siswa" | "piket"
    container: null,
    onNotify: null,
    store: {
      recentCache: {},
      fullCache: {},
      hasFullArchive: false,
      currentSiswa: null,
      rawPresensi: [],
      filterOptions: { taList: [], semesterMap: {} },
      currentFiltered: [],
      chartData: [],
      selectedDotIndex: null,
      activeRange: "1w"
    },

    init(options = {}) {
      this.apiUrl = options.apiUrl || (typeof API_URL !== "undefined" ? API_URL : "");
      this.mode = options.mode || "siswa";
      this.onNotify = typeof options.onNotify === "function" ? options.onNotify : null;

      const el = typeof options.containerId === "string"
        ? document.getElementById(options.containerId)
        : options.containerEl;

      if (!el) {
        console.error("[RiwayatWidget] Container tidak ditemukan.");
        return;
      }

      this.container = el;
      this.renderScaffold();
      this.bindGlobalEvents();
      this.initRangeDropdown();

      if (options.idSiswa) {
        if (this.mode === "piket") {
          const inp = this.q(".rw-input-nis");
          const clr = this.q(".rw-clear-nis");
          if (inp) inp.value = options.idSiswa;
          if (clr) clr.hidden = false;
        }
        this.loadStudentHistory(options.idSiswa);
      } else if (this.mode === "piket") {
        setTimeout(() => this.q(".rw-input-nis")?.focus(), 60);
      }
    },

    q(selector) {
      return this.container ? this.container.querySelector(selector) : null;
    },

    notify(msg, type = "info") {
      if (this.onNotify) this.onNotify(msg, type);
      else if (typeof showToast === "function") showToast(msg, type);
      else alert(msg);
    },

    reset() {
      this.setSearchDisabled(false);
      Object.assign(this.store, {
        currentSiswa: null,
        rawPresensi: [],
        currentFiltered: [],
        chartData: [],
        selectedDotIndex: null,
        activeRange: "1w"
      });

      if (!this.container) return;
      const inp = this.q(".rw-input-nis");
      const clr = this.q(".rw-clear-nis");
      if (inp) inp.value = "";
      if (clr) clr.hidden = true;

      const divEl = this.q(".rw-result-divider");
      const boxEl = this.q(".rw-student-box");
      if (divEl) divEl.style.display = "none";
      if (boxEl) boxEl.style.display = "none";

      this.q(".rw-result-wrap").style.display = "none";
      this.q(".rw-loading-box").style.display = "none";
      const ph = this.q(".rw-empty-box");
      ph.innerHTML = this.mode === "piket"
        ? `Silakan <strong>scan kartu QR siswa</strong> atau masukkan <strong>NIS</strong> di atas untuk melihat grafik riwayat kehadiran.`
        : `Data riwayat presensi belum dimuat.`;
      ph.style.display = "block";
    },

    renderScaffold() {
      const searchHeaderHTML = this.mode === "piket" ? `
        <div class="rw-search-grid">
          <div class="rw-filter-item" style="flex: 0 0 auto;">
            <label>Input ID / NIS Siswa:</label>
            <div class="rw-scan-row">
              <div class="rw-input-wrap">
                <input type="text" class="rw-input-text rw-input-nis" placeholder="Scan QR / ketik NIS...">
                <button type="button" class="rw-clear-btn rw-clear-nis" title="Hapus" hidden>✕</button>
              </div>
              <button type="button" class="rw-btn-primary rw-btn-cek">Cek</button>
            </div>
          </div>
          <div class="rw-result-divider" style="display:none; width:1px; align-self:stretch; background:#e2e8f0;"></div>
          <div class="rw-student-box" style="display:none; flex:1; flex-direction:column; justify-content:center; gap:6px; font-size:14px;">
            <div style="display:flex; align-items:baseline;">
              <span style="width:105px; font-weight:600; color:#64748b;">Nama Siswa</span>
              <span style="margin-right:8px; color:#64748b;">:</span>
              <span class="rw-res-nama" style="font-weight:700; color:#0f172a;">-</span>
            </div>
            <div style="display:flex; align-items:baseline;">
              <span style="width:105px; font-weight:600; color:#64748b;">Kelas</span>
              <span style="margin-right:8px; color:#64748b;">:</span>
              <span class="rw-res-kelas" style="font-weight:700; color:#0f172a;">-</span>
            </div>
          </div>
        </div>
      ` : "";

      this.container.innerHTML = `
        <div class="rw-container">
          ${searchHeaderHTML}

          <div class="rw-empty-box">
            ${this.mode === "piket"
              ? `Silakan <strong>scan kartu QR siswa</strong> atau masukkan <strong>NIS</strong> di atas untuk melihat grafik riwayat kehadiran.`
              : `Memuat riwayat presensi...`}
          </div>

          <div class="rw-loading-box" style="display:none;">
            <div class="rw-dots"><span></span><span></span><span></span></div>
            <div class="rw-loading-text">Memuat riwayat presensi...</div>
          </div>

          <div class="rw-result-wrap" style="display:none;">
            <div class="rw-toolbar-row">
              <div class="rw-range-wrap">
                <div class="rw-range-dropdown" data-value="1w"></div>
              </div>

              <div class="rw-inline-subfilter rw-sub-semester" style="display:none;">
                <div class="rw-sel-ta-sem" data-value="" style="flex:1; min-width:140px;"></div>
                <div class="rw-sel-sem-type" data-value="" style="flex:1.2; min-width:165px;"></div>
                <button type="button" class="rw-btn-primary rw-apply-sem">Terapkan</button>
              </div>

              <div class="rw-inline-subfilter rw-sub-ta" style="display:none;">
                <div class="rw-sel-ta-full" data-value="" style="flex:1; min-width:155px;"></div>
                <button type="button" class="rw-btn-primary rw-apply-ta">Terapkan</button>
              </div>

              <div class="rw-inline-subfilter rw-sub-custom" style="display:none;">
                <input type="date" class="rw-date-start" title="Dari Tanggal">
                <span class="rw-date-sep">s.d.</span>
                <input type="date" class="rw-date-end" title="Sampai Tanggal">
                <button type="button" class="rw-btn-primary rw-apply-custom">Terapkan</button>
              </div>
            </div>

            <div class="rw-stats-row">
              <div class="rw-stat-pill rw-tone-green" data-stat="tepat" style="display:none;"><label>Tepat Waktu</label><span>0</span></div>
              <div class="rw-stat-pill rw-tone-amber" data-stat="terlambat" style="display:none;"><label>Terlambat</label><span>0</span></div>
              <div class="rw-stat-pill rw-tone-purple" data-stat="htp" style="display:none;"><label>Tidak Presensi</label><span>0</span></div>
              <div class="rw-stat-pill rw-tone-green" data-stat="prakerin" style="display:none;"><label>Prakerin</label><span>0</span></div>
              <div class="rw-stat-pill rw-tone-green" data-stat="dispensasi" style="display:none;"><label>Dispensasi</label><span>0</span></div>
              <div class="rw-stat-pill rw-tone-green" data-stat="daring" style="display:none;"><label>Daring</label><span>0</span></div>
              <div class="rw-stat-pill rw-tone-cyan" data-stat="sakit" style="display:none;"><label>Sakit</label><span>0</span></div>
              <div class="rw-stat-pill rw-tone-blue" data-stat="izin" style="display:none;"><label>Izin</label><span>0</span></div>
              <div class="rw-stat-pill rw-tone-red" data-stat="alpa" style="display:none;"><label>Alpa</label><span>0</span></div>
            </div>

            <div class="rw-chart-card">
              <div class="rw-chart-scroll">
                <div class="rw-chart-inner">
                  <canvas class="rw-trend-canvas"></canvas>
                </div>
              </div>

              <div class="rw-legend-grid">
                <div class="rw-legend-item"><span class="rw-dot-legend" style="background:#15803d;"></span><span>Tepat Waktu / Dispensasi / Prakerin / Daring</span></div>
                <div class="rw-legend-item"><span class="rw-dot-legend" style="background:#d97706;"></span><span>Terlambat</span></div>
                <div class="rw-legend-item"><span class="rw-dot-legend" style="background:#c2410c;"></span><span>Sangat Terlambat</span></div>
                <div class="rw-legend-item"><span class="rw-dot-legend" style="background:#b91c1c;"></span><span>Sangat Terlambat Sekali</span></div>
                <div class="rw-legend-item"><span class="rw-dot-legend" style="background:#7c3aed;"></span><span>Hadir Tidak Presensi</span></div>
                <div class="rw-legend-item"><span class="rw-dot-legend" style="background:#0284c7;"></span><span>Izin</span></div>
                <div class="rw-legend-item"><span class="rw-dot-legend" style="background:#0891b2;"></span><span>Sakit</span></div>
                <div class="rw-legend-item"><span class="rw-dot-legend" style="background:#111827;"></span><span>Alpa</span></div>
              </div>
            </div>
          </div>
        </div>
      `;

      // Bind event tombol-tombol internal
      if (this.mode === "piket") {
        const inp = this.q(".rw-input-nis");
        const clr = this.q(".rw-clear-nis");
        const btnCek = this.q(".rw-btn-cek");

        inp?.addEventListener("input", () => { if (clr) clr.hidden = !inp.value; });
        inp?.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); this.searchByNis(); }
        });
        clr?.addEventListener("click", () => {
          if (inp) { inp.value = ""; inp.focus(); }
          clr.hidden = true;
        });
        btnCek?.addEventListener("click", () => this.searchByNis());
      }

      this.q(".rw-apply-sem")?.addEventListener("click", () => this.applySemesterFilter());
      this.q(".rw-apply-ta")?.addEventListener("click", () => this.applyTaFilter());
      this.q(".rw-apply-custom")?.addEventListener("click", () => this.applyCustomDateFilter());
    },

    bindGlobalEvents() {
      if (RiwayatWidget._globalBound) return;
      RiwayatWidget._globalBound = true;

      document.addEventListener("click", (e) => {
        if (!e.target.closest(".rw-dropdown")) {
          document.querySelectorAll(".rw-dropdown.open").forEach(el => el.classList.remove("open"));
        }
      });
    },

    createDropdown(containerEl, options, selectedValue, onSelect) {
      if (!containerEl) return;
      containerEl.classList.add("rw-dropdown");
      containerEl.innerHTML = `
        <div class="rw-dropdown-selected">
          <span class="rw-dropdown-text"></span>
          <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
        <div class="rw-dropdown-menu">
          <div class="rw-dropdown-menu-inner"></div>
        </div>
      `;

      const textSpan = containerEl.querySelector(".rw-dropdown-text");
      const menuOuter = containerEl.querySelector(".rw-dropdown-menu");
      const menuInner = containerEl.querySelector(".rw-dropdown-menu-inner");
      const selectedBox = containerEl.querySelector(".rw-dropdown-selected");

      const currentObj = options.find(opt => opt.value === selectedValue) || options[0] || { value: "", label: "-" };
      textSpan.innerText = currentObj.label;
      containerEl.setAttribute("data-value", currentObj.value);

      options.forEach(item => {
        const div = document.createElement("div");
        div.className = "rw-dropdown-item";
        div.setAttribute("data-value", item.value);
        div.innerText = item.label;
        menuInner.appendChild(div);
      });

      selectedBox.onclick = (e) => {
        e.stopPropagation();
        const isOpen = containerEl.classList.contains("open");
        document.querySelectorAll(".rw-dropdown.open").forEach(el => el.classList.remove("open"));
        if (!isOpen) containerEl.classList.add("open");
      };

      menuOuter.onclick = (e) => {
        e.stopPropagation();
        const item = e.target.closest(".rw-dropdown-item");
        if (!item) return;
        const val = item.getAttribute("data-value");
        const lbl = item.innerText;
        textSpan.innerText = lbl;
        containerEl.setAttribute("data-value", val);
        containerEl.classList.remove("open");
        if (typeof onSelect === "function") onSelect(val, lbl);
      };
    },

    initRangeDropdown() {
      const rangeDropEl = this.q(".rw-range-dropdown");
      const rangeOptions = [
        { value: "1w", label: "1 Minggu Terakhir" },
        { value: "1m", label: "1 Bulan Terakhir" },
        { value: "semester_select", label: "Per Semester" },
        { value: "ta_select", label: "Per Tahun Ajaran" },
        { value: "custom", label: "Kustom Rentang Tanggal" }
      ];

      this.createDropdown(rangeDropEl, rangeOptions, "1w", async (val) => {
        this.q(".rw-sub-semester").style.display = "none";
        this.q(".rw-sub-ta").style.display = "none";
        this.q(".rw-sub-custom").style.display = "none";

        if (val === "semester_select") {
          this.q(".rw-sub-semester").style.display = "flex";
        } else if (val === "ta_select") {
          this.q(".rw-sub-ta").style.display = "flex";
        } else if (val === "custom") {
          this.q(".rw-sub-custom").style.display = "flex";
        } else if (val === "1m") {
          if (await this.ensureFullArchive()) this.applyFilterRange("1m");
        } else {
          this.applyFilterRange(val);
        }
      });
    },

    searchByNis() {
      const nis = this.q(".rw-input-nis")?.value.trim() || "";
      if (!nis) {
        this.notify("Masukkan NIS atau scan barcode kartu siswa terlebih dahulu.", "info");
        this.q(".rw-input-nis")?.focus();
        return;
      }
      this.loadStudentHistory(nis);
    },

    setSearchDisabled(isDisabled) {
      const grid = this.q(".rw-search-grid");
      if (!grid) return;
      grid.classList.toggle("is-loading", isDisabled);
      const inp = this.q(".rw-input-nis");
      const clr = this.q(".rw-clear-nis");
      const btn = this.q(".rw-btn-cek");
      if (inp) inp.disabled = isDisabled;
      if (clr) clr.disabled = isDisabled;
      if (btn) btn.disabled = isDisabled;
    },

    async loadStudentHistory(idSiswa) {
      const cleanId = String(idSiswa || "").trim();
      if (!cleanId) return;

      const placeholderBox = this.q(".rw-empty-box");
      const loadingBox = this.q(".rw-loading-box");
      const loadingText = this.q(".rw-loading-text");
      const resultWrap = this.q(".rw-result-wrap");
      const dividerEl = this.q(".rw-result-divider");
      const studentBoxEl = this.q(".rw-student-box");

      placeholderBox.style.display = "none";
      resultWrap.style.display = "none";
      if (loadingText) loadingText.textContent = "Memuat riwayat presensi terkini...";
      loadingBox.style.display = "flex";
      if (dividerEl) dividerEl.style.display = "none";
      if (studentBoxEl) studentBoxEl.style.display = "none";

      this.setSearchDisabled(true);

      try {
        const isFull = Boolean(this.store.fullCache[cleanId]);
        let data = this.store.fullCache[cleanId] || this.store.recentCache[cleanId];

        if (!data) {
          const response = await fetch(this.apiUrl, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
              action: "getHistoryPresensiSiswa",
              idSiswa: cleanId,
              mode: "recent"
            })
          });

          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          data = await response.json();
          if (!data || data.success === false) {
            throw new Error(data?.message || "Data siswa tidak ditemukan.");
          }
          this.store.recentCache[cleanId] = data;
        }

        this.store.hasFullArchive = isFull;
        this.store.currentSiswa = data.siswa || { id_siswa: cleanId, nama: "Siswa", kelas: "-" };
        this.store.rawPresensi = Array.isArray(data.rawPresensi) ? data.rawPresensi : [];
        this.store.filterOptions = data.filterOptions || { taList: [], semesterMap: {} };
        this.store.selectedDotIndex = null;

        if (this.mode === "piket") {
          const namaEl = this.q(".rw-res-nama");
          const kelasEl = this.q(".rw-res-kelas");
          if (namaEl) namaEl.textContent = this.store.currentSiswa.nama || "-";
          if (kelasEl) kelasEl.textContent = this.store.currentSiswa.kelas || "-";
          if (dividerEl) dividerEl.style.display = "block";
          if (studentBoxEl) studentBoxEl.style.display = "flex";
        }

        this.populateSubFilters();

        const rangeDropEl = this.q(".rw-range-dropdown");
        if (rangeDropEl) {
          const txt = rangeDropEl.querySelector(".rw-dropdown-text");
          if (txt) txt.innerText = "1 Minggu Terakhir";
          rangeDropEl.setAttribute("data-value", "1w");
        }
        this.q(".rw-sub-semester").style.display = "none";
        this.q(".rw-sub-ta").style.display = "none";
        this.q(".rw-sub-custom").style.display = "none";

        loadingBox.style.display = "none";
        resultWrap.style.display = "block";

        this.applyFilterRange("1w");
      } catch (err) {
        console.error("[RiwayatWidget] Gagal load history:", err);
        if (dividerEl) dividerEl.style.display = "none";
        if (studentBoxEl) studentBoxEl.style.display = "none";
        loadingBox.style.display = "none";
        placeholderBox.innerHTML = `<span style="color:#b91c1c; font-weight:600;">⚠️ ${err.message}</span>`;
        placeholderBox.style.display = "block";
      } finally {
        this.setSearchDisabled(false);
      }
    },

    populateSubFilters() {
      const taList = this.store.filterOptions.taList || [];
      const selTaSem = this.q(".rw-sel-ta-sem");
      const selTaFull = this.q(".rw-sel-ta-full");
      const selSem = this.q(".rw-sel-sem-type");

      if (taList.length === 0) {
        const emptyOpt = [{ value: "", label: "Tidak ada data TA" }];
        this.createDropdown(selTaSem, emptyOpt, "", null);
        this.createDropdown(selTaFull, emptyOpt, "", null);
        this.createDropdown(selSem, [{ value: "", label: "-" }], "", null);
        return;
      }

      const taOptions = taList.map(ta => ({ value: ta, label: `TA ${ta}` }));
      this.createDropdown(selTaSem, taOptions, taList[0], () => this.updateSemesterOptions());
      this.createDropdown(selTaFull, taOptions, taList[0], null);
      this.updateSemesterOptions();
    },

    updateSemesterOptions() {
      const selectedTa = this.q(".rw-sel-ta-sem")?.getAttribute("data-value") || "";
      const selSem = this.q(".rw-sel-sem-type");
      const sems = this.store.filterOptions.semesterMap[selectedTa] || [];
      const semOptions = sems.length > 0
        ? sems.map(sem => ({
            value: sem,
            label: sem === "Ganjil" ? "Ganjil (Semester 1)" : (sem === "Genap" ? "Genap (Semester 2)" : sem)
          }))
        : [{ value: "", label: "Tidak ada semester" }];

      this.createDropdown(selSem, semOptions, semOptions[0].value, null);
    },

    async ensureFullArchive() {
      const cleanId = String(this.store.currentSiswa?.id_siswa || "").trim();
      if (!cleanId) return false;
      if (this.store.hasFullArchive) return true;

      if (this.store.fullCache[cleanId]) {
        const cached = this.store.fullCache[cleanId];
        this.store.rawPresensi = Array.isArray(cached.rawPresensi) ? cached.rawPresensi : [];
        this.store.filterOptions = cached.filterOptions || this.store.filterOptions;
        this.store.hasFullArchive = true;
        return true;
      }

      const loadingBox = this.q(".rw-loading-box");
      const loadingText = this.q(".rw-loading-text");
      const resultWrap = this.q(".rw-result-wrap");

      resultWrap.style.display = "none";
      if (loadingText) loadingText.textContent = "Memuat arsip presensi lintas semester...";
      loadingBox.style.display = "flex";
      this.setSearchDisabled(true);

      try {
        const response = await fetch(this.apiUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "getHistoryPresensiSiswa",
            idSiswa: cleanId,
            mode: "archive"
          })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!data || data.success === false) {
          throw new Error(data?.message || "Gagal memuat arsip presensi.");
        }

        this.store.fullCache[cleanId] = data;
        this.store.rawPresensi = Array.isArray(data.rawPresensi) ? data.rawPresensi : [];
        this.store.filterOptions = data.filterOptions || this.store.filterOptions;
        this.store.hasFullArchive = true;
        this.populateSubFilters();

        loadingBox.style.display = "none";
        resultWrap.style.display = "block";
        return true;
      } catch (err) {
        console.error("[RiwayatWidget] Gagal load arsip penuh:", err);
        loadingBox.style.display = "none";
        resultWrap.style.display = "block";
        this.notify(err.message || "Gagal memuat arsip lintas semester.", "error");
        return false;
      } finally {
        this.setSearchDisabled(false);
      }
    },

    async applySemesterFilter() {
      const ta = this.q(".rw-sel-ta-sem")?.getAttribute("data-value") || "";
      const sem = this.q(".rw-sel-sem-type")?.getAttribute("data-value") || "";
      if (!ta || !sem) return;
      if (await this.ensureFullArchive()) {
        this.applyFilterRange("semester", ta, sem);
      }
    },

    async applyTaFilter() {
      const ta = this.q(".rw-sel-ta-full")?.getAttribute("data-value") || "";
      if (!ta) return;
      if (await this.ensureFullArchive()) {
        this.applyFilterRange("tahun_ajaran", ta);
      }
    },

    async applyCustomDateFilter() {
      const start = this.q(".rw-date-start")?.value || "";
      const end = this.q(".rw-date-end")?.value || "";
      if (!start || !end) {
        this.notify("Pilih tanggal mulai dan tanggal akhir terlebih dahulu.", "info");
        return;
      }
      if (start > end) {
        this.notify("Tanggal mulai tidak boleh melebihi tanggal akhir.", "error");
        return;
      }
      if (await this.ensureFullArchive()) {
        this.applyFilterRange("custom", start, end);
      }
    },

    normalizeDateKey(value) {
      if (!value) return "";
      const raw = String(value).trim();
      let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
      m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) return `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
      return raw;
    },

    applyFilterRange(rangeType, param1 = null, param2 = null) {
      this.store.activeRange = rangeType;
      this.store.selectedDotIndex = null;

      const all = this.store.rawPresensi;
      let filtered = all;

      if (rangeType === "1w") {
        filtered = all.slice(-7);
      } else if (rangeType === "1m") {
        filtered = all.slice(-30);
      } else if (rangeType === "semester") {
        const targetDigit = param2 === "Ganjil" ? "1" : (param2 === "Genap" ? "2" : "");
        filtered = all.filter(p => {
          const matchTa = p.tahunAjaran === param1;
          if (p.idSemester) return matchTa && p.idSemester.endsWith(targetDigit);
          return matchTa && p.semester === param2;
        });
      } else if (rangeType === "tahun_ajaran") {
        filtered = all.filter(p => p.tahunAjaran === param1);
      } else if (rangeType === "custom") {
        filtered = all.filter(p => {
          const key = this.normalizeDateKey(p.isoDate || p.tanggal);
          return key >= param1 && key <= param2;
        });
      }

      this.store.currentFiltered = filtered;
      this.updateSummaryCards(filtered);
      this.renderTrendChart(filtered, rangeType);
    },

    updateSummaryCards(data) {
      const counts = {
        tepat: 0, terlambat: 0, htp: 0, prakerin: 0,
        dispensasi: 0, daring: 0, sakit: 0, izin: 0, alpa: 0
      };

      data.forEach(item => {
        const st = String(item.statusMasuk || "").trim().toLowerCase();
        if (st.includes("tepat")) counts.tepat++;
        else if (st.includes("terlambat")) counts.terlambat++;
        else if (st.includes("tidak presensi") || st === "htp") counts.htp++;
        else if (st.includes("prakerin") || st.includes("pkl")) counts.prakerin++;
        else if (st.includes("dispensasi")) counts.dispensasi++;
        else if (st.includes("daring")) counts.daring++;
        else if (st.includes("sakit")) counts.sakit++;
        else if (st.includes("izin")) counts.izin++;
        else if (st.includes("alpa")) counts.alpa++;
      });

      let visibleCards = 0;
      Object.entries(counts).forEach(([key, count]) => {
        const boxEl = this.q(`.rw-stat-pill[data-stat="${key}"]`);
        if (!boxEl) return;
        const valEl = boxEl.querySelector("span");
        if (valEl) valEl.textContent = count;
        boxEl.style.display = count > 0 ? "" : "none";
        if (count > 0) visibleCards++;
      });

      const rowEl = this.q(".rw-stats-row");
      if (rowEl) rowEl.style.display = visibleCards > 0 ? "flex" : "none";
    },

    formatChartAxisDate(item) {
      const iso = String(item.isoDate || item.date || "").trim();
      const ymd = iso.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (ymd) return `${ymd[3].padStart(2, "0")}/${ymd[2].padStart(2, "0")}/${ymd[1].slice(-2)}`;

      const str = String(item.tanggal || "").trim();
      const dmy = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
      if (dmy) return `${dmy[1].padStart(2, "0")}/${dmy[2].padStart(2, "0")}/${dmy[3].slice(-2)}`;

      const dmOnly = str.match(/^(\d{1,2})\/(\d{1,2})$/);
      if (dmOnly && item.tahunAjaran) {
        const taParts = String(item.tahunAjaran).match(/(\d{4})\D+(\d{4})/);
        if (taParts) {
          const monthNum = parseInt(dmOnly[2], 10);
          const fullYear = monthNum >= 7 ? taParts[1] : taParts[2];
          return `${dmOnly[1].padStart(2, "0")}/${dmOnly[2].padStart(2, "0")}/${fullYear.slice(-2)}`;
        }
      }
      return str.slice(0, 8);
    },

    renderTrendChart(data, filterRange = "1w") {
      const canvas = this.q(".rw-trend-canvas");
      const wrapper = this.q(".rw-chart-inner");
      const scrollContainer = this.q(".rw-chart-scroll");
      if (!canvas || !wrapper || !scrollContainer) return;

      const ctx = canvas.getContext("2d");
      const renderScale = Math.max(window.devicePixelRatio || 1, 2);
      const primaryColor = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#824653";

      const levelColors = {
        8: "#15803d", 7: "#d97706", 6: "#c2410c", 5: "#b91c1c",
        4: "#7c3aed", 3: "#0284c7", 2: "#0891b2", 1: "#111827"
      };

      const getStatusInfo = (statusStr) => {
        const s = String(statusStr || "").toLowerCase();
        if (s.includes("prakerin") || s.includes("dispensasi") || s.includes("daring") || s.includes("tepat")) {
          return { level: 8, color: levelColors[8], fullName: statusStr || "Tepat Waktu" };
        }
        if (s.includes("sangat terlambat sekali")) return { level: 5, color: levelColors[5], fullName: "Sangat Terlambat Sekali" };
        if (s.includes("sangat terlambat")) return { level: 6, color: levelColors[6], fullName: "Sangat Terlambat" };
        if (s.includes("terlambat")) return { level: 7, color: levelColors[7], fullName: "Terlambat" };
        if (s.includes("tidak presensi")) return { level: 4, color: levelColors[4], fullName: "Hadir Tidak Presensi" };
        if (s.includes("izin")) return { level: 3, color: levelColors[3], fullName: "Izin" };
        if (s.includes("sakit")) return { level: 2, color: levelColors[2], fullName: "Sakit" };
        if (s.includes("alpa")) return { level: 1, color: levelColors[1], fullName: "Alpa" };
        return { level: 8, color: levelColors[8], fullName: statusStr || "Tepat Waktu" };
      };

      this.store.chartData = (data || []).map(item => {
        const st = getStatusInfo(item.statusMasuk);
        const jamClean = String(item.jamMasuk || "").trim();
        return {
          label: this.formatChartAxisDate(item),
          jamMasuk: (jamClean && jamClean !== "-") ? jamClean : "",
          val: st.level,
          color: st.color,
          fullName: st.fullName
        };
      });

      const points = this.store.chartData;
      const parentWidth = scrollContainer.clientWidth || 680;
      let computedWidth = parentWidth;

      if (filterRange !== "1w" && points.length * 82 > parentWidth) {
        computedWidth = points.length * 82 + 24;
      }

      const width = computedWidth;
      const height = wrapper.clientHeight || 240;

      wrapper.style.width = width + "px";
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      canvas.width = Math.round(width * renderScale);
      canvas.height = Math.round(height * renderScale);

      ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.clearRect(0, 0, width, height);

      if (points.length === 0) {
        ctx.font = "500 12px Roboto";
        ctx.fillStyle = "#64748b";
        ctx.textAlign = "center";
        ctx.fillText("Belum ada data presensi pada periode ini", width / 2, height / 2);
        return;
      }

      const axisXPos = 6;
      const paddingLeft = 52;
      const paddingRight = 46;
      const paddingTop = 24;
      const paddingBottom = 56;
      const graphWidth = width - paddingLeft - paddingRight;
      const graphHeight = height - paddingTop - paddingBottom;
      const bottomAxisY = height - 20;

      points.forEach((item, i) => {
        item.x = points.length === 1 ? paddingLeft + graphWidth / 2 : paddingLeft + (i / (points.length - 1)) * graphWidth;
        item.y = paddingTop + graphHeight - ((item.val - 1) / 7) * graphHeight;
      });

      // Sumbu Y & X
      ctx.beginPath();
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1;
      ctx.moveTo(axisXPos, paddingTop);
      ctx.lineTo(axisXPos, bottomAxisY);
      ctx.lineTo(width - 20, bottomAxisY);
      ctx.stroke();

      for (let level = 1; level <= 8; level++) {
        const yPos = paddingTop + graphHeight - ((level - 1) / 7) * graphHeight;
        ctx.strokeStyle = "#e2e8f0";
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(axisXPos + 5, yPos);
        ctx.lineTo(width - 20, yPos);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(axisXPos, yPos, 2.8, 0, Math.PI * 2);
        ctx.fillStyle = levelColors[level];
        ctx.fill();
      }

      // Garis Kurva Bezier (Halus / Anti-Aliased)
      if (points.length > 1) {
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        for (let i = 0; i < points.length; i++) {
          const { x, y } = points[i];
          if (i === 0) ctx.moveTo(x, y);
          else {
            const prev = points[i - 1];
            const cpX = prev.x + (x - prev.x) / 2;
            ctx.bezierCurveTo(cpX, prev.y, cpX, y, x, y);
          }
        }
        ctx.stroke();
        ctx.restore();
      }

      // Crosshair jika dot diklik
      if (this.store.selectedDotIndex !== null && points[this.store.selectedDotIndex]) {
        const sel = points[this.store.selectedDotIndex];
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 1.4;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(sel.x, paddingTop);
        ctx.lineTo(sel.x, bottomAxisY);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Titik & Label Status + Jam
      points.forEach((item, idx) => {
        const isSelected = this.store.selectedDotIndex === idx;
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(item.x, item.y, 10, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(130, 70, 83, 0.22)";
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(item.x, item.y, isSelected ? 6.5 : 5, 0, Math.PI * 2);
        ctx.fillStyle = item.color;
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = isSelected ? "700 9.5px Roboto" : "500 9px Roboto";
        ctx.textAlign = "center";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 3;
        ctx.strokeText(item.fullName, item.x, item.y + 14);
        ctx.fillStyle = item.color;
        ctx.fillText(item.fullName, item.x, item.y + 14);

        if (item.jamMasuk) {
          ctx.font = "700 9px Roboto";
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 3;
          ctx.strokeText(item.jamMasuk, item.x, item.y + 24);
          ctx.fillStyle = "#334155";
          ctx.fillText(item.jamMasuk, item.x, item.y + 24);
        }

        ctx.fillStyle = isSelected ? "#0f172a" : "#64748b";
        ctx.font = isSelected ? "700 10.5px Roboto" : "500 10px Roboto";
        ctx.fillText(item.label, item.x, height - 6);
      });

      // Drag-to-Scroll (Desktop) & Klik Titik
      if (!scrollContainer.dataset.hasDragScroll) {
        scrollContainer.dataset.hasDragScroll = "true";
        canvas.ondragstart = () => false;

        let isPointerDown = false;
        let hasDragged = false;
        let startClientX = 0;
        let scrollLeftStart = 0;

        scrollContainer.addEventListener("mousedown", (e) => {
          if (e.button !== 0) return;
          isPointerDown = true;
          hasDragged = false;
          startClientX = e.clientX;
          scrollLeftStart = scrollContainer.scrollLeft;
          scrollContainer.classList.add("is-dragging");
        });

        window.addEventListener("mousemove", (e) => {
          if (!isPointerDown) return;
          const dx = e.clientX - startClientX;
          if (Math.abs(dx) > 4) hasDragged = true;
          if (hasDragged) {
            e.preventDefault();
            scrollContainer.scrollLeft = scrollLeftStart - dx;
          }
        });

        window.addEventListener("mouseup", (e) => {
          if (!isPointerDown) return;
          isPointerDown = false;
          scrollContainer.classList.remove("is-dragging");

          if (!hasDragged && e.target === canvas) {
            const rect = canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            let nearest = null;
            let minDist = Infinity;

            (this.store.chartData || []).forEach((pt, idx) => {
              const d = Math.abs(pt.x - clickX);
              if (d < minDist && d <= 32) {
                minDist = d;
                nearest = idx;
              }
            });

            const prevScroll = scrollContainer.scrollLeft;
            this.store.selectedDotIndex = (this.store.selectedDotIndex === nearest) ? null : nearest;
            this.renderTrendChart(this.store.currentFiltered, this.store.activeRange);
            scrollContainer.scrollLeft = prevScroll;
          }
        });
      }
    }
  };

  global.RiwayatWidget = RiwayatWidget;
})(window);