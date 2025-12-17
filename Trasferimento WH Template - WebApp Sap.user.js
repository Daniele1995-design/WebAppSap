// ==UserScript==
// @name         Trasferimento WH Template - WebApp Sap CSV
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  Inserisce seriali e ubicazioni da CSV + pulsante nel menu utente sopra Trasferisci
// @match        http://172.18.20.20:8095/Transfer/Whs/?v=20250522
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
        input.accept = '.csv';
        input.onchange = e => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = evt => {
                const text = evt.target.result;
                const lines = text.split(/\r?\n/);
                dati = [];
                lines.forEach((line, idx) => {
                    if (idx === 0) return;           // salta header
                    if (!line.trim()) return;        // salta righe vuote
                    const parts = line.split(';');
                    if (parts[7] && parts[9]) {
                        dati.push([parts[7].trim(), parts[9].trim()]);
                    }
                });
                console.log('Dati caricati:', dati);
                insertSeriale(0);
            };
            reader.readAsText(file);
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
