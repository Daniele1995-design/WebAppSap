// ==UserScript==
// @name         Lookup CSV per Input Shoot Trasferimento e Pick
// @namespace    http://tampermonkey.net/
// @version      0.5
// @description  Sostituisce automaticamente il codice barcode con il valore SAP dal CSV - Semplice e affidabile
// @author       Daniele
// @match        http://172.18.20.20:8095/Transfer/Whs/?v=*
// @match        http://172.18.20.20:8095/Pick/?v=*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const lookupMap = new Map();

    // Carica e parsare il CSV
    fetch('https://raw.githubusercontent.com/Daniele1995-design/WebAppSap/refs/heads/main/Anagrafica%20SAP%20NTD%20Contingency.csv')
        .then(r => {
            if (!r.ok) throw new Error('CSV non raggiungibile');
            return r.text();
        })
        .then(text => {
            const lines = text.trim().split('\n');
            lines.forEach((line, i) => {
                if (i === 0) return; // salta header
                const cols = line.split(',').map(c => c.trim());
                if (cols.length >= 2) {
                    lookupMap.set(cols[1], cols[0]); // Codice barcode → Codice SAP
                }
            });
            console.log('CSV caricato correttamente:', lookupMap.size, 'voci');
        })
        .catch(err => console.error('Errore caricamento CSV:', err));

    // Funzione di sostituzione
    function tryReplace(input) {
        const valore = input.value.trim();
        if (!valore || lookupMap.size === 0) return;

        if (lookupMap.has(valore)) {
            const nuovoValore = lookupMap.get(valore);
            input.value = nuovoValore;
            console.log('Sostituito:', valore, '→', nuovoValore);

            // Notifica all'app che il valore è cambiato
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        // Se non trovato → non facciamo niente, l'app usa il valore originale
    }

    // Osservatore per trovare l'input
    const observer = new MutationObserver(() => {
        const input = document.getElementById('shootInput');
        if (!input) return;

        console.log('shootInput trovato - script attivo (v0.5 semplice)');

        // Ogni volta che il valore cambia (barcode, incolla, manuale)
        input.addEventListener('input', () => {
            tryReplace(input);
        });

        // Extra sicurezza: anche quando si preme Enter, controlliamo un'ultima volta
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.keyCode === 13) {
                tryReplace(input);
                // NON facciamo e.preventDefault() → lasciamo che l'app proceda normalmente
            }
        });

        observer.disconnect();
    });

    observer.observe(document.body, { childList: true, subtree: true });

})();
