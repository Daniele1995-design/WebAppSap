window.initGRNCompleto = (function() {
    'use strict';

    console.log("Script Tampermonkey avviato con pulizia seriali");

    // --- Variabili globali per la pulizia seriali ---
    const CSV_URL = "https://raw.githubusercontent.com/Daniele1995-design/WebAppSap/refs/heads/main/Anagrafica%20completa%20solo%20Partnumber%20e%20Produttore.csv";
    let anagrafica = {}; // { PN: { produttore } }
    let puliziaSerialiAttiva = true; // Flag on/off per la pulizia
    let serialeOriginale = ""; // Memorizza il seriale barcodato originale

    // --- Variabile per lo scroll automatico ---
    let targetElementForScroll = null; // Memorizza l'elemento target per lo scroll

    // --- Lista globale valori non trovati ---
    let notFoundList = JSON.parse(localStorage.getItem('reportData') || '[]');

// --- Helper normalizzazione SN (toglie spazi, invisibili, uniforma case) ---
function normalizeSN(s) {
    if (!s) return "";
    return String(s)
        .replace(/^\([^)]*\)/, '')  // rimuovi prefisso tra parentesi all'inizio
        .replace(/[\u200B\u00A0\s\r\n]/g, '')  // rimuovi spazi e caratteri invisibili
        .toUpperCase()
        .trim();
}

    // --- Helper VB functions ---
    function vbInStr(haystack, needle, start) {
        start = start || 1;
        const idx = haystack.indexOf(needle, Math.max(0, start - 1));
        return idx === -1 ? 0 : idx + 1;
    }

    function vbMid(str, start1, len) {
        if (!str) return "";
        if (start1 < 1) start1 = 1;
        const jsStart = start1 - 1;
        if (len == null) return str.substr(jsStart);
        return str.substr(jsStart, len);
    }

    function vbLeft(str, n) {
        return str ? str.substr(0, n) : "";
    }

    function vbRight(str, n) {
        if (!str) return "";
        n = Math.min(n, str.length);
        return str.substr(str.length - n, n);
    }

    function vbLen(str) {
        return (str || "").length;
    }

    // --- Caricamento CSV con PapaParse ---
    function loadCSVData() {
        const script = document.createElement('script');
        script.src = "https://raw.githubusercontent.com/Daniele1995-design/WebAppSap/refs/heads/main/papaparse.min.js";
        script.onload = () => {
            console.log("ðŸ“Š PapaParse caricato");
            Papa.parse(CSV_URL, {
                download: true,
                header: false,
                skipEmptyLines: true,
                complete: function(results) {
                    results.data.forEach((row, i) => {
                        let pn = (row[0] || "").replace(/["\u200B\r\n]/g,'').trim().toUpperCase();
                        let produttore = (row[1] || "").replace(/["\u200B\r\n]/g,'').trim();
                        if(pn) anagrafica[pn] = { produttore };
                    });
                    console.log(`[ANAGRAFICA]  Caricati ${Object.keys(anagrafica).length} PN`);
                }
            });
        };
        document.head.appendChild(script);
    }

    // --- DLookupPN: cerca PN normalizzato nella 'anagrafica' ---
    function DLookupPN(pn) {
        if (!pn) return null;
        const cleanedPN = pn.replace(/["\u200B\r\n]/g,'').trim().toUpperCase();
        if (!anagrafica[cleanedPN]) {
            console.warn(`[DEBUG] PN cercato "${pn}" â†’ normalizzato "${cleanedPN}" NON trovato`);
            return null;
        } else {
            console.log(`[DEBUG] PN cercato "${pn}" â†’ normalizzato "${cleanedPN}" TROVATO`);
            return anagrafica[cleanedPN];
        }
    }

    // --- parseSeriale: logica fedele VBA con debug ---
    function parseSeriale(var1) {
        console.log(`[PARSE] Input ricevuto: "${var1}"`);

        if (!var1) return { PNESTRATTO: "", SERESTRATTO: "" };
        var1 = String(var1).trim();
        let PNESTRATTO = "", SERESTRATTO = "", APPOGGIO = "";

        console.log(`[PARSE] Lunghezza stringa: ${vbLen(var1)}`);

        if (vbLen(var1) <= 1) {
            console.log(`[PARSE] Stringa troppo corta, return vuoto`);
            return { PNESTRATTO, SERESTRATTO };
        }

        // --- casi semplici ---
        let APPOGGIOstart = vbMid(var1, 1, 4);
        console.log(`[PARSE] Primi 4 caratteri: "${APPOGGIOstart}"`);

        if (/^\([\da-zA-Z]S\)/.test(APPOGGIOstart)) {
            console.log(`[PARSE] Caso (XS) rilevato`);
            const posSpace = vbInStr(var1, " ");
            if (posSpace > 0) {
                PNESTRATTO = vbMid(var1, 5, posSpace - 4);
                SERESTRATTO = vbMid(var1, 5); // prende tutto subito dopo (XS)
            } else {
                PNESTRATTO = vbMid(var1, 5);
                SERESTRATTO = ""; // nulla se non c'Ã¨ spazio
            }
            console.log(`[PARSE] Risultato (XS): PN="${PNESTRATTO}", SN="${SERESTRATTO}"`);
            return { PNESTRATTO, SERESTRATTO };
        }

        APPOGGIO = vbMid(var1, 1, 2);
        if (APPOGGIO === "SS" || vbLeft(var1, 1) === "S") {
            console.log(`[PARSE] Caso SS/S rilevato`);
            SERESTRATTO = vbMid(var1, 2, 20);
            PNESTRATTO = "Verificare Fisicamente";
            console.log(`[PARSE] Risultato SS/S: PN="${PNESTRATTO}", SN="${SERESTRATTO}"`);
            return { PNESTRATTO, SERESTRATTO };
        }

        const posSemi = vbInStr(var1, ";");
        if (posSemi > 1) {
            console.log(`[PARSE] Caso ; rilevato in posizione ${posSemi}`);
            SERESTRATTO = vbMid(var1, 1, posSemi - 1);
            PNESTRATTO = vbMid(var1, posSemi + 1, 20);
            console.log(`[PARSE] Risultato ;: PN="${PNESTRATTO}", SN="${SERESTRATTO}"`);
            return { PNESTRATTO, SERESTRATTO };
        }

        if (vbLen(var1) === 20 && vbLeft(var1, 2) === "21") {
            console.log(`[PARSE] Caso 21 (20 char) rilevato`);
            PNESTRATTO = vbMid(var1, 3, 8);
            SERESTRATTO = var1;
            console.log(`[PARSE] Risultato 21: PN="${PNESTRATTO}", SN="${SERESTRATTO}"`);
            return { PNESTRATTO, SERESTRATTO };
        }

        if (vbLen(var1) === 16 && (vbLeft(var1, 2) === "02" || vbLeft(var1, 2) === "03")) {
            console.log(`[PARSE] Caso 02/03 (16 char) rilevato`);
            PNESTRATTO = "03" + vbMid(var1, 1, 6);
            SERESTRATTO = var1;
            console.log(`[PARSE] Risultato 02/03: PN="${PNESTRATTO}", SN="${SERESTRATTO}"`);
            return { PNESTRATTO, SERESTRATTO };
        }

        // --- Logica >39 caratteri con tutti i tentativi ---
        if (vbLen(var1) > 39) {
            console.log(`[PARSE] Stringa >39 caratteri, inizio tentativi`);

            // Tentativo 0: Mid(var1,7,8)
            APPOGGIO = vbMid(var1, 7, 8).replace(/["\u200B\r\n]/g,'').trim();
            console.log(`[PARSE] Tentativo 0 - PN da pos 7-8: "${APPOGGIO}"`);
            let pos = vbInStr(var1, " ");
            SERESTRATTO = pos > 14 ? vbMid(var1, pos - 14, 14) : "";
            console.log(`[PARSE] Tentativo 0 - SN: "${SERESTRATTO}"`);

            if (DLookupPN(APPOGGIO)) {
                PNESTRATTO = APPOGGIO;
                console.log(`[PARSE] Tentativo 0 SUCCESS: PN="${PNESTRATTO}", SN="${SERESTRATTO}"`);
                return { PNESTRATTO, SERESTRATTO };
            }

            const pos1P = vbInStr(var1, "1P");
            console.log(`[PARSE] Posizione "1P": ${pos1P}`);

            if (pos1P > 0) {
                // Tentativo 1: Mid dopo "1P" 8 caratteri
                APPOGGIO = vbMid(var1, pos1P + 2, 8).replace(/["\u200B\r\n]/g,'').trim();
                console.log(`[PARSE] Tentativo 1 - PN dopo 1P (8 char): "${APPOGGIO}"`);
                pos = pos1P;
                SERESTRATTO = pos > 14 ? vbMid(var1, pos - 14, 14) : "";
                console.log(`[PARSE] Tentativo 1 - SN: "${SERESTRATTO}"`);

                if (DLookupPN(APPOGGIO)) {
                    PNESTRATTO = APPOGGIO;
                    console.log(`[PARSE] Tentativo 1 SUCCESS: PN="${PNESTRATTO}", SN="${SERESTRATTO}"`);
                    return { PNESTRATTO, SERESTRATTO };
                }

                // Tentativo 2: Mid dopo "1P" 12 caratteri (solo Huawei)
                APPOGGIO = vbMid(var1, pos1P + 2, 12).replace(/["\u200B\r\n]/g,'').trim();
                console.log(`[PARSE] Tentativo 2 - PN dopo 1P (12 char): "${APPOGGIO}"`);
                const rec = DLookupPN(APPOGGIO);

                if (rec && String(rec.produttore).toUpperCase() === "HUAWEI") {
                    console.log(`[PARSE] Tentativo 2 - Trovato Huawei!`);
                    SERESTRATTO = vbLen(var1) >= 12 ? vbRight(var1, 12) : "";
                    PNESTRATTO = APPOGGIO;
                    console.log(`[PARSE] Tentativo 2 SUCCESS (Huawei): PN="${PNESTRATTO}", SN="${SERESTRATTO}"`);
                    return { PNESTRATTO, SERESTRATTO };
                }

                // Tentativo 3: secondo "1P" se >41
                if (vbLen(var1) > 41) {
                    console.log(`[PARSE] Tentativo 3 - Cerca secondo 1P (>41 char)`);
                    const second1P = vbInStr(var1, "1P", pos1P + 2);
                    console.log(`[PARSE] Tentativo 3 - Secondo 1P in posizione: ${second1P}`);

                    if (second1P > 0) {
                        APPOGGIO = vbMid(var1, second1P + 2, 12).replace(/["\u200B\r\n]/g,'').trim();
                        console.log(`[PARSE] Tentativo 3 - PN dal secondo 1P: "${APPOGGIO}"`);
                        let codiceTarget = APPOGGIO;
                        pos = vbInStr(var1, codiceTarget);
                        SERESTRATTO = pos > 18 ? vbMid(var1, pos - 2 - 18, 18) : "";
                        console.log(`[PARSE] Tentativo 3 - SN: "${SERESTRATTO}"`);

                        if (DLookupPN(APPOGGIO)) {
                            PNESTRATTO = APPOGGIO;
                            console.log(`[PARSE]  Tentativo 3 SUCCESS: PN="${PNESTRATTO}", SN="${SERESTRATTO}"`);
                            return { PNESTRATTO, SERESTRATTO };
                        }
                    }
                }

                // Tentativo 4: Mid dopo "1P" 10 caratteri
                APPOGGIO = vbMid(var1, pos1P + 2, 10).replace(/["\u200B\r\n]/g,'').trim();
                console.log(`[PARSE] Tentativo 4 - PN dopo 1P (10 char): "${APPOGGIO}"`);
                pos = vbInStr(var1, APPOGGIO);
                SERESTRATTO = pos > 19 ? vbMid(var1, pos - 2 - 18, 19) : "";
                console.log(`[PARSE] Tentativo 4 - SN: "${SERESTRATTO}"`);

                if (DLookupPN(APPOGGIO)) {
                    PNESTRATTO = APPOGGIO;
                    console.log(`[PARSE] Tentativo 4 SUCCESS: PN="${PNESTRATTO}", SN="${SERESTRATTO}"`);
                    return { PNESTRATTO, SERESTRATTO };
                }

                // Tentativo 5: Mid dopo "1P" fino prima di "S"
                const posS = vbInStr(var1, "S");
                console.log(`[PARSE] Tentativo 5 - Posizione S: ${posS}`);

                if (posS > 0 && posS > pos1P + 2) {
                    APPOGGIO = vbMid(var1, pos1P + 2, posS - (pos1P + 2));
                    SERESTRATTO = vbLen(var1) >= posS + 10 ? vbMid(var1, posS + 1, 11) : "";
                    console.log(`[PARSE] Tentativo 5 - PN fino a S: "${APPOGGIO}", SN: "${SERESTRATTO}"`);
                } else {
                    APPOGGIO = "";
                    console.log(`[PARSE] Tentativo 5 - S non trovato o posizione non valida`);
                }

                if (DLookupPN(APPOGGIO)) {
                    PNESTRATTO = APPOGGIO;
                    console.log(`[PARSE]  Tentativo 5 SUCCESS: PN="${PNESTRATTO}", SN="${SERESTRATTO}"`);
                    return { PNESTRATTO, SERESTRATTO };
                }

                // fallback finale per caso >39
                console.log(`[PARSE]  Tutti i tentativi falliti per >39, fallback`);
                PNESTRATTO = "Verificare Fisicamente";
                SERESTRATTO = var1;
                return { PNESTRATTO, SERESTRATTO };
            } else {
                // fallback se non trova "1P" in >39
                console.log(`[PARSE]  1P non trovato in >39, fallback`);
                PNESTRATTO = "Verificare Fisicamente";
                SERESTRATTO = var1;
                return { PNESTRATTO, SERESTRATTO };
            }
        }

        // fallback generico per <=39 caratteri
        console.log(`[PARSE]  Nessun caso matched per <=39, fallback generico`);
        PNESTRATTO = "Verificare Fisicamente";
        SERESTRATTO = var1;
        return { PNESTRATTO, SERESTRATTO };
    }

    // ===== RESET AUTOMATICO AL CAMBIO GRN =====
    let currentGRN = localStorage.getItem('reportGRN') || null;

    function checkGRNAndReset() {
        const grnElement = document.querySelector('#numeroGRN');
        if (!grnElement) return;
        const newGRN = grnElement.textContent.trim();
        if (newGRN && newGRN !== currentGRN) {
            console.log(`â™»ï¸ Nuovo GRN rilevato: ${newGRN}. Report resettato.`);
            notFoundList = [];
            localStorage.setItem('reportData', JSON.stringify([]));
            localStorage.setItem('reportGRN', newGRN);
            currentGRN = newGRN;
            const tbody = document.querySelector("#reportTable tbody");
            if (tbody) tbody.innerHTML = '';
        }
    }

    function observeGRN() {
        const grnElement = document.querySelector('#numeroGRN');
        if (!grnElement) { setTimeout(observeGRN, 300); return; }
        checkGRNAndReset();
        const observer = new MutationObserver(() => checkGRNAndReset());
        observer.observe(grnElement, { characterData: true, childList: true, subtree: true });
    }
    observeGRN();

    // === FUNZIONI PER AGGIUNGERE PULSANTI NEL MODAL ===
    function addButtonsToModal() {
        const modalInner = document.querySelector('.sheet-modal-inner');
        if (!modalInner) return;

        // Controlla se i pulsanti sono giÃ  stati aggiunti
        if (document.querySelector('#modalTogglePulizia') || document.querySelector('#modalReportBtn')) return;

        console.log("ðŸŽ›ï¸ Aggiungendo pulsanti nel modal...");

        // Trova l'ultimo div con padding-horizontal per inserire i nuovi pulsanti dopo
        const allPaddingDivs = modalInner.querySelectorAll('.padding-horizontal.padding-bottom');
        const lastPaddingDiv = allPaddingDivs[allPaddingDivs.length - 1];
        if (!lastPaddingDiv) return;

        // Crea il pulsante Toggle Pulizia
        const toggleBtnContainer = document.createElement('div');
        toggleBtnContainer.className = 'padding-horizontal padding-bottom';
        toggleBtnContainer.innerHTML = `
            <a class="button button-large button-fill" id="modalTogglePulizia" style="background: ${puliziaSerialiAttiva ? '#28a745' : '#dc3545'};">
                <span>${puliziaSerialiAttiva ? '🟢 PULIZIA ON' : '🔴 PULIZIA OFF'}</span>
            </a>
        `;

        // Crea il pulsante Report
        const reportBtnContainer = document.createElement('div');
        reportBtnContainer.className = 'padding-horizontal padding-bottom';
        reportBtnContainer.innerHTML = `
            <a class="button button-large button-fill" id="modalReportBtn" style="background: #007bff;">
                <i class="icon f7-icons if-not-md">list_bullet</i>
                <i class="icon material-icons md-only">list</i>
                <span>📋 Report Valori</span>
            </a>
        `;

        // Trova il div con "SwipeUp" per inserire i pulsanti prima di esso
        const swipeUpDiv = modalInner.querySelector('.margin-top.text-align-center');
        if (swipeUpDiv) {
            swipeUpDiv.before(toggleBtnContainer);
            swipeUpDiv.before(reportBtnContainer);
        } else {
            // Se non trova il div SwipeUp, li inserisce dopo l'ultimo pulsante
            lastPaddingDiv.after(toggleBtnContainer);
            toggleBtnContainer.after(reportBtnContainer);
        }

        // Event listener per il toggle pulizia
        const modalToggleBtn = document.querySelector('#modalTogglePulizia');
        modalToggleBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();

            puliziaSerialiAttiva = !puliziaSerialiAttiva;

            // Aggiorna il testo e colore del pulsante nel modal
            modalToggleBtn.style.background = puliziaSerialiAttiva ? '#28a745' : '#dc3545';
            modalToggleBtn.querySelector('span').textContent = puliziaSerialiAttiva ? '🟢 PULIZIA ON' : '🔴 PULIZIA OFF';

            const msg = puliziaSerialiAttiva ? "🟢 Pulizia seriali ATTIVATA" : "🔴 Pulizia seriali DISATTIVATA";
            showPopup(msg);
            console.log("Stato pulizia cambiato dal modal a:", puliziaSerialiAttiva);
        });

        // Event listener per il report
        const modalReportBtn = document.querySelector('#modalReportBtn');
        modalReportBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();

            // Crea il pannello se non esiste
            createReportPanel();

            // Mostra il pannello
            const panel = document.querySelector("#reportPanel");
            if (panel) {
                panel.style.display = "block";
            }

            console.log("Report aperto dal modal");
        });

        console.log("Pulsanti aggiunti al modal");
    }

    // Osserva quando il modal si apre
    function observeModalOpen() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' || mutation.type === 'attributes') {
                    const modal = document.querySelector('.sheet-modal-inner');
                    if (modal && modal.offsetParent !== null) { // Verifica che sia visibile
                        setTimeout(() => {
                            addButtonsToModal();
                        }, 200);
                    }
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class']
        });
    }

    // --- Funzione pannello report (senza pulsanti fissi in alto) ---
    function createReportPanel() {
        if (document.querySelector("#reportPanel")) return;

        const panel = document.createElement("div");
        panel.id = "reportPanel";
        panel.style.position = "fixed";
        panel.style.top = "200px";
        panel.style.left = "200px";
        panel.style.width = "600px";
        panel.style.height = "300px";
        panel.style.overflow = "auto";
        panel.style.background = "#fff";
        panel.style.border = "1px solid #ccc";
        panel.style.borderRadius = "8px";
        panel.style.boxShadow = "0 2px 10px rgba(0,0,0,0.3)";
        panel.style.fontSize = "12px";
        panel.style.zIndex = "9999";
        panel.style.display = "none";
        panel.style.resize = "both";
        panel.style.minWidth = "400px";
        panel.style.minHeight = "200px";

        // Header con titolo, copia, reset, chiudi
        const header = document.createElement("div");
        header.style.position = "relative";
        header.style.width = "100%";
        header.style.height = "40px";
        header.style.background = "#007bff";
        header.style.color = "#fff";
        header.style.display = "grid";
        header.style.gridTemplateColumns = "2fr 1fr 1fr 1fr";
        header.style.alignItems = "center";
        header.style.padding = "0 5px";
        header.style.borderTopLeftRadius = "8px";
        header.style.borderTopRightRadius = "8px";
        header.style.cursor = "move";

        const leftSpan = document.createElement("span");
        leftSpan.style.fontWeight = "bold";
        leftSpan.textContent = "ðŸ“‹ Report valori non trovati";
        leftSpan.style.justifySelf = "start";

        const copyBtn = document.createElement("button");
        copyBtn.id = "copyTableBtn";
        copyBtn.textContent = "ðŸ“„ Copia";
        copyBtn.style.padding = "2px 4px";
        copyBtn.style.fontSize = "12px";
        copyBtn.style.border = "none";
        copyBtn.style.borderRadius = "3px";
        copyBtn.style.cursor = "pointer";
        copyBtn.style.background = "#28a745";
        copyBtn.style.color = "#fff";

        const resetBtn = document.createElement("button");
        resetBtn.id = "resetTableBtn";
        resetBtn.textContent = "â™»ï¸ Reset";
        resetBtn.style.padding = "2px 4px";
        resetBtn.style.fontSize = "12px";
        resetBtn.style.border = "none";
        resetBtn.style.borderRadius = "3px";
        resetBtn.style.cursor = "pointer";
        resetBtn.style.background = "#dc3545";
        resetBtn.style.color = "#fff";

        const closeBtn = document.createElement("button");
        closeBtn.id = "closeReport";
        closeBtn.textContent = "X";
        closeBtn.style.fontSize = "20px";
        closeBtn.style.fontWeight = "bold";
        closeBtn.style.background = "transparent";
        closeBtn.style.border = "none";
        closeBtn.style.color = "red";
        closeBtn.style.cursor = "pointer";

        header.appendChild(leftSpan);
        header.appendChild(copyBtn);
        header.appendChild(resetBtn);
        header.appendChild(closeBtn);
        panel.appendChild(header);

        // Tabella
        const table = document.createElement("table");
        table.id = "reportTable";
        table.style.width = "100%";
        table.style.borderCollapse = "collapse";
        table.style.marginTop = "5px";
        table.innerHTML = `
            <thead>
                <tr style="background:#f0f0f0;">
                    <th style="border:1px solid #ccc;padding:3px;">Data/Ora</th>
                    <th style="border:1px solid #ccc;padding:3px;">Tipo</th>
                    <th style="border:1px solid #ccc;padding:3px;">Valore</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;
        panel.appendChild(table);
        document.body.appendChild(panel);

        // Popola dati salvati
        const tbody = table.querySelector('tbody');
        notFoundList.forEach(item => {
            const tr = document.createElement('tr');
            ["date","type","value"].forEach(k=>{
                const td=document.createElement('td');
                td.textContent = item[k];
                td.style.border="1px solid #ccc";
                td.style.padding="3px";
                td.contentEditable="true";
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });

        // Eventi pulsanti del pannello
        copyBtn.addEventListener("click", () => {
            const range = document.createRange();
            range.selectNode(table);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            try {
                document.execCommand('copy');
                sel.removeAllRanges();
                showPopup("Tabella copiata!");
            } catch {
                showPopup("Impossibile copiare");
            }
        });

        resetBtn.addEventListener("click", () => {
            if(confirm("Vuoi resettare davvero i valori?")){
                notFoundList = [];
                localStorage.setItem('reportData', JSON.stringify([]));
                tbody.innerHTML = '';
                showPopup("Report resettato");
            }
        });

        closeBtn.addEventListener("click", () => {
            panel.style.display = "none";
        });

        // Drag & Drop pannello
        let offsetX=0, offsetY=0, isDragging=false;
        header.addEventListener("mousedown",(e)=>{
            isDragging=true;
            offsetX=e.clientX-panel.getBoundingClientRect().left;
            offsetY=e.clientY-panel.getBoundingClientRect().top;
            document.body.style.userSelect="none";
        });
        document.addEventListener("mousemove",(e)=>{
            if(!isDragging) return;
            panel.style.left=(e.clientX-offsetX)+"px";
            panel.style.top=(e.clientY-offsetY)+"px";
        });
        document.addEventListener("mouseup",()=>{ isDragging=false; document.body.style.userSelect="auto"; });
    }

    // --- Aggiunge record tabellare ---
    function addNotFoundRecord(tipo, valore) {
        createReportPanel();
        const tbody = document.querySelector("#reportTable tbody");

        const tr = document.createElement("tr");
        const dateCell = document.createElement("td");
        const tipoCell = document.createElement("td");
        const valoreCell = document.createElement("td");

        dateCell.textContent = new Date().toLocaleString();
        tipoCell.textContent = tipo;
        valoreCell.textContent = valore;

        [dateCell,tipoCell,valoreCell].forEach(td=>{
            td.style.border="1px solid #ccc";
            td.style.padding="3px";
            td.contentEditable="true";
            tr.appendChild(td);
        });

        tbody.appendChild(tr);

        notFoundList.push({
            date: dateCell.textContent,
            type: tipoCell.textContent,
            value: valoreCell.textContent
        });
        localStorage.setItem('reportData', JSON.stringify(notFoundList));
    }

    // --- Funzione popup fade in/out ---
    function showPopup(msgText){
        let existing=document.querySelector('#tmPopupMsg');
        if(existing){
            existing.textContent=msgText; existing.style.opacity=1;
            setTimeout(()=>existing.style.opacity=0,2500); return;
        }
        const msg=document.createElement('div');
        msg.id='tmPopupMsg';
        msg.textContent=msgText;
        msg.style.position='fixed';
        msg.style.top='20px';
        msg.style.right='20px';
        msg.style.background='#ffcc00';
        msg.style.color='#000';
        msg.style.padding='10px 15px';
        msg.style.borderRadius='5px';
        msg.style.boxShadow='0 0 10px rgba(0,0,0,0.3)';
        msg.style.zIndex=9999;
        msg.style.opacity=0;
        msg.style.transition='opacity 0.5s';
        document.body.appendChild(msg);
        requestAnimationFrame(()=>msg.style.opacity=1);
        setTimeout(()=>msg.style.opacity=0,2500);
    }

// --- Funzione popup persistente per seriale non trovato (unica, aggiorna se SAP attivo) ---
function showNotFoundPopup(seriale) {
    const SAP_SELECTOR = '#ArticoloScansionato-text';
    let sapElement = document.querySelector(SAP_SELECTOR);
    let observer;
    let timeoutId;

    // Funzione per verificare se SAP è attivo
    function isSapActive() {
        if (!sapElement) {
            sapElement = document.querySelector(SAP_SELECTOR);
            if (!sapElement) return false;
        }
        const txt = (sapElement.textContent || '').trim();
        const visible = (sapElement.offsetParent !== null) ||
                       (sapElement.getClientRects && sapElement.getClientRects().length > 0);
        return txt !== '' && visible;
    }

    // Rimuovi il piccolo popup giallo se presente
    const small = document.querySelector('#tmPopupMsg');
    if (small) small.remove();

    // Rimuovi eventuali popup esistenti
    const existingPopup = document.querySelector('#tmNotFoundPopup');
    if (existingPopup) {
        existingPopup.remove();
    }

    // Se non c'è un seriale e SAP non è attivo, non fare nulla
    if (!seriale && !isSapActive()) {
        return;
    }

    // Crea il popup
    const popup = document.createElement('div');
    popup.id = 'tmNotFoundPopup';
    popup.style.position = 'fixed';
    popup.style.top = '5px';
    popup.style.left = '5px';
    popup.style.padding = '10px 15px';
    popup.style.borderRadius = '6px';
    popup.style.boxShadow = '0 0 12px rgba(0,0,0,0.25)';
    popup.style.zIndex = '99999';
    popup.style.fontSize = '15px';
    popup.style.display = 'flex';
    popup.style.justifyContent = 'space-between';
    popup.style.alignItems = 'center';
    popup.style.whiteSpace = 'nowrap';
    popup.style.minWidth = '220px';

    const textDiv = document.createElement('div');
    textDiv.id = 'tmNotFoundText';
    textDiv.style.lineHeight = '1.1';
    popup.appendChild(textDiv);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✖';
    closeBtn.style.marginLeft = '12px';
    closeBtn.style.background = 'transparent';
    closeBtn.style.border = 'none';
    closeBtn.style.color = '#fff';
    closeBtn.style.fontSize = '16px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.padding = '0';
    closeBtn.style.display = 'flex';
    closeBtn.style.alignItems = 'center';
    closeBtn.style.justifyContent = 'center';
    closeBtn.style.width = '20px';
    closeBtn.style.height = '20px';
    popup.appendChild(closeBtn);

    document.body.appendChild(popup);

    // Funzione per chiudere il popup
    function closePopup() {
        try {
            if (observer) {
                observer.disconnect();
            }
            if (popup && popup.parentNode) {
                popup.remove();
            }
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        } catch (e) {
            console.error('Errore durante la pulizia:', e);
        }
    }

    // Aggiorna lo stato del popup
    function updatePopupState() {
        const sapActive = isSapActive();

        if (sapActive) {
            popup.style.background = '#28a745';
            popup.style.color = '#fff';
            textDiv.innerHTML = `<strong>Modalità Ricerca SAP Attiva</strong><br>Clicca il Popup Verde per Uscire`;
            textDiv.style.textAlign = 'center';
        } else if (seriale) {
            popup.style.background = '#ff4d4f';
            textDiv.innerHTML = `<strong>Not Found</strong><br><em>${seriale}</em>`;
        } else {
            closePopup();
            return;
        }

        popup.style.display = 'flex';
    }

    // Imposta l'osservatore per l'elemento SAP
    if (sapElement) {
        observer = new MutationObserver((mutations) => {
            const wasSapActive = popup.style.background === 'rgb(40, 167, 69)'; // #28a745 in RGB
            const isNowActive = isSapActive();

            // Se ero in modalità SAP e ora non lo sono più, chiudi tutto
            if (wasSapActive && !isNowActive) {
                closePopup();
                return;
            }

            // Altrimenti aggiorna lo stato
            updatePopupState();
        });

        observer.observe(sapElement, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['style', 'class']
        });
    }

    // Imposta il pulsante di chiusura
    closeBtn.onclick = closePopup;

    // Imposta il timeout di sicurezza
    //timeoutId = setTimeout(closePopup, 3000000);

    // Aggiorna lo stato iniziale
    updatePopupState();

    return popup;
}
    // --- Funzione per lo scroll automatico ---
    function scrollToTargetElement() {
        if (targetElementForScroll) {
            console.log("Eseguendo scroll verso l'elemento target");

            // Scroll con comportamento smooth
            targetElementForScroll.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'nearest'
            });

            // Evidenzia temporaneamente l'elemento
            const originalBorder = targetElementForScroll.style.border;
            const originalBackground = targetElementForScroll.style.backgroundColor;

            targetElementForScroll.style.border = '3px solid #ff6b00';
            targetElementForScroll.style.backgroundColor = '#fff3cd';

            setTimeout(() => {
                targetElementForScroll.style.border = originalBorder;
                targetElementForScroll.style.backgroundColor = originalBackground;
            }, 2000);

            // Reset della variabile
            targetElementForScroll = null;
        }
    }

    // --- Observer pagina ---
    const pageObserver = new MutationObserver(() => {
        const strongElem = Array.from(document.querySelectorAll('strong'))
                              .find(s => s.textContent.includes('Verbali di scarico collegato'));
        const titleElem = document.querySelector('div.title')?.textContent.includes('Goods Receipt');
        if (strongElem && titleElem) {
            console.log("Pagina pronta");
            pageObserver.disconnect();
            initStateListener();
            loadCSVData();
            observeModalOpen();
        }
    });
    pageObserver.observe(document.body, { childList: true, subtree: true });

    // --- Stato ---
    function initStateListener() {
        const selectStato = document.querySelector('#statoLogicoTestata');
        if (!selectStato) {
            setTimeout(initStateListener, 300);
            return;
        }

        console.log("Select stato trovata");

        function checkAndEnable() {
            const selectedOption = selectStato.options[selectStato.selectedIndex];
            const stato = selectedOption?.text || '';
            console.log("Stato attuale:", stato);

            if (['Rottame','Guasto','Usato'].includes(stato)) {
                console.log("Stato corretto, abilito ricerca");
                enableSearch();
                clearInterval(autoCheck);
            }
        }

        const autoCheck = setInterval(checkAndEnable, 500);
        selectStato.addEventListener('change', checkAndEnable);
    }

    function enableSearch() {
        const inputSearch = document.querySelector('#shootInput');
        if (!inputSearch) return;
        inputSearch.removeEventListener('keydown', handleEnter);
        inputSearch.addEventListener('keydown', handleEnter);
        console.log("Ricerca abilitata (Enter pronto)");
    }

    // --- handleEnter con pulizia seriali integrata e memorizzazione target ---
   function handleEnter(e) {
    if (e.key !== 'Enter') return;
       // --- Controllo modalità SAP attiva ---
const articoloScansionato = document.querySelector('#ArticoloScansionato-text');
if (articoloScansionato && articoloScansionato.textContent.trim() !== "") {
    console.log("Modalità Ricerca SAP attiva, salto ricerca personalizzata");
    showNotFoundPopup(""); // usa il popup unico (verde)
    return; // blocca la ricerca interna, lascia fare alla webapp
}
    checkGRNAndReset();
    const inputSearch = e.target;
    let codiceInput = inputSearch.value.trim();

    // Memorizza il seriale originale
    serialeOriginale = codiceInput;

    // Se la pulizia Ã¨ attiva, pulisce il seriale
    if (puliziaSerialiAttiva && codiceInput) {
        const { PNESTRATTO, SERESTRATTO } = parseSeriale(codiceInput);
        codiceInput = SERESTRATTO || codiceInput; // Usa il seriale pulito
        inputSearch.value = codiceInput;
        console.log(`Pulizia attiva - Originale: "${serialeOriginale}" â†’ Pulito: "${codiceInput}" | PN: "${PNESTRATTO}"`);
    }

    console.log("Enter premuto, valore cercato:", codiceInput);
    if (!codiceInput) return;

    let targetDiv = null;
    let riferimentoLinea = null;

    const pnInfos = Array.from(document.querySelectorAll('span.pn-info'));
    let serialMatch = pnInfos.find(span => {
    const match = span.textContent.match(/Seriale:\s*([^\|]+)/);
    if (!match) return false;
    const serialeTrovato = normalizeSN(match[1]);
    const serialeCercato = normalizeSN(codiceInput);
    console.log("Confronto seriali:", {
        trovato: serialeTrovato,
        cercato: serialeCercato,
        uguaglianza: serialeTrovato === serialeCercato
    });
    return serialeTrovato === serialeCercato;
});

    if (serialMatch) {
        console.log("Match trovato in Seriale:", codiceInput);
        targetDiv = serialMatch.closest('li') || serialMatch.parentElement;
    } else {
        console.log("Nessun match in Seriale, passo alla ricerca in Riferimento");
        const divRiferimenti = Array.from(document.querySelectorAll('div'))
            .filter(d => d.textContent.includes("Riferimento:"));

        targetDiv = divRiferimenti.find(div => {
            const match = div.textContent.match(/Riferimento:\s*([A-Za-z0-9]+)/);
            return match && match[1] === codiceInput;
        });
    }

if (!targetDiv) {
    // mostra il popup unico (verrà aggiornato in verde se la webapp inserisce il div SAP)
    showNotFoundPopup(serialeOriginale || codiceInput);

    // registra il not-found solo se SAP NON è attivo *ora* (opzionale)
    const sapEl = document.querySelector('#ArticoloScansionato-text');
    if (!(sapEl && sapEl.textContent.trim() !== "")) {
        addNotFoundRecord("search", serialeOriginale || codiceInput);
    }

    const inputSearch = document.querySelector('#shootInput');
    if (inputSearch) inputSearch.focus();
    return;
}
    const refMatch = targetDiv.textContent.match(/Riferimento:\s*([A-Za-z0-9]+)/);
    riferimentoLinea = refMatch ? refMatch[1] : codiceInput;

    // --- Evidenzia la riga trovata ---
   const codiceRigaMatch = targetDiv.querySelector("span, b")?.textContent.match(/#\d{3,}/);
const codiceRiga = codiceRigaMatch ? codiceRigaMatch[0] : null;
if (codiceRiga) {
    // Evidenzia SOLO dopo la chiusura della maschera (aggiunta/annulla)
    const dialogNode = document.getElementById('dialogNewItem');
    if (dialogNode) {
        const dialogObserver = new MutationObserver(() => {
            // Se la maschera è chiusa...
            if (dialogNode.style.display === "none" || dialogNode.offsetParent === null) {
                dialogObserver.disconnect();
                evidenziaRigaDaCodiceQuandoPronta(codiceRiga);
            }
        });
        dialogObserver.observe(dialogNode, { attributes: true, attributeFilter: ['style', 'class'] });
    } else {
        // Fallback se non c'è dialog
        setTimeout(() => evidenziaRigaDaCodiceQuandoPronta(codiceRiga), 700);
    }
}

    const addBtn = targetDiv.querySelector('button[onclick^="addNewLine"]');
    if (!addBtn) {
        showPopup('Pulsante Aggiungi non trovato');
        return;
    }

    addBtn.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true }));

    // --- observer maschera inserimento seriale ---
    const observer = new MutationObserver(() => {
        const serialInput = document.querySelector('#dialogNewItem-Seriale');
        const descrSpan = document.querySelector('#dialogNewItem-Descrizione');
        if (serialInput && descrSpan) {
            let rifDiv = document.querySelector('#dialogNewItem-CodiceRif');
            if (!rifDiv) {
                rifDiv = document.createElement('div');
                rifDiv.id = 'dialogNewItem-CodiceRif';
                descrSpan.parentElement.insertAdjacentElement('afterend', rifDiv);
            }
            rifDiv.innerHTML = `<strong>Riferimento:</strong> ${riferimentoLinea}`;

            // --- INSERISCE SEMPRE IL SERIALE BARCODATO ORIGINALE ---
            if (puliziaSerialiAttiva && serialeOriginale) {
                serialInput.value = serialeOriginale;
                console.log("Inserito seriale originale barcodato nella maschera:", serialeOriginale);
            } else {
                serialInput.value = serialeOriginale || codiceInput;
                console.log("Inserito seriale nella maschera:", serialeOriginale || codiceInput);
            }

            if (puliziaSerialiAttiva) {
                setTimeout(() => {
                    const enterEvent = new KeyboardEvent('keydown', {
                        key: 'Enter',
                        code: 'Enter',
                        keyCode: 13,
                        which: 13,
                        bubbles: true,
                        cancelable: true
                    });
                    serialInput.dispatchEvent(enterEvent);
                    console.log("Enter automatico inviato al campo seriale");
                }, 100);
            }

            serialInput.focus();
            serialInput.select();
            observer.disconnect();
            console.log("Riferimento e seriale inseriti nella maschera");
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}
    // --- Reset CodiceRif e ricerca principale su click con scroll ---
    document.body.addEventListener('click', (e) => {
        const btn = e.target;
        if (!btn) return;
        const isAddBtn = btn.matches('button[onclick^="grn.addLine"]');
        const isCancelBtn = btn.matches('button[onclick^="app.dialog.close"]');

        if (isAddBtn || isCancelBtn) {
            const rifDiv = document.querySelector('#dialogNewItem-CodiceRif');
            if (rifDiv) {
                rifDiv.remove();
                console.log("â™»ï¸ CodiceRif resettato manualmente");
            }
            if (isAddBtn) {
                const inputSearch = document.querySelector('#shootInput');
                if (inputSearch) {
                    inputSearch.value = '';
                    inputSearch.focus();
                    console.log("ðŸ”„ Campo ricerca principale resettato e focus");
                }

                // *** ESEGUI LO SCROLL DOPO AVER CLICCATO AGGIUNGI ***
                setTimeout(() => {
                    scrollToTargetElement();
                }, 500);

                serialeOriginale = "";
            }

            if (isCancelBtn) {
                // Reset della variabile anche se si cancella
                targetElementForScroll = null;
            }
        }
    });

    // --- Click manuale Aggiungi ---
    document.body.addEventListener('click', (e) => {
        const btn = e.target.closest('button[onclick^="addNewLine"]');
        if (!btn) return;

        console.log("ðŸ–±ï¸ Click manuale su Aggiungi rilevato");

        const liContainer = btn.closest('li') || btn.parentElement;

        // *** MEMORIZZA ANCHE PER CLICK MANUALE ***
        targetElementForScroll = liContainer;

        let riferimentoLinea = null;
        const refMatch = liContainer.textContent.match(/Riferimento:\s*([A-Za-z0-9]+)/);
        if (refMatch) {
            riferimentoLinea = refMatch[1];
        } else {
            addNotFoundRecord("manual_click", liContainer.textContent.trim().slice(0,100));
        }

        const observer = new MutationObserver(() => {
            const serialInput = document.querySelector('#dialogNewItem-Seriale');
            const descrSpan = document.querySelector('#dialogNewItem-Descrizione');
            if (serialInput && descrSpan) {
                let rifDiv = document.querySelector('#dialogNewItem-CodiceRif');
                if (!rifDiv) {
                    rifDiv = document.createElement('div');
                    rifDiv.id = 'dialogNewItem-CodiceRif';
                    descrSpan.parentElement.insertAdjacentElement('afterend', rifDiv);
                }
                rifDiv.innerHTML = `<strong>Riferimento:</strong> ${riferimentoLinea || 'N/D'}`;

                const disableManualAddCleanup = true;
                if (!disableManualAddCleanup && puliziaSerialiAttiva) {
                    let pnDiv = document.getElementById('dialogNewItem-PN-estratto');
                    if (!pnDiv) {
                        pnDiv = document.createElement('div');
                        pnDiv.id = 'dialogNewItem-PN-estratto';
                        pnDiv.style.marginTop = '5px';
                        pnDiv.style.fontWeight = 'bold';
                        pnDiv.style.color = 'green';
                        rifDiv.after(pnDiv);
                    }
                    pnDiv.innerHTML = "<div>ðŸ§¹ Pulizia seriali: ATTIVA</div><div>SN Barcodato: </div><div>PN estratto: </div>";

                    serialInput.addEventListener('keydown', function handleSerialClean(e) {
                        if (e.key === 'Enter') {
                            const rawSN = serialInput.value;
                            if (rawSN && puliziaSerialiAttiva) {
                                const { PNESTRATTO, SERESTRATTO } = parseSeriale(rawSN);
                                serialInput.value = SERESTRATTO || rawSN;
                                serialInput.dispatchEvent(new Event('input', { bubbles: true }));
                                console.log("[INFO] SN Barcodato:", rawSN, "| SN estratto:", SERESTRATTO, "| PN estratto:", PNESTRATTO);
                                pnDiv.innerHTML = `<div>ðŸ§¹ Pulizia seriali: ATTIVA</div><div>SN Barcodato: ${rawSN}</div><div>PN estratto: ${PNESTRATTO}</div>`;

                                setTimeout(() => checkAndAddSerial(), 200);
                            }
                            serialInput.removeEventListener('keydown', handleSerialClean);
                        }
                    });
                }

                serialInput.focus();
                serialInput.select();
                observer.disconnect();
                console.log("ðŸ“ Riferimento inserito nella maschera da click manuale");
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    });

// --- Funzione di controllo automatico per la pulizia seriali ---
function checkAndAddSerial() {
    console.log("=== INIZIO CHECK SERIAL ===");

    // 1. Verifica se la funzione viene chiamata
    console.log("Funzione checkAndAddSerial chiamata");

    // 2. Trova l'input del seriale
    const serialInput = document.querySelector('#dialogNewItem-Seriale');
    console.log("Input seriale trovato:", !!serialInput);
    if (!serialInput) return;

    // 3. Leggi il valore inserito
    const currentSN = serialInput.value.trim();
    console.log("Seriale inserito:", JSON.stringify(currentSN));

    // 4. Trova il riferimento al seriale atteso
    const referenceSpan = document.querySelector('#dialogNewItem-PN');
    console.log("Riferimento PN trovato:", !!referenceSpan);
    if (!referenceSpan) return;

    // 5. Stampa il contenuto completo per debug
    console.log("Contenuto referenceSpan:", referenceSpan.textContent);

    // 6. Cerca il seriale atteso
    const expectedMatch = referenceSpan.textContent.match(/Seriale:\s*([^|]+)/);
    console.log("Match trovato:", !!expectedMatch);

    if (expectedMatch) {
        const expectedSN = expectedMatch[1].trim();
        console.log("Seriale atteso:", JSON.stringify(expectedSN));

        // 7. Normalizzazione aggressiva
        const normalize = s => String(s || "").replace(/\s+/g, '').toUpperCase();
        const cleanCurrent = normalize(currentSN);
        const cleanExpected = normalize(expectedSN);

        console.log("Dopo normalizzazione:", {
            inserito: cleanCurrent,
            atteso: cleanExpected,
            corrispondono: cleanCurrent === cleanExpected
        });

        // 8. Se corrispondono, clicca su Aggiungi
        if (cleanCurrent === cleanExpected) {
            const addBtn = document.querySelector('button[onclick="grn.addLine(true)"]');
            console.log("Pulsante Aggiungi trovato:", !!addBtn);
            if (addBtn) {
                console.log("Click su Aggiungi in corso...");
                addBtn.click();
                return;
            }
        }
    }

    console.log("=== FINE CHECK SERIAL (nessuna azione eseguita) ===");
}

// Aggiungi questo per verificare se la funzione viene chiamata
document.addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && e.target.matches('#dialogNewItem-Seriale')) {
        console.log("=== INVIO RILEVATO NEL CAMPO SERIALE ===");
        setTimeout(checkAndAddSerial, 100);
    }
});
    // --- Reset dei campi quando si chiude/cancella ---
    document.body.addEventListener('click', (e) => {
        const btn = e.target;
        if (!btn) return;

        const buttons = [
            'button[onclick="grn.addLine(true)"]',
            'button[onclick="app.dialog.close(\'#dialogNewItem\')"]',
            'button.button i.fa-trash-o'
        ];

        const isTargetButton = buttons.some(selector => {
            if (selector.includes('i.fa-trash-o')) {
                return btn.matches('i.fa-trash-o') || btn.closest('button')?.querySelector('i.fa-trash-o');
            }
            return btn.matches(selector);
        });

        if (isTargetButton) {
            const pnDiv = document.querySelector('#dialogNewItem-PN-estratto');
            const erroreDiv = document.querySelector('#dialogNewItem-errore');

            if (pnDiv) {
                pnDiv.innerHTML = "<div>ðŸ§¹ Pulizia seriali: " + (puliziaSerialiAttiva ? "ATTIVA" : "DISATTIVA") + "</div><div>SN Barcodato: </div><div>PN estratto: </div>";
            }
            if (erroreDiv) {
                erroreDiv.remove();
            }

            serialeOriginale = "";
            console.log("ðŸ”„ Campi pulizia resettati");
        }
    });

    console.log("ðŸŽ¯ Script con pulizia seriali e scroll automatico completamente inizializzato");

    let lastHighlightedCard = null;

function evidenziaRigaDaCodiceQuandoPronta(codiceRiga) {
    function trovaLi() {
        const codiceDiv = Array.from(document.querySelectorAll('div[style*="padding-right"]')).find(el =>
            el.textContent && el.textContent.includes(codiceRiga)
        );
        if (codiceDiv) {
            return codiceDiv.closest("li.item-content.item-input.item-input-outline");
        }
        return null;
    }
    // Evidenzia
    function evidenzia(riga) {
        if (window.lastHighlightedCard) {
            window.lastHighlightedCard.style.backgroundColor = '';
            window.lastHighlightedCard.style.boxShadow = '';
        }
        riga.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        riga.style.backgroundColor = '#ced4da';
        riga.style.boxShadow = '0 0 0 3px #bdbdbd inset';
        window.lastHighlightedCard = riga;
    }
    // Observer sulla lista
    const ulContainer = document.querySelector('ul, ol, div.list, div[role="list"]') || document.body;
    const observer = new MutationObserver(() => {
        let nuovaRiga = trovaLi();
        if (nuovaRiga) {
            evidenzia(nuovaRiga);
            observer.disconnect();
        }
    });
       observer.observe(ulContainer, { childList: true, subtree: true });
    // Se già presente (seriale già inserito)
    let rigaSubito = trovaLi();
    if (rigaSubito) {
        evidenzia(rigaSubito);
        observer.disconnect();
    }
    setTimeout(() => observer.disconnect(), 4000); // safety

    console.log("✅ GRN completamente inizializzato");
};

// Richiama subito la funzione per avviare lo script
window.initGRNCompleto();
