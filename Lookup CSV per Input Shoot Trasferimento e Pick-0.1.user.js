// ==UserScript==
// @name         Lookup CSV per Input Shoot Trasferimento e Pick
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Cerca valore input in CSV e sostituisce se trovato
// @author       Daniele
// @match        http://172.18.20.20:8095/Transfer/Whs/?v=*
// @match        http://172.18.20.20:8095/Pick/?v=*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let lookupMap = new Map();
    let timeoutId;

    // Funzione per parsare CSV semplice (due colonne, skip header)
    function parseCSV(text) {
        const lines = text.trim().split('\n');
        lines.forEach((line, index) => {
            if (index === 0) return; // Skip header
            const cols = line.split(',').map(col => col.trim());
            if (cols.length >= 2) {
                lookupMap.set(cols[1], cols[0]); // B -> A
            }
        });
    }

    // Fetch CSV
    fetch('https://raw.githubusercontent.com/Daniele1995-design/WebAppSap/refs/heads/main/Anagrafica%20SAP%20NTD%20Contingency.csv')
        .then(response => {
            if (!response.ok) throw new Error('Errore fetch CSV');
            return response.text();
        })
        .then(parseCSV)
        .catch(error => console.error('Errore caricamento CSV:', error));

    // Osserva DOM per input
    const observer = new MutationObserver(() => {
        const input = document.getElementById('shootInput');
        if (input) {
            input.addEventListener('input', handleInput);
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Gestore input con debounce
    function handleInput(e) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            processValue(e.target);
        }, 200); // 200ms debounce per barcode
    }

    // Processa valore
    function processValue(input) {
        const val = input.value.trim();
        if (!val || lookupMap.size === 0) return;

        if (lookupMap.has(val)) {
            input.value = lookupMap.get(val);
            // Dispatch eventi per notificare l'app
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        // Altrimenti lascia com'è e l'app procede normalmente
    }
})();