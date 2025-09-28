(function() {
    'use strict';

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
        input.accept = '.xlsx';
        input.onchange = e => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = evt => {
                const dataArray = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(dataArray, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                json.forEach((row, idx) => {
                    if(idx>0 && row[7] && row[9]){
                        dati.push([row[7].toString().trim(), row[9].toString().trim()]);
                    }
                });

                console.log('Dati caricati:', dati);
                insertSeriale(0);
            };
            reader.readAsArrayBuffer(file);
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

        // Proviamo a intercettare errori tramite PNotify
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
        const csvContent = ['Seriale,Ubicazione,Stato,TipoErrore']
            .concat(report.map(e => [e.seriale, e.ubicazione, e.stato, e.tipoErrore].join(',')))
            .join('\n');

        GM_download({
            url: "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent),
            name: "report_seriali.csv",
            saveAs: true
        });
    }

    addButton();
})();


