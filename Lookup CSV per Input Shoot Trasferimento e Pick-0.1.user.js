// ==UserScript==
// @name         Lookup CSV per Input Shoot Trasferimento e Pick
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Cerca valore input in CSV e sostituisce se trovato
// @author       Daniele
// @match        http://172.18.20.20:8095/Transfer/Whs/?v=*
// @match        http://172.18.20.20:8095/Pick/?v=*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let lookupMap = new Map();

    // Funzione per parsare CSV semplice (due colonne, skip header)
    function parseCSV(text) {
        const lines = text.trim().split('\n');
        lines.forEach((line, index) => {
            if (index === 0) return; // Skip header
            const cols = line.split(',').map(col => col.trim());
            if (cols.length >= 2) {
                lookupMap.set(cols[1], cols[0]); // Colonna B → Colonna A
            }
        });
        console.log('CSV caricato:', lookupMap.size, 'record');
    }

    // Fetch CSV
    fetch('https://raw.githubusercontent.com/Daniele1995-design/WebAppSap/refs/heads/main/Anagrafica%20SAP%20NTD%20Contingency.csv')
        .then(response => {
            if (!response.ok) throw new Error('Errore fetch CSV');
            return response.text();
        })
        .then(parseCSV)
        .catch(error => console.error('Errore caricamento CSV:', error));

    // Processa il valore dell'input
    function processValue(input) {
        const val = input.value.trim();
        if (!val) return;

        // Se il CSV non è ancora pronto, ritenta fra un po'
        if (lookupMap.size === 0) {
            setTimeout(() => processValue(input), 100);
            return;
        }

        if (lookupMap.has(val)) {
            const newValue = lookupMap.get(val);
            input.value = newValue;
            // Notifica all'app il cambio valore
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            console.log('Sostituito:', val, '→', newValue);
        } else {
            console.log('Nessuna sostituzione per:', val);
        }
    }

    // Osserva il DOM finché non trova l'input
    const observer = new MutationObserver(() => {
        const input = document.getElementById('shootInput');
        if (!input) return;

        console.log('Input shootInput trovato - script attivo');

        // Processa immediatamente qualsiasi cambiamento (barcode arriva tutto in una volta)
        input.addEventListener('input', (e) => {
            processValue(e.target);
        });

        // Intercetta il tasto Enter inviato dal terminalino
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.keyCode === 13) {
                e.preventDefault(); // Blocca l'invio immediato
                processValue(input);

                // Dopo un piccolo delay, riesegui l'Enter per far procedere l'app
                setTimeout(() => {
                    const enterEvent = new KeyboardEvent('keydown', {
                        key: 'Enter',
                        code: 'Enter',
                        keyCode: 13,
                        which: 13,
                        bubbles: true,
                        cancelable: true
                    });
                    input.dispatchEvent(enterEvent);
                    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
                }, 50);
            }
        });

        // Fallback: intercetta il submit del form (se presente)
        const form = input.closest('form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                processValue(input);
                setTimeout(() => {
                    form.submit();
                }, 50);
            });
        }

        // agganciato l'input, non serve più osservare
        observer.disconnect();
    });

    // Avvia l'osservazione
    observer.observe(document.body, { childList: true, subtree: true });

})();
