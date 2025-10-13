// ==UserScript==
// @name         Trasferimento WH Template - WebApp Sap CSV
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Inserisce seriali e ubicazioni da CSV separato da ; con report errori
// @match        http://172.18.20.20:8095/Transfer/Whs/?v=20250522
// @grant        GM_download
// ==/UserScript==

(function() {
    'use strict';

    const checkInterval = setInterval(() => {
        const strongElements = Array.from(document.querySelectorAll('strong'));
        if(strongElements.some(el => el.textContent.trim() === 'Verbali di scarico collegato')) {
            console.log('Script non avviato: Verbali di scarico collegato presente.');
            clearInterval(checkInterval);
            return;
        }
        clearInterval(checkInterval);
        addButton(); // avvia solo se il testo non è presente
    }, 200);

    let dati = [];
    let report = [];
    const wm = unsafeWindow.wm;

    function addButton() {
        if(document.getElementById('startBtn')) return;
        const btn = document.createElement('button');
        btn.id = 'startBtn';
        btn.textContent = '▶️';
        Object.assign(btn.style, {
            position: 'fixed', top: '10px', left: '10px',
            width: '40px', height: '40px', background: '#0d6efd',
            color: '#fff', border: 'none', borderRadius: '6px',
            cursor: 'pointer', fontSize: '16px', fontWeight: '600',
            zIndex: 9999
        });
        btn.addEventListener('click', startProcess);
        document.body.appendChild(btn);
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
                lines.forEach((line, idx) => {
                    if(idx === 0) return; // salta intestazione
                    if(!line.trim()) return; // salta righe vuote
                    const parts = line.split(';');
                    if(parts[7] && parts[9]){
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
        if(index >= dati.length){
            console.log('Processo completato!');
            downloadCSV();
            return;
        }

        const [seriale, ubicazione] = dati[index];
        let currentEntry = { seriale, ubicazione, stato: 'Caricato', tipoErrore: 'Nessuno' };

        const originalError = unsafeWindow.PNotify.error;
        unsafeWindow.PNotify.error = function(obj){
            currentEntry.stato = 'Errore';
            if(obj.text.toLowerCase().includes('serial')) currentEntry.tipoErrore = 'Errore seriale';
            else if(obj.text.toLowerCase().includes('ubic')) currentEntry.tipoErrore = 'Errore ubicazione';
            else currentEntry.tipoErrore = 'Errore generico';
            originalError(obj);
        };

        try { wm.scanG(seriale); } catch(e){ currentEntry.stato='Errore'; currentEntry.tipoErrore='Errore seriale'; }
        await new Promise(r => setTimeout(r, 300));
        try { wm.scanG(ubicazione); } catch(e){ currentEntry.stato='Errore'; currentEntry.tipoErrore='Errore ubicazione'; }
        await new Promise(r => setTimeout(r, 300));

        unsafeWindow.PNotify.error = originalError;
        report.push(currentEntry);

        insertSeriale(index+1);
    }

    function downloadCSV() {
        const csvContent = ['Seriale;Ubicazione;Stato;TipoErrore']
            .concat(report.map(e => [e.seriale, e.ubicazione, e.stato, e.tipoErrore].join(';')))
            .join('\n');

        GM_download({
            url: "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent),
            name: "report_seriali.csv",
            saveAs: true
        });
    }

    addButton();
})();
