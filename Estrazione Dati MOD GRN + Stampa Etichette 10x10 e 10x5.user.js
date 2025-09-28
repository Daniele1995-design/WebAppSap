// ==UserScript==
// @name         Estrazione Dati MOD GRN + Stampa Etichette 10x10 e 10x5
// @namespace    http://tampermonkey.net/
// @version      6.2
// @description  Esporta seriali + PN in CSV e aggiunge funzionalità di stampa etichette 10x10 e 10x5
// @match        http://172.18.20.20/GRN/*
// @match        http://172.18.20.20:8095/GRN/*
// @grant        GM_download
// @require      https://raw.githubusercontent.com/Daniele1995-design/WebAppSap/refs/heads/main/qrcode.min.js
// @require      https://raw.githubusercontent.com/Daniele1995-design/WebAppSap/refs/heads/main/JsBarcode.all.min.js
// ==/UserScript==

(function () {
    'use strict';

    function sleep(ms) {
        return new Promise(res => setTimeout(res, ms));
    }

    async function waitForSerials(timeout = 10000) {
        let elapsed = 0, interval = 500;
        while (document.querySelectorAll("div[id^='dropdown-'] ul > li").length === 0 && elapsed < timeout) {
            await sleep(interval);
            elapsed += interval;
        }
    }

    function toCSV(rows) {
        const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"` ;
        return rows.map(r => r.map(escape).join(';')).join('\n');
    }

    function findDivTextByLabel(root, label) {
        const divs = root.querySelectorAll('div');
        for (const d of divs) {
            const t = (d.innerText || '').replace(/\s+/g, ' ').trim();
            if (t.startsWith(label)) {
                return t.slice(label.length).trim();
            }
        }
        return '';
    }

    function getDataFromLi(li) {
        const dropdown = li.querySelector("div[id^='dropdown-']");
        if (dropdown) dropdown.style.display = 'block';

        const articoloOriginale = findDivTextByLabel(li, 'Articolo:');
        const articolo = (articoloOriginale.split(' ')[0] || '').trim();
        const codiceBP = (articoloOriginale.split(' ')[1] ? articoloOriginale.split(' ')[1].replace(/[()]/g, '') : '').trim();

        const descrizione = findDivTextByLabel(li, 'Descrizione:');

        let riferimento = '';
        const rifDiv = Array.from(li.querySelectorAll('div')).find(d => /Riferimento:/i.test(d.innerText || ''));
        if (rifDiv) riferimento = (rifDiv.innerText || '').replace(/^.*Riferimento:\s*/i, '').trim();

        let riferimentoOrdine = '';
        const divRifOrd = Array.from(li.querySelectorAll('div')).find(d => d.querySelector('button[onclick*="modificaRiferimentoCliente"]'));
        if (divRifOrd) {
            const button = divRifOrd.querySelector('button');
            if (button && button.nextSibling) {
                riferimentoOrdine = (button.nextSibling.textContent || '').replace(/\s+/g,'').trim();
            }
        }

        let pn = '';
        const pnSpan = li.querySelector('span.pn-info');
        if (pnSpan && /\[PN:/i.test(pnSpan.textContent)) {
            pn = pnSpan.textContent.replace(/\[PN:\s*/i, '').replace(/\].*$/, '').trim();
        }

        const serialRows = li.querySelectorAll("div[id^='dropdown-'] ul > li");
        const serials = [];

        serialRows.forEach(sr => {
            let quantita = '', seriale = '', stato = '';
            Array.from(sr.querySelectorAll('strong')).forEach(str => {
                const label = (str.textContent || '').toLowerCase();
                const parentText = (str.parentElement.innerText || '').replace(/\s+/g, ' ').trim();
                if (label.includes('quantità')) quantita = parentText.replace(/.*Quantità:\s*/i, '').trim();
                if (label.includes('seriale')) seriale = parentText.replace(/.*Seriale:\s*/i, '').trim();
                if (label.includes('stato logico')) stato = parentText.replace(/.*Stato Logico:\s*/i, '').trim();
            });

            if (!seriale) {
                const txt = (sr.innerText || '').trim();
                const m = txt.match(/([0-9]{6,})/);
                if (m) seriale = m[1];
            }

            if (seriale) {
                serials.push({ quantita, seriale, stato });
            }
        });

        return {
            pn, articolo, codiceBP, descrizione, riferimento, riferimentoOrdine,
            riferimentoPulito: riferimento ? riferimento.trim().substring(0, 4) : '',
            serials
        };
    }

    function estraiRighe() {
        const out = [];
        out.push([
            'Part Number', 'Articolo', 'Codice BP', 'Descrizione',
            'Riferimento', 'Riferimento Ordine', 'Quantità', 'Seriale', 'Stato Logico', 'Ubicazione'
        ]);

        const righe = document.querySelectorAll('li.item-content.item-input.item-input-outline');
        let totalSeriali = 0;

        righe.forEach(li => {
            const data = getDataFromLi(li);

            data.serials.forEach(seriale => {
                out.push([
                    data.pn ? `="${data.pn}"`  : '',
                    data.articolo ? `="${data.articolo}"`  : '',
                    data.codiceBP ? `="${data.codiceBP}"`  : '',
                    data.descrizione,
                    data.riferimentoPulito,
                    data.riferimentoOrdine,
                    seriale.quantita ? `="${seriale.quantita}"`  : '',
                    `="${seriale.seriale}"` ,
                    seriale.stato || '',
                    '' // Colonna Ubicazione vuota
                ]);
                totalSeriali++;
            });
        });

        return { rows: out, total: totalSeriali };
    }

    async function downloadCSV() {
        await waitForSerials();
        const { rows, total } = estraiRighe();

        if (total === 0) {
            alert('Nessun seriale trovato!');
            return;
        }

        const csv = toCSV(rows);
        GM_download({
            url: "data:text/csv;charset=utf-8," + encodeURIComponent(csv),
            name: "seriali_grn.csv",
            saveAs: true
        });

        alert(`Estrazione completata! Seriali esportati: ${total}` );
    }

    function printAllLabels() {
        const righe = document.querySelectorAll('li.item-content.item-input.item-input-outline');
        if (righe.length === 0) {
            alert('Nessuna riga trovata!');
            return;
        }

        const allLabels = [];
        righe.forEach(li => {
            const data = getDataFromLi(li);
            data.serials.forEach(s => {
                allLabels.push({
                    codiceBP: data.codiceBP || '',
                    articolo: data.articolo || '',
                    po: data.riferimentoOrdine || data.riferimento || '',
                    pn: data.pn || '',
                    seriale: s.seriale || ''
                });
            });
        });

        if (allLabels.length === 0) {
            alert('Nessun seriale trovato per la stampa delle etichette!');
            return;
        }

        printLabels(allLabels);
    }

function printLabels(labels) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert('Bloccato popup: permetti finestre popup per poter stampare.');
        return;
    }

    const payload = encodeURIComponent(JSON.stringify(labels));

    printWindow.document.write(`
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Etichette 10x10</title>
<style>
@page {
    size: 100mm 100mm;
    margin: 0;
}
html, body {
    margin: 0;
    padding: 0;
    font-family: Arial, Helvetica, sans-serif;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
.labels {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
}
.label {
    width: 100mm;
    height: 100mm;
    box-sizing: border-box;
    padding: 4mm;
    border: none;
    display: block;
    page-break-after: always;
}
.container {
    display: flex;
    height: 100%;
}
.left {
    flex: 1;
    padding-right: 4px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
}
.top-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
}
.codicebp {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 1px;
}
.small {
    font-size: 12px;
    color: #222;
}
.line {
    border-top: 1px solid #000;
    margin: 4px 0;
    width: 100%;
}
.barcode {
    width: 100%;
    height: 8mm;
}
.barcode-text {
    text-align: center;
    font-size: 12px;
    margin-top: 2px;
}
.right {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
}
.qr {
    width: 13mm;
    height: 13mm;
}
.vert {
    writing-mode: vertical-lr;
    transform: rotate(0deg);
    font-size: 8px;
    margin-left: 2px;
    white-space: nowrap;
}
.qr-container {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
}
.field-block {
    display: flex;
    flex-direction: column;
    margin-top: 2px;
}
.potext {
    font-size: 12px;
    color: #333;
}
.pn-block {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 4px;
}
.pn-block .qr-container {
    margin-top: -25px;
}
.serial-block {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 4px;
}
.serial-block .small {
    font-size: 12px;
    font-weight: bold;
}
.center-left {
    display: flex;
    flex-direction: column;
    justify-content: center;
}
.logo {
    max-height: 15mm;
    max-width: 30mm;
    margin-bottom: 2mm;
}
</style>
</head>
<body>
<div id="labels" class="labels"></div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>

<script>
(function(){
    const labels = JSON.parse(decodeURIComponent("${payload}"));
    const container = document.getElementById('labels');

    function generateLabels() {
        labels.forEach((lab, idx) => {
            const label = document.createElement('div');
            label.className = 'label';

            const containerInner = document.createElement('div');
            containerInner.className = 'container';

            const left = document.createElement('div');
            left.className = 'left';

            // LOGO in alto a sinistra
            const logo = document.createElement('img');
            logo.src = "https://raw.githubusercontent.com/Daniele1995-design/WebAppSap/main/logo%20ats.jpg";
            logo.className = "logo";
            left.appendChild(logo);

            // Codice BP + QR
            const topRow = document.createElement('div');
            topRow.className = 'top-row';

            const leftTop = document.createElement('div');
            leftTop.className = 'center-left';
            const codLabel = document.createElement('div');
            codLabel.className = 'small';
            codLabel.innerText = 'Codice BP';
            const codVal = document.createElement('div');
            codVal.className = 'codicebp';
            codVal.innerText = lab.codiceBP || '';
            leftTop.appendChild(codLabel);
            leftTop.appendChild(codVal);

            const rightTop = document.createElement('div');
            rightTop.style.display = 'flex';
            rightTop.style.flexDirection = 'column';
            rightTop.style.alignItems = 'center';

            // Contenitore per QR Codice BP + testo
            const qrCodContainer = document.createElement('div');
            qrCodContainer.className = 'qr-container';
            const qrCod = document.createElement('div');
            qrCod.id = 'qr-codice-' + idx;
            qrCod.className = 'qr';
            const vertCod = document.createElement('div');
            vertCod.className = 'vert';
            vertCod.innerText = 'COD. BP';
            qrCodContainer.appendChild(qrCod);
            qrCodContainer.appendChild(vertCod);
            rightTop.appendChild(qrCodContainer);

            topRow.appendChild(leftTop);
            topRow.appendChild(rightTop);
            left.appendChild(topRow);

            const line1 = document.createElement('div');
            line1.className = 'line';
            left.appendChild(line1);

            // Articolo con barcode e testo sotto
            const artDiv = document.createElement('div');
            artDiv.style.display = 'flex';
            artDiv.style.flexDirection = 'column';
            const artLabel = document.createElement('div');
            artLabel.className = 'small';
            artLabel.innerText = 'Articolo';
            const svgBarcode = document.createElementNS('http://www.w3.org/2000/svg','svg');
            svgBarcode.setAttribute('id','barcode-art-' + idx);
            svgBarcode.classList.add('barcode');
            const barcodeText = document.createElement('div');
            barcodeText.id = 'barcode-text-' + idx;
            barcodeText.className = 'barcode-text';
            artDiv.appendChild(artLabel);
            artDiv.appendChild(svgBarcode);
            artDiv.appendChild(barcodeText);
            left.appendChild(artDiv);

            const line2 = document.createElement('div');
            line2.className = 'line';
            left.appendChild(line2);

            // Po Nr° + PN
            const poDiv = document.createElement('div');
            poDiv.className = 'field-block';
            const poLab = document.createElement('div');
            poLab.className = 'small';
            poLab.innerHTML = '<b>Po Nr°</b><div style="font-weight:700;font-size: 16px;">'+(lab.po||'')+'</div>';
            poDiv.appendChild(poLab);
            left.appendChild(poDiv);
            poDiv.style.marginBottom = '20px';

            const pnBlock = document.createElement('div');
            pnBlock.className = 'pn-block';
            const pnLeft = document.createElement('div');
            pnLeft.className = 'small';
            pnLeft.innerHTML = '<b>Part Number</b><div style="font-weight:700;font-size: 16px;">'+(lab.pn||'')+'</div>';
            const pnRight = document.createElement('div');
            pnRight.style.display='flex';
            pnRight.style.flexDirection='column';
            pnRight.style.alignItems='center';

            // Contenitore per QR TPN + testo
            const qrPnContainer = document.createElement('div');
            qrPnContainer.className = 'qr-container';
            const qrPn = document.createElement('div');
            qrPn.id = 'qr-pn-' + idx;
            qrPn.className = 'qr';
            const vertP = document.createElement('div');
            vertP.className = 'vert';
            vertP.innerText = 'TPN';
            qrPnContainer.appendChild(qrPn);
            qrPnContainer.appendChild(vertP);
            pnRight.appendChild(qrPnContainer);

            pnBlock.appendChild(pnLeft);
            pnBlock.appendChild(pnRight);
            left.appendChild(pnBlock);

            const line3 = document.createElement('div');
            line3.className = 'line';
            left.appendChild(line3);

            // Seriale
            const serialBlock = document.createElement('div');
            serialBlock.className = 'serial-block';
            const sLeft = document.createElement('div');
            sLeft.className = 'small';
            sLeft.innerHTML = '<b>Serial Number</b><div style="font-weight:700;font-size: 16px;">'+(lab.seriale||'')+'</div>';
            const sRight = document.createElement('div');
            sRight.style.display='flex';
            sRight.style.flexDirection='column';
            sRight.style.alignItems='center';

            // Contenitore per QR Seriale + testo
            const qrSerialContainer = document.createElement('div');
            qrSerialContainer.className = 'qr-container';
            const qrSerial = document.createElement('div');
            qrSerial.id = 'qr-serial-' + idx;
            qrSerial.className = 'qr';
            const vertS = document.createElement('div');
            vertS.className = 'vert';
            vertS.innerText = 'SN';
            qrSerialContainer.appendChild(qrSerial);
            qrSerialContainer.appendChild(vertS);
            sRight.appendChild(qrSerialContainer);

            serialBlock.appendChild(sLeft);
            serialBlock.appendChild(sRight);
            left.appendChild(serialBlock);

            containerInner.appendChild(left);
            label.appendChild(containerInner);
            container.appendChild(label);

            // Genera QR e barcode
            try {
                new QRCode(qrCod, {
                    text: lab.codiceBP || '',
                    width: 39,
                    height: 39,
                    correctLevel: QRCode.CorrectLevel.H
                });
                new QRCode(qrPn, {
                    text: lab.pn || '',
                    width: 39,
                    height: 39,
                    correctLevel: QRCode.CorrectLevel.H
                });
                new QRCode(qrSerial, {
                    text: lab.seriale || '',
                    width: 39,
                    height: 39,
                    correctLevel: QRCode.CorrectLevel.H
                });
                JsBarcode(svgBarcode, (lab.articolo||''), {
                    format: "CODE128",
                    width: 1.2,
                    height: 25,
                    displayValue: false,
                    margin: 0
                });
                document.getElementById('barcode-text-'+idx).innerText = lab.articolo || '';
            } catch(e) {
                console.error('Errore nella generazione dei codici:', e);
            }
        });

        // Avvia la stampa dopo che tutto è stato generato
        setTimeout(() => {
            window.print();
        }, 500);
    }

    // Chiudi la finestra dopo la stampa
    window.onafterprint = function() {
        setTimeout(() => {
            if (!window.closed) {
                window.close();
            }
        }, 100);
    };

    // Genera le etichette quando il DOM è pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', generateLabels);
    } else {
        generateLabels();
    }
})();
</script>
</body>
</html>
    `);

    // Chiudi la finestra se la stampa non parte
    printWindow.document.close();
    setTimeout(() => {
        if (printWindow && !printWindow.closed) {
            printWindow.close();
        }
    }, 3000000); // Chiudi dopo 30 minuti se ancora aperta
}
function printLabels10x5(labels) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert('Bloccato popup: permetti finestre popup per poter stampare.');
        return;
    }

    const payload = encodeURIComponent(JSON.stringify(labels));

    printWindow.document.write(`
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Etichette 10x5</title>
<style>
@page {
    size: 100mm 50mm;
    margin: 0;
}
body {
    margin: 0;
    padding: 0;
    font-family: Arial, sans-serif;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
.label {
    width: 100mm;
    height: 50mm;
    padding: 3mm;
    box-sizing: border-box;
    position: relative;
    overflow: hidden;
    page-break-after: always;
}
.header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 1px solid #000;
    padding-bottom: 1mm;
    margin-bottom: 1mm;
    height: 15mm;
}
.logo {
    height: 10mm;
    max-width: 40mm;
    margin-top: 0;
}
.bp-section {
    display: flex;
    align-items: center;
    gap: 1mm;
}
.bp-text {
    text-align: center;
    line-height: 1.0;
    margin-right: 4mm;
}
.bp-label {
    font-size: 15px;
    font-weight: bold;
}
.bp-value {
    font-size: 12px;
    font-weight: bold;
}
.qr-bp-container {
    display: flex;
    align-items: center;
    gap: 1mm;
}
.qr-bp {
    width: 9mm;
    height: 9mm;
}
.bp-vert {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font-size: 6px;
    font-weight: bold;
    height: 12mm;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: 1mm;
}
.barcode-container {
    text-align: center;
    margin: 1mm 0;
    height: 15mm;
    display: flex;
    flex-direction: column;
    justify-content: center;
    border-bottom: 1px solid #000;
    padding-bottom: 1mm;
    margin-bottom: 1mm;
}
.barcode {
    height: 10mm;
    max-width: 100%;
}
.barcode-text {
    font-size: 9px;
    margin-top: 1px;
    text-align: left;
    font-weight: bold;
    letter-spacing: 0.5px;
}
.details {
    margin-top: 1mm;
    font-size: 9px;
    line-height: 1.3;
}
.detail-row {
    display: flex;
    margin-bottom: 1mm;
    align-items: center;
    position: relative;
}
.detail-label {
    font-weight: bold;
    margin-right: 1mm;
    white-space: nowrap;
    width: 20mm;
}
.detail-value {
    flex-grow: 1;
    text-align: left;
    word-break: break-all;
    font-size: 11px;
}
.qr-serial-container {
    position: absolute;
    right: 0;
    top: -5%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    gap: 1mm;
    height: 20px;
}
.qr-serial {
    width: 9mm;
    height: 9mm;
}
.sn-vert {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font-size: 6px;
    height: 9mm;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    margin-left: 1mm;
    line-height: 1;
    transform-origin: center;
}
</style>
</head>
<body>
<div id="labels"></div>

<script src="https://raw.githubusercontent.com/Daniele1995-design/WebAppSap/refs/heads/main/qrcode.min.js"></script>
<script src="https://raw.githubusercontent.com/Daniele1995-design/WebAppSap/refs/heads/main/JsBarcode.all.min.js"></script>

<script>
(function(){
    const labels = JSON.parse(decodeURIComponent("${payload}"));
    const container = document.getElementById('labels');

    function generateLabels() {
        labels.forEach((lab, idx) => {
            const label = document.createElement('div');
            label.className = 'label';

            // Header con logo e codice BP
            const header = document.createElement('div');
            header.className = 'header';

            // Logo
            const logo = document.createElement('img');
            logo.src = "https://raw.githubusercontent.com/Daniele1995-design/WebAppSap/main/logo%20ats.jpg";
            logo.className = "logo";
            logo.alt = "ATS";

            // Sezione BP
            const bpSection = document.createElement('div');
            bpSection.className = 'bp-section';

            // Testo BP
            const bpText = document.createElement('div');
            bpText.className = 'bp-text';
            const codLabel = document.createElement('div');
            codLabel.className = 'bp-label';
            codLabel.innerText = 'Codice BP';
            const codVal = document.createElement('div');
            codVal.className = 'bp-value';
            codVal.innerText = lab.codiceBP || '';
            bpText.appendChild(codLabel);
            bpText.appendChild(codVal);

            // QR Code BP
            const qrBpContainer = document.createElement('div');
            qrBpContainer.className = 'qr-bp-container';
            const qrBp = document.createElement('div');
            qrBp.id = 'qr-bp-' + idx;
            qrBp.className = 'qr-bp';
            const bpVert = document.createElement('div');
            bpVert.className = 'bp-vert';
            bpVert.innerText = 'BP';
            qrBpContainer.appendChild(qrBp);
            qrBpContainer.appendChild(bpVert);

            bpSection.appendChild(bpText);
            bpSection.appendChild(qrBpContainer);
            header.appendChild(logo);
            header.appendChild(bpSection);
            label.appendChild(header);

            // Barcode
            const barcodeContainer = document.createElement('div');
            barcodeContainer.className = 'barcode-container';
            const barcodeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            barcodeSvg.id = 'barcode-' + idx;
            barcodeSvg.className = 'barcode';
            const barcodeText = document.createElement('div');
            barcodeText.className = 'barcode-text';
            barcodeText.textContent = lab.articolo || '';
            barcodeContainer.appendChild(barcodeSvg);
            barcodeContainer.appendChild(barcodeText);
            label.appendChild(barcodeContainer);

            // Dettagli
            const details = document.createElement('div');
            details.className = 'details';

            // PO Number
            const poRow = document.createElement('div');
            poRow.className = 'detail-row';
            poRow.innerHTML = \`<span class="detail-label">Po Nr°:</span><span class="detail-value">\${lab.po || ''}</span>\`;

            // Part Number
            const pnRow = document.createElement('div');
            pnRow.className = 'detail-row';
            pnRow.innerHTML = \`<span class="detail-label">Part Number:</span><span class="detail-value">\${lab.pn || ''}</span>\`;

            // Seriale con QR
            const serialRow = document.createElement('div');
            serialRow.className = 'detail-row';
            serialRow.style.marginBottom = '0';
            const serialContent = document.createElement('div');
            serialContent.style.flexGrow = '1';
            serialContent.innerHTML = \`<span class="detail-label">Seriale:</span><span class="detail-value">\${lab.seriale || ''}</span>\`;

            // QR Seriale
            const qrSerialContainer = document.createElement('div');
            qrSerialContainer.className = 'qr-serial-container';
            const qrSerial = document.createElement('div');
            qrSerial.id = 'qr-serial-' + idx;
            qrSerial.className = 'qr-serial';
            const snVert = document.createElement('div');
            snVert.className = 'sn-vert';
            snVert.innerText = 'SN';
            qrSerialContainer.appendChild(qrSerial);
            qrSerialContainer.appendChild(snVert);

            serialRow.appendChild(serialContent);
            serialRow.appendChild(qrSerialContainer);
            details.appendChild(poRow);
            details.appendChild(pnRow);
            details.appendChild(serialRow);
            label.appendChild(details);
            container.appendChild(label);

            // Genera codici
            try {
                const paddedSeriale = String(lab.seriale || '').padStart(4, '0');
                const paddedCodiceBP = String(lab.codiceBP || '').padStart(4, '0');

                new QRCode(qrBp, {
                    text: paddedCodiceBP || '',
                    width: 30,
                    height: 30,
                    correctLevel: QRCode.CorrectLevel.H
                });

                new QRCode(qrSerial, {
                    text: paddedSeriale,
                    width: 30,
                    height: 30,
                    correctLevel: QRCode.CorrectLevel.H
                });

                JsBarcode(barcodeSvg, lab.articolo || '', {
                    format: "CODE128",
                    width: 1,
                    height: 20,
                    displayValue: false,
                    margin: 0
                });
            } catch(e) {
                console.error('Errore generazione codici:', e);
            }
        });

        // Avvia la stampa
        setTimeout(() => {
            window.print();
        }, 500);
    }

    // Chiudi dopo la stampa
    window.onafterprint = function() {
        setTimeout(() => {
            if (!window.closed) window.close();
        }, 100);
    };

    // Avvia la generazione
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', generateLabels);
    } else {
        generateLabels();
    }
})();
</script>
</body>
</html>
    `);

    // Chiudi se la stampa non parte
    printWindow.document.close();
    setTimeout(() => {
        if (printWindow && !printWindow.closed) {
            printWindow.close();
        }
    }, 30000);
}
    function printAllLabels10x5() {
        const righe = document.querySelectorAll('li.item-content.item-input.item-input-outline');
        if (righe.length === 0) {
            alert('Nessuna riga trovata!');
            return;
        }

        const allLabels = [];
        righe.forEach(li => {
            const data = getDataFromLi(li);
            data.serials.forEach(s => {
                allLabels.push({
                    codiceBP: data.codiceBP || '',
                    articolo: data.articolo || '',
                    po: data.riferimentoOrdine || data.riferimento || '',
                    pn: data.pn || '',
                    seriale: s.seriale || ''
                });
            });
        });

        if (allLabels.length === 0) {
            alert('Nessun seriale trovato per la stampa delle etichette!');
            return;
        }

        printLabels10x5(allLabels);
    }
    function printAllLabelsFromPNInfo() {
    const righe = document.querySelectorAll('li.item-content.item-input.item-input-outline');
    if (righe.length === 0) {
        alert('Nessuna riga trovata!');
        return;
    }

    const allLabels = [];

    righe.forEach(li => {
        // Salta la riga di ricerca
        if (li.querySelector('#shootInput')) {
            return;
        }

        const pnInfo = li.querySelector('span.pn-info');
        if (!pnInfo) return;

        const pnText = pnInfo.textContent || '';
        const serialeMatch = pnText.match(/Seriale:\s*([^\s|]+)/i);
        if (!serialeMatch) return;

        const data = getDataFromLi(li);
        const seriale = serialeMatch[1].trim();

        allLabels.push({
            codiceBP: data.codiceBP || '',
            articolo: data.articolo || '',
            po: data.riferimentoOrdine || data.riferimento || '',
            pn: data.pn || '',
            seriale: seriale
        });
    });

    if (allLabels.length === 0) {
        alert('Nessun seriale trovato nel formato corretto!');
        return;
    }

    printLabels10x5(allLabels);
}

    function printLabelsForRow(dataRow) {
        const labels = dataRow.serials.map(s => ({
            codiceBP: dataRow.codiceBP || '',
            articolo: dataRow.articolo || '',
            po: dataRow.riferimentoOrdine || dataRow.riferimento || '',
            pn: dataRow.pn || '',
            seriale: s.seriale || ''
        }));

        printLabels(labels);
    }

    function printLabels10x5ForRow(dataRow) {
        const labels = dataRow.serials.map(s => ({
            codiceBP: dataRow.codiceBP || '',
            articolo: dataRow.articolo || '',
            po: dataRow.riferimentoOrdine || dataRow.riferimento || '',
            pn: dataRow.pn || '',
            seriale: s.seriale || ''
        }));

        printLabels10x5(labels);
    }

