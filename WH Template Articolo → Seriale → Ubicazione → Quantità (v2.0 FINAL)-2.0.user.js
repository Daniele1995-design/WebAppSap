// ==UserScript==
// @name         WH Template Articolo → Seriale → Ubicazione → Quantità Excel
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  Forza apertura keypad cliccando su #lastQty se necessario (focus su qty)
// @match        http://172.18.20.20:8095/Transfer/Whs/*
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
        // ✅ PRIMA: Verifica se l'input esiste e se il keypad è già aperto
        const inputQty = document.querySelector('#lastQty');
        if (!inputQty) {
            console.warn("[writeQuantity] Input #lastQty non trovato!");
            return false;
        }

        // ✅ Aspetta che il keypad appaia o forza l'apertura
        let keypad = null;
        for (let i = 0; i < 15; i++) {
            keypad = document.querySelector(".keypad-buttons");
            if (keypad) break;

            // ✅ Se il keypad non c'è, clicca sull'input per aprirlo
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
                    await delay(400); // ✅ Torno a 400ms (timing originale)
                }
                await writeQuantity(r.quantita); // ✅ Ora forza l'apertura del keypad se necessario
            }
            await insertUbicazioneWithCheckbox(r.ubicazione);
        }

        report.push(entry);
        insertData(i + 1);
    }

    function startProcess() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".xlsx,.xls";
        input.onchange = e => {
           const reader = new FileReader();
reader.onload = evt => {
    const data = new Uint8Array(evt.target.result);
    const workbook = XLSX.read(data, { type: 'array' });

    // prende il primo foglio (o puoi mettere il nome)
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // array di array
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    dati = [];

    rows.forEach((row, idx) => {
        if (idx === 0) return; // salta header
        if (!row || row.length < 11) return; // righe incomplete

        dati.push({
            articolo: String(row[1] || "").trim(),
            quantita: String(row[6] || "").trim(),
            seriale: String(row[7] || "").trim(),
            ubicazione: String(row[9] || "").trim(),
            ubicazionePrelievo: String(row[10] || "").trim() || null
        });
    });

    console.log("Righe caricate da Excel:", dati.length);
    insertData(0);
};

reader.readAsArrayBuffer(e.target.files[0]);
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

    // PULSANTE IDENTICO ALL'ALTRO SCRIPT (rosso con camion, sopra Trasferisci)
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
                    <span style="margin-left:12px;font-weight:bold;">Carica Template Lotti / Seriali</span>
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
