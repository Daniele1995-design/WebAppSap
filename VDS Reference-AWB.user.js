// ==UserScript==
// @name         VDS Reference/AWB
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Gestione AWB/DDT/NumPO/PosizionePO/TipoMerce con popup
// @author       Daniele Izzo
// @match        http://172.18.20.20/GRN/VDS/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    function init() {
        const rifInput = document.getElementById("Rif");
        if (!rifInput) return;

        rifInput.readOnly = true;
        rifInput.style.cursor = "pointer";
        rifInput.style.backgroundColor = "#f5f7fa";

        rifInput.addEventListener("click", function () {
            openModal(rifInput.value);
        });
    }

    function openModal(existingValue = "") {

        const old = document.getElementById("rifModalOverlay");
        if (old) old.remove();

        let awb = "", ddt = "", numpo = "", posizionePO = "", tipoMerce = "Nuovo";

        if (existingValue.includes("/")) {
            const parts = existingValue.split("/");
            awb         = parts[0] || "";
            ddt         = parts[1] || "";
            numpo       = parts[2] || "";
            posizionePO = parts[3] || "";
            tipoMerce   = parts[4] || "Nuovo";
        }

        const overlay = document.createElement("div");
        overlay.id = "rifModalOverlay";
        overlay.innerHTML = `
            <div style="
                position: fixed;
                inset: 0;
                background: rgba(0,0,0,0.45);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 99999;
                font-family: Arial, sans-serif;
            ">
                <div style="
                    background: #ffffff;
                    width: 420px;
                    border-radius: 8px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                    padding: 25px;
                    animation: fadeIn 0.2s ease-in-out;
                ">
                    <h3 style="
                        margin-top:0;
                        margin-bottom:20px;
                        color:#2f4050;
                        font-weight:600;
                    ">Gestione Reference / AWB</h3>

                    ${createInput("AWB",          "awbField",         awb)}
                    ${createInput("DDT",          "ddtField",         ddt)}
                    ${createInput("NumPO",        "numpoField",       numpo)}
                    ${createInput("Posizione PO", "posizionePOField", posizionePO)}
                    ${createSelect("Tipo Merce",  "tipoMerceField",   tipoMerce)}

                    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
                        <button id="rifCancel" style="${btnSecondary()}">Annulla</button>
                        <button id="rifSave"   style="${btnPrimary()}">Salva</button>
                    </div>
                </div>
            </div>

            <style>
                @keyframes fadeIn {
                    from { opacity:0; transform:scale(0.95); }
                    to   { opacity:1; transform:scale(1); }
                }
            </style>
        `;

        document.body.appendChild(overlay);

        // Listener slash→trattino sui campi testo
        ["awbField", "ddtField", "numpoField", "posizionePOField"].forEach(function(id) {
            document.getElementById(id).addEventListener("input", function () {
                const pos = this.selectionStart;
                const hadSlash = this.value.includes("/");
                this.value = this.value.replace(/\//g, "-");
                if (hadSlash) this.setSelectionRange(pos, pos);
            });
        });

        // Pulizia errore Posizione PO quando si digita
        document.getElementById("posizionePOField").addEventListener("input", function () {
            this.style.borderColor = "#d1d5db";
            this.style.backgroundColor = "#fff";
            const errMsg = document.getElementById("posizionePOError");
            if (errMsg) errMsg.remove();
        });

        document.getElementById("awbField").focus();

        document.getElementById("rifCancel").onclick = closeModal;
        overlay.addEventListener("click", function(e){
            if (e.target.id === "rifModalOverlay") closeModal();
        });

        document.getElementById("rifSave").onclick = function () {
            const awbVal         = document.getElementById("awbField").value.trim();
            const ddtVal         = document.getElementById("ddtField").value.trim();
            const numpoVal       = document.getElementById("numpoField").value.trim();
            const posizionePOVal = document.getElementById("posizionePOField").value.trim();
            const tipoMerceVal   = document.getElementById("tipoMerceField").value;

            // Validazione: Posizione PO obbligatoria se Tipo Merce = Nuovo
            if (tipoMerceVal === "Nuovo" && posizionePOVal === "") {
                const field = document.getElementById("posizionePOField");
                field.style.borderColor = "#e74c3c";
                field.style.backgroundColor = "#fff5f5";
                field.focus();

                let errMsg = document.getElementById("posizionePOError");
                if (!errMsg) {
                    errMsg = document.createElement("div");
                    errMsg.id = "posizionePOError";
                    errMsg.style.cssText = "color:#e74c3c; font-size:12px; margin-top:4px;";
                    errMsg.textContent = "⚠ Posizione PO è obbligatoria per Tipo Merce 'Nuovo'";
                    field.parentNode.appendChild(errMsg);
                }
                return;
            }

            const result = `${awbVal}/${ddtVal}/${numpoVal}/${posizionePOVal}/${tipoMerceVal}`;

            const rifInput = document.getElementById("Rif");
            rifInput.value = result;

            if (typeof vds !== "undefined" && typeof vds.updateRif === "function") {
                vds.updateRif();
            }

            closeModal();
        };

        document.addEventListener("keydown", escClose);
    }

    function createInput(label, id, value) {
        return `
            <div style="margin-bottom:15px;">
                <label style="
                    display:block;
                    font-size:13px;
                    font-weight:600;
                    margin-bottom:5px;
                    color:#555;
                ">${label}</label>
                <input type="text" id="${id}" value="${value}" style="
                    width:100%;
                    padding:8px 10px;
                    border:1px solid #d1d5db;
                    border-radius:4px;
                    font-size:14px;
                    box-sizing:border-box;
                    transition: all 0.2s;
                "
                onfocus="this.style.borderColor='#1ab394'"
                onblur="this.style.borderColor='#d1d5db'">
            </div>
        `;
    }

    function createSelect(label, id, selectedValue) {
        const options = ["Nuovo", "Censito", "Riutilizzo"];
        const optionsHtml = options.map(opt => `
            <option value="${opt}" ${opt === selectedValue ? "selected" : ""}>${opt}</option>
        `).join("");

        return `
            <div style="margin-bottom:15px;">
                <label style="
                    display:block;
                    font-size:13px;
                    font-weight:600;
                    margin-bottom:5px;
                    color:#555;
                ">${label}</label>
                <select id="${id}" style="
                    width:100%;
                    padding:8px 10px;
                    border:1px solid #d1d5db;
                    border-radius:4px;
                    font-size:14px;
                    box-sizing:border-box;
                    background:#fff;
                    cursor:pointer;
                    transition: all 0.2s;
                "
                onfocus="this.style.borderColor='#1ab394'"
                onblur="this.style.borderColor='#d1d5db'">
                    ${optionsHtml}
                </select>
            </div>
        `;
    }

    function btnPrimary() {
        return `
            background:#1ab394;
            color:white;
            border:none;
            padding:8px 16px;
            border-radius:4px;
            cursor:pointer;
            font-weight:600;
        `;
    }

    function btnSecondary() {
        return `
            background:#e5e7eb;
            color:#333;
            border:none;
            padding:8px 16px;
            border-radius:4px;
            cursor:pointer;
        `;
    }

    function closeModal() {
        const modal = document.getElementById("rifModalOverlay");
        if (modal) modal.remove();
        document.removeEventListener("keydown", escClose);
    }

    function escClose(e) {
        if (e.key === "Escape") closeModal();
    }

    const observer = new MutationObserver(() => {
        const rifInput = document.getElementById("Rif");
        if (rifInput) {
            init();
            observer.disconnect();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

})();
