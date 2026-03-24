// ==UserScript==
// @name         Verbale di Carico Merce – ATS71
// @namespace    http://tampermonkey.net/
// @version      7.1
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
// [MODIFICA] odps ora è array di oggetti { id, numero, peso }
// era: let odps = [];
let odps = [];
let destinazioni = {};
let builtOnce = false;
// [MODIFICA] editRigaId per modalità modifica riga
let editRigaId = null;

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
   [MODIFICA] aggiunti solo: .btn-edit-row, .row-actions, .odp-peso-badge,
              .btn-edit-odp, .odp-item-info, .odp-item-actions,
              .odp-list-modal-item flex update, .btn-splitta
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
    position: absolute;
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
    width: 100px;
    height: 50px;
    border-radius: 8px;
    white-space: nowrap;
    flex-shrink: 0;
    font-family: inherit;
    margin: auto 0 0 0;
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

/* ---- DESTINO DROPDOWN ---- */
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
    padding: 12px 12px;
    border-bottom: 0.5px solid #e5e5ea;
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    width: 100%;
    overflow: hidden;
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
/* [MODIFICA] bottoni riga: edit + del affiancati — compatti per stare nella riga */
#vdc-ov .row-actions { display: flex; gap: 4px; flex-shrink: 0; }
#vdc-ov .btn-del-row {
    background: #ff3b30;
    color: white;
    border: none;
    border-radius: 7px;
    padding: 6px 9px;
    font-size: 13px;
    cursor: pointer;
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: inherit;
    margin: 0;
    line-height: 1;
}
/* [MODIFICA] bottone modifica riga */
#vdc-ov .btn-edit-row {
    background: #007aff;
    color: white;
    border: none;
    border-radius: 7px;
    padding: 6px 9px;
    font-size: 13px;
    cursor: pointer;
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: inherit;
    margin: 0;
    line-height: 1;
}

/* ---- ODP ITEMS ---- */
#vdc-ov .odp-item {
    padding: 13px 90px 13px 15px;
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
/* [MODIFICA] badge peso ODP nella vista principale */
#vdc-ov .odp-peso-badge {
    font-size: 12px; color: #34c759; font-weight: 600; margin-left: 8px;
}
/* [MODIFICA] info + actions affiancati nel modal ODP */
#vdc-ov .odp-item-info { display: flex; flex-direction: column; gap: 2px; }
#vdc-ov .odp-item-peso { font-size: 12px; color: #34c759; font-weight: 600; }
#vdc-ov .odp-item-actions { display: flex; gap: 6px; align-items: center; }
#vdc-ov .btn-edit-odp {
    background: #007aff;
    color: white;
    border: none;
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 13px;
    cursor: pointer;
    font-family: inherit;
    margin: 0;
    line-height: 1;
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

/* [MODIFICA] bottone Splitta Peso */
#vdc-ov .btn-splitta {
    background: linear-gradient(135deg, #ff9500 0%, #ff6b00 100%);
    color: white;
    border: none;
    border-radius: 14px;
    padding: 14px 16px;
    width: 100%;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    margin-bottom: 12px;
    margin-top: 0;
    letter-spacing: 0.3px;
    box-shadow: 0 4px 12px rgba(255,149,0,0.3);
    transition: transform 0.1s, box-shadow 0.1s;
    display: block;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.4;
}
#vdc-ov .btn-splitta:active { transform: scale(0.98); box-shadow: none; }

/* ---- BTN STAMPA ETICHETTE COLLI ---- */
#vdc-ov .btn-etichetta {
    background: linear-gradient(135deg, #5856d6 0%, #3634a3 100%);
    color: white; border: none; border-radius: 14px;
    padding: 14px 16px; width: 100%; font-size: 15px; font-weight: 700;
    cursor: pointer; margin-bottom: 12px; margin-top: 0;
    letter-spacing: 0.3px; box-shadow: 0 4px 12px rgba(88,86,214,0.3);
    transition: transform 0.1s, box-shadow 0.1s; display: block;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.4;
}
#vdc-ov .btn-etichetta:active { transform: scale(0.98); box-shadow: none; }

/* ---- BTN STAMPA RIEPILOGO SPEDIZIONE ---- */
#vdc-ov .btn-riepilogo {
    background: linear-gradient(135deg, #00b894 0%, #00856f 100%);
    color: white; border: none; border-radius: 14px;
    padding: 14px 16px; width: 100%; font-size: 15px; font-weight: 700;
    cursor: pointer; margin-bottom: 12px; margin-top: 0;
    letter-spacing: 0.3px; box-shadow: 0 4px 12px rgba(0,184,148,0.3);
    transition: transform 0.1s, box-shadow 0.1s; display: block;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.4;
}
#vdc-ov .btn-riepilogo:active { transform: scale(0.98); box-shadow: none; }

/* ---- BTN STAMPA ODP (per singola riga ODP) ---- */
#vdc-ov .btn-print-odp {
    background: #5856d6; color: white; border: none; border-radius: 8px;
    padding: 6px 10px; font-size: 13px; cursor: pointer;
    font-family: inherit; margin: 0; line-height: 1; flex-shrink: 0;
}

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

/* ODP modal — [MODIFICA] layout a griglia numero + peso */
#vdc-ov .odp-add-row { display: flex; gap: 10px; margin-bottom: 12px; }
#vdc-ov .odp-add-row .modal-input { flex: 1; margin-bottom: 0; }
#vdc-ov .odp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
#vdc-ov .odp-grid .modal-input { margin-bottom: 0; }
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
    height: 52px;
    align-self: end;
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
    #vdc-ov .odp-grid { grid-template-columns: 1fr; }
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
                        placeholder="Digita per cercare…" autocomplete="off">
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
        <button class="btn-splitta" id="btn-splitta-peso">⚖️&nbsp; SPLITTA PESO DA ODP</button>
        <button class="btn-etichetta" id="btn-stampa-etichette">🏷️&nbsp; STAMPA ETICHETTE COLLI</button>
        <button class="btn-riepilogo" id="btn-stampa-riepilogo">📋&nbsp; STAMPA ETICHETTA RIEPILOGO SPEDIZIONE</button>
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

