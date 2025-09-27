// ==UserScript==
// @name         Ricerca PN + Seriali in GRN - WebApp SAP
// @namespace    http://tampermonkey.net/
// @version      3.8
// @description  Mostra PN, Riferimento e Seriali (FR_ID->seriale CSV) con caching 9h, aggiorna righe e maschere "Aggiungi"
// @match        http://172.18.20.20:8095/GRN/*
// @grant        none
// ==/UserScript==

(async function() {
    'use strict';

    // --- PN-RIF normale ---
    const CSV_URL = "https://raw.githubusercontent.com/Daniele1995-design/WebAppSap/refs/heads/main/Anagrafica%20Definitiva%2028052025%20-%20anagrafica%20SAP.csv";
    const CACHE_KEY = "GRN_CSV_CACHE";
    const CACHE_EXPIRY_HOURS = 9;
    let csvData = {}; // { codice: {pn, rif} }

    // --- CSV SERIALI ---
    const SERIAL_CACHE_KEY = "GRN_CSV_CACHE_SERIAL";
    const SERIAL_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSVMfUrBEeHweSi9tow2eS37RugtyYabG7c2tv22TIq-u1LS1QuQrx7bStSGXd05luyiFTKibbkKxWI/pub?output=csv";
    let csvSerialData = {}; // { fr_id: seriale }

    // --- Utils ---
    function extractFrIdFromDialog(dialog) {
        const divRif = dialog.querySelector("#dialogNewItem-CodiceRif");
        if (!divRif) return "";

        // 1) prova a prendere il text node subito dopo <strong>
        const strong = divRif.querySelector("strong");
        if (strong) {
            let n = strong.nextSibling;
            while (n && n.nodeType !== Node.TEXT_NODE) n = n.nextSibling;
            if (n && typeof n.textContent === "string") {
                const raw = n.textContent;
                const onlyDigits = (raw.match(/\d+/) || [""])[0];
                if (onlyDigits) {
                    console.log("[MASCHERA] FR_ID (textNode dopo <strong>):", onlyDigits, "| innerHTML:", divRif.innerHTML);
                    return onlyDigits;
                }
            }
        }

        // 2) fallback: regex sul textContent completo
        const m = divRif.textContent.match(/Riferimento:\s*([0-9]+)/i);
        if (m) {
            console.log("[MASCHERA] FR_ID (regex su textContent):", m[1], "| textContent:", divRif.textContent);
            return m[1];
        }

        console.warn("[MASCHERA] Nessun FR_ID estraibile da #dialogNewItem-CodiceRif. innerHTML:", divRif.innerHTML);
        return "";
    }

    // --- Caricamento CSV PN/RIF ---
    async function caricaCSV() {
        const cache = localStorage.getItem(CACHE_KEY);
        if (cache) {
            const parsed = JSON.parse(cache);
            if (Date.now() - parsed.timestamp < CACHE_EXPIRY_HOURS * 3600 * 1000) {
                csvData = parsed.data;
                console.log("[PN-RIF] Cache trovata");
                return;
            }
        }

        try {
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
            console.log("[PN-RIF] CSV caricato");
        } catch(e) { console.error("[PN-RIF] ❌ Errore caricamento CSV:", e); }
    }

    // --- Caricamento CSV Seriali ---
    async function caricaCSVSeriali() {
        const cache = localStorage.getItem(SERIAL_CACHE_KEY);
        if (cache) {
            try {
                const parsed = JSON.parse(cache);
                if (Date.now() - parsed.timestamp < CACHE_EXPIRY_HOURS * 3600 * 1000) {
                    csvSerialData = parsed.data;
                    console.log("[SERIAL] Cache trovata");
                    return;
                }
            } catch(e) { console.warn("[SERIAL] Cache corrotta"); }
        }

        try {
            const resp = await fetch(SERIAL_CSV_URL);
            const text = await resp.text();
            let countSeriali = 0;

            text.trim().split("\n").slice(1).forEach(line => {
                const valori = line.split(",");
                const fr_id = (valori[0] ?? "").trim(); // <-- chiave: quella che vedi in "Riferimento:"
                const seriale = (valori[1] ?? "").trim(); // colonna B intera
                if (fr_id) {
                    csvSerialData[fr_id] = seriale;
                    if (seriale) countSeriali++;
                }
            });

            if (countSeriali === 0) {
                console.warn("[SERIAL] ⚠ Nessun seriale trovato, resetto cache");
                localStorage.removeItem(SERIAL_CACHE_KEY);
            } else {
                localStorage.setItem(SERIAL_CACHE_KEY, JSON.stringify({timestamp: Date.now(), data: csvSerialData}));
                console.log(`[SERIAL] CSV Seriali caricato (${countSeriali} seriali validi)`);
            }
        } catch(e) { console.error("[SERIAL] ❌ Errore caricamento CSV Seriali:", e); }
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

                    // match codice articolo
                    const matchCodice = divArticolo.textContent.match(/(WMS\d{7}-[A-Z]+)/);

                    // match riferimento/seriale nel div corretto
                    const divRif = divArticolo.querySelector("div:has(button[onclick^='modificaRiferimentoCliente'])");
                    let fr_id = null;
                    if (divRif) {
                        const btn = divRif.querySelector("button[onclick^='modificaRiferimentoCliente']");
                        if (btn) {
                            const textAfterBtn = divRif.childNodes[divRif.childNodes.length - 1]?.textContent?.trim();
                            fr_id = textAfterBtn;
                            console.log("[RIGA] FR_ID estratto:", fr_id);
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

                        console.log(`[RIGA] PN: ${dati?.pn} | Rif: ${dati?.rif} | Seriale: "${seriale}"`);
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
                    attaccaObserverDialog(dialog); // osserva cambi dinamici
                    aggiornaPN(dialog);            // primo tentativo
                    observer.disconnect();
                }
            });
            observer.observe(document.body, {childList: true, subtree: true});
        });
    }

    let lastDialogFrId = ""; // evita refresh inutili
    function attaccaObserverDialog(dialog) {
        const mo = new MutationObserver((mutations) => {
            // Se cambia qualcosa nel dialog, riprova ad aggiornare (ma throttling su fr_id)
            const frTry = extractFrIdFromDialog(dialog);
            if (frTry && frTry !== lastDialogFrId) {
                console.log("[MASCHERA] Cambio FR_ID rilevato nel dialog:", frTry);
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

        // --- FR_ID dalla riga "Riferimento:" del dialog ---
        const fr_id = extractFrIdFromDialog(dialog);
        if (!fr_id) {
            console.warn("[MASCHERA] FR_ID vuoto: impossibile collegare seriale in questo momento.");
        }

        const dati = csvData[codice];
        const seriale = fr_id ? (csvSerialData[fr_id] || "") : "";

        // --- UI PN/Rif/Seriale ---
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

        // --- Prova ad aggiornare anche il campo "Seriale", se esiste ---
        const serialeInput = dialog.querySelector("input[name='Seriale']");
        if (serialeInput) {
            serialeInput.value = seriale;
        } else {
            console.warn("[MASCHERA] Nessun input[name='Seriale'] trovato!");
        }

        console.log(`[MASCHERA] codice=${codice} | FR_ID=${fr_id} | seriale="${seriale}" | csvHit=${Object.prototype.hasOwnProperty.call(csvSerialData, fr_id)}`);
    }

    // --- Avvio ---
    await caricaCSV();
    await caricaCSVSeriali();
    aggiungiPNAlleRighe();
    intercettaMascheraAggiungi();

})();