function addPrintButtonsToRows() {
    const righe = document.querySelectorAll('li.item-content.item-input.item-input-outline');
    righe.forEach((li, idx) => {
        // Salta la riga di ricerca (contiene l'input con id 'shootInput')
        if (li.querySelector('#shootInput')) {
            return; // Salta questa iterazione
        }

        // Rimuovi i pulsanti esistenti
        const existingBtns = li.querySelectorAll('.btn-print-etichetta, .btn-print-etichetta-small, .btn-container');
        existingBtns.forEach(btn => btn.remove());

        // Crea un contenitore per i pulsanti
        const btnContainer = document.createElement('div');
        btnContainer.className = 'btn-container';
        btnContainer.style.cssText = 'display: flex; flex-wrap: nowrap; gap: 4px; margin-left: 8px;';

        // Crea il pulsante per l'etichetta 10x10
        const btn10x10 = document.createElement('button');
        btn10x10.className = 'btn-print-etichetta';
        btn10x10.style.cssText = 'padding: 4px 6px; border-radius: 4px; cursor: pointer; background: #28a745; border: 1px solid #218838; color: white; font-size: 12px; white-space: nowrap;';
        btn10x10.title = 'Stampa etichetta 10x10';
        btn10x10.innerText = '🖨️ 10x10';

        btn10x10.addEventListener('click', async (ev) => {
            ev.preventDefault();
            await waitForSerials(5000);
            const data = getDataFromLi(li);
            printLabelsForRow(data);
        });

        // Crea il pulsante per l'etichetta 10x5
        const btn10x5 = document.createElement('button');
        btn10x5.className = 'btn-print-etichetta-small';
        btn10x5.style.cssText = 'padding: 4px 6px; border-radius: 4px; cursor: pointer; background: #17a2b8; border: 1px solid #117a8b; color: white; font-size: 12px; white-space: nowrap;';
        btn10x5.title = 'Stampa etichetta 10x5';
        btn10x5.innerText = '🖨️ 10x5';

        btn10x5.addEventListener('click', async (ev) => {
            ev.preventDefault();
            await waitForSerials(5000);
            const data = getDataFromLi(li);
            printLabels10x5ForRow(data);
        });

        // Aggiungi i pulsanti al contenitore
        btnContainer.appendChild(btn10x10);
        btnContainer.appendChild(btn10x5);

        // Aggiungi il contenitore all'area azioni
        const actionArea = li.querySelector('.item-media, .item-after, .item-title, .item-inner') || li;

        if (actionArea.classList.contains('item-inner')) {
            actionArea.style.display = 'flex';
            actionArea.style.alignItems = 'center';
            actionArea.style.justifyContent = 'space-between';
            actionArea.style.width = '100%';

            // Crea un contenitore per il testo esistente
            const textContainer = document.createElement('div');
            while (actionArea.firstChild) {
                textContainer.appendChild(actionArea.firstChild);
            }

            // Aggiungi il contenitore del testo e i pulsanti
            actionArea.appendChild(textContainer);
            actionArea.appendChild(btnContainer);
        } else {
            actionArea.appendChild(btnContainer);
        }
    });
}
    function addExportAndPrintUI() {
        const modal = document.querySelector('.sheet-modal-inner .sheet-modal-swipe-step');
        if (!modal) return;

        // Rimuovi i pulsanti esistenti se ci sono
        const existingWrapper = document.getElementById('export-print-wrapper');
        if (existingWrapper) existingWrapper.remove();

        // Crea il wrapper per i pulsanti
        const wrapper = document.createElement('div');
        wrapper.id = 'export-print-wrapper';

        // Stile per il wrapper
        Object.assign(wrapper.style, {
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: '10px',
            padding: '10px',
            marginTop: '20px',
            borderTop: '1px solid #ddd',
            justifyContent: 'space-between',
            width: '100%',
            boxSizing: 'border-box'
        });

        // Stile per i pulsanti
        const buttonStyle = {
            flex: '1',
            minWidth: '120px',
            textAlign: 'center',
            padding: '8px 5px',
            margin: '2px',
            fontSize: '12px',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            color: 'white',
            fontWeight: 'bold'
        };

        // Crea i pulsanti
        const buttons = [
            { text: '📤 Estrai Dati', color: '#0d6efd', click: downloadCSV },
            { text: '🖨️ 10x10', color: '#28a745', click: printAllLabels },
            { text: '🖨️ 10x5', color: '#17a2b8', click: printAllLabels10x5 },
            { text: '🖨️ 10x5 Seriale Atteso', color: '#6f42c1', click: printAllLabelsFromPNInfo }
        ];

        buttons.forEach(btnData => {
            const btn = document.createElement('button');
            btn.innerText = btnData.text;
            Object.assign(btn.style, buttonStyle, { backgroundColor: btnData.color });
            btn.addEventListener('click', btnData.click);
            wrapper.appendChild(btn);
        });

        // Aggiungi il wrapper alla modale
        modal.appendChild(wrapper);

        // Aggiungi stili globali per i pulsanti
        const style = document.createElement('style');
        style.textContent = `
            #export-print-wrapper button {
                transition: opacity 0.2s;
            }
            #export-print-wrapper button:hover {
                opacity: 0.9;
            }
            #export-print-wrapper button:active {
                transform: translateY(1px);
            }
        `;
        document.head.appendChild(style);

        // Aggiungi i pulsanti alle singole righe
        addPrintButtonsToRows();
    }

    // Avvio dello script
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            addExportAndPrintUI();
            setInterval(addPrintButtonsToRows, 1500);
        });
    } else {
        addExportAndPrintUI();
        setInterval(addPrintButtonsToRows, 1500);
    }

})();
