// ==UserScript==
// @name         Trasferimento WH Template - WebApp Sap Excel
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Inserisce seriali e ubicazioni da Excel + pulsante nel menu utente sopra Trasferisci
// @match        http://172.18.20.20:8095/Transfer/Whs/?v=20250522
// @require https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js
// @grant        GM_download
// ==/UserScript==

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
        // Cerchiamo prima l'input attivo, altrimenti quello generico
        let input = document.querySelector('input[type="text"]:focus, input[type="search"]:focus');
        if (!input) {
            input = document.querySelector('input[type="text"], input[type="search"]');
        }

        if (!input) {
            console.warn('Input scan non trovato, scan saltato:', valore);
            return;
        }

        input.focus();
        input.value = valore;                    // Imposta direttamente il valore
        // NON dispatchiamo più manualmente l'evento 'input' → evita l'errore .apply()
        setTimeout(() => wm.scanG(valore), 50);   // Piccolo delay per stabilità
    }

function startProcess() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';

    input.onchange = e => {
        const file = e.target.files[0];
        const reader = new FileReader();

        reader.onload = evt => {
            const data = new Uint8Array(evt.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            // prima sheet
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];

            // array di array (righe / colonne)
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            dati = [];

            rows.forEach((row, idx) => {
                if (idx === 0) return;        // salta header
                if (!row || row.length === 0) return;

                // STESSE COLONNE DEL CSV
                const seriale = row[7];
                const ubicazione = row[9];

                if (seriale && ubicazione) {
                    dati.push([
                        String(seriale).trim(),
                        String(ubicazione).trim()
                    ]);
                }
            });

            console.log('Dati caricati da Excel:', dati);
            insertSeriale(0);
        };

        reader.readAsArrayBuffer(file);
    };

    input.click();
}

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

        await new Promise(r => setTimeout(r, 800)); // aumentato per maggiore stabilità

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

        await new Promise(r => setTimeout(r, 800)); // aumentato

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
                    <span>Carica Template Seriali</span>
                </a>
            `;

            btnTrasferisci.parentNode.parentNode.insertBefore(wrapper, btnTrasferisci.parentNode);

            document.getElementById('btnCaricaSerialiMenu')
                .addEventListener('click', () => {
                    document.querySelector('.sheet-modal .sheet-close')?.click();
                    setTimeout(startProcess, 400);
                });

            console.log('Pulsante "Carica Template Seriali" aggiunto nel menu');
            observer.disconnect(); // una volta aggiunto, non serve più osservare
        });

        observer.observe(document.body, { childList: true, subtree: true });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', aggiungiPulsanteMenuSeriali);
    } else {
        aggiungiPulsanteMenuSeriali();
    }

})();
