// ==UserScript==
// @name         Pulizia Seriali Automatica - Entrata Merci
// @namespace    http://tampermonkey.net/
// @author       Daniele Izzo
// @version      3.0
// @description  Pulisce automaticamente i seriali con toggle nel menu e popup seriale originale
// @match        http://172.18.20.20/GRN/*
// @require      https://cdn.jsdelivr.net/gh/Daniele1995-design/WebAppSap@main/papaparse.min.js
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    console.log("✅ Script Pulizia Seriali avviato");

    // ============================
    // CONFIGURAZIONE
    // ============================
    const CSV_URL = "https://raw.githubusercontent.com/Daniele1995-design/WebAppSap/refs/heads/main/Anagrafica%20completa%20solo%20Partnumber%20e%20Produttore.csv";
    let anagrafica = {}; // { PN: { produttore } }
    let puliziaSerialiAttiva = localStorage.getItem('puliziaSerialiAttiva') === 'true' || false;
    let serialeOriginale = "";

    // ============================
    // HELPER FUNCTIONS (VBA-like)
    // ============================
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

    function normalizeSN(s) {
        if (!s) return "";
        return String(s)
            .replace(/^\([^)]*\)/, '')
            .replace(/[\u200B\u00A0\s\r\n]/g, '')
            .toUpperCase()
            .trim();
    }

    // ============================
    // CARICAMENTO ANAGRAFICA CSV
    // ============================
    function loadCSVData() {
        Papa.parse(CSV_URL, {
            download: true,
            header: false,
            skipEmptyLines: true,
            complete: function(results) {
                results.data.forEach((row) => {
                    let pn = (row[0] || "").replace(/["\u200B\r\n]/g,'').trim().toUpperCase();
                    let produttore = (row[1] || "").replace(/["\u200B\r\n]/g,'').trim();
                    if(pn) anagrafica[pn] = { produttore };
                });
                console.log(`✅ Anagrafica caricata: ${Object.keys(anagrafica).length} PN`);
            },
            error: function(err) {
                console.error("❌ Errore caricamento CSV:", err);
            }
        });
    }

    // ============================
    // LOOKUP PN NELL'ANAGRAFICA
    // ============================
    function DLookupPN(pn) {
        if (!pn) return null;
        const cleanedPN = pn.replace(/["\u200B\r\n]/g,'').trim().toUpperCase();
        if (!anagrafica[cleanedPN]) {
            return null;
        } else {
            return anagrafica[cleanedPN];
        }
    }

    // ============================
    // PARSING SERIALE (LOGICA VBA)
    // ============================
    function parseSeriale(var1) {
        if (!var1) return { PNESTRATTO: "", SERESTRATTO: "" };
        var1 = String(var1).trim();
        let PNESTRATTO = "", SERESTRATTO = "", APPOGGIO = "";

        if (vbLen(var1) <= 1) {
            return { PNESTRATTO, SERESTRATTO };
        }

        // Caso (XS) pattern
        let APPOGGIOstart = vbMid(var1, 1, 4);
        if (/^\([\da-zA-Z]S\)/.test(APPOGGIOstart)) {
            const posSpace = vbInStr(var1, " ");
            if (posSpace > 0) {
                PNESTRATTO = vbMid(var1, 5, posSpace - 4);
                SERESTRATTO = vbMid(var1, 5);
            } else {
                PNESTRATTO = vbMid(var1, 5);
                SERESTRATTO = "";
            }
            return { PNESTRATTO, SERESTRATTO };
        }

        // Caso SS/S
        APPOGGIO = vbMid(var1, 1, 2);
        if (APPOGGIO === "SS" || vbLeft(var1, 1) === "S") {
            SERESTRATTO = vbMid(var1, 2, 20);
            PNESTRATTO = "Verificare Fisicamente";
            return { PNESTRATTO, SERESTRATTO };
        }

        // Caso ; separatore
        const posSemi = vbInStr(var1, ";");
        if (posSemi > 1) {
            SERESTRATTO = vbMid(var1, 1, posSemi - 1);
            PNESTRATTO = vbMid(var1, posSemi + 1, 20);
            return { PNESTRATTO, SERESTRATTO };
        }

        // Caso 21 (20 char)
        if (vbLen(var1) === 20 && vbLeft(var1, 2) === "21") {
            PNESTRATTO = vbMid(var1, 3, 8);
            SERESTRATTO = var1;
            return { PNESTRATTO, SERESTRATTO };
        }

        // Caso 02/03 (16 char)
        if (vbLen(var1) === 16 && (vbLeft(var1, 2) === "02" || vbLeft(var1, 2) === "03")) {
            PNESTRATTO = "03" + vbMid(var1, 1, 6);
            SERESTRATTO = var1;
            return { PNESTRATTO, SERESTRATTO };
        }

        // STRINGHE LUNGHE (>39 caratteri)
        if (vbLen(var1) > 39) {
            // Tentativo 0
            APPOGGIO = vbMid(var1, 7, 8).replace(/["\u200B\r\n]/g,'').trim();
            let pos = vbInStr(var1, " ");
            SERESTRATTO = pos > 14 ? vbMid(var1, pos - 14, 14) : "";
            if (DLookupPN(APPOGGIO)) {
                PNESTRATTO = APPOGGIO;
                return { PNESTRATTO, SERESTRATTO };
            }

            const pos1P = vbInStr(var1, "1P");
            if (pos1P > 0) {
                // Tentativo 1
                APPOGGIO = vbMid(var1, pos1P + 2, 8).replace(/["\u200B\r\n]/g,'').trim();
                pos = pos1P;
                SERESTRATTO = pos > 14 ? vbMid(var1, pos - 14, 14) : "";
                if (DLookupPN(APPOGGIO)) {
                    PNESTRATTO = APPOGGIO;
                    return { PNESTRATTO, SERESTRATTO };
                }

                // Tentativo 2 (Huawei)
                APPOGGIO = vbMid(var1, pos1P + 2, 12).replace(/["\u200B\r\n]/g,'').trim();
                const rec = DLookupPN(APPOGGIO);
                if (rec && String(rec.produttore).toUpperCase() === "HUAWEI") {
                    SERESTRATTO = vbLen(var1) >= 12 ? vbRight(var1, 12) : "";
                    PNESTRATTO = APPOGGIO;
                    return { PNESTRATTO, SERESTRATTO };
                }

                // Tentativo 3
                if (vbLen(var1) > 41) {
                    const second1P = vbInStr(var1, "1P", pos1P + 2);
                    if (second1P > 0) {
                        APPOGGIO = vbMid(var1, second1P + 2, 12).replace(/["\u200B\r\n]/g,'').trim();
                        let codiceTarget = APPOGGIO;
                        pos = vbInStr(var1, codiceTarget);
                        SERESTRATTO = pos > 18 ? vbMid(var1, pos - 2 - 18, 18) : "";
                        if (DLookupPN(APPOGGIO)) {
                            PNESTRATTO = APPOGGIO;
                            return { PNESTRATTO, SERESTRATTO };
                        }
                    }
                }

                // Tentativo 4
                APPOGGIO = vbMid(var1, pos1P + 2, 10).replace(/["\u200B\r\n]/g,'').trim();
                pos = vbInStr(var1, APPOGGIO);
                SERESTRATTO = pos > 19 ? vbMid(var1, pos - 2 - 18, 19) : "";
                if (DLookupPN(APPOGGIO)) {
                    PNESTRATTO = APPOGGIO;
                    return { PNESTRATTO, SERESTRATTO };
                }

                // Tentativo 5
                const posS = vbInStr(var1, "S");
                if (posS > 0 && posS > pos1P + 2) {
                    APPOGGIO = vbMid(var1, pos1P + 2, posS - (pos1P + 2));
                    SERESTRATTO = vbLen(var1) >= posS + 10 ? vbMid(var1, posS + 1, 11) : "";
                } else {
                    APPOGGIO = "";
                }
                if (DLookupPN(APPOGGIO)) {
                    PNESTRATTO = APPOGGIO;
                    return { PNESTRATTO, SERESTRATTO };
                }

                PNESTRATTO = "Verificare Fisicamente";
                SERESTRATTO = var1;
                return { PNESTRATTO, SERESTRATTO };
            } else {
                PNESTRATTO = "Verificare Fisicamente";
                SERESTRATTO = var1;
                return { PNESTRATTO, SERESTRATTO };
            }
        }

        PNESTRATTO = "Verificare Fisicamente";
        SERESTRATTO = var1;
        return { PNESTRATTO, SERESTRATTO };
    }

    // ============================
    // POPUP NOTIFICHE TEMPORANEE (Solo per toggle on/off)
    // ============================
    function showPopup(msgText, color = '#ffcc00') {
        let existing = document.querySelector('#cleanSerialPopup');
        if (existing) {
            existing.textContent = msgText;
            existing.style.background = color;
            existing.style.opacity = 1;
            setTimeout(() => existing.style.opacity = 0, 2500);
            return;
        }

        const msg = document.createElement('div');
        msg.id = 'cleanSerialPopup';
        msg.textContent = msgText;
        msg.style.position = 'fixed';
        msg.style.top = '20px';
        msg.style.right = '20px';
        msg.style.background = color;
        msg.style.color = '#fff';
        msg.style.padding = '8px 12px';
        msg.style.borderRadius = '5px';
        msg.style.boxShadow = '0 0 10px rgba(0,0,0,0.3)';
        msg.style.zIndex = '99999';
        msg.style.opacity = '0';
        msg.style.transition = 'opacity 0.5s';
        msg.style.fontWeight = 'bold';
        msg.style.fontSize = '13px';
        msg.style.pointerEvents = 'none';
        document.body.appendChild(msg);

        requestAnimationFrame(() => msg.style.opacity = 1);
        setTimeout(() => msg.style.opacity = 0, 2500);
    }

    // ============================
    // PULSANTE COMPATTO PER MOSTRARE POPUP
    // ============================
    function showCompactButton(seriale, pulito = "") {
        if (!seriale) {
            const existing = document.querySelector('#compactSerialButton');
            if (existing) existing.remove();
            return;
        }

        let button = document.querySelector('#compactSerialButton');

        if (!button) {
            button = document.createElement('button');
            button.id = 'compactSerialButton';
            button.innerHTML = '🧹';
            button.title = 'Mostra dettagli pulizia seriale';
            button.style.position = 'fixed';
            button.style.top = '10px';
            button.style.left = '280px';
            button.style.zIndex = '10001';
            button.style.width = '40px';
            button.style.height = '40px';
            button.style.background = '#007bff';
            button.style.color = 'white';
            button.style.border = '2px solid #0056b3';
            button.style.borderRadius = '50%';
            button.style.fontSize = '18px';
            button.style.cursor = 'pointer';
            button.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
            button.style.transition = 'all 0.2s';
            button.style.display = 'flex';
            button.style.alignItems = 'center';
            button.style.justifyContent = 'center';

            button.onmouseover = function() {
                this.style.background = '#0056b3';
                this.style.transform = 'scale(1.1)';
            };
            button.onmouseout = function() {
                this.style.background = '#007bff';
                this.style.transform = 'scale(1)';
            };

            document.body.appendChild(button);
        }

        // Salva i dati nel pulsante
        button.dataset.seriale = seriale;
        button.dataset.pulito = pulito || seriale;

        // Click per mostrare/nascondere il popup
        button.onclick = function() {
            const popup = document.querySelector('#serialeOriginalePopup');
            if (popup) {
                // Se il popup esiste, lo chiudiamo
                popup.remove();
            } else {
                // Altrimenti lo mostriamo
                showSerialeOriginalePopup(this.dataset.seriale, this.dataset.pulito);
            }
        };
    }

    // ============================
    // POPUP PERSISTENTE SERIALE ORIGINALE
    // ============================
    function showSerialeOriginalePopup(seriale, pulito = "") {
        if (!seriale) {
            const existing = document.querySelector('#serialeOriginalePopup');
            if (existing) existing.remove();
            return;
        }

        let popup = document.querySelector('#serialeOriginalePopup');

        if (!popup) {
            popup = document.createElement('div');
            popup.id = 'serialeOriginalePopup';
            popup.style.position = 'fixed';
            popup.style.zIndex = '10000';
            popup.style.minHeight = '35px';
            popup.style.padding = '8px 12px';
            popup.style.background = 'white';
            popup.style.color = '#333';
            popup.style.border = '2px solid #ddd';
            popup.style.borderRadius = '3px';
            popup.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';
            popup.style.fontSize = '14px';
            popup.style.fontWeight = 'normal';
            popup.style.pointerEvents = 'auto';
            popup.style.whiteSpace = 'normal';
            popup.style.minWidth = '250px';
            popup.style.display = 'flex';
            popup.style.alignItems = 'center';
            popup.style.gap = '15px';

            document.body.appendChild(popup);
        }

        // Posiziona accanto al pulsante compatto
        popup.style.top = '55px';
        popup.style.left = '10px'; // 40px (width button) + 10px (left) + 10px (gap)
        popup.style.right = 'auto';

        popup.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 4px; flex: 1;">
                <div style="display: flex; flex-direction: column; gap: 2px;">
                    <span style="font-weight: 600; font-size: 13px;">Seriale Originale:</span>
                    <span style="font-size: 13px; word-break: break-all; min-width: 420px;">${seriale}</span>
                </div>
                <div style="display: flex; flex-direction: column; gap: 2px;">
                    <span style="font-weight: 600; font-size: 13px;">Pulizia:</span>
                    <span style="color: #007bff; font-weight: bold; font-size: 14px; word-break: break-all; min-width: 420px;">${pulito || seriale}</span>
                </div>
            </div>
            <button id="closeSerialPopup" style="
                background: #f0f0f0;
                border: 1px solid #ddd;
                color: #333;
                font-size: 16px;
                cursor: pointer;
                padding: 2px 6px;
                line-height: 1;
                border-radius: 2px;
                align-self: flex-start;
                transition: background 0.2s;
            " onmouseover="this.style.background='#e0e0e0'" onmouseout="this.style.background='#f0f0f0'">✖</button>
        `;

        const closeBtn = popup.querySelector('#closeSerialPopup');
        closeBtn.addEventListener('click', () => {
            popup.remove();
        });
    }

    // ============================
    // AGGIORNA TOGGLE NEL MENU (nuovo sistema)
    // ============================
    function updateToggleButton() {
        const toggleDiv = document.querySelector('#filtroPuliziaSeriali');
        const toggleText = document.querySelector('#filtroPuliziaSerialiText');

        if (!toggleDiv || !toggleText) {
            console.warn("⚠️ Elementi toggle non trovati");
            return;
        }

        // Aggiorna il testo
        toggleText.textContent = puliziaSerialiAttiva ? 'ATTIVO' : 'DISATTIVO';

        // Aggiorna lo stile del pulsante
        const button = toggleDiv.querySelector('a');
        if (button) {
            button.style.background = puliziaSerialiAttiva ? '#28a745' : '#dc3545';
            button.style.color = '#fff';
        }

        console.log("✅ Toggle aggiornato:", puliziaSerialiAttiva ? "ATTIVO" : "DISATTIVO");
    }

    // ============================
    // FUNZIONE GLOBALE PER IL TOGGLE (chiamata da onclick)
    // ============================
    window.toggleSerialCleaning = function() {
        puliziaSerialiAttiva = !puliziaSerialiAttiva;
        localStorage.setItem('puliziaSerialiAttiva', puliziaSerialiAttiva);

        updateToggleButton();

        const msg = puliziaSerialiAttiva ? "🟢 Pulizia seriali ATTIVATA" : "🔴 Pulizia seriali DISATTIVATA";
        showPopup(msg, puliziaSerialiAttiva ? '#28a745' : '#dc3545');
        console.log("🔄 Stato pulizia:", puliziaSerialiAttiva);
    };

    // ============================
    // INTERCETTA INPUT PRIMA DELLA WEBAPP
    // ============================
    function interceptInput() {
        const shootInput = document.querySelector('#shootInput');
        if (!shootInput) {
            setTimeout(interceptInput, 200);
            return;
        }

        console.log("✅ Campo #shootInput trovato - intercettazione attiva");

        // Intercetta PRIMA del submit del form
        shootInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && puliziaSerialiAttiva) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                const rawValue = shootInput.value.trim();
                if (!rawValue) return;

                serialeOriginale = rawValue;
                const { PNESTRATTO, SERESTRATTO } = parseSeriale(rawValue);
                const cleanValue = SERESTRATTO || rawValue;

                if (cleanValue !== rawValue) {
                    console.log(`🧹 INTERCETTATO: "${rawValue}" → "${cleanValue}" | PN: "${PNESTRATTO}"`);
                    shootInput.value = cleanValue;
                    showCompactButton(rawValue, cleanValue);
                }

                // Ora invia il form con il valore pulito
                setTimeout(() => {
                    const form = shootInput.closest('form');
                    if (form) {
                        const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
                        form.dispatchEvent(submitEvent);
                    }
                }, 50);
            }
        }, true); // useCapture = true per intercettare PRIMA

        // Reset pulsante quando campo vuoto
        shootInput.addEventListener('input', function() {
            if (!shootInput.value.trim()) {
                serialeOriginale = "";
                showCompactButton("");
                showSerialeOriginalePopup("");
            }
        });
    }

    // ============================
    // MONITOR DIALOG INPUT (dialogNewItem-Seriale)
    // ============================
    function monitorDialogInput() {
        const observer = new MutationObserver(() => {
            const dialogInput = document.querySelector('#dialogNewItem-Seriale');
            if (dialogInput && !dialogInput.dataset.cleanerAttached) {
                console.log("✅ Dialog input #dialogNewItem-Seriale trovato");
                dialogInput.dataset.cleanerAttached = 'true';

                dialogInput.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' && puliziaSerialiAttiva) {
                        const rawValue = dialogInput.value.trim();
                        if (!rawValue) return;

                        serialeOriginale = rawValue;
                        const { PNESTRATTO, SERESTRATTO } = parseSeriale(rawValue);
                        const cleanValue = SERESTRATTO || rawValue;

                        if (cleanValue !== rawValue) {
                            dialogInput.value = cleanValue;
                            showCompactButton(rawValue, cleanValue);
                            console.log(`🧹 Dialog pulito: "${rawValue}" → "${cleanValue}"`);
                        }
                    }
                }, true);

                setTimeout(() => dialogInput.focus(), 100);
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    // ============================
    // INIZIALIZZAZIONE
    // ============================
    function init() {
        console.log("🚀 Inizializzazione script...");
        loadCSVData();

        // Aggiorna il toggle button all'avvio
        setTimeout(updateToggleButton, 1000);

        // Retry logic per assicurarsi che tutto si carichi
        let attempts = 0;
        const maxAttempts = 10;

        function tryInit() {
            attempts++;
            console.log(`🔄 Tentativo ${attempts}/${maxAttempts}`);

            updateToggleButton();
            interceptInput();
            monitorDialogInput();

            // Verifica se almeno uno è riuscito
            const toggleExists = document.querySelector('#filtroPuliziaSeriali');
            const inputExists = document.querySelector('#shootInput');

            if (!toggleExists && !inputExists && attempts < maxAttempts) {
                console.warn(`⚠️ Elementi non trovati, retry in 500ms...`);
                setTimeout(tryInit, 500);
            } else {
                console.log("✅ Script inizializzato - Stato:", puliziaSerialiAttiva ? "ATTIVO" : "DISATTIVO");
            }
        }

        // Primo tentativo dopo un breve delay
        setTimeout(tryInit, 800);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Backup: se dopo 5 secondi non è ancora inizializzato, forza un nuovo tentativo
    setTimeout(() => {
        if (!document.querySelector('#filtroPuliziaSeriali')) {
            console.warn("⚠️ Forcing re-initialization...");
            init();
        }
    }, 5000);

})();