<!-- MODAL RIGA — identico all'originale, aggiunto solo id al modal-header per modifica -->
<div class="modal-overlay" id="modalRiga">
    <div class="modal-sheet">
        <div class="modal-handle"></div>
        <div class="modal-header" id="modalRigaHeader">Aggiungi Riga Carico</div>
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
                        <div class="modal-label" style="font-size:11px; margin-bottom:4px;">Larghezza</div>
                        <input type="number" class="modal-input" id="m-larghezza" value="0" min="0" step="1">
                    </div>
                    <div>
                        <div class="modal-label" style="font-size:11px; margin-bottom:4px;">Profondità</div>
                        <input type="number" class="modal-input" id="m-profondita" value="0" min="0" step="1">
                    </div>
                    <div>
                        <div class="modal-label" style="font-size:11px; margin-bottom:4px;">Altezza</div>
                        <input type="number" class="modal-input" id="m-altezza" value="0" min="0" step="1">
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

<!-- MODAL ODP — [MODIFICA] aggiunto campo Peso accanto al numero -->
<div class="modal-overlay" id="modalODP">
    <div class="modal-sheet">
        <div class="modal-handle"></div>
        <div class="modal-header" id="modalODPHeader">Gestione ODP</div>
        <div class="modal-body">
            <div class="modal-field">
                <div class="modal-label">Inserisci ODP e Peso (puoi incollare più valori separati da spazio)</div>
                <div class="odp-grid">
                    <div>
                        <div class="modal-label" style="font-size:11px;margin-bottom:4px;">Numero ODP *</div>
                        <input type="text" class="modal-input" id="m-odp-input" placeholder="es. 6500001">
                    </div>
                    <div>
                        <div class="modal-label" style="font-size:11px;margin-bottom:4px;">Peso (kg)</div>
                        <input type="text" class="modal-input" id="m-odp-peso" placeholder="es. 85 200">
                    </div>
                </div>
                <button class="btn-odp-add" id="btn-odp-add" style="width:100%;margin-top:6px;">＋ AGGIUNGI</button>
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

    // dropdown destino fuori dall'overlay
    const dd = document.createElement('div');
    dd.id = 'vdc-destino-dd';
    document.body.appendChild(dd);

    bindEvents();
}

