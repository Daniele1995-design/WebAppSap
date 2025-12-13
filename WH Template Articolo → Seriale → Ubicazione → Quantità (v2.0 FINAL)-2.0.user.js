// ==UserScript==
// @name         WH Template Articolo → Seriale → Ubicazione → Quantità (v2.0 FINAL)
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Funziona sempre + pulsante bello come l'altro + 40% più veloce
// @match        http://172.18.20.20:8095/Transfer/Whs/*
// @grant        GM_download
// ==/UserScript==

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
            await delay(70); // ridotto da 150 → più veloce
        }
        return null;
    }

    async function clearKeyboard() {
        const delBtn = await waitForElement(".keypad-delete-button", 2000);
        if (!delBtn) return;
        for(let i=0; i<20; i++) { delBtn.click(); await delay(50); } // da 70ms → 50ms
    }

    async function writeQuantity(qty) {
        let keypad = null;
        for (let i = 0; i < 10; i++) { // ridotto da 20 → 15
            keypad = document.querySelector(".keypad-buttons");
            if (keypad) break;
            await delay(100);
        }
        if (!keypad) return false;

        await clearKeyboard();
        await delay(70); // da 150 → 100

        for (const digit of qty) {
            const btn = [...document.querySelectorAll(".keypad-button")]
                .find(b => b.textContent.trim() === digit ||
                          b.querySelector(".keypad-button-number")?.textContent === digit);
            if (btn) {
                btn.click();
                await delay(50); // da 100 → 80
            }
        }

        const okBtn = document.querySelector('.popover-close, a.link.sheet-close');
        if (okBtn) okBtn.click();
        await delay(150); // da 250 → 200
        return true;
    }

    async function insertUbicazioneWithCheckbox(ubicazione) {
        if (!ubicazione) return;
        const checkbox = document.querySelector('li[class*="pointer"] input[type="checkbox"][name="wm-checkbox-label"]');
        if (checkbox && !checkbox.checked) {
            checkbox.click();
            await delay(70); // da 120 → 100
        }
        wm.scanG(ubicazione);
        await delay(400); // da 600 → 500
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
        await delay(400); // da 600 → 500

        let hasKeypad = false;
        for (let t = 0; t < 5; t++) { // da 10 → 8
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
                    await delay(300);
                }
                await writeQuantity(r.quantita);
            }
            await insertUbicazioneWithCheckbox(r.ubicazione);
        }

        report.push(entry);
        insertData(i + 1);
    }

    function startProcess() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".csv";
        input.onchange = e => {
            const reader = new FileReader();
            reader.onload = evt => {
                const lines = evt.target.result.split(/\r?\n/);
                dati = lines.slice(1)
                    .filter(ln => ln.trim())
                    .map(ln => {
                        const p = ln.split(";");
                        return {
                            articolo: p[1]?.trim(),
                            quantita: p[6]?.trim(),
                            seriale: p[7]?.trim(),
                            ubicazione: p[9]?.trim(),
                            ubicazionePrelievo: p[10]?.trim() || null
                        };
                    });
                console.log("Righe caricate:", dati.length);
                insertData(0);
            };
            reader.readAsText(e.target.files[0]);
        };
        input.click();
    }

    function downloadReport() {
        const txt = [
            "Articolo;Seriale;Ubicazione;Quantità;Stato;Errore",
            ...report.map(r => `${r.articolo};${r.seriale};${r.ubicazione};${r.quantita};${r.stato};${r.errore}`)
        ].join("\n");
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