// ==UserScript==
// @name         Seleziona/Deseleziona Tutti GRN - WebApp SAP
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  Pulsanti accanto a "Ricerca Ordini" con lo stesso layout dei bottoni originali (compatibile su tutti i PC)
// @author       Tu
// @match        http://172.18.20.20:8095/GRN/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function aggiungiPulsanti() {
        const ricercaOrdiniBtn = Array.from(document.querySelectorAll("button"))
            .find(btn => btn.textContent.trim().includes("Ricerca"));

        if (!ricercaOrdiniBtn) return; // se non c’è ancora, esci
        if (document.querySelector("#btnSelezionaTutti")) return; // già aggiunti

        function creaBottone(id, testo, colore, onClick) {
            let btn = document.createElement("button");
            btn.id = id;
            btn.innerText = testo;
            btn.className = "button button-fill";  // stesso stile dei bottoni esistenti
            btn.style.width = "fit-content";
            btn.style.marginLeft = "5px";
            btn.style.fontSize = "12px";
            btn.style.fontWeight = "bold";
            btn.style.backgroundColor = colore;
            btn.addEventListener("click", onClick);
            return btn;
        }

        const btnSeleziona = creaBottone("btnSelezionaTutti", "✔ SELEZIONA", "#28a745", () => {
            document.querySelectorAll("input[type=checkbox][id=odaSelected]").forEach(cb => {
                if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new Event("change")); }
            });
        });

        const btnDeseleziona = creaBottone("btnDeselezionaTutti", "✖ DESELEZIONA", "#dc3545", () => {
            document.querySelectorAll("input[type=checkbox][id=odaSelected]").forEach(cb => {
                if (cb.checked) { cb.checked = false; cb.dispatchEvent(new Event("change")); }
            });
        });

        // Inserisco i pulsanti subito dopo Ricerca Ordini
        ricercaOrdiniBtn.parentNode.insertBefore(btnSeleziona, ricercaOrdiniBtn.nextSibling);
        ricercaOrdiniBtn.parentNode.insertBefore(btnDeseleziona, btnSeleziona.nextSibling);

        console.log("✅ Pulsanti aggiunti accanto a Ricerca Ordini con layout corretto");
    }

    // prova ogni 500ms finché non trova il bottone
    const interval = setInterval(() => {
        if (document.querySelector("button")) {
            aggiungiPulsanti();
        }
    }, 500);

    // stop dopo 20s per sicurezza
    setTimeout(() => clearInterval(interval), 20000);
})();
