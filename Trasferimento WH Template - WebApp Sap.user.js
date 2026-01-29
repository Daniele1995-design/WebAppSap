// ==UserScript==
// @name         Trasferimento WH Template Seriali (Excel + CSV)
// @namespace    http://tampermonkey.net/
// @version      4.1
// @description  Inserisce seriali e ubicazioni da Excel o CSV - Rilevamento automatico
// @match        http://172.18.20.20:8095/Transfer/Whs/?v=20250522
// @require https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js
// @grant        GM_download
// ==/UserScript==
/* global XLSX */

(function() {
    'use strict';

    const checkInterval = setInterval(() => {
        const strongElements = Array.from(document.querySelectorAll('strong'));
        if (strongElements.some(el => el.textContent.trim() === 'Verbali di scarico collegato')) {
            console.log('Script non avviato: Verbali di scarico collegato presente.');
            clearInterval(checkInterval);
            return;
        }
        clearInterval(checkInterval);
    }, 200);

    let dati = [];
    let report = [];
    const wm = unsafeWindow.wm;

    // ===================================================
    // FIX: scan più stabile senza triggerare errori Framework7
    // ===================================================
    function forceScan(valore) {
        let input = document.querySelector('input[type="text"]:focus, input[type="search"]:focus');
        if (!input) {
            input = document.querySelector('input[type="text"], input[type="search"]');
        }

        if (!input) {
            console.warn('Input scan non trovato, scan saltato:', valore);
            return;
        }

        input.focus();
        input.value = valore;
        setTimeout(() => wm.scanG(valore), 50);
    }

    // ===================================================
    // PARSING EXCEL
    // ===================================================
    function parseExcel(arrayBuffer) {
        console.log('📊 Rilevato file Excel - parsing in corso...');

        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        const rows = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            defval: "",
            raw: false
        });

        console.log('Totale righe Excel:', rows.length);
        console.log('Header:', rows[0]);

        const parsed = [];

        rows.forEach((row, idx) => {
            if (idx === 0) return; // salta header
            if (!row || row.length === 0) return;

            const seriale = String(row[7] || "").trim();
            const ubicazione = String(row[9] || "").trim();

            if (!seriale || !ubicazione) {
                console.log(`❌ Riga Excel ${idx} scartata - seriale o ubicazione mancante`);
                return;
            }

            parsed.push([seriale, ubicazione]);
            console.log(`✅ Riga Excel ${idx} caricata:`, { seriale, ubicazione });
        });

        return parsed;
    }

    // ===================================================
    // PARSING CSV
    // ===================================================
    function parseCSV(text) {
        console.log('📄 Rilevato file CSV - parsing in corso...');

        const lines = text.split(/\r?\n/);
        console.log('Totale righe CSV:', lines.length);

        const parsed = [];

        lines.forEach((line, idx) => {
            if (idx === 0) return; // salta header
            if (!line.trim()) return;

            const parts = line.split(';');

            const seriale = (parts[7] || "").trim();
            const ubicazione = (parts[9] || "").trim();

            if (!seriale || !ubicazione) {
                console.log(`❌ Riga CSV ${idx + 1} scartata - seriale o ubicazione mancante`);
                return;
            }

            parsed.push([seriale, ubicazione]);
            console.log(`✅ Riga CSV ${idx + 1} caricata:`, { seriale, ubicazione });
        });

        return parsed;
    }

    // ===================================================
    // FUNZIONE INTELLIGENTE DI CARICAMENTO
    // ===================================================
    function startProcess() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xlsx,.xls,.csv'; // ← Accetta entrambi i formati

        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;

            const fileName = file.name.toLowerCase();
            const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
            const isCSV = fileName.endsWith('.csv');

            console.log('=== CARICAMENTO FILE ===');
            console.log('Nome file:', file.name);
            console.log('Tipo:', file.type);
            console.log('Dimensione:', (file.size / 1024).toFixed(2), 'KB');

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
                        alert('⚠️ Formato file non riconosciuto!\n\nFormati supportati:\n- Excel (.xlsx, .xls)\n- CSV (.csv)');
                        return;
                    }

                    console.log('=== RIEPILOGO CARICAMENTO ===');
                    console.log('Righe caricate:', parsed.length);
                    console.log('Primi 3 record:', parsed.slice(0, 3));

                    console.table(parsed.map((d, i) => ({
                        idx: i + 1,
                        seriale: d[0]?.substring(0, 20) || '-',
                        ubicazione: d[1]
                    })));

                    if (parsed.length === 0) {
                        alert('⚠️ Nessun dato valido trovato nel file!\n\nVerifica che:\n- Il file abbia intestazioni nella prima riga\n- I dati partano dalla riga 2\n- Le colonne H (seriale) e J (ubicazione) non siano vuote');
                        return;
                    }

                    dati = parsed;
                    insertSeriale(0);

                } catch (error) {
                    console.error('❌ Errore durante il parsing:', error);
                    alert('❌ Errore durante la lettura del file:\n\n' + error.message);
                }
            };

            reader.onerror = () => {
                console.error('❌ Errore lettura file');
                alert('❌ Impossibile leggere il file!');
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

    // ===================================================
    // INSERIMENTO SERIALI
    // ===================================================
    async function insertSeriale(index) {
        if (index >= dati.length) {
            console.log('Processo completato!');
            downloadCSV();
            return;
        }

        const [seriale, ubicazione] = dati[index];
        let currentEntry = {
            seriale,
            ubicazione,
            stato: 'Caricato',
            tipoErrore: 'Nessuno'
        };

        const originalError = unsafeWindow.PNotify.error;
        unsafeWindow.PNotify.error = function(obj) {
            currentEntry.stato = 'Errore';
            if (obj.text?.toLowerCase().includes('serial'))
                currentEntry.tipoErrore = 'Errore seriale';
            else if (obj.text?.toLowerCase().includes('ubic'))
                currentEntry.tipoErrore = 'Errore ubicazione';
            else
                currentEntry.tipoErrore = 'Errore generico';
            originalError(obj);
        };

        // -------- SCAN SERIALE --------
        try {
            forceScan(seriale);
        } catch (e) {
            currentEntry.stato = 'Errore';
            currentEntry.tipoErrore = 'Errore seriale';
            console.error('Errore scan seriale:', e);
        }

        await new Promise(r => setTimeout(r, 800));

        // Seleziona la riga
        const primaRigaCheckbox = document.querySelector(
            'li[class*="pointer"] input[type="checkbox"][name="wm-checkbox-label"]'
        );
        if (primaRigaCheckbox && !primaRigaCheckbox.checked) {
            primaRigaCheckbox.click();
            await new Promise(r => setTimeout(r, 300));
        }

        // -------- SCAN UBICAZIONE --------
        try {
            forceScan(ubicazione);
        } catch (e) {
            currentEntry.stato = 'Errore';
            currentEntry.tipoErrore = 'Errore ubicazione';
            console.error('Errore scan ubicazione:', e);
        }

        await new Promise(r => setTimeout(r, 800));

        // Deseleziona la riga per preparare la prossima
        if (primaRigaCheckbox && primaRigaCheckbox.checked) {
            primaRigaCheckbox.click();
            await new Promise(r => setTimeout(r, 300));
        }

        // Ripristina PNotify originale
        unsafeWindow.PNotify.error = originalError;

        report.push(currentEntry);
        insertSeriale(index + 1);
    }

    // ===================================================
    // DOWNLOAD REPORT
    // ===================================================
    function downloadCSV() {
        const header = 'Seriale;Ubicazione;Stato;TipoErrore';

        const rows = report.map(e => {
            const serialeTesto = e.seriale ? "'" + e.seriale : '';
            return `${serialeTesto};${e.ubicazione || ''};${e.stato || ''};${e.tipoErrore || ''}`;
        });

        const csvContent = [header, ...rows].join('\n');

        GM_download({
            url: 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent),
            name: 'report_seriali.csv',
            saveAs: true
        });
    }

    // ===================================================
    // PULSANTE MENU
    // ===================================================
    const aggiungiPulsanteMenuSeriali = () => {
        const observer = new MutationObserver(() => {
            const menu = document.querySelector('.sheet-modal.userinfo-swipe-to-close');
            if (!menu) return;
            if (document.getElementById('btnCaricaSerialiMenu')) return;

            const btnTrasferisci = menu.querySelector('a[onclick="wm.trasferisci();"]');
            if (!btnTrasferisci) return;

            const wrapper = document.createElement('div');
            wrapper.className = 'padding-horizontal padding-bottom';
            wrapper.innerHTML = `
                <a class="button button-large button-fill"
                   id="btnCaricaSerialiMenu"
                   style="background:#27ae60; color:white;">
                    <i class="icon material-icons md-only">list_alt</i>
                    <span>Carica Template solo Seriali (Excel/CSV)</span>
                </a>
            `;

            btnTrasferisci.parentNode.parentNode.insertBefore(wrapper, btnTrasferisci.parentNode);

            document.getElementById('btnCaricaSerialiMenu')
                .addEventListener('click', () => {
                    document.querySelector('.sheet-modal .sheet-close')?.click();
                    setTimeout(startProcess, 400);
                });

            console.log('Pulsante "Carica Template Seriali" aggiunto nel menu');
            observer.disconnect();
        });

        observer.observe(document.body, { childList: true, subtree: true });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', aggiungiPulsanteMenuSeriali);
    } else {
        aggiungiPulsanteMenuSeriali();
    }

})();
