// ==UserScript==
// @name         WH Template Articolo → Seriale → Ubicazione → Quantità (Excel + CSV)
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  Supporta sia Excel (.xlsx/.xls) che CSV - Rilevamento automatico
// @match        http://172.18.20.20/Transfer/Whs/*
// @grant        GM_download
// @require https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js
// ==/UserScript==
/* global XLSX */

(function() {
    'use strict';
    const wm = unsafeWindow.wm;
    let dati = [];
    let report = [];

    function delay(ms){ return new Promise(r => setTimeout(r, ms)); }

    async function waitForElement(selector, timeout = 8000) {
        const start = Date.now();
        while(Date.now() - start < timeout) {
            const el = document.querySelector(selector);
            if(el) return el;
            await delay(70);
        }
        return null;
    }

    async function clearKeyboard() {
        const delBtn = await waitForElement(".keypad-delete-button", 2000);
        if (!delBtn) return;
        for(let i=0; i<20; i++) { delBtn.click(); await delay(50); }
    }

    async function writeQuantity(qty) {
        const inputQty = document.querySelector('#lastQty');
        if (!inputQty) {
            console.warn("[writeQuantity] Input #lastQty non trovato!");
            return false;
        }

        let keypad = null;
        for (let i = 0; i < 15; i++) {
            keypad = document.querySelector(".keypad-buttons");
            if (keypad) break;

            if (i === 5 || i === 10) {
                console.log(`[writeQuantity] Tentativo ${i}: clicco su #lastQty per aprire keypad`);
                inputQty.click();
                inputQty.focus();
            }

            await delay(100);
        }

        if (!keypad) {
            console.error("[writeQuantity] Keypad non trovato dopo 15 tentativi!");
            return false;
        }

        await clearKeyboard();
        await delay(70);

        for (const digit of qty) {
            const btn = [...document.querySelectorAll(".keypad-button")]
                .find(b => b.textContent.trim() === digit ||
                          b.querySelector(".keypad-button-number")?.textContent === digit);
            if (btn) {
                btn.click();
                await delay(50);
            }
        }

        const okBtn = document.querySelector('.popover-close, a.link.sheet-close');
        if (okBtn) okBtn.click();
        await delay(150);
        return true;
    }

    async function insertUbicazioneWithCheckbox(ubicazione) {
        if (!ubicazione) return;
        const checkbox = document.querySelector('li[class*="pointer"] input[type="checkbox"][name="wm-checkbox-label"]');
        if (checkbox && !checkbox.checked) {
            checkbox.click();
            await delay(70);
        }
        wm.scanG(ubicazione);
        await delay(400);
        if (checkbox && checkbox.checked) {
            checkbox.click();
            await delay(100);
        }
    }

    async function insertData(i) {
        if (i >= dati.length) {
            downloadReport();
            return;
        }
        const r = dati[i];
        let entry = { articolo: r.articolo, seriale: r.seriale, ubicazione: r.ubicazione, quantita: r.quantita, stato: "OK", errore: "" };

        wm.scanG(r.articolo);
        await delay(400);

        let hasKeypad = false;
        for (let t = 0; t < 5; t++) {
            if (document.querySelector(".keypad-buttons")) { hasKeypad = true; break; }
            await delay(100);
        }

        const hasLastBatchNum = document.querySelector("#lastBatchnum")?.textContent.trim().length > 0;

        if (hasKeypad) {
            await writeQuantity(r.quantita);
            await insertUbicazioneWithCheckbox(r.ubicazione);
        } else if (hasLastBatchNum) {
            await insertUbicazioneWithCheckbox(r.ubicazione);
        } else {
            wm.scanG(r.seriale);
            await delay(500);

            hasKeypad = false;
            for (let t = 0; t < 8; t++) {
                if (document.querySelector(".keypad-buttons")) { hasKeypad = true; break; }
                await delay(100);
            }

            if (hasKeypad) {
                await writeQuantity(r.quantita);
            } else {
                if (r.ubicazionePrelievo) {
                    await insertUbicazioneWithCheckbox(r.ubicazionePrelievo);
                    await delay(400);
                }
                await writeQuantity(r.quantita);
            }
            await insertUbicazioneWithCheckbox(r.ubicazione);
        }

        report.push(entry);
        insertData(i + 1);
    }

    // ✅ PARSING EXCEL
    function parseExcel(arrayBuffer) {
        console.log("📊 Rilevato file Excel - parsing in corso...");

        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        const rows = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            defval: "",
            raw: false
        });

        console.log("Totale righe Excel:", rows.length);
        console.log("Header:", rows[0]);

        const parsed = [];

        rows.forEach((row, idx) => {
            if (idx === 0) return; // salta header

            if (!row || !row[1]) {
                console.log(`❌ Riga ${idx} scartata - articolo mancante`);
                return;
            }

            const articolo = String(row[1] || "").trim();
            const quantita = String(row[6] || "").trim();
            const seriale = String(row[7] || "").trim();
            const ubicazione = String(row[9] || "").trim();
            const ubicazionePrelievo = String(row[10] || "").trim();

            if (!articolo) {
                console.log(`❌ Riga ${idx} - articolo vuoto`);
                return;
            }

            parsed.push({
                articolo,
                quantita,
                seriale,
                ubicazione,
                ubicazionePrelievo: ubicazionePrelievo || null
            });

            console.log(`✅ Riga ${idx} caricata:`, { articolo, quantita, seriale, ubicazione });
        });

        return parsed;
    }

    // ✅ PARSING CSV
    function parseCSV(text) {
        console.log("📄 Rilevato file CSV - parsing in corso...");

        const lines = text.split(/\r?\n/);
        console.log("Totale righe CSV:", lines.length);

        const parsed = [];

        lines.forEach((line, idx) => {
            if (idx === 0) return; // salta header
            if (!line.trim()) return;

            const p = line.split(";");

            const articolo = (p[1] || "").trim();
            const quantita = (p[6] || "").trim();
            const seriale = (p[7] || "").trim();
            const ubicazione = (p[9] || "").trim();
            const ubicazionePrelievo = (p[10] || "").trim();

            if (!articolo) {
                console.log(`❌ Riga CSV ${idx + 1} - articolo vuoto`);
                return;
            }

            parsed.push({
                articolo,
                quantita,
                seriale,
                ubicazione,
                ubicazionePrelievo: ubicazionePrelievo || null
            });

            console.log(`✅ Riga CSV ${idx + 1} caricata:`, { articolo, quantita, seriale, ubicazione });
        });

        return parsed;
    }

    // ✅ FUNZIONE INTELLIGENTE DI CARICAMENTO
    function startProcess() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".xlsx,.xls,.csv"; // ← Accetta entrambi i formati

        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;

            const fileName = file.name.toLowerCase();
            const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
            const isCSV = fileName.endsWith('.csv');

            console.log("=== CARICAMENTO FILE ===");
            console.log("Nome file:", file.name);
            console.log("Tipo:", file.type);
            console.log("Dimensione:", (file.size / 1024).toFixed(2), "KB");

            const reader = new FileReader();

            reader.onload = evt => {
                try {
                    let parsed = [];

                    if (isExcel) {
                        // ✅ Parsing Excel
                        const arrayBuffer = evt.target.result;
                        parsed = parseExcel(arrayBuffer);
                    }
                    else if (isCSV) {
                        // ✅ Parsing CSV
                        const text = evt.target.result;
                        parsed = parseCSV(text);
                    }
                    else {
                        alert("⚠️ Formato file non riconosciuto!\n\nFormati supportati:\n- Excel (.xlsx, .xls)\n- CSV (.csv)");
                        return;
                    }

                    console.log("=== RIEPILOGO CARICAMENTO ===");
                    console.log("Righe caricate:", parsed.length);
                    console.log("Primi 3 record:", parsed.slice(0, 3));

                    console.table(parsed.map((d, i) => ({
                        idx: i + 1,
                        articolo: d.articolo,
                        qta: d.quantita,
                        seriale: d.seriale?.substring(0, 15) || '-',
                        ubicazione: d.ubicazione,
                        ubicPrelievo: d.ubicazionePrelievo?.substring(0, 10) || '-'
                    })));

                    if (parsed.length === 0) {
                        alert("⚠️ Nessun dato valido trovato nel file!\n\nVerifica che:\n- Il file abbia intestazioni nella prima riga\n- I dati partano dalla riga 2\n- La colonna B (articolo) non sia vuota");
                        return;
                    }

                    dati = parsed;
                    insertData(0);

                } catch (error) {
                    console.error("❌ Errore durante il parsing:", error);
                    alert("❌ Errore durante la lettura del file:\n\n" + error.message);
                }
            };

            reader.onerror = () => {
                console.error("❌ Errore lettura file");
                alert("❌ Impossibile leggere il file!");
            };

            // ✅ Leggi il file nel formato appropriato
            if (isExcel) {
                reader.readAsArrayBuffer(file);
            } else {
                reader.readAsText(file);
            }
        };

        input.click();
    }

    function downloadReport() {
        const header = "Articolo;Seriale;Ubicazione;Quantità;Stato;Errore";

        const rows = report.map(r => {
            const serialeTesto = r.seriale ? "'" + r.seriale : '';
            return `${r.articolo || ''};${serialeTesto};${r.ubicazione || ''};${r.quantita || ''};${r.stato};${r.errore}`;
        });

        const txt = [header, ...rows].join("\n");

        GM_download({
            url: "data:text/csv;charset=utf-8," + encodeURIComponent(txt),
            name: "report_lotti.csv",
            saveAs: true
        });
    }

    // PULSANTE NEL MENU
    const addMenuBtn = () => {
        const obs = new MutationObserver(() => {
            const menu = document.querySelector('.sheet-modal.userinfo-swipe-to-close');
            if (!menu || document.getElementById("btnCaricaLottiMenu")) return;

            const trasferisci = menu.querySelector('a[onclick="wm.trasferisci();"]');
            if (!trasferisci) return;

            const div = document.createElement('div');
            div.className = 'padding-horizontal padding-bottom';
            div.innerHTML = `
                <a class="button button-large button-fill" id="btnCaricaLottiMenu" style="background:#e74c3c;color:white;">
                    <i class="icon material-icons md-only">inbox</i>
                    <span style="margin-left:12px;font-weight:bold;">Carica Template (Excel/CSV)</span>
                </a>
            `;

            trasferisci.parentNode.parentNode.insertBefore(div, trasferisci.parentNode);

            div.querySelector('a').onclick = () => {
                menu.querySelector('.sheet-close')?.click();
                setTimeout(startProcess, 300);
            };
        });
        obs.observe(document.body, { childList: true, subtree: true });
    };

    addMenuBtn();
})();
