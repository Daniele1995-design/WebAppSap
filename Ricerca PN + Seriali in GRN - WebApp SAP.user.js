// libreriaGRN.js
(function(window) {
    'use strict';

    async function initGRN() {

        // --- PN-RIF normale ---
        const CSV_URL = "https://raw.githubusercontent.com/Daniele1995-design/WebAppSap/refs/heads/main/Anagrafica%20Definitiva%2028052025%20-%20anagrafica%20SAP.csv";
        const CACHE_KEY = "GRN_CSV_CACHE";
        const CACHE_EXPIRY_HOURS = 9;
        let csvData = {}; // { codice: {pn, rif} }

        // --- CSV SERIALI ---
        const SERIAL_CACHE_KEY = "GRN_CSV_CACHE_SERIAL";
        const SERIAL_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSVMfUrBEeHweSi9tow2eS37RugtyYabG7c2tv22TIq-u1LS1QuQrx7bStSGXd05luyiFTKibbkKxWI/pub?output=csv";
        let csvSerialData = {}; // { fr_id: seriale }

        // --- Utilities ---
        function extractFrIdFromDialog(dialog) {
            const divRif = dialog.querySelector("#dialogNewItem-CodiceRif");
            if (!divRif) return "";

            const strong = divRif.querySelector("strong");
            if (strong) {
                let n = strong.nextSibling;
                while (n && n.nodeType !== Node.TEXT_NODE) n = n.nextSibling;
                if (n && typeof n.textContent === "string") {
                    const raw = n.textContent;
                    const onlyDigits = (raw.match(/\d+/) || [""])[0];
                    if (onlyDigits) return onlyDigits;
                }
            }

            const m = divRif.textContent.match(/Riferimento:\s*([0-9]+)/i);
            if (m) return m[1];

            return "";
        }

        // --- Caricamento CSV PN/RIF ---
        async function caricaCSV() {
            const cache = localStorage.getItem(CACHE_KEY);
            if (cache) {
                const parsed = JSON.parse(cache);
                if (Date.now() - parsed.timestamp < CACHE_EXPIRY_HOURS * 3600 * 1000) {
                    csvData = parsed.data;
                    return;
                }
            }
            const resp = await fetch(CSV_URL);
            const text = await resp.text();
            text.trim().split("\n").slice(1).forEach(line => {
                const valori = line.split(",");
                const codice = valori[0]?.trim();
                const pn = valori[5]?.trim();
                const rif = valori[1]?.trim();
                if (codice) csvData[codice] = { pn, rif };
            });
            localStorage.setItem(CACHE_KEY, JSON.stringify({timestamp: Date.now(), data: csvData}));
        }

        // --- Caricamento CSV Seriali ---
        async function caricaCSVSeriali() {
            const cache = localStorage.getItem(SERIAL_CACHE_KEY);
            if (cache) {
                try {
                    const parsed = JSON.parse(cache);
                    if (Date.now() - parsed.timestamp < CACHE_EXPIRY_HOURS * 3600 * 1000) {
                        csvSerialData = parsed.data;
                        return;
                    }
                } catch(e) { localStorage.removeItem(SERIAL_CACHE_KEY); }
            }

            const resp = await fetch(SERIAL_CSV_URL);
            const text = await resp.text();
            text.trim().split("\n").slice(1).forEach(line => {
                const valori = line.split(",");
                const fr_id = (valori[0] ?? "").trim();
                const seriale = (valori[1] ?? "").trim();
                if (fr_id) csvSerialData[fr_id] = seriale;
            });

            localStorage.setItem(SERIAL_CACHE_KEY, JSON.stringify({timestamp: Date.now(), data: csvSerialData}));
        }

        // --- Integrazione lista righe ---
        function aggiungiPNAlleRighe() {
            const container = document.querySelector("#listaArticoli");
            if (!container) return;

            const observer = new MutationObserver(mutations => {
                mutations.forEach(m => {
                    m.addedNodes.forEach(node => {
                        if (node.nodeType !== 1) return;
                        const divArticolo = node.querySelector("div");
                        if (!divArticolo) return;

                        const matchCodice = divArticolo.textContent.match(/(WMS\d{7}-[A-Z]+)/);
                        const divRif = divArticolo.querySelector("div:has(button[onclick^='modificaRiferimentoCliente'])");
                        let fr_id = null;
                        if (divRif) {
                            const btn = divRif.querySelector("button[onclick^='modificaRiferimentoCliente']");
                            if (btn) {
                                const textAfterBtn = divRif.childNodes[divRif.childNodes.length - 1]?.textContent?.trim();
                                fr_id = textAfterBtn;
                            }
                        }

                        const dati = matchCodice ? csvData[matchCodice[0].trim()] : null;
                        const seriale = fr_id ? (csvSerialData[fr_id] || "") : "";

                        if (!divArticolo.querySelector(".pn-info")) {
                            const spanPN = document.createElement("span");
                            spanPN.className = "pn-info";
                            spanPN.style.marginLeft = "10px";
                            spanPN.style.fontWeight = "bold";
                            spanPN.style.color = dati?.pn ? "green" : "red";
                            spanPN.textContent = dati?.pn ? `[PN: ${dati.pn}]` : "[PN: ❓ PN non trovato]";
                            if (dati?.rif) spanPN.textContent += ` | Rif: ${dati.rif}`;
                            spanPN.textContent += ` | Seriale: ${seriale}`;
                            divArticolo.appendChild(spanPN);
                        }
                    });
                });
            });

            observer.observe(container, {childList: true, subtree: true});
        }

        // --- Hook maschera "Aggiungi" ---
        function intercettaMascheraAggiungi() {
            document.body.addEventListener("click", e => {
                const btn = e.target.closest("button[onclick^='addNewLine']");
                if (!btn) return;

                const observer = new MutationObserver(() => {
                    const dialog = document.querySelector("#dialogNewItem");
                    if (dialog) {
                        attaccaObserverDialog(dialog);
                        aggiornaPN(dialog);
                        observer.disconnect();
                    }
                });
                observer.observe(document.body, {childList: true, subtree: true});
            });
        }

        let lastDialogFrId = "";
        function attaccaObserverDialog(dialog) {
            const mo = new MutationObserver(() => {
                const frTry = extractFrIdFromDialog(dialog);
                if (frTry && frTry !== lastDialogFrId) {
                    aggiornaPN(dialog);
                    lastDialogFrId = frTry;
                }
            });
            mo.observe(dialog, {subtree: true, childList: true, characterData: true});
        }

        function aggiornaPN(dialog) {
            const spanCode = dialog.querySelector("#dialogNewItem-ItemCode");
            const spanSubCat = dialog.querySelector("#dialogNewItem-SubCatNum");
            if (!spanCode || !spanSubCat) return;

            const codice = (spanCode.textContent || "").trim();
            const fr_id = extractFrIdFromDialog(dialog);
            const dati = csvData[codice];
            const seriale = fr_id ? (csvSerialData[fr_id] || "") : "";

            let spanPN = dialog.querySelector("#dialogNewItem-PN");
            if (!spanPN) {
                spanPN = document.createElement("span");
                spanPN.id = "dialogNewItem-PN";
                spanPN.style.marginLeft = "10px";
                spanPN.style.fontWeight = "bold";
                spanSubCat.parentNode.insertBefore(spanPN, spanSubCat.nextSibling);
            }

            const pnText = dati?.pn || "❓ PN non trovato";
            spanPN.style.color = dati?.pn ? "green" : "red";
            spanPN.textContent = `[PN: ${pnText}]`;
            if (dati?.rif) spanPN.textContent += ` | Rif: ${dati.rif}`;
            spanPN.textContent += ` | Seriale: ${seriale}`;

            const serialeInput = dialog.querySelector("input[name='Seriale']");
            if (serialeInput) serialeInput.value = seriale;
        }

        // --- Avvio ---
        await caricaCSV();
        await caricaCSVSeriali();
        aggiungiPNAlleRighe();
        intercettaMascheraAggiungi();

    }

    // Esponiamo la funzione a livello globale
    window.initGRN = initGRN;

})(window);