/* ================================================================
   BIND EVENTS
================================================================ */
function bindEvents() {
    q('#vdc-back').addEventListener('click', chiudiOverlay);

    qa('#vdc-ov .tab-btn').forEach(btn =>
        btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

    const bpSel = q('#vdc-bp');
    const opt0 = new Option('Seleziona...', '');
    bpSel.appendChild(opt0);
    BUSINESS_PARTNERS.forEach(bp => bpSel.appendChild(new Option(bp, bp)));

    bpSel.value = '';
    q('#vdc-plant').value = 'CE71';
    q('#vdc-tipo-spedizione').value = 'Standard';
    q('#vdc-data').value = new Date().toISOString().split('T')[0];
    q('#vdc-commessa').value = '';
    caricaDest('');

    q('#vdc-commessa').addEventListener('change', () => {
        const c = q('#vdc-commessa').value;
        q('#vdc-destino').value = '';
        hidDD();
        if (c) caricaDest(c);
    });

    // Destino — [MODIFICA] aggiunto click + focus per aprire lista
    q('#vdc-destino').addEventListener('input', mostraDD);
    q('#vdc-destino').addEventListener('focus', mostraDD);
    q('#vdc-destino').addEventListener('click', mostraDD);
    q('#vdc-destino').addEventListener('blur', () => setTimeout(hidDD, 200));

    // Modal riga — identico all'originale
    q('#btn-add-riga').addEventListener('click', () => apriRiga(null));
    q('#btn-annulla-riga').addEventListener('click', chiudiRiga);
    q('#btn-salva-riga').addEventListener('click', salvaRiga);
    q('#m-imballo').addEventListener('change', onImballo);
    ['m-altezza','m-larghezza','m-profondita'].forEach(id =>
        q('#'+id).addEventListener('input', calcolaVolume));
    q('#m-quantita').addEventListener('input', calcolaVolume);

    // [MODIFICA] bottone Splitta Peso
    q('#btn-splitta-peso').addEventListener('click', () => splittaPeso('manual'));
    q('#btn-stampa-etichette').addEventListener('click', stampaEtichette);
    q('#btn-stampa-riepilogo').addEventListener('click', stampaEtichettaRiepilogo);

    // Modal ODP
    q('#btn-add-odp').addEventListener('click', apriODP);
    q('#btn-odp-add').addEventListener('click', aggiungiODP);
    q('#m-odp-input').addEventListener('keypress', e => {
        if (e.key === 'Enter') { e.preventDefault(); q('#m-odp-peso').focus(); }
    });
    q('#m-odp-peso').addEventListener('keypress', e => {
        if (e.key === 'Enter') { e.preventDefault(); aggiungiODP(); }
    });
    q('#btn-chiudi-odp').addEventListener('click', chiudiODP);

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
   [MODIFICA] fuzzy: normalizza trattini/spazi prima del confronto
================================================================ */
function caricaDest(commessa) {
    if (destinazioni[commessa] !== undefined) return;
    destinazioni[commessa] = null;

    GM_xmlhttpRequest({
        method:  'POST',
        url:     DEST_API_URL,
        headers: { 'Content-Type': 'application/json' },
        data:    JSON.stringify({ mode: 'list', gid: DEST_GID[commessa] }),
        onload:  r => {
            try { destinazioni[commessa] = JSON.parse(r.responseText).data || []; }
            catch { destinazioni[commessa] = []; }
            const dest = q('#vdc-destino');
            if (q('#vdc-commessa').value === commessa && document.activeElement === dest) {
                mostraDD();
            }
        },
        onerror: () => { destinazioni[commessa] = []; }
    });
}

// Normalizza per confronto fuzzy: trattini/slash → spazio, spazi multipli → uno
function normDest(str) {
    return str.toLowerCase()
        .replace(/[-–—\/\\\.]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function mostraDD() {
    const commessa = q('#vdc-commessa').value;
    const testoRaw = (q('#vdc-destino').value || '').trim();
    const testo = normDest(testoRaw);
    const dd = document.getElementById('vdc-destino-dd');
    const inp = q('#vdc-destino');
    const rect = inp.getBoundingClientRect();

    dd.style.top  = (rect.bottom + 4) + 'px';
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

    // [MODIFICA] confronto su versioni normalizzate; se testo vuoto mostra tutto
    const filt = testo
        ? lista.filter(d => normDest(d.destino).includes(testo))
        : lista;

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
   MODAL RIGA — uguale all'originale + supporto modifica
================================================================ */
function apriRiga(rigaDaModificare) {
    editRigaId = rigaDaModificare ? rigaDaModificare.id : null;

    if (rigaDaModificare) {
        q('#modalRigaHeader').textContent = 'Modifica Riga Carico';
        q('#m-imballo').value    = rigaDaModificare.imballo;
        q('#m-quantita').value   = rigaDaModificare.quantita;
        q('#m-altezza').value    = rigaDaModificare.altezza;
        q('#m-larghezza').value  = rigaDaModificare.larghezza;
        q('#m-profondita').value = rigaDaModificare.profondita;
        q('#m-volume').value     = (rigaDaModificare.volume * rigaDaModificare.quantita).toFixed(4);
        q('#m-peso').value       = rigaDaModificare.peso;
        q('#m-note').value       = rigaDaModificare.note;
    } else {
        // identico all'originale v5.2
        q('#modalRigaHeader').textContent = 'Aggiungi Riga Carico';
        q('#m-imballo').value    = '';
        q('#m-quantita').value   = 1;
        q('#m-altezza').value    = 0;
        q('#m-larghezza').value  = 0;
        q('#m-profondita').value = 0;
        q('#m-volume').value     = '0.0000';
        q('#m-peso').value       = 0;
        q('#m-note').value       = '';
    }
    q('#modalRiga').classList.add('show');
}

function chiudiRiga() {
    editRigaId = null;
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
    const h   = parseFloat(q('#m-altezza').value)   || 0;
    const l   = parseFloat(q('#m-larghezza').value)  || 0;
    const p   = parseFloat(q('#m-profondita').value) || 0;
    const qty = parseInt(q('#m-quantita').value)     || 1;
    const volUnit = (h * l * p) / 1_000_000;
    q('#m-volume').value = (volUnit * qty).toFixed(4);
}

function salvaRiga() {
    const imballo = q('#m-imballo').value;
    if (!imballo) { toast('⚠️ Seleziona il tipo di imballo!'); return; }

    const h   = parseFloat(q('#m-altezza').value)   || 0;
    const l   = parseFloat(q('#m-larghezza').value)  || 0;
    const p   = parseFloat(q('#m-profondita').value) || 0;
    const qty = parseInt(q('#m-quantita').value)     || 1;
    const volUnit = (h * l * p) / 1_000_000;

    const dati = {
        imballo,
        quantita:   qty,
        altezza:    h,
        larghezza:  l,
        profondita: p,
        volume:     volUnit,
        peso:       parseFloat(q('#m-peso').value) || 0,
        note:       q('#m-note').value.trim()
    };

    if (editRigaId !== null) {
        const idx = righeCarico.findIndex(r => r.id === editRigaId);
        if (idx !== -1) { dati.id = editRigaId; righeCarico[idx] = dati; }
        toast('✏️ Riga aggiornata');
    } else {
        dati.id = Date.now();
        righeCarico.push(dati);
        toast('✅ Riga aggiunta');
    }

    aggiornaVistaCarico();
    chiudiRiga();
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
        q('#sumColli').textContent  = '0';
        q('#sumVolume').textContent = '0.000';
        q('#sumPeso').textContent   = '0';
        return;
    }

    const totColli  = righeCarico.reduce((s,r) => s + r.quantita, 0);
    const totVolume = righeCarico.reduce((s,r) => s + r.volume * r.quantita, 0);
    const totPeso   = righeCarico.reduce((s,r) => s + r.peso, 0);

    q('#sumColli').textContent  = totColli;
    q('#sumVolume').textContent = fmtIt(totVolume, 3);
    q('#sumPeso').textContent   = fmtIt(totPeso, 1);

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
            </div>
            <div class="row-actions"></div>`;

        const actions = div.querySelector('.row-actions');

        // [MODIFICA] bottone modifica
        const btnEdit = document.createElement('button');
        btnEdit.className = 'btn-edit-row';
        btnEdit.textContent = '✎';
        btnEdit.title = 'Modifica';
        btnEdit.addEventListener('click', e => { e.stopPropagation(); apriRiga(r); });

        const btnDel = document.createElement('button');
        btnDel.className = 'btn-del-row';
        btnDel.textContent = '✕';
        btnDel.addEventListener('click', e => { e.stopPropagation(); eliminaRiga(r.id); });

        actions.appendChild(btnEdit);
        actions.appendChild(btnDel);
        container.appendChild(div);
    });
}

/* ================================================================
   SPLITTA PESO DA ODP
   mode: 'auto'   = silenzioso, alla conferma
         'manual' = bottone utente, mostra sempre pop-up
================================================================ */

// Distribuisce pesoDaSplittare proporzionalmente al volume sulle righe passate
function _distribuisci(righe, pesoDaSplittare) {
    const volTot = righe.reduce((s, r) => s + r.volume * r.quantita, 0);
    righe.forEach(r => {
        const idx = righeCarico.findIndex(x => x.id === r.id);
        if (idx === -1) return;
        if (volTot === 0) {
            righeCarico[idx].peso = Math.round((pesoDaSplittare / righe.length) * 10) / 10;
        } else {
            righeCarico[idx].peso = Math.round((r.volume * r.quantita / volTot) * pesoDaSplittare * 10) / 10;
        }
    });
}

function splittaPeso(mode) {
    // Usa sempre il totale ODP intero — le righe con peso>0 vengono ignorate
    const totPesoODP     = odps.reduce((s, o) => s + (o.peso || 0), 0);
    const righeSenzaPeso = righeCarico.filter(r => r.peso === 0);

    if (totPesoODP <= 0) {
        if (mode === 'manual') toast('\u26a0\ufe0f Nessun peso inserito negli ODP');
        return false;
    }
    if (!righeCarico.length) {
        if (mode === 'manual') toast('\u26a0\ufe0f Nessuna riga di carico inserita');
        return false;
    }
    if (!righeSenzaPeso.length) {
        if (mode === 'manual') toast('\u2139\ufe0f Tutte le righe hanno gi\u00e0 un peso assegnato');
        return false;
    }

    // AUTOMATICO (alla conferma): silenzioso
    if (mode === 'auto') {
        _distribuisci(righeSenzaPeso, totPesoODP);
        aggiornaVistaCarico();
        return true;
    }

    // MANUALE: se righe miste chiedi, se tutte a 0 fai direttamente
    const righeCon = righeCarico.filter(r => r.peso > 0);

    if (righeCon.length > 0) {
        // Righe miste → pop-up di conferma
        const msg = `Distribuisci ${fmtIt(totPesoODP,1)} kg (totale ODP) sulle ${righeSenzaPeso.length} righe con peso = 0?\n\n`
                  + `Le ${righeCon.length} righe con peso gi\u00e0 impostato NON vengono modificate.`;
        if (!confirm(msg)) return false;
    }
    // Tutte a 0 → nessuna domanda, fai direttamente

    _distribuisci(righeSenzaPeso, totPesoODP);
    aggiornaVistaCarico();
    toast(`\u2696\ufe0f ${fmtIt(totPesoODP,1)} kg distribuiti su ${righeSenzaPeso.length} righe`);
    return true;
}

/* ================================================================
   MODAL ODP
================================================================ */
function apriODP() {
    q('#m-odp-input').value = '';
    q('#m-odp-peso').value  = '';
    q('#modalODPHeader').textContent = 'Gestione ODP';
    q('#btn-odp-add').textContent = '＋ AGGIUNGI';
    renderODPModal();
    q('#modalODP').classList.add('show');
    setTimeout(() => q('#m-odp-input').focus(), 320);
}

function chiudiODP() {
    q('#modalODP').classList.remove('show');
    aggiornaVistaODP();
}

function aggiungiODP() {
    const rawNum  = q('#m-odp-input').value.trim();
    const rawPeso = q('#m-odp-peso').value.trim();
    if (!rawNum) { toast('⚠️ Inserisci il numero ODP'); return; }

    // Split numeri su qualsiasi separatore (spazio, tab, virgola, punto e virgola, newline)
    const numeri = rawNum.split(/[\s\t\n\r;,]+/).map(v => v.trim()).filter(v => v);

    // Split pesi sullo stesso separatore — accetta sia punto che virgola decimale
    const pesi = rawPeso
        ? rawPeso.split(/[\s\t\n\r;,]+/)
            .map(v => parseFloat(v.replace(',', '.')))
            .filter(v => !isNaN(v) && v >= 0)
        : [];

    // Funzione per ottenere il peso per posizione i:
    // - se pesi ha un solo valore → usato per tutti
    // - se pesi ha tanti valori quanto numeri → abbinamento posizionale
    // - altrimenti → 0
    const getPeso = i => {
        if (pesi.length === 0)       return 0;
        if (pesi.length === 1)       return pesi[0];
        return pesi[i] !== undefined ? pesi[i] : 0;
    };

    let aggiunti = 0, duplicati = 0;
    numeri.forEach((num, i) => {
        if (odps.find(o => o.numero === num)) {
            duplicati++;
        } else {
            odps.push({ id: Date.now() + Math.random(), numero: num, peso: getPeso(i) });
            aggiunti++;
        }
    });

    q('#m-odp-input').value = '';
    q('#m-odp-peso').value  = '';
    renderODPModal();
    q('#m-odp-input').focus();

    if (duplicati > 0 && aggiunti === 0)
        toast(`⚠️ Tutti gli ODP erano già presenti!`);
    else if (duplicati > 0)
        toast(`✅ ${aggiunti} aggiunt${aggiunti>1?'i':'o'}, ${duplicati} già present${duplicati>1?'i':'e'}`);
    else if (aggiunti > 1)
        toast(`✅ ${aggiunti} ODP aggiunti`);
    else
        toast(`✅ ODP aggiunto`);
}

function modificaODPModal(odp) {
    q('#m-odp-input').value = odp.numero;
    q('#m-odp-peso').value  = odp.peso > 0 ? odp.peso : '';
    // rimuovo e sostituisco con un id temporaneo per evitare duplicato
    odps = odps.filter(o => o.id !== odp.id);
    q('#m-odp-input').focus();
    renderODPModal();
}

function eliminaODPModal(id) {
    odps = odps.filter(o => o.id !== id);
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

        const info = document.createElement('div');
        info.className = 'odp-item-info';
        info.innerHTML = `
            <span><span style="color:#8e8e93;font-size:12px;">#${i+1}&nbsp;</span><strong>${odp.numero}</strong></span>
            ${odp.peso > 0
                ? `<span class="odp-item-peso">⚖️ ${fmtIt(odp.peso,1)} kg</span>`
                : `<span style="font-size:11px;color:#c7c7cc;">peso non impostato</span>`}`;

        const acts = document.createElement('div');
        acts.className = 'odp-item-actions';

        const btnEdit = document.createElement('button');
        btnEdit.className = 'btn-edit-odp';
        btnEdit.textContent = '✎';
        btnEdit.addEventListener('click', () => modificaODPModal(odp));

        const btnDel = document.createElement('button');
        btnDel.className = 'btn-del-row';
        btnDel.textContent = '✕';
        btnDel.addEventListener('click', () => eliminaODPModal(odp.id));

        acts.appendChild(btnEdit);
        acts.appendChild(btnDel);
        div.appendChild(info);
        div.appendChild(acts);
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
        sp.innerHTML = `<span class="odp-number">${odp.numero}</span><span class="odp-idx">#${i+1}</span>`
            + (odp.peso > 0 ? `<span class="odp-peso-badge">⚖️ ${fmtIt(odp.peso,1)} kg</span>` : '');

        const acts = document.createElement('div');
        acts.style.cssText = 'display:flex;gap:6px;';

        // Bottone stampa etichetta ODP 10x5
        const btnPrint = document.createElement('button');
        btnPrint.className = 'btn-print-odp';
        btnPrint.textContent = '🏷️ Stampa';
        btnPrint.title = 'Stampa etichetta ODP';
        btnPrint.addEventListener('click', () => stampaEtichetteODP(odp));

        const btnEdit = document.createElement('button');
        btnEdit.className = 'btn-edit-odp';
        btnEdit.textContent = '✎';
        btnEdit.addEventListener('click', () => {
            apriODP();
            setTimeout(() => {
                q('#m-odp-input').value = odp.numero;
                q('#m-odp-peso').value = odp.peso > 0 ? odp.peso : '';
                odps = odps.filter(o => o.id !== odp.id);
                renderODPModal();
            }, 50);
        });

        const btnDel = document.createElement('button');
        btnDel.className = 'btn-del-row';
        btnDel.textContent = '✕';
        btnDel.addEventListener('click', () => {
            if (!confirm('Eliminare questo ODP?')) return;
            odps = odps.filter(o => o.id !== odp.id);
            aggiornaVistaODP();
        });

        acts.appendChild(btnPrint);
        acts.appendChild(btnEdit);
        acts.appendChild(btnDel);
        div.appendChild(sp);
        div.appendChild(acts);
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
   STAMPA ETICHETTE COLLI — 10×10 cm, una per ogni collo fisico
================================================================ */
function stampaEtichette() {
    if (!righeCarico.length) {
        toast('⚠️ Nessuna riga di carico inserita!');
        switchTab('carico');
        return;
    }

    const commessa  = q('#vdc-commessa').value  || '—';
    const destino   = (q('#vdc-destino').value  || '').trim() || '—';
    const tipoSped  = q('#vdc-tipo-spedizione').value || '—';
    const bp        = q('#vdc-bp').value || '—';
    const data      = q('#vdc-data').value;
    const dataFmt   = data ? data.split('-').reverse().join('/') : '—';
    const plant     = q('#vdc-plant').value || '—';
    const logoUrl   = 'https://raw.githubusercontent.com/Daniele1995-design/WebAppSap/refs/heads/main/logo%20ats.jpg';

    // Espandi ogni riga in N colli fisici
    const colli = [];
    righeCarico.forEach(r => {
        const pesoUnit = r.quantita > 0 ? (r.peso / r.quantita) : 0;
        for (let i = 0; i < r.quantita; i++) {
            colli.push({ imballo: r.imballo, peso: pesoUnit, volume: r.volume, note: r.note || '' });
        }
    });

    const totColli = colli.length;
    const odpStr   = odps.length ? odps.map(o => o.numero).join(' ; ') : '—';

    let labelsHtml = '';
    colli.forEach((c, i) => {
        const pesoStr   = c.peso > 0   ? c.peso.toFixed(1).replace('.', ',') + ' kg'   : '—';
        const volumeStr = c.volume > 0 ? c.volume.toFixed(4).replace('.', ',') + ' m³' : '—';
        labelsHtml += `
        <div class="label">
            <div class="label-header">
                <img src="${logoUrl}" class="label-logo" alt="ATS">
                <div class="label-brand">
                    <div class="label-company">ATS GRUPPO</div>
                    <div class="label-sub">Verbale di Carico Merce</div>
                </div>
                <div class="label-date">${dataFmt}</div>
            </div>
            <div class="label-body">
               <div class="label-row">
             <span class="lbl">Commessa</span>
            <span style="font-size:18pt;color:Black;font-weight:900;flex:1;line-height:1.3;word-break:break-word;">${commessa}</span>
               </div>
               <div class="label-row">
                <span class="lbl">Destino</span>
                <span style="font-size:20pt;color:Black;font-weight:900;flex:1;line-height:1.3;word-break:break-word;">${destino}</span>
               </div>
                <div class="label-row">
                    <span class="lbl">Imballo</span>
                    <span class="val">${c.imballo} <span class="val-secondary">&nbsp;|&nbsp;${pesoStr}&nbsp;|&nbsp;${volumeStr}</span></span>
                </div>
                <div class="label-row">
                    <span class="lbl">ODP</span>
                    <span class="val val-odp" style="font-size:10pt;">${odpStr}</span>
                </div>
                ${c.note ? `<div class="label-row"><span class="lbl">Note</span><span class="val val-note">${c.note}</span></div>` : ''}
            </div>
            <div class="label-footer">
                <div class="footer-left">
                    <div class="footer-plant">PLANT : ${plant}</div>
                    <span class="val">SPEDIZIONE : ${tipoSped}</span>
                </div>
                <div class="collo-num">
                    <span class="collo-cur">${i + 1}</span>
                    <span class="collo-sep">/</span>
                    <span class="collo-tot">${totColli}</span>
                </div>
            </div>
        </div>`;
    });

    const html = buildLabelPage({
        titolo: `🏷️ ${totColli} etichett${totColli===1?'a':'e'} — ${commessa} → ${destino}`,
        size: '10cm 10cm',
        headerColor: '#1e3a5f',
        labelsHtml,
        extraCSS: `
.label { width:10cm; height:10cm; background:white; border:2px solid #1e3a5f; border-radius:6px; display:flex; flex-direction:column; overflow:hidden; }
.label-header { background:linear-gradient(135deg,#1e3a5f 0%,#2d5986 100%); padding:5px 8px; display:flex; align-items:center; gap:8px; flex-shrink:0; min-height:1.4cm; }
.label-logo { height:26px; width:auto; object-fit:contain; background:white; border-radius:3px; padding:2px 4px; flex-shrink:0; }
.label-brand { flex:1; display:flex; flex-direction:column; }
.label-company { color:Black; font-size:11pt; font-weight:900; letter-spacing:1px; line-height:1; }
.label-sub { color:Black; font-size:6.5pt; margin-top:2px; }
.label-date { color:Black; font-size:8pt; font-weight:700; flex-shrink:0; }
.label-body { flex:1; padding:5px 8px 3px; display:flex; flex-direction:column; overflow:hidden; }
.label-row { display:flex; align-items:flex-start; padding:4px 0; border-bottom:0.5px solid Black; gap:5px; }
.label-row:last-child { border-bottom:none; }
.lbl { font-size:8pt; color:Black; text-transform:uppercase; font-weight:700; min-width:58px; flex-shrink:0; padding-top:1px; }
.val-big { font-size:14pt; color:Black; font-weight:900; }
.val-secondary { font-size:7pt; color:Black; font-weight:600; }
.val-odp { font-size:7pt; color:Black; word-break:break-all; font-weight:600; }
.val-note { font-size:7pt; color:Black; font-style:italic; }
.label-footer { background:#1e3a5f; padding:4px 10px; display:flex; align-items:center; justify-content:space-between; flex-shrink:0; min-height:1.6cm; }
.footer-left { display:flex; flex-direction:column; gap:2px; }
.footer-plant { color:Black; font-size:8pt; font-weight:600; }
.val { font-size:8pt; font-weight:700; color:#111; flex:1; line-height:1.3; word-break:break-word; }
.collo-num { display:flex; align-items:baseline; gap:1px; line-height:1; }
.collo-cur { font-size:36pt; font-weight:900; color:Black; line-height:1; }
.collo-sep { font-size:22pt; font-weight:700; color:Black; margin:0 1px; }
.collo-tot { font-size:22pt; font-weight:700; color:Black; line-height:1; }`
    });

    apriFinestra(html);
}

/* ================================================================
   STAMPA ETICHETTA RIEPILOGO SPEDIZIONE — 10×10 cm, singola
================================================================ */
function stampaEtichettaRiepilogo() {
    const commessa  = q('#vdc-commessa').value  || '—';
    const destino   = (q('#vdc-destino').value  || '').trim() || '—';
    const tipoSped  = q('#vdc-tipo-spedizione').value || '—';
    const bp        = q('#vdc-bp').value || '—';
    const data      = q('#vdc-data').value;
    const dataFmt   = data ? data.split('-').reverse().join('/') : '—';
    const plant     = q('#vdc-plant').value || '—';
    const note      = q('#vdc-note').value || '';
    const logoUrl   = 'https://raw.githubusercontent.com/Daniele1995-design/WebAppSap/refs/heads/main/logo%20ats.jpg';

    const totColli  = righeCarico.reduce((s,r) => s + r.quantita, 0);
    const totVolume = righeCarico.reduce((s,r) => s + r.volume * r.quantita, 0);
    const totPeso   = righeCarico.reduce((s,r) => s + r.peso, 0);
    const odpStr    = odps.length ? odps.map(o => o.numero).join(' ; ') : '—';

    let righeHtml = '';
    righeCarico.forEach((r, i) => {
        righeHtml += `<div class="riga-row">
            <span class="riga-n">${i+1}.</span>
            <span class="riga-desc">${r.imballo} ×${r.quantita}
                <span class="riga-detail">&nbsp;${r.altezza}×${r.larghezza}×${r.profondita}cm | ${(r.volume*r.quantita).toFixed(3).replace('.',',')}m³ | ${r.peso.toFixed(1).replace('.',',')}kg</span>
                ${r.note ? `<span class="riga-note"> – ${r.note}</span>` : ''}
            </span>
        </div>`;
    });

    const labelsHtml = `
    <div class="label">
        <div class="label-header">
            <img src="${logoUrl}" class="label-logo" alt="ATS">
            <div class="label-brand">
                <div class="label-company">ATS GRUPPO</div>
                <div class="label-sub">Riepilogo Spedizione</div>
            </div>
            <div class="label-date">${dataFmt}</div>
        </div>
        <div class="label-body">
            <div class="label-row">
                <span class="lbl">Commessa</span>
                <span class="val val-big">${commessa}</span>
            </div>
           <div class="label-row" style="border-bottom:1.5px solid #d0d8ff;">
            <span class="lbl">Destino</span>
            <span class="val val-big" style="font-size:14pt; color:Black; font-weight:900;">${destino}</span>
           </div>
            <div class="label-row">
                <span class="lbl">Spedizione</span>
                <span class="val">${tipoSped} <span style="font-size:6.5pt;color:#555;font-weight:600;">| Plant: ${plant} | ${bp.split('–')[0].trim()}</span></span>
            </div>
            <div class="label-row">
                <span class="lbl">ODP</span>
                <span class="val val-odp">${odpStr}</span>
            </div>
            <div class="totali-bar">
                <div class="tot-item"><div class="tot-val">${totColli}</div><div class="tot-lbl">Colli</div></div>
                <div class="tot-item"><div class="tot-val">${totVolume.toFixed(3).replace('.',',')}</div><div class="tot-lbl">m³</div></div>
                <div class="tot-item"><div class="tot-val">${totPeso.toFixed(1).replace('.',',')}</div><div class="tot-lbl">kg</div></div>
            </div>
            <div class="righe-block">
                <div class="righe-title">Dettaglio Carico</div>
                ${righeHtml || '<div style="font-size:7pt;color:#ccc;padding:4px;">Nessuna riga</div>'}
            </div>
            ${note ? `<div class="label-row" style="margin-top:2px;"><span class="lbl">Note</span><span class="val val-note">${note}</span></div>` : ''}
        </div>
        <div class="label-footer">
            <div class="footer-left">
                <div class="footer-riepilogo">RIEPILOGO SPEDIZIONE</div>
                <div class="footer-bp">${bp.split('–')[0].trim()}</div>
            </div>
            <div style="color:rgba(255,255,255,0.85);font-size:9pt;font-weight:700;text-align:right;line-height:1.4;">
                ${odps.length} ODP<br><span style="font-size:7pt;opacity:0.7;">${dataFmt}</span>
            </div>
        </div>
    </div>`;

    const html = buildLabelPage({
        titolo: `📋 Riepilogo Spedizione — ${commessa} → ${destino}`,
        size: '10cm 10cm',
        headerColor: '#00856f',
        labelsHtml,
        extraCSS: `
.label { width:10cm; height:10cm; background:white; border:2px solid #1e3a5f; border-radius:6px; display:flex; flex-direction:column; overflow:hidden; }
.label-header { background:linear-gradient(135deg,#1e3a5f 0%,#2d5986 100%); padding:5px 8px; display:flex; align-items:center; gap:8px; flex-shrink:0; min-height:1.4cm; }
.label-logo { height:26px; width:auto; object-fit:contain; background:white; border-radius:3px; padding:2px 4px; flex-shrink:0; }
.label-brand { flex:1; display:flex; flex-direction:column; }
.label-company { color:Black; font-size:11pt; font-weight:900; letter-spacing:1px; line-height:1; }
.label-sub { color:Black; font-size:6.5pt; margin-top:2px; }
.label-date { color:Black; font-size:8pt; font-weight:700; flex-shrink:0; }
.label-body { flex:1; padding:5px 8px 3px; display:flex; flex-direction:column; overflow:hidden; }
.label-row { display:flex; align-items:flex-start; padding:2px 0; border-bottom:0.5px solid Black; gap:5px; }
.label-row:last-child { border-bottom:none; }
.lbl { font-size:6pt; color:Black; text-transform:uppercase; font-weight:700; min-width:50px; flex-shrink:0; padding-top:1px; }
.val { font-size:8pt; font-weight:700; color:Black; flex:1; line-height:1.3; word-break:break-word; }
.val-big { font-size:9.5pt; color:Black; }
.val-odp { font-size:6.5pt; color:Black; word-break:break-all; font-weight:600; }
.val-note { font-size:6.5pt; color:Black; font-style:italic; }
.totali-bar { background:#f0f4ff; border:1px solid #d0d8ff; border-radius:5px; margin:3px 0; display:flex; justify-content:space-around; padding:4px 6px; flex-shrink:0; }
.tot-item { text-align:center; }
.tot-val { font-size:10pt; font-weight:900; color:Black; line-height:1; }
.tot-lbl { font-size:5.5pt; color:Black; text-transform:uppercase; margin-top:1px; }
.righe-block { flex:1; overflow:hidden; border:0.5px solid #eee; border-radius:4px; padding:3px 5px; margin-top:2px; }
.righe-title { font-size:6pt; color:Black; text-transform:uppercase; font-weight:700; margin-bottom:2px; }
.riga-row { display:flex; gap:3px; padding:1px 0; border-bottom:0.3px solid #f0f0f0; }
.riga-row:last-child { border-bottom:none; }
.riga-n { font-size:6pt; color:Black; min-width:10px; flex-shrink:0; }
.riga-desc { font-size:6.5pt; color:Black; font-weight:600; line-height:1.3; }
.riga-detail { color:Black; font-weight:400; font-size:6pt; }
.riga-note { color:Black; font-style:italic; font-size:6pt; }
.label-footer { background:#1e3a5f; padding:4px 10px; display:flex; align-items:center; justify-content:space-between; flex-shrink:0; min-height:1.2cm; }
.footer-left { display:flex; flex-direction:column; gap:2px; }
.footer-riepilogo { color:Black; font-size:8pt; font-weight:900; letter-spacing:0.5px; }
.footer-bp { color:Black; font-size:7.5pt; font-weight:700; }`
    });

    apriFinestra(html);
}

/* ================================================================
   STAMPA ETICHETTE ODP — 10×5 cm, N etichette per N colli
================================================================ */
function stampaEtichetteODP(odp) {
    const destino   = (q('#vdc-destino').value || '').trim() || '—';
    const data      = q('#vdc-data').value;
    const dataFmt   = data ? data.split('-').reverse().join('/') : '—';
    const commessa  = q('#vdc-commessa').value || '—';
    const logoUrl   = 'https://raw.githubusercontent.com/Daniele1995-design/WebAppSap/refs/heads/main/logo%20ats.jpg';

    const nColliStr = window.prompt(`ODP: ${odp.numero}\nQuanti colli ha questo ODP?`, '1');
    if (nColliStr === null) return;
    const nColli = parseInt(nColliStr);
    if (isNaN(nColli) || nColli < 1) { toast('⚠️ Numero colli non valido'); return; }

    let labelsHtml = '';
    for (let i = 1; i <= nColli; i++) {
        labelsHtml += `
        <div class="label">
            <div class="label-header">
                <img src="${logoUrl}" class="label-logo" alt="ATS">
                <div class="label-brand">
                    <div class="label-company">ATS GRUPPO</div>
                    <div class="label-sub">${commessa}</div>
                </div>
                <div class="label-date">${dataFmt}</div>
            </div>
           <div class="label-body">
           <div class="odp-big">${odp.numero}</div>
           <div class="destino-label">Destino</div>
           <div class="destino-line">${destino}</div>
           </div>
            <div class="label-footer">
                <div class="footer-collo">
                    Collo <span class="collo-cur">${i}</span>/<span class="collo-tot">${nColli}</span>
                </div>
                ${odp.peso > 0 ? `<div class="footer-peso">⚖️ ${odp.peso.toFixed(1).replace('.',',')} kg</div>` : ''}
            </div>
        </div>`;
    }

    const html = buildLabelPage({
        titolo: `🏷️ ODP ${odp.numero} — ${nColli} etichett${nColli===1?'a':'e'} → ${destino}`,
        size: '10cm 5cm',
        headerColor: '#5856d6',
        labelsHtml,
        extraCSS: `
.label { width:10cm; height:5cm; background:white; border:2px solid #1e3a5f; border-radius:6px; display:flex; flex-direction:column; overflow:hidden; }
.label-header { background:linear-gradient(135deg,#1e3a5f 0%,#2d5986 100%); padding:4px 8px; display:flex; align-items:center; gap:8px; flex-shrink:0; min-height:1cm; }
.label-logo { height:20px; width:auto; object-fit:contain; background:white; border-radius:3px; padding:2px 4px; flex-shrink:0; }
.label-brand { flex:1; }
.label-company { color:Black; font-size:9pt; font-weight:900; letter-spacing:1px; line-height:1; }
.label-sub { color:Black; font-size:5.5pt; margin-top:1px; }
.label-date { color:Black; font-size:8pt; font-weight:700; flex-shrink:0; }
.label-body { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:2px 8px; gap:2px; }
.odp-big { font-size:26pt; font-weight:900; color:Black; letter-spacing:2px; line-height:1; text-align:center; }
.destino-line { font-size:18pt; color:Black; font-weight:900; text-align:center; line-height:1.1; width:100%; word-break:break-word; }
.label-footer { background:#1e3a5f; padding:4px 12px; display:flex; align-items:center; justify-content:space-between; flex-shrink:0; min-height:0.9cm; }
.footer-collo { color:Black; font-size:10pt; font-weight:700; }
.collo-cur { font-size:18pt; font-weight:900; color:Black; }
.collo-tot { font-size:13pt; font-weight:700; color:Black; }
.footer-peso { color:Black; font-size:9pt; font-weight:700; }
.odp-label { font-size:7pt; color:Black; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:2px; }
.destino-label { font-size:7pt; color:Black; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:1px; }`
    });

    apriFinestra(html);
}

/* ================================================================
   HELPER — costruisce la pagina HTML di stampa
================================================================ */
function buildLabelPage({ titolo, size, headerColor, labelsHtml, extraCSS }) {
    return `<!DOCTYPE html>
<html lang="it"><head><meta charset="utf-8">
<title>${titolo}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:Arial,Helvetica,sans-serif; background:#d0d0d0; }
@media screen {
    body { padding:24px; }
    .label { margin:16px auto; box-shadow:0 4px 18px rgba(0,0,0,0.25); }
    .print-bar { position:sticky; top:0; z-index:99; background:${headerColor}; padding:12px 20px; display:flex; align-items:center; justify-content:space-between; border-radius:10px; margin-bottom:20px; }
    .print-info { color:white; font-size:14px; font-weight:600; }
    .btn-print { padding:10px 28px; background:#34c759; color:white; border:none; border-radius:8px; font-size:15px; font-weight:700; cursor:pointer; }
}
@media print {
    body { background:white; padding:0; }
    .print-bar { display:none !important; }
    .label { page-break-after:always; margin:0 !important; box-shadow:none !important; border-radius:0 !important; }
    .label:last-child { page-break-after:avoid; }
    @page { size:${size}; margin:0; }
}
${extraCSS}
</style></head><body>
<div class="print-bar">
    <div class="print-info">${titolo}</div>
    <button class="btn-print" onclick="window.print()">🖨️ STAMPA</button>
</div>
${labelsHtml}
</body></html>`;
}

/* Helper — apre la finestra di stampa */
function apriFinestra(html) {
    const win = window.open('', '_blank', 'width=820,height=750');
    if (!win) { toast('⚠️ Pop-up bloccato! Consenti i pop-up per questo sito.'); return; }
    win.document.write(html);
    win.document.close();
}

/* ================================================================
   CONFERMA VERBALE
================================================================ */
async function confermaVerbale() {
    const bp      = q('#vdc-bp').value;
    const data    = q('#vdc-data').value;
    const destino = (q('#vdc-destino').value || '').trim();

    if (!bp)   { toast('⚠️ Seleziona il Business Partner'); switchTab('intestazione'); return; }
    if (!data) { toast('⚠️ Inserisci la data del verbale'); switchTab('intestazione'); return; }

    if (!odps.length) {
        toast('⚠️ Inserisci almeno un ODP prima di confermare!');
        switchTab('odp');
        return;
    }

    if (!righeCarico.length && !confirm('Non hai inserito righe di carico. Confermare ugualmente?')) return;

    // [MODIFICA] se ci sono righe con peso=0 e ODP con peso → splitta automaticamente
    const righeSenzaPeso = righeCarico.filter(r => r.peso === 0);
    const totPesoODP = odps.reduce((s, o) => s + (o.peso || 0), 0);
    if (righeSenzaPeso.length > 0 && totPesoODP > 0) {
        splittaPeso('auto'); // silenzioso
    }

    const docNum = generateDocNum();

    const totColli       = righeCarico.reduce((s,r) => s + r.quantita, 0);
    const totVolume      = righeCarico.reduce((s,r) => s + r.volume * r.quantita, 0);
    const totPeso        = righeCarico.reduce((s,r) => s + r.peso, 0);
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
        const dataFmt   = data.split('-').reverse().join('/');
        const commessa  = q('#vdc-commessa').value || '';
        const plant     = q('#vdc-plant').value || '';
        const note      = q('#vdc-note').value || '';
        const dataExcel = data.replace(/-/g, '');

        const wb = XLSX.utils.book_new();

        /* --- SHEET 1: INTESTAZIONE --- */
        const codeBP  = bp.split('–')[0].trim();
        const namesBP = bp.split('–')[1].trim();

        const hdrInt  = ['DocNum','U_CodeBP','U_NameBP','U_AWB','U_Data','U_Plant','U_TipoSpedizione','U_Commessa','U_Destino','U_Note','U_TotColli','U_VolumeTot','U_PesoTot'];
        const hdrInt2 = ['DocNum','Code_BP','Business_Partner','AWB','Data','Plant','Tipo_Spedizione','Commessa','Destino','Note','Totale_Colli','Volume_Totale_MC','Peso_Totale_Kg'];
        const rowInt  = [docNum, codeBP, namesBP, '', dataExcel, plant, tipoSpedizione, commessa, destino, note, totColli, totVolume.toFixed(3).replace('.',','), totPeso.toFixed(1).replace('.',',')];

        const ws1 = XLSX.utils.aoa_to_sheet([hdrInt, hdrInt2, rowInt]);
        ws1['!cols'] = [5,10,28,12,12,8,18,30,30,12,18,16].map(w => ({wch:w}));
        ws1['!rows'] = [{ hidden: true }, {}, {}];
        XLSX.utils.book_append_sheet(wb, ws1, 'Intestazione');

        /* --- SHEET 2: DETTAGLI CARICO --- */
        const hdrCar  = ['DocNum','LineNum','U_TipoImballo','U_Qta','U_Altezza','U_Larghezza','U_Profondita','U_VolumeU','U_VolumeTotR','U_TotPesoR','U_NoteR'];
        const hdrCar2 = ['DocNum','LineNum','Imballo','Quantity','Altezza_Cm','Larghezza_Cm','Profondita_Cm','Volume_Unitario_Mc','Volume_Totale_Riga_Mc','Peso_Totale_Riga_Kg','Note'];
        const rowsCar = righeCarico.map((r,i) => [
            docNum, i, r.imballo, r.quantita,
            r.altezza, r.larghezza, r.profondita,
            r.volume.toFixed(4).replace('.',','),
            (r.volume * r.quantita).toFixed(4).replace('.',','),
            r.peso.toFixed(1).replace('.',','),
            r.note || ''
        ]);
        const ws2 = XLSX.utils.aoa_to_sheet([hdrCar, hdrCar2, ...rowsCar]);
        ws2['!cols'] = [5,22,10,14,14,14,20,22,20,30].map(w => ({wch:w}));
        ws2['!rows'] = [{ hidden: true }, {}, ...rowsCar.map(() => ({}))];
        XLSX.utils.book_append_sheet(wb, ws2, 'Dettagli Carico');

        /* --- SHEET 3: ODP — [MODIFICA] aggiunta colonna Peso --- */
        const hdrODP  = ['DocNum','LineNum','U_ODP','U_PesoODP'];
        const hdrODP2 = ['DocNum','LineNum','Numero_ODP','Peso_ODP_Kg'];
        const rowsODP = odps.map((o,i) => [
            docNum, i, o.numero,
            (o.peso || 0).toFixed(1).replace('.',',')
        ]);
        const ws3 = XLSX.utils.aoa_to_sheet([hdrODP, hdrODP2, ...rowsODP]);
        ws3['!cols'] = [{wch:5},{wch:8},{wch:25},{wch:14}];
        ws3['!rows'] = [{ hidden: true }, {}, ...rowsODP.map(() => ({}))];
        XLSX.utils.book_append_sheet(wb, ws3, 'Dettagli ODP');

        /* --- NOME FILE --- */
        const commessaShort = commessa ? commessa.replace(/[^a-zA-Z0-9\-]/g,'_') : 'NoCommessa';
        const destShort     = destino  ? destino.substring(0,25).replace(/[^a-zA-Z0-9]/g,'_') : 'NoDestino';
        const dataStr       = data.replace(/-/g,'');
        const fileName      = `VDC_${commessaShort}_${destShort}_${dataStr}.xlsx`;

        XLSX.writeFile(wb, fileName);

        /* --- INVIO GAS --- */
        const wbArr  = XLSX.write(wb, { bookType:'xlsx', type:'array' });
        const base64 = btoa(String.fromCharCode(...new Uint8Array(wbArr)));

        const soggetto = `Verbale di Carico – ${destino || commessa} –${commessa} – ${dataFmt}`;
        const corpo    = `Verbale di Carico del ${dataFmt}\n`
                       + `Business Partner: ${bp}\nDestino: ${destino}\nCommessa: ${commessa}\n\n`
                       + `Colli: ${totColli} | Volume: ${totVolume.toFixed(3).replace('.',',')} m³ | Peso: ${totPeso.toFixed(1).replace('.',',')} kg\n\n`
                       + `File allegato: ${fileName}`;

        GM_xmlhttpRequest({
            method:  'POST',
            url:     GAS_URL,
            headers: { 'Content-Type': 'application/json' },
            data:    JSON.stringify({ fileName, content: base64, emailTo: EMAIL_TO, subject: soggetto, body: corpo }),
            onload:  r => console.log('VDC GAS:', r.responseText.slice(0,100)),
            onerror: e => console.warn('VDC GAS err:', e)
        });

        toast(`✅ Verbale confermato! Email → ${EMAIL_TO}`, 3000);

        setTimeout(() => {
            righeCarico = [];
            odps        = [];
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
buildOverlay();

let n = 0;
const ti = setInterval(() => {
    if (injectMenuBtn() || ++n > 60) clearInterval(ti);
}, 500);

new MutationObserver(injectMenuBtn)
    .observe(document.body, { childList: true, subtree: false });

})();
