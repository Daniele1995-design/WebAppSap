// ==UserScript==
// @name         GRN - Controllo BOM + CSV + Etichette Collo Singole (Definitivo Perfetto)
// @namespace    http://tampermonkey.net/
// @version      4.6
// @description  BOM perfetto + CSV completo + Etichette con QR nitidi (30x30) + campi ravvicinati
// @author       Daniele
// @match        http://172.18.20.20/GRN/*
// @match        http://172.18.20.20:8095/GRN/*
// @require      https://cdn.jsdelivr.net/npm/papaparse@5.3.0/papaparse.min.js
// @grant        GM_download
// ==/UserScript==

(function() {
    'use strict';
    const LOGO_URL = "https://raw.githubusercontent.com/Daniele1995-design/WebAppSap/refs/heads/main/logo%20ats.jpg";
    const LOGO_URL2 = "https://raw.githubusercontent.com/Daniele1995-design/WebAppSap/refs/heads/main/PackingList.png";

    // ===================== CARICAMENTO BOM =====================
    const DRIVE_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTvprxVE4qAvY5PMFEoz1tUi3yIynkE0fjCAebj10_v3wJEj-ezdtgYvJawAh2DqLX40f3pH6WUcDbS/pub?output=csv";
    const BOM_CSV_URL = "https://corsproxy.io/?" + encodeURIComponent(DRIVE_CSV_URL);
    let bomData = {};
    console.log("Avvio BOM definitivo...");
    Papa.parse(BOM_CSV_URL, {
        download: true,
        header: false,
        skipEmptyLines: true,
        complete: function(results) {
            results.data.forEach(row => {
                const wmsCode = (row[0] || "").trim().toUpperCase();
                const materialCode = (row[1] || "").trim();
                const figlio = (row[4] || "").trim().toUpperCase();
                const pnFiglio = (row[3] || "").trim();
                const qty = parseInt(row[6] || "0", 10);
                if (wmsCode && figlio && qty > 0) {
                    if (!bomData[wmsCode]) {
                        bomData[wmsCode] = { materialCode, figli: [] };
                    }
                    bomData[wmsCode].figli.push({ figlio, pn: pnFiglio, qty });
                }
            });
            console.log(`✅ BOM caricata: ${Object.keys(bomData).length} padri trovati`);
            aggiungiPulsantiBOM();
            addExportUI();
            aggiungiPulsanteGeneraLotto();
        },
        error: function() {
            alert("Errore caricamento BOM - verifica connessione/proxy");
        }
    });

    // ===================== UTILITY =====================
    function getArticolo(li) {
        const header = li.querySelector("div[style*='display: flex']");
        if (!header) return '';
        const codeDiv = header.querySelector("div:nth-of-type(2)");
        if (!codeDiv) return '';
        return codeDiv.textContent.split('|')[0].trim().toUpperCase();
    }
    function getQtaRichiesta(li) {
        const div = Array.from(li.querySelectorAll('div')).find(d => d.textContent.includes('Qta richiesta:'));
        if (!div) return 0;
        const match = div.textContent.match(/Qta richiesta:\s*(\d+)/i);
        return match ? parseInt(match[1], 10) : 0;
    }
    function getSeriali(li) {
        const serials = [];
        li.querySelectorAll("div[id^='dropdown-'] ul > li").forEach(sr => {
            const txt = (sr.innerText || sr.textContent || '').trim();
            const match = txt.match(/(?:Seriale|Lotto)[\s:]+([A-Za-z0-9_-]+)/i);
            if (match && match[1]) {
                serials.push(match[1].trim());
            }
        });
        return serials;
    }
    function getDescrizione(li) {
        const divs = li.querySelectorAll('div');
        for (let div of divs) {
            const txt = div.textContent;
            if (txt.includes('Descrizione:')) {
                const match = txt.match(/Descrizione:\s*(.+)/i);
                return match ? match[1].trim() : '';
            }
        }
        return '';
    }
    function getRif(li) {
        const divs = li.querySelectorAll('div');
        for (let div of divs) {
            const txt = div.textContent;
            if (txt.includes('Rif:')) {
                const match = txt.match(/Rif:\s*(\d+)/i);
                return match ? match[1].trim() : '';
            }
        }
        return '';
    }// ===================== GENERA LOTTO =====================
function generaLotto() {
    // Trova la select della commessa
    const commessaSelect = document.querySelector('#commessaTestata');
    if (!commessaSelect) {
        alert('Commessa non trovata!');
        return;
    }

    // Prendi il valore selezionato (es: "FLM", "NTD", ecc.)
    const commessaValue = commessaSelect.value;

    // Prendi le ultime 3 cifre
    const ultime3 = commessaValue.slice(-3);

    // Genera timestamp nel formato aaaammgg-hhmmss
    const now = new Date();
    const anno = now.getFullYear();
    const mese = String(now.getMonth() + 1).padStart(2, '0');
    const giorno = String(now.getDate()).padStart(2, '0');
    const ore = String(now.getHours()).padStart(2, '0');
    const minuti = String(now.getMinutes()).padStart(2, '0');
    const secondi = String(now.getSeconds()).padStart(2, '0');

    const timestamp = `${anno}${mese}${giorno}-${ore}${minuti}${secondi}`;

    // Crea il codice lotto finale
    const codiceLotto = `${ultime3}-${timestamp}`;

    // Trova l'input di ricerca e inserisci il valore
    const shootInput = document.querySelector('#shootInput');
    if (shootInput) {
        shootInput.value = codiceLotto;
        shootInput.focus();

        // Trigger evento input per aggiornare l'interfaccia
        const event = new Event('input', { bubbles: true });
        shootInput.dispatchEvent(event);
    } else {
        alert('Campo di ricerca non trovato!');
    }
}

function aggiungiPulsanteGeneraLotto() {
    // Evita duplicati
    if (document.getElementById('btn-genera-lotto')) return;

    // Trova un container in alto (cerca navbar o page-content)
    let targetContainer = document.querySelector('.navbar-inner') ||
                          document.querySelector('.page-content') ||
                          document.querySelector('header');

    if (!targetContainer) return;

    // Crea il pulsante
    const btnLotto = document.createElement('button');
    btnLotto.id = 'btn-genera-lotto';
    btnLotto.innerHTML = 'Genera Lotto';
    btnLotto.title = 'Genera codice lotto automatico';
    btnLotto.style.cssText = `
    position: fixed;
    top: 10px;
    left: 10px;
    z-index: 10000;
    width: 100px;
    height: 15px;
    padding: 0;
    background: #4caf50;
    color: white;
    border: none;
    border-radius: 3px;
    font-size: 9px;
    font-weight: bold;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
`;
    btnLotto.onclick = generaLotto;

    // Aggiungi hover effect
    btnLotto.onmouseenter = () => btnLotto.style.background = '#45a049';
    btnLotto.onmouseleave = () => btnLotto.style.background = '#4caf50';

    document.body.appendChild(btnLotto);
}

    function getPosizione(li) {
        const divs = li.querySelectorAll('div');
        for (let div of divs) {
            const txt = div.textContent;
            if (txt.includes('Posizione:')) {
                const match = txt.match(/Posizione:\s*(\d+)/i);
                return match ? match[1].trim() : '';
            }
        }
        return '';
    }

    // ===================== POPUP BOM =====================
   function mostraPopup(articolo, qta) {
    const data = bomData[articolo];
    if (!data) return;
    const figli = data.figli;

    let html = `
        <div style="font-family: system-ui, sans-serif; font-size: 1.5em; width: 90vw; max-width: 600px; max-height: 85vh; display: flex; flex-direction: column;">
            <!-- Header fisso -->
            <div style="padding: 20px 24px 12px; flex-shrink: 0;">
                <h2 style="margin:0 0 16px; color:#1565c0; font-size:1.4em;">📦 BOM</h2>
                <p style="margin:8px 0;"><strong>Padre:</strong> <span style="color:#d32f2f; font-weight:bold;">${articolo}</span></p>
                <p style="margin:8px 0;"><strong>Material Code:</strong> <span style="color:#1976d2;">${data.materialCode || '—'}</span></p>
                <p style="margin:14px 0 18px;"><strong>Qta richiesta:</strong>
                    <span style="font-size:2em; font-weight:bold; color:#c62828;">${qta}</span>
                </p>
                <hr style="margin:18px 0; border:0.5px solid #ccc;">
            </div>

            <!-- Area scrollabile -->
            <div style="flex: 1; overflow-y: auto; padding: 0 24px; min-height: 0;">
    `;

    if (figli.length === 0) {
        html += `<p style="color:#ff9800; font-weight:bold; text-align:center; margin:20px 0; font-size:1.1em;">Nessun componente figlio</p>`;
    } else {
                          //Modifica Percentuali per adattamento tabella anteprima
        html += `<h3 style="margin:14px 0 8px; font-size:1.1em;">Componenti:</h3>
                 <table style="width:100%; border-collapse:collapse; font-size:0.70em; table-layout:fixed;">
                 <thead><tr style="background:#f5f8ff;">
                     <th style="padding:8px 6px; text-align:left; width:35%;">Codice Figlio</th>
                     <th style="padding:8px 6px; text-align:left; width:30%;">P/N</th>
                     <th style="padding:8px 6px; text-align:center; width:8%;">Qty x1</th>
                     <th style="padding:8px 6px; text-align:center; font-weight:bold; color:#1565c0; width:7%;">Tot.</th>
                 </tr></thead><tbody>`;
        figli.forEach(f => {
            const totale = qta * f.qty;
            html += `<tr style="border-bottom:1px solid #eee;">
                <td style="padding:8px 6px; word-wrap:break-word; overflow-wrap:break-word;"><strong>${f.figlio}</strong></td>
                <td style="padding:8px 6px; word-wrap:break-word; overflow-wrap:break-word; max-width:0;">${f.pn || '—'}</td>
                <td style="padding:8px 6px; text-align:center;">${f.qty}</td>
                <td style="padding:8px 6px; text-align:center; font-weight:bold; color:#1565c0;">${totale}</td>
            </tr>`;
        });
        html += `</tbody></table>`;
    }

    html += `
            </div>

            <!-- Footer fisso -->
            <div style="padding: 12px 24px 20px; flex-shrink: 0; text-align:right;">
                <button id="chiudi" style="padding:10px 24px; background:#1565c0; color:white; border:none; border-radius:6px; cursor:pointer; font-size:1em;">
                    Chiudi
                </button>
            </div>
        </div>`;

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:white;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,0.3);max-height:100%;overflow:hidden;';
    modal.innerHTML = html;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.querySelector('#chiudi').onclick = () => overlay.remove();
    overlay.onclick = e => e.target === overlay && overlay.remove();
}

    // ===================== PULSANTI RIGA – SOLO SU PADRI =====================
    function aggiungiPulsantiBOM() {
        document.querySelectorAll('li.item-content.item-input.item-input-outline').forEach(li => {
            if (li.querySelector('.bom-definitivo')) return;
            const articolo = getArticolo(li);
            if (!articolo) return;
            if (!bomData[articolo]) return; // solo padri

            const stampaBtn = li.querySelector('button[title="Opzioni di stampa etichetta"]');
            if (!stampaBtn) return;
            const container = stampaBtn.parentNode;
            container.style.display = 'inline-flex';
            container.style.alignItems = 'center';
            container.style.gap = '8px';

            // Pulsante BOM
            const bomBtn = document.createElement('button');
            bomBtn.className = 'bom-definitivo';
            bomBtn.textContent = '📦';
            bomBtn.title = 'Controllo BOM';
            bomBtn.style.cssText = `
                padding:0; border-radius:4px; cursor:pointer; background:rgb(52,58,64);
                border:2px solid rgb(35,39,43); color:white; font-size:30px; width:40px; height:40px;
                display:inline-flex; align-items:center; justify-content:center; font-weight:bold;
            `;
            bomBtn.onclick = () => {
                const qta = getQtaRichiesta(li);
                mostraPopup(articolo, qta);
            };

            // Pulsante stampa etichetta singola ATS
            const printBtn = document.createElement('button');
            printBtn.className = 'print-singola-ats';
            printBtn.title = 'Stampa Etichetta Collo (solo questo padre)';
            printBtn.style.cssText = `
                padding:0; border:none; background:transparent; cursor:pointer;
                width:40px; height:40px; display:inline-flex; align-items:center; justify-content:center;
            `;
            const img = document.createElement('img');
            img.src = LOGO_URL2;
            img.alt = 'ATS';
            img.style.cssText = 'width:36px; height:36px; object-fit:contain; border-radius:4px;';
            printBtn.appendChild(img);
            printBtn.onclick = () => stampaEtichettaSingola(articolo, li);

            container.insertBefore(bomBtn, stampaBtn.nextSibling);
            container.insertBefore(printBtn, stampaBtn.nextSibling);
        });
    }

    // ===================== GENERAZIONE ETICHETTA =====================
    function generaEtichettaHTML(padre, data, seriale, commessa, rif) {
        const materialCode = data.materialCode || '—';
        const qrIdMaterial = 'qr-material-' + Math.random().toString(36).substr(2, 9);
        const qrIdSeriale = 'qr-seriale-' + Math.random().toString(36).substr(2, 9);

        return `
        <div class="etichetta">
            <div class="header">
                <img src="${LOGO_URL}" class="logo" alt="ATS">
                <h2>CONTENUTO COLLO</h2>
            </div>
            <div class="info">
                <p class="line compact"><strong>Padre:</strong> <span class="codice">${padre}</span></p>

                <!-- Material Code + QR 50x50 -->
                <div class="line material-row">
                    <span><strong>Material Code:</strong> ${materialCode}</span>
                    <canvas id="${qrIdMaterial}" class="qr-code" data-text="${materialCode}"></canvas>
                </div>

                <!-- Seriale + QR 50x50 sotto -->
                <div class="line material-row">
                    <span><strong>Seriale:</strong> <span class="seriale">${seriale}</span></span>
                    <canvas id="${qrIdSeriale}" class="qr-code" data-text="${seriale}"></canvas>
                </div>
            </div>
            <hr>
            <h3>Componenti:</h3>
            <table>
                <thead><tr><th>Codice</th><th>P/N</th><th>Qty</th></tr></thead>
                <tbody>
                    ${data.figli.map(f => `<tr><td><strong>${f.figlio}</strong></td><td>${f.pn || '—'}</td><td>${f.qty}</td></tr>`).join('')}
                </tbody>
            </table>
            <div class="footer">Commessa: ${commessa} | Rif: ${rif}</div>
        </div>`;
    }

    // ===================== FINESTRA STAMPA =====================
    function apriFinestraStampa(contenutoHTML, titolo) {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>${titolo}</title>
           <style>
    body {
        margin:0;
        padding:12px;
        background:#f8f8f8;
        font-family:Arial,sans-serif;
    }

    .etichetta {
        width:9.5cm;
        min-height:10cm;          /* ✅ NON height */
        margin:0 auto 10px;
        padding:6px;
        box-sizing:border-box;
        background:white;
        border:2px solid #333;

        display:flex;
        flex-direction:column;

        page-break-inside: avoid;
        break-after: page;        /* ✅ moderno */
    }

    .header {
        display:flex;
        align-items:center;
        margin-bottom:1px;
    }

    .logo {
        width:55px;
        height:55px;
        object-fit:contain;
        margin-right:8px;
    }

    h2 {
        margin:0;
        font-size:1.15em;
        color:#003087;
        flex-grow:1;
        text-align:center;
    }

    .info {
        font-size:0.78em;
        line-height:1;
        margin-bottom:2px;
    }

    .line { margin:1px 0; }
    .line.compact { margin:0; }

    .material-row {
        display:flex;
        align-items:center;
        justify-content:space-between;
        margin:2px 0;
        gap:12px;
    }

    .qr-code {
        width:30px;
        height:30px;
        flex-shrink:0;
        margin:2px 0;
    }

    .codice {
        font-size:1.05em;
        font-weight:bold;
        color:#d32f2f;
    }

    .seriale {
        font-size:1.15em;
        font-weight:bold;
        color:#1976d2;
    }

    hr {
        margin:2px 0;
        border-top:1px solid #ccc;
    }

    h3 {
        margin:1px 0 2px;
        font-size:0.82em;
    }

    table {
        width:100%;
        border-collapse:collapse;
        font-size:0.66em;
        flex-grow:1;
    }

    th, td {
        border:1px solid #999;
        padding:1px 2px;
        text-align:left;
    }

    th {
        background:#f0f0f0;
        font-weight:bold;
    }

    .footer {
        text-align:center;
        font-size:0.58em;
        color:#555;
        margin-top:4px;
    }

    @media print {
        body {
            padding:0;
            background:white;
        }

        .etichetta {
            border:none;
            margin:0;
            break-after: page;
        }
    }
</style>
        </head>
        <body onload="generaQR(); setTimeout(() => window.print(), 500);">
            ${contenutoHTML}
            <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js"></script>
            <script>
                function generaQR() {
                    document.querySelectorAll('.qr-code').forEach(canvas => {
                        const text = canvas.getAttribute('data-text');
                        if (text && text !== '—') {
                            QRCode.toCanvas(canvas, text.trim(), {
                                errorCorrectionLevel: 'M',
                                width: 30,
                                margin: 1
                            });
                        }
                    });
                }
                window.onafterprint = () => window.close();
                window.matchMedia('print').addListener(m => { if (!m.matches) window.close(); });
            </script>
        </body>
        </html>`);
        printWindow.document.close();
        printWindow.focus();
    }

    // ===================== STAMPA =====================
    function stampaEtichettaSingola(padre, li) {
        const data = bomData[padre];
        const seriali = getSeriali(li);
        if (seriali.length === 0) {
            alert('Nessun seriale scansionato per questo padre');
            return;
        }
        const commessa = document.querySelector('#commessaTestata')?.value || '';
        const rif = document.querySelector('#Riferimento')?.value?.trim() || '';
        let html = '';
        seriali.forEach(seriale => {
            html += generaEtichettaHTML(padre, data, seriale, commessa, rif);
        });
        apriFinestraStampa(html, `Etichetta - ${padre}`);
    }

    function stampaTutteEtichette() {
        let html = '';
        const commessa = document.querySelector('#commessaTestata')?.value || '';
        const rif = document.querySelector('#Riferimento')?.value?.trim() || '';
        document.querySelectorAll('li.item-content.item-input.item-input-outline').forEach(li => {
            const padre = getArticolo(li);
            const seriali = getSeriali(li);
            if (!bomData[padre] || seriali.length === 0) return;
            const data = bomData[padre];
            seriali.forEach(seriale => {
                html += generaEtichettaHTML(padre, data, seriale, commessa, rif);
            });
        });
        if (!html) {
            alert('Nessun collo con seriale trovato');
            return;
        }
        apriFinestraStampa(html, 'Tutte le Etichette Collo');
    }

    // ===================== CSV CON NUMERO RIGA =====================
    const forceText = v => `="${String(v ?? '').replace(/"/g, '""')}"`;
    function toCSV(rows) {
        return 'sep=;\n' + rows.map(r => r.map(forceText).join(';')).join('\n');
    }

    function estraiReportBOM() {
        const out = [['Riga', 'Padre', 'Material Code Padre', 'Descrizione', 'Rif', 'Posizione', 'Seriale', 'Codice', 'PN', 'Quantità']];

        document.querySelectorAll('li.item-content.item-input.item-input-outline').forEach(li => {
            // Estrai numero riga #001 ecc.
            const rigaSpan = li.querySelector('span[style*="background-color: bisque"] b');
            const numeroRiga = rigaSpan ? rigaSpan.textContent.trim() : '';

            const articolo = getArticolo(li);
            const descrizione = getDescrizione(li);
            const rif = getRif(li);
            const posizione = getPosizione(li);
            const seriali = getSeriali(li);
            if (!articolo || seriali.length === 0) return;

            if (bomData[articolo]) {
                const data = bomData[articolo];
                seriali.forEach(seriale => {
                    out.push([numeroRiga, articolo, data.materialCode || '', descrizione, rif, posizione, seriale, '', '', 1]);
                    data.figli.forEach(f => {
                        out.push([numeroRiga, articolo, data.materialCode || '', descrizione, rif, posizione, '', f.figlio, f.pn || '', f.qty]);
                    });
                });
            } else {
                seriali.forEach(seriale => {
                    out.push([numeroRiga, articolo, '', descrizione, rif, posizione, seriale, '', '', 1]);
                });
            }
        });
        return out;
    }

    function downloadCSVBOM() {
        const rows = estraiReportBOM();
        if (rows.length <= 1) {
            alert('Nessun dato BOM trovato');
            return;
        }
        const commessa = document.querySelector('#commessaTestata')?.value || 'SenzaCommessa';
        const rif = document.querySelector('#Riferimento')?.value?.trim() || 'SenzaRif';
        const csv = toCSV(rows);
        GM_download({
            url: 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv),
            name: `${commessa}_BOM_${rif}.csv`,
            saveAs: true
        });
    }

    // ===================== UI EXPORT =====================
    function addExportUI() {
        let wrapper = document.getElementById('export-print-wrapper');
        if (!wrapper) {
            const modal = document.querySelector('.sheet-modal-inner .sheet-modal-swipe-step');
            if (!modal) return;
            wrapper = document.createElement('div');
            wrapper.id = 'export-print-wrapper';
            wrapper.style.cssText = `
                display: flex; flex-flow: wrap; gap: 10px; padding: 10px; margin-top: 20px;
                border-top: 1px solid #ddd; justify-content: space-between; width: 100%; box-sizing: border-box;
            `;
            modal.appendChild(wrapper);
        }
        if (document.getElementById('btn-custom-csv-bom')) return;

        const btnCSV = document.createElement('button');
        btnCSV.id = 'btn-custom-csv-bom';
        btnCSV.innerHTML = '📄 CSV CON INTEGRAZIONE BOM';
        btnCSV.title = 'Estrai Report CSV BOM';
        btnCSV.style.cssText = `
            flex: 1 1 0%; min-width: 120px; text-align: center; padding: 8px 5px; margin: 2px;
            font-size: 12px; border: none; border-radius: 4px; cursor: pointer; color: white;
            font-weight: bold; background-color: blue;
        `;
        btnCSV.onclick = downloadCSVBOM;

        const btnAll = document.createElement('button');
        btnAll.id = 'btn-custom-stampa-tutte';
        btnAll.innerHTML = '📋 Stampa Tutte PL BOM';
        btnAll.title = 'Stampa Tutte le PackingList 10x10';
        btnAll.style.cssText = `
            flex: 1 1 0%; min-width: 120px; text-align: center; padding: 8px 5px; margin: 2px;
            font-size: 12px; border: none; border-radius: 4px; cursor: pointer; color: white;
            font-weight: bold; background-color: orange;
        `;
        btnAll.onclick = stampaTutteEtichette;

        wrapper.appendChild(btnCSV);
        wrapper.appendChild(btnAll);
    }

    // ===================== OSSERVATORI =====================
    setInterval(() => {
        const el = document.querySelector('#ArticoloScansionato-text');
        if (!el || el.dataset.bomChecked) return;
        const codice = el.textContent.trim().toUpperCase();
        if (!codice) return;
        let mostra = false, msg = '', colore = '';
        if (bomData[codice]) {
            mostra = true; msg = `📦 PADRE nella BOM → Controlla figli`; colore = '#4caf50';
        } else {
            const padre = Object.keys(bomData).find(p => bomData[p].figli.some(f => f.figlio === codice));
            if (padre) { mostra = true; msg = `🔧 FIGLIO di ${padre}`; colore = '#2196f3'; }
        }
        if (mostra) {
            const div = document.createElement('div');
            div.textContent = msg;
            div.style.cssText = `margin-top:8px; padding:12px; border-radius:8px; font-weight:bold; text-align:center; color:white; background:${colore}; font-size:1em;`;
            el.parentNode.appendChild(div);
        }
        el.dataset.bomChecked = 'true';
    }, 1000);

    new MutationObserver(() => {
    aggiungiPulsantiBOM();
    aggiungiPulsanteGeneraLotto();
}).observe(document.body, { childList: true, subtree: true });
})();

