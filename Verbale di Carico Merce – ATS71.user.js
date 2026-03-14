// ==UserScript==
// @name         Verbale di Carico Merce – ATS71
// @namespace    http://tampermonkey.net/
// @version      5.1
// @description  Verbale di Carico – UI identica HTML originale, tutti i fix , per il magazzino 71
// @author       Daniele Izzo
// @match        http://172.18.20.20/
// @match        http://172.18.20.20:8095/
// @grant        GM_xmlhttpRequest
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @require      https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
// ==/UserScript==

(function () {
'use strict';

/* ================================================================
   CONFIG
================================================================ */
const EMAIL_TO = 'OperativoBollettazione71@atsgruppo.eu';
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzG0jy-B_QbIYDTYqLzD0Jnr2Bvn9_uccdjdErK_y7oYU7vbseEF5AO5u0AjmdzFCcR/exec';
const DEST_API_URL = 'https://script.google.com/macros/s/AKfycbzP-L7wJgg6njb6FKUGGYaceMHYm0vQ0nQAIte5W7hWiSorKykQYHjYfO140bC0TyhH/exec';

const DEST_GID = {
    'VODAFONE-NTD': 422824578,
    'VODAFONE-FLM': 655395330,
    'INWIT':        1836812344,
    'ZAS':          0,
    'GREENCHEM':    783261315,
    'JOIGUM':       114825062,
    'AG-LOGISTICA': 414795981
};

const BUSINESS_PARTNERS = [
    'C000021 – FASTWEB SPA',
    'C000383 – ZAS TRADING SRL',
    'C000384 – AG LOGISTICA SRL',
    'C000223 – GREENCHEM SOLUTIONS SRL',
    'C000198 – JOYGUM SRL',
    'C000207 – INFRASTRUTTURE WIRELESS ITALIANE SPA',

];

/* ================================================================
   STATE
================================================================ */
let righeCarico = [];
let odps = [];
let destinazioni = {};
let builtOnce = false;

/* ================================================================
   CREAZIONE DOCNUM UNIVOCO
================================================================ */

    function generateDocNum() {
    const now = new Date();
    const pad = (n, l) => String(n).padStart(l, '0');
    return (
        now.getFullYear().toString() +
        pad(now.getMonth() + 1, 2) +
        pad(now.getDate(), 2) +
        pad(now.getHours(), 2) +
        pad(now.getMinutes(), 2) +
        pad(now.getSeconds(), 2) +
        pad(now.getMilliseconds(), 3)
    );
}
    function fmtIt(num, decimali = 3) {
    return Number(num).toFixed(decimali).replace('.', ',');
}

/* ================================================================
   CSS — scoped a #vdc-ov, copiato esattamente dall'HTML originale
================================================================ */
function injectCSS() {
    if (document.getElementById('vdc-style')) return;
    const s = document.createElement('style');
    s.id = 'vdc-style';
    s.textContent = `

/* ---- OVERLAY ---- */
#vdc-ov {
    display: none;
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    z-index: 2147483647;
    background: #f2f2f7;
    flex-direction: column;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 16px;
    color: #1c1c1e;
    -webkit-tap-highlight-color: transparent;
    box-sizing: border-box;
}
#vdc-ov.vdc-show { display: flex; }
/* box-sizing solo su elementi diretti, NON con font-size ereditato */
#vdc-ov div, #vdc-ov span, #vdc-ov button, #vdc-ov input,
#vdc-ov select, #vdc-ov textarea, #vdc-ov a, #vdc-ov img {
    box-sizing: border-box;
    -webkit-tap-highlight-color: transparent;
}

/* ---- TOP BAR ---- */
#vdc-ov .topbar {
    background: linear-gradient(135deg, #1e3a5f 0%, #2d5986 100%);
    padding: 12px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    z-index: 200;
    box-shadow: 0 2px 12px rgba(0,0,0,0.25);
    min-height: 60px;
    flex-shrink: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    position: relative;
}
#vdc-ov .topbar-logo { height: 36px; width: auto; object-fit: contain; flex-shrink: 0; }
#vdc-ov .topbar-title {
    font-size: 22px; font-weight: 700;
    position: absolute;          /* ← centrato assoluto */
    left: 50%; transform: translateX(-50%);
    letter-spacing: 0.3px; color: white; margin: 0; padding: 0;
    font-family: inherit;
    white-space: nowrap;
    pointer-events: none;
}
#vdc-ov .btn-back {
    background: rgba(255,255,255,0.15);
    border: none;
    color: white;
    font-size: 20px;
    font-weight: 600;
    cursor: pointer;
    width: 100px;          /* ← larghezza 60px */
    height: 50px;         /* ← altezza 30px */
    border-radius: 8px;
    white-space: nowrap;
    flex-shrink: 0;
    font-family: inherit;
    margin: auto 0 0 0;   /* ← spinto tutto a destra */
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
}
#vdc-ov .btn-back:hover { background: rgba(255,255,255,0.25); }

/* ---- TABS ---- */
#vdc-ov .tabs {
    display: flex;
    background: white;
    border-bottom: 1px solid #d1d1d6;
    z-index: 150;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    flex-shrink: 0;
}
#vdc-ov .tab-btn {
    flex: 1;
    padding: 13px 6px;
    border: none;
    background: none;
    font-size: 16px;
    font-weight: 600;
    color: #8e8e93;
    cursor: pointer;
    border-bottom: 3px solid transparent;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    margin: 0;
}
#vdc-ov .tab-btn.active { color: #007aff; border-bottom-color: #007aff; }
#vdc-ov .badge {
    background: #ff3b30;
    color: white;
    border-radius: 10px;
    padding: 1px 6px;
    font-size: 11px;
    font-weight: 700;
    min-width: 18px;
    text-align: center;
    font-family: inherit;
}
#vdc-ov .badge.hidden { display: none; }

/* ---- SCROLL AREA ---- */
#vdc-ov .scroll-area {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 14px 14px 90px;
}

/* ---- TAB PANELS ---- */
#vdc-ov .tab-content { display: none; }
#vdc-ov .tab-content.active { display: block; }

/* ---- CARD ---- */
#vdc-ov .card {
    background: white;
    border-radius: 14px;
    overflow: hidden;
    margin-bottom: 14px;
    box-shadow: 0 1px 6px rgba(0,0,0,0.08);
}

/* ---- SECTION LABEL ---- */
#vdc-ov .section-label {
    font-size: 13px;
    font-weight: 700;
    color: #8e8e93;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 12px 4px 6px;
    display: block;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    margin: 0;
}

/* ---- FIELD ROW ---- */
#vdc-ov .field-row {
    padding: 13px 16px;
    border-bottom: 0.5px solid #e5e5ea;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 52px;
    margin: 0;
}
#vdc-ov .field-row:last-child { border-bottom: none; }
#vdc-ov .field-label {
    font-size: 15px;
    font-weight: 500;
    color: #1c1c1e;
    min-width: 140px;
    flex-shrink: 0;
    font-family: inherit;
    margin: 0; padding: 0;
}
#vdc-ov .field-value { flex: 1; display: flex; justify-content: flex-end; }
#vdc-ov .field-input {
    border: none;
    outline: none;
    font-size: 15px;
    color: #3c3c43;
    background: transparent;
    text-align: right;
    width: 100%;
    font-family: inherit;
    padding: 0; margin: 0;
}
#vdc-ov textarea.field-input {
    text-align: left;
    resize: none;
    padding-top: 4px;
    line-height: 1.4;
}
#vdc-ov .field-select {
    border: none;
    outline: none;
    font-size: 15px;
    color: #3c3c43;
    background: transparent;
    text-align: right;
    width: 100%;
    cursor: pointer;
    -webkit-appearance: none;
    font-family: inherit;
    padding: 0; margin: 0;
}

/* ---- DESTINO DROPDOWN — fixed per non essere clippato ---- */
#vdc-destino-dd {
    display: none;
    position: fixed;
    background: white;
    border: 1px solid #d1d1d6;
    border-radius: 12px;
    box-shadow: 0 8px 30px rgba(0,0,0,0.18);
    z-index: 2147483647;
    max-height: 300px;
    overflow-y: auto;
    min-width: 220px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
#vdc-destino-dd .dest-item {
    padding: 12px 14px;
    cursor: pointer;
    border-bottom: 0.5px solid #f2f2f7;
    font-size: 14px;
    color: #1c1c1e;
    margin: 0;
}
#vdc-destino-dd .dest-item:last-child { border-bottom: none; }
#vdc-destino-dd .dest-item:hover { background: #f2f2f7; }
#vdc-destino-dd .dest-hint {
    padding: 12px 14px;
    font-size: 13px;
    color: #8e8e93;
    font-style: italic;
    margin: 0;
}

/* ---- SUMMARY BAR ---- */
#vdc-ov .summary-bar {
    background: linear-gradient(135deg, #1e3a5f 0%, #2d5986 100%);
    padding: 14px;
    border-radius: 14px;
    display: flex;
    justify-content: space-around;
    margin-bottom: 14px;
    box-shadow: 0 4px 14px rgba(30,58,95,0.3);
}
#vdc-ov .summary-item { text-align: center; margin: 0; padding: 0; }
#vdc-ov .summary-value {
    font-size: 24px; font-weight: 800; line-height: 1;
    color: white; margin: 0; padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
#vdc-ov .summary-label {
    font-size: 11px; opacity: 0.8; margin-top: 3px;
    color: white; padding: 0;
    font-family: inherit;
}

/* ---- ROW ITEMS ---- */
#vdc-ov .row-item {
    padding: 14px 16px;
    border-bottom: 0.5px solid #e5e5ea;
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0;
}
#vdc-ov .row-item:last-child { border-bottom: none; }
#vdc-ov .row-num {
    background: #007aff;
    color: white;
    border-radius: 50%;
    width: 28px; height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    flex-shrink: 0;
    margin: 0; padding: 0;
    font-family: inherit;
    line-height: 1;
}
#vdc-ov .row-info { flex: 1; min-width: 0; margin: 0; padding: 0; }
#vdc-ov .row-title {
    font-size: 15px; font-weight: 700; color: #1c1c1e;
    margin: 0; padding: 0;
    font-family: inherit;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
#vdc-ov .row-sub {
    font-size: 12px; color: #8e8e93; margin-top: 3px;
    line-height: 1.4; padding: 0;
    font-family: inherit;
}
#vdc-ov .row-note {
    font-size: 12px; color: #ff9500; margin-top: 2px;
    font-style: italic; padding: 0;
    font-family: inherit;
}
#vdc-ov .btn-del-row {
    background: #ff3b30;
    color: white;
    border: none;
    border-radius: 8px;
    padding: 7px 12px;
    font-size: 14px;
    cursor: pointer;
    flex-shrink: 0;
    width: auto;
    font-family: inherit;
    margin: 0;
    line-height: 1;
}

/* ---- ODP ITEMS ---- */
#vdc-ov .odp-item {
    padding: 13px 16px;
    border-bottom: 0.5px solid #e5e5ea;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0;
}
#vdc-ov .odp-item:last-child { border-bottom: none; }
#vdc-ov .odp-number {
    font-size: 16px; font-weight: 700; color: #1c1c1e;
    margin: 0; padding: 0; font-family: inherit;
}
#vdc-ov .odp-idx {
    font-size: 13px; color: #8e8e93; margin-left: 8px;
    padding: 0; font-family: inherit;
}

/* ---- EMPTY STATE ---- */
#vdc-ov .empty-state {
    text-align: center;
    padding: 40px 20px;
    color: #c7c7cc;
    font-size: 15px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    margin: 0;
}
#vdc-ov .empty-icon {
    font-size: 40px; margin-bottom: 8px; display: block;
    line-height: 1;
}

/* ---- BTN ADD ---- */
#vdc-ov .btn-add {
    background: #ff3b30;
    color: white;
    border: none;
    border-radius: 14px;
    padding: 16px;
    width: 100%;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    margin-bottom: 12px;
    margin-top: 0;
    letter-spacing: 0.3px;
    box-shadow: 0 4px 12px rgba(255,59,48,0.3);
    transition: transform 0.1s, box-shadow 0.1s;
    display: block;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.4;
}
#vdc-ov .btn-add:active { transform: scale(0.98); box-shadow: none; }

/* ---- BOTTOM BAR ---- */
#vdc-ov .bottom-bar {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    background: white;
    padding: 12px 16px;
    border-top: 0.5px solid #d1d1d6;
    z-index: 200;
    box-shadow: 0 -4px 20px rgba(0,0,0,0.08);
}
#vdc-ov .btn-confirm-verbale {
    background: linear-gradient(135deg, #34c759 0%, #28a745 100%);
    color: white;
    border: none;
    border-radius: 14px;
    padding: 16px;
    width: 100%;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(52,199,89,0.35);
    transition: transform 0.1s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    margin: 0;
    line-height: 1.4;
}
#vdc-ov .btn-confirm-verbale:active { transform: scale(0.98); }
#vdc-ov .btn-confirm-verbale:disabled { background: #c7c7cc; box-shadow: none; cursor: not-allowed; }

/* ---- MODAL OVERLAY ---- */
#vdc-ov .modal-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 2147483647;
    align-items: flex-end;
    justify-content: center;
    backdrop-filter: blur(2px);
}
#vdc-ov .modal-overlay.show { display: flex; }
#vdc-ov .modal-sheet {
    background: white;
    width: 100%;
    max-width: 640px;
    max-height: 92vh;
    border-radius: 20px 20px 0 0;
    overflow-y: auto;
    animation: vdcSlideUp 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
    overscroll-behavior: contain;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
@keyframes vdcSlideUp {
    from { transform: translateY(110%); opacity: 0.5; }
    to   { transform: translateY(0);    opacity: 1; }
}
#vdc-ov .modal-handle {
    width: 40px; height: 4px;
    background: #d1d1d6;
    border-radius: 2px;
    margin: 12px auto 0;
}
#vdc-ov .modal-header {
    padding: 16px 20px 12px;
    font-size: 18px;
    font-weight: 700;
    text-align: center;
    border-bottom: 0.5px solid #e5e5ea;
    color: #1c1c1e;
    margin: 0;
    font-family: inherit;
}
#vdc-ov .modal-body { padding: 16px; margin: 0; }
#vdc-ov .modal-field { margin-bottom: 16px; }
#vdc-ov .modal-label {
    font-size: 13px;
    font-weight: 600;
    color: #8e8e93;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin-bottom: 6px;
    margin-top: 0;
    padding: 0;
    display: block;
    font-family: inherit;
}
#vdc-ov .modal-input {
    width: 100%;
    padding: 13px 14px;
    border: 1.5px solid #e5e5ea;
    border-radius: 12px;
    font-size: 16px;
    outline: none;
    color: #1c1c1e;
    transition: border-color 0.2s;
    background: white;
    display: block;
    font-family: inherit;
    margin: 0;
}
#vdc-ov .modal-input:focus { border-color: #007aff; }
#vdc-ov .modal-input[readonly] { background: #f9f9f9; color: #8e8e93; }
#vdc-ov .modal-select {
    width: 100%;
    padding: 13px 14px;
    border: 1.5px solid #e5e5ea;
    border-radius: 12px;
    font-size: 16px;
    outline: none;
    color: #1c1c1e;
    background: white;
    cursor: pointer;
    -webkit-appearance: none;
    display: block;
    font-family: inherit;
    margin: 0;
}
#vdc-ov .modal-select:focus { border-color: #007aff; }
#vdc-ov .row-3cols { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
#vdc-ov .modal-actions {
    display: flex;
    gap: 10px;
    padding: 12px 16px 20px;
    border-top: 0.5px solid #e5e5ea;
    margin: 0;
}
#vdc-ov .btn-cancel-m {
    flex: 1;
    padding: 14px;
    border: 1.5px solid #d1d1d6;
    border-radius: 12px;
    background: white;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    color: #1c1c1e;
    font-family: inherit;
    margin: 0;
    line-height: 1;
}
#vdc-ov .btn-ok-m {
    flex: 2;
    padding: 14px;
    border: none;
    border-radius: 12px;
    background: #007aff;
    color: white;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
    margin: 0;
    line-height: 1;
}
#vdc-ov .btn-ok-m:hover { background: #0066dd; }

/* ODP modal */
#vdc-ov .odp-add-row { display: flex; gap: 10px; margin-bottom: 12px; }
#vdc-ov .odp-add-row .modal-input { flex: 1; margin-bottom: 0; }
#vdc-ov .btn-odp-add {
    padding: 13px 18px;
    background: #007aff;
    color: white;
    border: none;
    border-radius: 12px;
    font-size: 22px;
    cursor: pointer;
    font-weight: 700;
    flex-shrink: 0;
    width: auto;
    font-family: inherit;
    margin: 0;
    line-height: 1;
}
#vdc-ov .odp-list-modal {
    max-height: 240px;
    overflow-y: auto;
    border: 1.5px solid #e5e5ea;
    border-radius: 12px;
}
#vdc-ov .odp-list-modal-item {
    padding: 12px 14px;
    border-bottom: 0.5px solid #e5e5ea;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 15px;
    font-weight: 600;
}
#vdc-ov .odp-list-modal-item:last-child { border-bottom: none; }

/* chip */
#vdc-ov .chip {
    display: inline-block;
    background: #e8f4ff;
    color: #007aff;
    border-radius: 20px;
    padding: 3px 10px;
    font-size: 12px;
    font-weight: 600;
    margin-right: 4px;
}

/* toast */
.vdc-toast {
    position: fixed;
    bottom: 90px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.82);
    color: white;
    padding: 12px 24px;
    border-radius: 22px;
    font-size: 14px;
    font-weight: 600;
    z-index: 2147483647;
    white-space: nowrap;
    pointer-events: none;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

@media (max-width: 400px) {
    #vdc-ov .row-3cols { grid-template-columns: 1fr 1fr; }
    #vdc-ov .field-label { min-width: 120px; font-size: 14px; }
}

/* ---- MENU ENTRY ---- */
#VDC-TM .item-title  { color: #2d5986; font-weight: 700; }
#VDC-TM .item-subtitle { color: #8e8e93; font-size: 12px; }
    `;
    document.head.appendChild(s);
}

/* ================================================================
   BUILD OVERLAY
================================================================ */
function buildOverlay() {
    if (builtOnce) return;
    builtOnce = true;

    const ov = document.createElement('div');
    ov.id = 'vdc-ov';
    ov.innerHTML = `

<!-- TOP BAR -->
<div class="topbar">
    <img src="/Content/GRN/images/logo.png" class="topbar-logo" onerror="this.style.display='none'" alt="Logo">
    <div class="topbar-title">Verbale di Carico Merce</div>
    <button class="btn-back" id="vdc-back">‹ Indietro</button>
</div>

<!-- TABS -->
<div class="tabs">
    <button class="tab-btn active" data-tab="intestazione">📋 Intestazione</button>
    <button class="tab-btn" data-tab="carico">
        📦 Carico <span class="badge hidden" id="badge-carico">0</span>
    </button>
    <button class="tab-btn" data-tab="odp">
        🔢 ODP <span class="badge hidden" id="badge-odp">0</span>
    </button>
</div>

<!-- SCROLL AREA -->
<div class="scroll-area" id="vdc-scroll">

    <!-- ===== TAB INTESTAZIONE ===== -->
    <div class="tab-content active" id="tab-intestazione">

        <div class="section-label">Dati Principali</div>
        <div class="card">
            <div class="field-row">
                <span class="field-label">Business Partner</span>
                <div class="field-value">
                    <select class="field-select" id="vdc-bp"></select>
                </div>
            </div>
            <div class="field-row">
                <span class="field-label">Data</span>
                <div class="field-value">
                    <input type="date" class="field-input" id="vdc-data">
                </div>
            </div>
            <div class="field-row">
                <span class="field-label">Plant</span>
                <div class="field-value">
                    <input type="text" class="field-input" id="vdc-plant" placeholder="es. CE71">
                </div>
            </div>
             <div class="field-row">
                <span class="field-label">Tipo Spedizione</span>
                <div class="field-value">
                    <select class="field-select" id="vdc-tipo-spedizione">
                        <option value="">— Seleziona —</option>
                        <option value="Standard">🚚 Standard</option>
                        <option value="Espresso">⚡ Espresso</option>
                        <option value="Dedicato">🎯 Dedicato</option>
                    </select>
                </div>
            </div>
        </div>

        <div class="section-label">Commessa &amp; Destinazione</div>
        <div class="card">
            <div class="field-row">
                <span class="field-label">Commessa</span>
                <div class="field-value">
                    <select class="field-select" id="vdc-commessa">
                        <option value="">Seleziona...</option>
                        <option value="VODAFONE-NTD">FASTWEB Spa – NTD</option>
                        <option value="VODAFONE-FLM">FASTWEB Spa – FLM</option>
                        <option value="INWIT">INWIT SpA</option>
                        <option value="ZAS">ZAS TRADING SRL</option>
                        <option value="GREENCHEM">GREENCHEM</option>
                        <option value="JOIGUM">JOIGUM</option>
                        <option value="AG-LOGISTICA">AG LOGISTICA</option>
                    </select>
                </div>
            </div>
            <div class="field-row">
                <span class="field-label">Destino</span>
                <div class="field-value">
                    <input type="text" class="field-input" id="vdc-destino"
                        placeholder="Seleziona commessa prima…" autocomplete="off">
                </div>
            </div>
        </div>

        <div class="section-label">Note Generali</div>
        <div class="card">
            <div class="field-row" style="align-items:flex-start;">
                <textarea class="field-input" id="vdc-note" rows="3"
                    placeholder="Note generali sul verbale..."></textarea>
            </div>
        </div>
    </div>

    <!-- ===== TAB CARICO ===== -->
    <div class="tab-content" id="tab-carico">
        <div class="summary-bar">
            <div class="summary-item">
                <div class="summary-value" id="sumColli">0</div>
                <div class="summary-label">Colli Tot.</div>
            </div>
            <div class="summary-item">
                <div class="summary-value" id="sumVolume">0.000</div>
                <div class="summary-label">Volume m³</div>
            </div>
            <div class="summary-item">
                <div class="summary-value" id="sumPeso">0</div>
                <div class="summary-label">Peso kg</div>
            </div>
        </div>
        <div class="card" id="righeContainer">
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                Nessuna riga inserita
            </div>
        </div>
        <button class="btn-add" id="btn-add-riga">➕&nbsp; AGGIUNGI RIGA</button>
    </div>

    <!-- ===== TAB ODP ===== -->
    <div class="tab-content" id="tab-odp">
        <div class="card" id="odpContainer">
            <div class="empty-state">
                <div class="empty-icon">📂</div>
                Nessun ODP inserito
            </div>
        </div>
        <button class="btn-add" id="btn-add-odp">➕&nbsp; AGGIUNGI ODP</button>
    </div>

</div><!-- /scroll-area -->

<!-- BOTTOM BAR -->
<div class="bottom-bar">
    <button class="btn-confirm-verbale" id="vdc-conferma">
        ✅&nbsp; CONFERMA VERBALE DI CARICO
    </button>
</div>

<!-- MODAL RIGA -->
<div class="modal-overlay" id="modalRiga">
    <div class="modal-sheet">
        <div class="modal-handle"></div>
        <div class="modal-header">Aggiungi Riga Carico</div>
        <div class="modal-body">
            <div class="modal-field">
                <div class="modal-label">Imballo *</div>
                <select class="modal-select" id="m-imballo">
                    <option value="">— Seleziona tipo —</option>
                    <option value="Pallet">🟫 Pallet</option>
                    <option value="Pallet Fuori Misura">📦 Pallet Fuori Misura</option>
                    <option value="Parcel">📫 Parcel</option>
                </select>
            </div>
            <div class="modal-field">
                <div class="modal-label">Quantità *</div>
                <input type="number" class="modal-input" id="m-quantita" value="1" min="1" step="1">
            </div>
            <div class="modal-field">
                <div class="modal-label">Dimensioni (cm)</div>
                <div class="row-3cols">
                    <div>
                        <div class="modal-label" style="font-size:11px; margin-bottom:4px;">Altezza</div>
                        <input type="number" class="modal-input" id="m-altezza" value="0" min="0" step="1">
                    </div>
                    <div>
                        <div class="modal-label" style="font-size:11px; margin-bottom:4px;">Larghezza</div>
                        <input type="number" class="modal-input" id="m-larghezza" value="0" min="0" step="1">
                    </div>
                    <div>
                        <div class="modal-label" style="font-size:11px; margin-bottom:4px;">Profondità</div>
                        <input type="number" class="modal-input" id="m-profondita" value="0" min="0" step="1">
                    </div>
                </div>
            </div>
            <div class="modal-field">
                <div class="modal-label">Volume Totale (m³)
                    <span style="color:#8e8e93; font-size:11px; text-transform:none; font-weight:400;">
                        calcolato automaticamente
                    </span>
                </div>
                <input type="number" class="modal-input" id="m-volume" value="0.0000" readonly>
            </div>
            <div class="modal-field">
                <div class="modal-label">Peso Totale riga (kg)</div>
                <input type="number" class="modal-input" id="m-peso" value="0" min="0" step="0.1">
            </div>
            <div class="modal-field">
                <div class="modal-label">Note</div>
                <input type="text" class="modal-input" id="m-note" placeholder="Eventuali note sulla riga...">
            </div>
        </div>
        <div class="modal-actions">
            <button class="btn-cancel-m" id="btn-annulla-riga">ANNULLA</button>
            <button class="btn-ok-m" id="btn-salva-riga">✓ CONFERMA</button>
        </div>
    </div>
</div>

<!-- MODAL ODP -->
<div class="modal-overlay" id="modalODP">
    <div class="modal-sheet">
        <div class="modal-handle"></div>
        <div class="modal-header">Gestione ODP</div>
        <div class="modal-body">
            <div class="modal-field">
                <div class="modal-label">Inserisci Numero ODP</div>
                <div class="odp-add-row">
                    <input type="text" class="modal-input" id="m-odp-input" placeholder="es. 4700123456">
                    <button class="btn-odp-add" id="btn-odp-add">+</button>
                </div>
            </div>
            <div class="modal-label" style="margin-bottom:8px;">
                ODP Inseriti <span id="odp-count-modal" class="chip">0</span>
            </div>
            <div class="odp-list-modal" id="odpListModal">
                <div style="padding:16px; text-align:center; color:#c7c7cc; font-size:14px;">Nessun ODP aggiunto</div>
            </div>
        </div>
        <div class="modal-actions">
            <button class="btn-ok-m" id="btn-chiudi-odp">✓ CHIUDI</button>
        </div>
    </div>
</div>
    `;

    document.body.appendChild(ov);

    // dropdown destino fuori dall'overlay (così è sempre sopra tutto)
    const dd = document.createElement('div');
    dd.id = 'vdc-destino-dd';
    document.body.appendChild(dd);

    bindEvents();
}

/* ================================================================
   BIND EVENTS — tutti addEventListener, zero onclick inline
================================================================ */
function bindEvents() {
    // Back
    q('#vdc-back').addEventListener('click', chiudiOverlay);

    // Tabs
    qa('#vdc-ov .tab-btn').forEach(btn =>
        btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

    // BP populate
    const bpSel = q('#vdc-bp');
    const opt0 = new Option('Seleziona...', '');
    bpSel.appendChild(opt0);
    BUSINESS_PARTNERS.forEach(bp => bpSel.appendChild(new Option(bp, bp)));

    bpSel.value = ''; //  cambia col valore che vuoi per valore predefinito
    q('#vdc-plant').value = 'CE71'; //  cambia col plant che vuoi per valore predefinito

    // Data oggi
    q('#vdc-data').value = new Date().toISOString().split('T')[0];
    q('#vdc-commessa').value = ''; // <- cambia col valore che vuoi
    caricaDest(''); // <- stesso valore, carica le destinazioni
    // Commessa
    q('#vdc-commessa').addEventListener('change', () => {
        const c = q('#vdc-commessa').value;
        q('#vdc-destino').value = '';
        hidDD();
        if (c) caricaDest(c);
    });

    // Destino
    q('#vdc-destino').addEventListener('input', mostraDD);
    q('#vdc-destino').addEventListener('focus', mostraDD);
    q('#vdc-destino').addEventListener('blur', () => setTimeout(hidDD, 200));

    // Modal riga
    q('#btn-add-riga').addEventListener('click', apriRiga);
    q('#btn-annulla-riga').addEventListener('click', chiudiRiga);
    q('#btn-salva-riga').addEventListener('click', salvaRiga);
    q('#m-imballo').addEventListener('change', onImballo);
    ['m-altezza','m-larghezza','m-profondita'].forEach(id =>
        q('#'+id).addEventListener('input', calcolaVolume));
    q('#m-quantita').addEventListener('input', calcolaVolume);

    // Modal ODP
    q('#btn-add-odp').addEventListener('click', apriODP);
    q('#btn-odp-add').addEventListener('click', aggiungiODP);
    q('#m-odp-input').addEventListener('keypress', e => {
        if (e.key === 'Enter') { e.preventDefault(); aggiungiODP(); }
    });
    q('#btn-chiudi-odp').addEventListener('click', chiudiODP);

    // Conferma
    q('#vdc-conferma').addEventListener('click', confermaVerbale);
}

/* ================================================================
   HELPERS
================================================================ */
const q = sel => document.querySelector(sel);
const qa = sel => document.querySelectorAll(sel);

function hidDD() {
    const dd = document.getElementById('vdc-destino-dd');
    if (dd) dd.style.display = 'none';
}

/* ================================================================
   OPEN / CLOSE OVERLAY
================================================================ */
function apriOverlay() {
    buildOverlay();
    q('#vdc-ov').classList.add('vdc-show');
    document.body.style.overflow = 'hidden';
    switchTab('intestazione');
}

function chiudiOverlay() {
    const ov = document.getElementById('vdc-ov');
    if (ov) ov.classList.remove('vdc-show');
    hidDD();
    document.body.style.overflow = '';
}

/* ================================================================
   TABS
================================================================ */
function switchTab(nome) {
    qa('#vdc-ov .tab-content').forEach(p => p.classList.remove('active'));
    qa('#vdc-ov .tab-btn').forEach(b => b.classList.remove('active'));
    const panel = document.getElementById('tab-' + nome);
    const btn = q('#vdc-ov .tab-btn[data-tab="' + nome + '"]');
    if (panel) panel.classList.add('active');
    if (btn) btn.classList.add('active');
    document.getElementById('vdc-scroll').scrollTop = 0;
}

/* ================================================================
   DESTINAZIONI
================================================================ */
function caricaDest(commessa) {
    if (destinazioni[commessa] !== undefined) return;
    destinazioni[commessa] = null; // loading

    GM_xmlhttpRequest({
        method:  'POST',
        url:     DEST_API_URL,
        headers: { 'Content-Type': 'application/json' },
        data:    JSON.stringify({ mode: 'list', gid: DEST_GID[commessa] }),
onload:  r => {
    try { destinazioni[commessa] = JSON.parse(r.responseText).data || []; }
    catch { destinazioni[commessa] = []; }
    //  mostra il dropdown SOLO se l'utente sta attivamente usando il campo
    const dest = q('#vdc-destino');
    if (q('#vdc-commessa').value === commessa && document.activeElement === dest) {
        mostraDD();
    }
},
        onerror: () => { destinazioni[commessa] = []; }
    });
}

function mostraDD() {
    const commessa = q('#vdc-commessa').value;
    const testo = q('#vdc-destino').value.toLowerCase();
    const dd = document.getElementById('vdc-destino-dd');
    const inp = q('#vdc-destino');
    const rect = inp.getBoundingClientRect();

    dd.style.top = (rect.bottom + 4) + 'px';
    dd.style.left = rect.left + 'px';
    dd.style.width = Math.max(rect.width, 240) + 'px';
    dd.innerHTML = '';

    if (!commessa) {
        const h = document.createElement('div');
        h.className = 'dest-hint';
        h.textContent = 'Seleziona prima una commessa';
        dd.appendChild(h);
        dd.style.display = 'block';
        return;
    }

    const lista = destinazioni[commessa];
    if (lista === null) {
        const h = document.createElement('div');
        h.className = 'dest-hint';
        h.textContent = '⏳ Caricamento…';
        dd.appendChild(h);
        dd.style.display = 'block';
        return;
    }
    if (!lista || !lista.length) { dd.style.display = 'none'; return; }

    const filt = lista.filter(d => d.destino.toLowerCase().includes(testo));
    if (!filt.length) { dd.style.display = 'none'; return; }

    filt.forEach(d => {
        const item = document.createElement('div');
        item.className = 'dest-item';
        item.textContent = d.destino;
        item.addEventListener('mousedown', e => {
            e.preventDefault();
            q('#vdc-destino').value = d.destino;
            dd.style.display = 'none';
        });
        dd.appendChild(item);
    });
    dd.style.display = 'block';
}

/* ================================================================
   MODAL RIGA
================================================================ */
function apriRiga() {
    q('#m-imballo').value = '';
    q('#m-quantita').value = 1;
    q('#m-altezza').value = 0;
    q('#m-larghezza').value = 0;
    q('#m-profondita').value= 0;
    q('#m-volume').value = '0.0000';
    q('#m-peso').value = 0;
    q('#m-note').value = '';
    q('#modalRiga').classList.add('show');
}

function chiudiRiga() {
    q('#modalRiga').classList.remove('show');
}

function onImballo() {
    if (q('#m-imballo').value === 'Pallet') {
        q('#m-larghezza').value = 80;
        q('#m-profondita').value = 120;
    }
    calcolaVolume();
}

function calcolaVolume() {
    const h = parseFloat(q('#m-altezza').value) || 0;
    const l = parseFloat(q('#m-larghezza').value) || 0;
    const p = parseFloat(q('#m-profondita').value) || 0;
    const qty = parseInt(q('#m-quantita').value) || 1;
    const volUnit = (h * l * p) / 1_000_000;
    q('#m-volume').value = (volUnit * qty).toFixed(4);
}

function salvaRiga() {
    const imballo = q('#m-imballo').value;
    if (!imballo) { toast('⚠️ Seleziona il tipo di imballo!'); return; }

    const h = parseFloat(q('#m-altezza').value) || 0;
    const l = parseFloat(q('#m-larghezza').value) || 0;
    const p = parseFloat(q('#m-profondita').value) || 0;
    const qty = parseInt(q('#m-quantita').value) || 1;
    const volUnit = (h * l * p) / 1_000_000; // ← unitario, NON da m-volume

    righeCarico.push({
        id:         Date.now(),
        imballo,
        quantita:   qty,
        altezza:    h,
        larghezza:  l,
        profondita: p,
        volume:     volUnit, // ← salvato come UNITARIO
        peso:       parseFloat(q('#m-peso').value) || 0,
        note:       q('#m-note').value.trim()
    });
    aggiornaVistaCarico();
    chiudiRiga();
    toast('✅ Riga aggiunta');
}

function eliminaRiga(id) {
    if (!confirm('Eliminare questa riga?')) return;
    righeCarico = righeCarico.filter(r => r.id !== id);
    aggiornaVistaCarico();
}

function aggiornaVistaCarico() {
    const container = q('#righeContainer');
    const badge = q('#badge-carico');

    badge.textContent = righeCarico.length;
    badge.classList.toggle('hidden', righeCarico.length === 0);

    if (righeCarico.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div>Nessuna riga inserita</div>';
        q('#sumColli').textContent = '0';
        q('#sumVolume').textContent = '0.000';
        q('#sumPeso').textContent = '0';
        return;
    }

    const totColli = righeCarico.reduce((s,r) => s + r.quantita, 0);
    const totVolume = righeCarico.reduce((s,r) => s + r.volume * r.quantita, 0);
    const totPeso = righeCarico.reduce((s,r) => s + r.peso, 0);

    q('#sumColli').textContent = totColli;
    q('#sumVolume').textContent = fmtIt(totVolume, 3);
    q('#sumPeso').textContent = fmtIt(totPeso, 1);

    container.innerHTML = '';
    righeCarico.forEach((r, idx) => {
        const div = document.createElement('div');
        div.className = 'row-item';
        div.innerHTML = `
            <div class="row-num">${idx + 1}</div>
            <div class="row-info">
                <div class="row-title">${r.imballo} &times; ${r.quantita}</div>
                <div class="row-sub">
                    ${r.altezza}&times;${r.larghezza}&times;${r.profondita} cm
                    &nbsp;|&nbsp; ${(r.volume * r.quantita).toFixed(3)} m³
                    &nbsp;|&nbsp; ${r.peso} kg
                </div>
                ${r.note ? `<div class="row-note">📝 ${r.note}</div>` : ''}
            </div>`;
        const btn = document.createElement('button');
        btn.className = 'btn-del-row';
        btn.textContent = '✕';
        btn.addEventListener('click', () => eliminaRiga(r.id));
        div.appendChild(btn);
        container.appendChild(div);
    });
}

/* ================================================================
   MODAL ODP
================================================================ */
function apriODP() {
    q('#m-odp-input').value = '';
    renderODPModal();
    q('#modalODP').classList.add('show');
    setTimeout(() => q('#m-odp-input').focus(), 320);
}

function chiudiODP() {
    q('#modalODP').classList.remove('show');
    aggiornaVistaODP();
}

function aggiungiODP() {
    const raw = q('#m-odp-input').value.trim();
    if (!raw) return;

    // Split su spazi, tab, newline, punto e virgola, virgola
    const valori = raw.split(/[\s\t\n\r;,]+/).map(v => v.trim()).filter(v => v.length > 0);

    let aggiunti = 0;
    let duplicati = 0;

    valori.forEach(val => {
        if (odps.includes(val)) {
            duplicati++;
        } else {
            odps.push(val);
            aggiunti++;
        }
    });

    q('#m-odp-input').value = '';
    renderODPModal();
    q('#m-odp-input').focus();

    if (duplicati > 0 && aggiunti === 0) {
        toast(`⚠️ Tutti gli ODP erano già presenti!`);
    } else if (duplicati > 0) {
        toast(`✅ ${aggiunti} ODP aggiunt${aggiunti > 1 ? 'i' : 'o'}, ${duplicati} già present${duplicati > 1 ? 'i' : 'e'}`);
    } else if (aggiunti > 1) {
        toast(`✅ ${aggiunti} ODP aggiunti`);
    } else {
        toast(`✅ ODP aggiunto`);
    }
}

function eliminaODPModal(val) {
    odps = odps.filter(o => o !== val);
    renderODPModal();
}

function renderODPModal() {
    const el = q('#odpListModal');
    q('#odp-count-modal').textContent = odps.length;

    if (!odps.length) {
        el.innerHTML = '<div style="padding:16px; text-align:center; color:#c7c7cc; font-size:14px;">Nessun ODP aggiunto</div>';
        return;
    }
    el.innerHTML = '';
    odps.forEach((odp, i) => {
        const div = document.createElement('div');
        div.className = 'odp-list-modal-item';
        const sp = document.createElement('span');
        sp.innerHTML = `<span style="color:#8e8e93; font-size:12px;">#${i+1}&nbsp;</span>${odp}`;
        const btn = document.createElement('button');
        btn.className = 'btn-del-row';
        btn.textContent = '✕';
        btn.addEventListener('click', () => eliminaODPModal(odp));
        div.appendChild(sp);
        div.appendChild(btn);
        el.appendChild(div);
    });
}

function aggiornaVistaODP() {
    const container = q('#odpContainer');
    const badge = q('#badge-odp');

    badge.textContent = odps.length;
    badge.classList.toggle('hidden', odps.length === 0);

    if (!odps.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📂</div>Nessun ODP inserito</div>';
        return;
    }
    container.innerHTML = '';
    odps.forEach((odp, i) => {
        const div = document.createElement('div');
        div.className = 'odp-item';
        const sp = document.createElement('span');
        sp.innerHTML = `<span class="odp-number">${odp}</span><span class="odp-idx">#${i+1}</span>`;
        const btn = document.createElement('button');
        btn.className = 'btn-del-row';
        btn.textContent = '✕';
        btn.addEventListener('click', () => {
            if (!confirm('Eliminare questo ODP?')) return;
            odps = odps.filter(o => o !== odp);
            renderODPModal();
            aggiornaVistaODP();
        });
        div.appendChild(sp);
        div.appendChild(btn);
        container.appendChild(div);
    });
}

/* ================================================================
   TOAST
================================================================ */
function toast(msg, ms = 2200) {
    const t = document.createElement('div');
    t.className = 'vdc-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
}

/* ================================================================
   CONFERMA VERBALE — Excel + GAS + torna alla pagina principale
================================================================ */
async function confermaVerbale() {
    const bp = q('#vdc-bp').value;
    const data = q('#vdc-data').value;
    const destino = (q('#vdc-destino').value || '').trim();

    if (!bp) { toast('⚠️ Seleziona il Business Partner'); switchTab('intestazione'); return; }
    if (!data) { toast('⚠️ Inserisci la data del verbale'); switchTab('intestazione'); return; }

    // ✅ BLOCCO se nessun ODP inserito
    if (!odps.length) {
        toast('⚠️ Inserisci almeno un ODP prima di confermare!');
        switchTab('odp');
        return;
    }

    // ✅ AVVISO se nessuna riga carico
    if (!righeCarico.length && !confirm('Non hai inserito righe di carico. Confermare ugualmente?')) return;
    const docNum = generateDocNum();

    // ✅ POP-UP conferma finale
    const totColli = righeCarico.reduce((s,r) => s + r.quantita, 0);
    const totVolume = righeCarico.reduce((s,r) => s + r.volume * r.quantita, 0);
    const totPeso = righeCarico.reduce((s,r) => s + r.peso, 0);
    const tipoSpedizione = q('#vdc-tipo-spedizione').value || '';

    const riepilogo = `Sei sicuro di voler confermare il verbale?\n\n`
        + `📋 Business Partner: ${bp}\n`
        + `📅 Data: ${data.split('-').reverse().join('/')}\n`
        + `📦 Commessa: ${q('#vdc-commessa').value || '—'}\n`
        + `📍 Destino: ${destino || '—'}\n`
        + `🚚 Tipo Spedizione: ${tipoSpedizione || '—'}\n`
        + `🔢 ODP inseriti: ${odps.length}\n`
        + `🗳️ Colli: ${totColli} | Volume: ${totVolume.toFixed(3).replace('.',',')} m³ | Peso: ${totPeso.toFixed(1).replace('.',',')} kg`;

    if (!confirm(riepilogo)) return;

    const btnEl = q('#vdc-conferma');
    btnEl.disabled = true;
    btnEl.textContent = '⏳ Elaborazione...';

    try {
        const dataFmt = data.split('-').reverse().join('/');
        const commessa = q('#vdc-commessa').value || '';
        const plant = q('#vdc-plant').value || '';
        const note = q('#vdc-note').value || '';
        const dataExcel = data.replace(/-/g, '');


        const wb = XLSX.utils.book_new();

/* --- SHEET 1: INTESTAZIONE (tutto su una riga) --- */
        const codeBP = bp.split('–')[0].trim(); //  estrae es. "F000002" da "F000002 – VODAFONE..."
        const namesBP = bp.split('–')[1].trim();

const hdrInt = [
    'DocNum','U_CodeBP','U_NameBP','U_AWB','U_Data','U_Plant','U_TipoSpedizione','U_Commessa','U_Destino',
    'U_Note','U_TotColli','U_VolumeTot','U_PesoTot'
];
const rowInt = [
    docNum, codeBP, namesBP, '',
    dataExcel, plant, tipoSpedizione, commessa, destino,
    note, totColli, totVolume.toFixed(3).replace('.',','), totPeso.toFixed(1).replace('.',',')
];
const hdrInt2 = [
    'DocNum','Code_BP','Business_Partner','AWB','Data','Plant','Tipo_Spedizione','Commessa','Destino',
    'Note','Totale_Colli','Volume_Totale_MC','Peso_Totale_Kg'
];

const ws1 = XLSX.utils.aoa_to_sheet([hdrInt, hdrInt2, rowInt]);
ws1['!cols'] = [5,10,28,12,12,8,18,30,30,12,18,16].map(w => ({wch:w}));
        ws1['!rows'] = [{ hidden: true }, {}, {}];
XLSX.utils.book_append_sheet(wb, ws1, 'Intestazione');

        /* --- SHEET 2: DETTAGLI CARICO --- */
        const hdrCar =['DocNum','LineNum','U_TipoImballo','U_Qta','U_Altezza','U_Larghezza',
                         'U_Profondita','U_VolumeU','U_VolumeTotR','U_TotPesoR','U_NoteR'
                        ];
        const rowsCar = righeCarico.map((r,i) => [
             docNum,i, r.imballo, r.quantita,
            r.altezza, r.larghezza, r.profondita,
            r.volume.toFixed(4).replace('.',','), (r.volume * r.quantita).toFixed(4).replace('.',','),
            r.peso.toFixed(1).replace('.',','), r.note || ''
        ]);
        //rowsCar.push([
          //  'TOTALE','', totColli,
           // '','','','', totVolume.toFixed(4).replace('.',','),
            //totPeso.toFixed(1).replace('.',','), ''
        //]);
        const hdrCar2 = [
            'DocNum','LineNum','Imballo','Quantity',
            'Altezza_Cm','Larghezza_Cm','Profondita_Cm',
            'Volume_Unitario_Mc','Volume_Totale_Riga_Mc',
            'Peso_Totale_Riga_Kg','Note'
        ];
        const ws2 = XLSX.utils.aoa_to_sheet([hdrCar, hdrCar2, ...rowsCar]);
        ws2['!cols'] = [5,22,10,14,14,14,20,22,20,30].map(w => ({wch:w}));
        ws2['!rows'] = [{ hidden: true }, {}, ...rowsCar.map(() => ({}))];
        XLSX.utils.book_append_sheet(wb, ws2, 'Dettagli Carico');

/* --- SHEET 3: ODP --- */
const rowsODP = odps.map((o,i) => [ docNum,i, o]);
const ws3 = XLSX.utils.aoa_to_sheet([
    ['DocNum','LineNum','U_ODP'],
    ['DocNum','LineNum','Numero_ODP'],
    ...rowsODP //  spread
]);
ws3['!cols'] = [{wch:5},{wch:25}];
ws3['!rows'] = [{ hidden: true }, {}, ...rowsODP.map(() => ({}))];
XLSX.utils.book_append_sheet(wb, ws3, 'Dettagli ODP');

/* --- NOME FILE: contiene commessa + destino --- */
const commessaShort = commessa
    ? commessa.replace(/[^a-zA-Z0-9\-]/g,'_')
    : 'NoCommessa';
const destShort = destino
    ? destino.substring(0,25).replace(/[^a-zA-Z0-9]/g,'_')
    : 'NoDestino';
const dataStr  = data.replace(/-/g,'');
const fileName = `VDC_${commessaShort}_${destShort}_${dataStr}.xlsx`;

        /* --- DOWNLOAD LOCALE --- */
        XLSX.writeFile(wb, fileName);

        /* --- INVIO GAS (Drive + Mail) --- */
        const wbArr = XLSX.write(wb, { bookType:'xlsx', type:'array' });
        const base64 = btoa(String.fromCharCode(...new Uint8Array(wbArr)));

        const soggetto = `Verbale di Carico – ${destino || commessa} –${commessa} – ${dataFmt}`;
        const corpo = `Verbale di Carico del ${dataFmt}\n`
                       + `Business Partner: ${bp}\n`
                       + `Destino: ${destino}\n`
                       + `Commessa: ${commessa}\n\n`
                       + `Colli: ${totColli} | Volume: ${totVolume.toFixed(3).replace('.',',')} m³ | Peso: ${totPeso.toFixed(1).replace('.',',')} kg\n\n`
                       + `File allegato: ${fileName}`;


        GM_xmlhttpRequest({
            method:  'POST',
            url:     GAS_URL,
            headers: { 'Content-Type': 'application/json' },
            data:    JSON.stringify({
                fileName, content: base64,
                emailTo: EMAIL_TO,
                subject: soggetto,
                body:    corpo
            }),
            onload:  r => console.log('VDC GAS:', r.responseText.slice(0,100)),
            onerror: e => console.warn('VDC GAS err:', e)
        });

        toast(`✅ Verbale confermato! Email → ${EMAIL_TO}`, 3000);

        /* --- Torna alla pagina principale dopo 1.5 s --- */
        setTimeout(() => {
            // reset stato
            righeCarico = [];
            odps = [];
            aggiornaVistaCarico();
            aggiornaVistaODP();
            chiudiOverlay();
        }, 1500);

    } catch(err) {
        alert('❌ Errore durante la conferma: ' + err.message);
    } finally {
        btnEl.disabled = false;
        btnEl.innerHTML = '✅&nbsp; CONFERMA VERBALE DI CARICO';
    }
}

/* ================================================================
   INIETTA BOTTONE NEL MENU GRN
================================================================ */
function injectMenuBtn() {
    if (document.getElementById('VDC-TM')) return true;
    const vds = document.getElementById('VDS');
    if (!vds) return false;

    const li = document.createElement('li');
    li.id = 'VDC-TM';

    const a = document.createElement('a');
    a.href = 'javascript:void(0)';
    a.className = 'item-link item-content';
    a.style.textDecoration = 'none';
    a.innerHTML = `
        <div class="item-media">
            <img src="/Content/GRN/images/audit.png" width="44" onerror="this.style.display='none'">
        </div>
        <div class="item-inner">
            <div class="item-title-row">
                <div class="item-title">Verbale di Carico</div>
            </div>
            <div class="item-subtitle">Inserimento dati carico merce</div>
        </div>`;
    a.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); apriOverlay(); });

    li.appendChild(a);
    vds.parentNode.insertBefore(li, vds);
    return true;
}

/* ================================================================
   BOOTSTRAP
================================================================ */
injectCSS();
buildOverlay(); // costruisce in background subito

// Retry ogni 500ms fino a 30 secondi
let n = 0;
const ti = setInterval(() => {
    if (injectMenuBtn() || ++n > 60) clearInterval(ti);
}, 500);

// Observer per SPA Framework7
new MutationObserver(injectMenuBtn)
    .observe(document.body, { childList: true, subtree: false });

})();
