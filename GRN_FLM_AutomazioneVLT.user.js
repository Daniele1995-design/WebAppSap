// ==UserScript==
// @name         GRN FLM - Automazione Chiusura FR
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  Legge i dati FLM aperti dal GRN Manager (BroadcastChannel) invece del Google Sheet. Chiude gli stati FR e notifica il GRN per segnare le righe come Chiuso.
// @match        https://logistictoolvf.net.vodafone.it/*
// @grant        GM_download
// ==/UserScript==

(function () {
    'use strict';

    const CHANNEL_NAME = 'grn_flm_channel';
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    // ── Stato globale ──────────────────────────────────────────────────────────
    window.__frRunning  = window.__frRunning  || false;
    window.__frPaused   = window.__frPaused   || false;
    window.__flmData    = window.__flmData    || null; // dati ricevuti dal GRN

    // ── BroadcastChannel verso GRN Manager ────────────────────────────────────
    let grnChannel = null;

    function initChannel() {
        try {
            grnChannel = new BroadcastChannel(CHANNEL_NAME);
            grnChannel.onmessage = function (ev) {
                const msg = ev.data;
                if (!msg || !msg.type) return;

                // GRN ci manda i dati FLM
                if (msg.type === 'FLM_DATA') {
                    window.__flmData = msg.rows || [];
                    console.log(`[GRN→TM] Ricevuti ${window.__flmData.length} record FLM aperti`);
                    showStatusBanner(`📦 ${window.__flmData.length} record FLM ricevuti dal GRN. Premi Avvia.`, '#17a2b8');
                }

                // GRN conferma ricezione chiusura FR
                if (msg.type === 'FR_DONE_ACK') {
                    console.log(`[GRN→TM] ACK chiusura FR ${msg.codice_fr} — ${msg.matched} riga/e aggiornate`);
                }
            };
            console.log('[TM] BroadcastChannel attivo su:', CHANNEL_NAME);
        } catch (e) {
            console.warn('[TM] BroadcastChannel non disponibile:', e.message);
        }
    }

    function notifyFrDone(codice_fr) {
        if (!grnChannel) return;
        grnChannel.postMessage({ type: 'FR_DONE', codice_fr: codice_fr });
    }

    function requestFlmData() {
        if (!grnChannel) {
            alert('BroadcastChannel non attivo. Verifica che il GRN Manager sia aperto in un\'altra tab.');
            return;
        }
        showStatusBanner('⏳ Richiesta dati FLM al GRN Manager...', '#6c757d');
        grnChannel.postMessage({ type: 'GET_FLM_DATA' });
        // Timeout se il GRN non risponde
        setTimeout(function () {
            if (!window.__flmData || window.__flmData.length === 0) {
                showStatusBanner('⚠️ Nessuna risposta dal GRN. Verifica che sia aperto e loggato.', '#dc3545');
            }
        }, 4000);
    }

    // ── Intercetta XHR per errori 500 ─────────────────────────────────────────
    (function () {
        const origOpen = XMLHttpRequest.prototype.open;
        const origSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function (method, url) {
            this._isTargetFailReps = method === 'PUT' && url.includes('/api/fail-reps');
            return origOpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function (body) {
            this.addEventListener('load', function () {
                if (this._isTargetFailReps && this.status === 500) {
                    window.__lastXhrError = { status: 500 };
                }
            });
            return origSend.apply(this, arguments);
        };
    })();

    // ── Banner di stato visivo ────────────────────────────────────────────────
    function showStatusBanner(text, color) {
        let banner = document.getElementById('__grn_banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = '__grn_banner';
            Object.assign(banner.style, {
                position: 'fixed', top: '0', left: '0', right: '0',
                zIndex: '99999', padding: '8px 16px', fontSize: '13px',
                fontFamily: 'Arial, sans-serif', fontWeight: 'bold',
                color: 'white', textAlign: 'center', transition: 'background .3s'
            });
            document.body.prepend(banner);
        }
        banner.style.background = color || '#333';
        banner.textContent = text;
    }

    // ── Pulsante nel menu utente ───────────────────────────────────────────────
    const addButtons = () => {
        if (document.getElementById('startCloseFrBtn')) return;

        // Pulsante principale Avvia/Pausa
        const btn = document.createElement('button');
        btn.id = 'startCloseFrBtn';
        btn.textContent = '⚙️ Avvia Chiusura FR (GRN)';
        Object.assign(btn.style, {
            width: '100%', textAlign: 'left', padding: '8px 16px',
            backgroundColor: '#dc3545', color: 'white', fontWeight: 'bold',
            border: 'none', cursor: 'pointer', fontSize: '14px',
            fontFamily: 'Arial, sans-serif', whiteSpace: 'nowrap',
            borderBottom: '1px solid rgba(255,255,255,.3)', boxSizing: 'border-box'
        });

        // Pulsante "Carica dati GRN"
        const btnLoad = document.createElement('button');
        btnLoad.id = 'loadGrnDataBtn';
        btnLoad.textContent = '📡 Carica dati dal GRN';
        Object.assign(btnLoad.style, {
            width: '100%', textAlign: 'left', padding: '8px 16px',
            backgroundColor: '#f59e0b', color: 'white', fontWeight: 'bold',
            border: 'none', cursor: 'pointer', fontSize: '14px',
            fontFamily: 'Arial, sans-serif', whiteSpace: 'nowrap',
            borderBottom: '3px solid white', boxSizing: 'border-box'
        });

        btnLoad.addEventListener('click', function (e) {
            e.preventDefault(); e.stopPropagation();
            requestFlmData();
        }, true);

        // Handler avvia/pausa
        const handlePress = async (event) => {
            event.preventDefault(); event.stopPropagation();

            const closeMenu = () => {
                const m = document.getElementById('account-menu');
                if (m) m.click();
            };

            if (window.__frRunning) {
                window.__frPaused = !window.__frPaused;
                localStorage.setItem('fr_paused', window.__frPaused ? '1' : '0');
                btn.textContent = window.__frPaused ? '⏸️ In Pausa — Riprendi' : '⏱️ In esecuzione — Pausa';
                btn.style.backgroundColor = window.__frPaused ? '#ffc107' : '#6c757d';
                setTimeout(closeMenu, 0);
                return;
            }

            // Controlla che ci siano dati
            if (!window.__flmData || window.__flmData.length === 0) {
                alert('Nessun dato FLM caricato.\nPrima premi "📡 Carica dati dal GRN" e assicurati che il GRN Manager sia aperto.');
                return;
            }

            // Resume?
            const savedIndex = parseInt(localStorage.getItem('grn_lastRowIndex') || '0');
            if (savedIndex > 0 && savedIndex < window.__flmData.length) {
                const lastFR = window.__flmData[savedIndex]?.CODICE_FR || '?';
                const resume = confirm(`Vuoi continuare dal FR ${lastFR} (riga ${savedIndex + 1} di ${window.__flmData.length})?\n\nOK = continua | Annulla = ricomincia da capo`);
                if (!resume) localStorage.removeItem('grn_lastRowIndex');
            }

            if (!confirm(`Avviare la procedura su ${window.__flmData.length} record FLM aperti?`)) {
                alert('Procedura annullata.');
                return;
            }

            window.__frRunning = true;
            window.__frPaused  = localStorage.getItem('fr_paused') === '1';
            localStorage.setItem('fr_was_running', '1');

            btn.disabled = false;
            btn.textContent = '⏱️ In esecuzione — Pausa';
            btn.style.backgroundColor = '#6c757d';
            setTimeout(closeMenu, 0);

            await mainAutomation();
        };

        btn.addEventListener('mousedown', handlePress, true);
        btn.addEventListener('click',     handlePress, true);

        // Inserimento nel menu
        const insertIntoMenu = () => {
            const menu = document.querySelector('ul.dropdown-menu[aria-labelledby="account-menu"]');
            if (!menu) return false;
            const logout = menu.querySelector('a#logout, button#logout');
            if (!logout || document.getElementById('startCloseFrBtn')) return false;
            const target = logout.closest('li') || logout;
            const li1 = document.createElement('li'); li1.appendChild(btnLoad);
            const li2 = document.createElement('li'); li2.appendChild(btn);
            menu.insertBefore(li1, target);
            menu.insertBefore(li2, target);
            console.log('[TM] Pulsanti GRN inseriti nel menu');
            return true;
        };

        if (!insertIntoMenu()) {
            const obs = new MutationObserver((_, o) => { if (insertIntoMenu()) o.disconnect(); });
            obs.observe(document.body, { childList: true, subtree: true });
        }
    };

    // ── Helpers pagina ────────────────────────────────────────────────────────
    const waitForElement = async (selector, timeout = 10000) => {
        const start = Date.now();
        return new Promise((resolve, reject) => {
            const iv = setInterval(() => {
                const el = document.querySelector(selector);
                if (el) { clearInterval(iv); resolve(el); }
                else if (Date.now() - start > timeout) { clearInterval(iv); reject(`Timeout: ${selector}`); }
            }, 500);
        });
    };

    const setAngularValue = (el, value) => {
        if (!el) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, value);
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const selectStatus = async (value) => {
        const select = await waitForElement('#field_frStatus');
        const option = [...select.options].find(o => o.text.includes(value));
        if (option) {
            select.value = option.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            await sleep(500);
            return true;
        }
        console.warn(`⚠️ Stato "${value}" non trovato`);
        return false;
    };

    const clickSave = async () => {
        const svg = await waitForElement('svg[data-icon="save"]');
        svg.closest('button')?.click();
        await sleep(500);
        const start = Date.now();
        while (Date.now() - start < 5000) {
            const err = [...document.querySelectorAll('*')]
                .find(el => el.textContent?.trim().toLowerCase().includes('internal server error'));
            if (err) {
                console.warn('❌ Errore visivo: Internal server error');
                const cancel = [...document.querySelectorAll('button')]
                    .find(b => b.textContent?.trim().toLowerCase().includes('annulla'));
                cancel?.click();
                window.__lastXhrError = { status: 500, visual: true };
                break;
            }
            await sleep(250);
        }
    };

    const fillAWBFields = () => {
        const fields = [
            ['#field_failEquiSala', 'A'],
            ['#field_failEquiScaffale', '1'],
            ['#field_failEquiPiano', 'A']
        ];
        fields.forEach(([sel, val]) => {
            const el = document.querySelector(sel);
            if (el) { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); }
        });
    };

    const checkAndThrowIfError = () => {
        if (window.__lastXhrError?.status === 500) {
            const msg = window.__lastXhrError.visual
                ? 'Errore 500 (banner rosso)'
                : 'Errore 500 dal server';
            throw new Error(msg);
        }
    };

    // ── Automazione principale ────────────────────────────────────────────────
    const mainAutomation = async () => {
        window.__frRunning = true;
        localStorage.setItem('fr_was_running', '1');
        const report = [];

        try {
            const data = window.__flmData;
            if (!data || !data.length) throw new Error('Nessun dato FLM disponibile');

            const savedIndex = parseInt(localStorage.getItem('grn_lastRowIndex') || '0');
            const startFrom  = savedIndex < data.length ? savedIndex : 0;

            showStatusBanner(`▶ Avvio da riga ${startFrom + 1} / ${data.length}`, '#28a745');

            for (let i = startFrom; i < data.length; i++) {

                // Pausa cooperativa
                while (window.__frPaused) { await sleep(400); }

                const row = data[i];
                const { CODICE_FR, NOTE, CONF_SERIAL, CONF_TMPN } = row;
                // Normalizza STATO_VLT: accetta sia 'OPEN' che 'Open' ecc.
                const STATO_VLT_RAW = row.STATO_VLT || '';
                const STATO_VLT_UP  = STATO_VLT_RAW.trim().toUpperCase();
                // Usa STATO_VLT_RAW per i match esatti del tool, STATO_VLT_UP per i nostri
                const STATO_VLT = STATO_VLT_RAW;

                if (!CODICE_FR) {
                    report.push({ CODICE_FR: '(vuoto)', STATO_FINALE: 'SKIP', NOTA: '', ERRORE: 'CODICE_FR mancante' });
                    localStorage.setItem('grn_lastRowIndex', i + 1);
                    continue;
                }

                const baseURL = `https://logistictoolvf.net.vodafone.it/#/fail-rep/${CODICE_FR}/edit`;
                showStatusBanner(`[${i + 1}/${data.length}] FR: ${CODICE_FR} — STATO_VLT: ${STATO_VLT_RAW || '—'}`, '#17a2b8');
                console.log(`🔄 [${i + 1}/${data.length}] STATO_VLT: ${STATO_VLT_RAW} → ${baseURL}`);

                window.__lastXhrError = null;
                window.location.href = baseURL;

                try {
                    await waitForElement('#field_note');

                    const logResult = (stato, err = '') => {
                        report.push({ CODICE_FR, STATO_FINALE: stato, NOTA: NOTE, ERRORE: err });
                    };

                    // ── Caso 1: Failed Material sent to Repairer ──────────────
                    if (STATO_VLT_UP === 'FAILED MATERIAL SENT TO REPAIRER') {
                        const isScrap = NOTE && NOTE.toUpperCase().includes('SCRAP');

                        if (isScrap) {
                            const ok = await selectStatus('Close for Scrap material');
                            if (!ok) throw new Error("Stato 'Close for Scrap material' non trovato");
                            const scrapBin  = await waitForElement('#field_scrapBin');
                            const scrapNote = await waitForElement('#field_scrapNote');
                            setAngularValue(scrapBin,  'Scrap');
                            setAngularValue(scrapNote, 'Non Riparabile');
                            try { await clickSave(); checkAndThrowIfError(); }
                            catch (e) { logResult('ERRORE', e.message); localStorage.setItem('grn_lastRowIndex', i + 1); continue; }
                            logResult('Close for Scrap material');
                        } else {
                            const ok = await selectStatus('Good Material Received');
                            if (!ok) throw new Error("Stato 'Good Material Received' non trovato");
                            const confSerial = await waitForElement('#newMaterialSerNo');
                            const confTMPN   = await waitForElement('#newMaterialTMPN');
                            const sala       = await waitForElement('#field_newsala');
                            const scaffale   = await waitForElement('#field_newscaffale');
                            const piano      = await waitForElement('#field_newpiano');
                            setAngularValue(confSerial, CONF_SERIAL);
                            setAngularValue(confTMPN,   CONF_TMPN);
                            setAngularValue(sala,       'A');
                            setAngularValue(scaffale,   '1');
                            setAngularValue(piano,      'A');
                            try { await clickSave(); checkAndThrowIfError(); }
                            catch (e) { logResult('ERRORE', e.message); localStorage.setItem('grn_lastRowIndex', i + 1); continue; }
                            logResult('Good Material Received');
                        }

                        // Notifica GRN → segna come Chiuso
                        notifyFrDone(CODICE_FR);
                        localStorage.setItem('grn_lastRowIndex', i + 1);
                        await sleep(1500);
                        continue;
                    }

                    // ── Caso 2: OPEN ──────────────────────────────────────────
                    if (STATO_VLT_UP === 'OPEN') {
                        const select = await waitForElement('#field_frStatus');
                        const hasOpen = [...select.options].some(o => o.text.includes('Open'));
                        if (hasOpen) {
                            const opt = [...select.options].find(o => o.text.includes('Open'));
                            select.value = opt.value;
                            select.dispatchEvent(new Event('change', { bubbles: true }));
                            await sleep(500);
                            const noteField = document.querySelector('#field_note');
                            if (noteField && NOTE) { noteField.value = NOTE; noteField.dispatchEvent(new Event('input', { bubbles: true })); }
                            try { await clickSave(); checkAndThrowIfError(); }
                            catch (e) { logResult('ERRORE', e.message); localStorage.setItem('grn_lastRowIndex', i + 1); continue; }
                            logResult('Open');
                            notifyFrDone(CODICE_FR);
                        } else {
                            logResult('Stato NON In Open');
                        }
                        localStorage.setItem('grn_lastRowIndex', i + 1);
                        await sleep(1500);
                        continue;
                    }

                    // ── Caso 3: Failure Report Sent → usa depot_origine (NOTE) ──
                    if (STATO_VLT_UP === 'FAILURE REPORT SENT') {
                        // NOTE contiene depot_origine (calcolato dal GRN)
                        const noteField = document.querySelector('#field_note');
                        if (noteField && NOTE) {
                            noteField.value = NOTE;
                            noteField.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                        try { await clickSave(); checkAndThrowIfError(); }
                        catch (e) { logResult('ERRORE', e.message); localStorage.setItem('grn_lastRowIndex', i + 1); continue; }
                        logResult('Failure Report Sent (depot_origine in NOTE)');
                        notifyFrDone(CODICE_FR);
                        localStorage.setItem('grn_lastRowIndex', i + 1);
                        await sleep(1500);
                        continue;
                    }

                    // ── Caso 4: flusso generale (NOTE con SCRAP o altro) ──────
                    if (NOTE || (STATO_VLT_UP.includes('FAILED MATERIAL SENT'))) {
                        await selectStatus('Failed Material Received and Verify');
                        fillAWBFields();
                        try { await clickSave(); checkAndThrowIfError(); }
                        catch (e) { logResult('ERRORE', e.message); localStorage.setItem('grn_lastRowIndex', i + 1); continue; }
                    }

                    await sleep(1500);
                    window.location.href = baseURL;
                    await waitForElement('#field_note');

                    if (NOTE?.toUpperCase().includes('SCRAP')) {
                        await selectStatus('Close for Scrap material');
                        const scrapBin  = await waitForElement('#field_scrapBin').catch(() => null);
                        const scrapNote = await waitForElement('#field_scrapNote').catch(() => null);
                        if (scrapBin)  setAngularValue(scrapBin,  'Scrap');
                        if (scrapNote) setAngularValue(scrapNote, 'Non Riparabile');
                        const noteField = document.querySelector('#field_note');
                        if (noteField && NOTE) { noteField.value = NOTE; noteField.dispatchEvent(new Event('input', { bubbles: true })); }
                        try { await clickSave(); checkAndThrowIfError(); }
                        catch (e) { logResult('ERRORE', e.message); localStorage.setItem('grn_lastRowIndex', i + 1); continue; }
                        logResult('Close for Scrap material');
                        notifyFrDone(CODICE_FR);
                    } else if (NOTE) {
                        await selectStatus('Pending Service Desk');
                        fillAWBFields();
                        const noteField = document.querySelector('#field_note');
                        if (noteField) { noteField.value = NOTE; noteField.dispatchEvent(new Event('input', { bubbles: true })); }
                        try { await clickSave(); checkAndThrowIfError(); }
                        catch (e) { logResult('ERRORE', e.message); localStorage.setItem('grn_lastRowIndex', i + 1); continue; }
                        logResult('Pending Service Desk');
                        notifyFrDone(CODICE_FR);
                    } else {
                        await selectStatus('Failure Report Sent');
                        try { await clickSave(); checkAndThrowIfError(); }
                        catch (e) { logResult('ERRORE', e.message); localStorage.setItem('grn_lastRowIndex', i + 1); continue; }
                        logResult('Failure Report Sent (note vuote)');
                        notifyFrDone(CODICE_FR);
                    }

                    localStorage.setItem('grn_lastRowIndex', i + 1);

                } catch (e) {
                    console.error('Errore processing FR:', e);
                    report.push({ CODICE_FR, STATO_FINALE: 'ERRORE', NOTA: NOTE, ERRORE: e.message });
                    localStorage.setItem('grn_lastRowIndex', i + 1);
                }

                await sleep(1500);
            } // end for

            // ── Report CSV finale ────────────────────────────────────────────
            const csvHeader = ['CODICE_FR', 'STATO_FINALE', 'NOTA', 'ERRORE'];
            const csvRows   = report.map(r => csvHeader.map(h => `"${(r[h] || '').replace(/"/g, '""')}"`).join(','));
            const csvContent = [csvHeader.join(','), ...csvRows].join('\n');
            GM_download({
                url: 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent),
                name: 'report_fr_grn_flm.csv',
                saveAs: true
            });

            showStatusBanner(`✅ Completato! ${report.length} FR elaborati.`, '#28a745');
            alert(`Procedura completata.\n${report.filter(r => r.STATO_FINALE !== 'ERRORE').length} successi, ${report.filter(r => r.STATO_FINALE === 'ERRORE').length} errori.\nReport scaricato.`);
            localStorage.removeItem('grn_lastRowIndex');
            window.__flmData = null; // svuota cache, al prossimo avvio si ricarica

        } finally {
            window.__frRunning = false;
            window.__frPaused  = false;
            localStorage.removeItem('fr_was_running');
            localStorage.removeItem('fr_paused');
            const b = document.getElementById('startCloseFrBtn');
            if (b) {
                b.textContent = '⚙️ Avvia Chiusura FR (GRN)';
                b.style.backgroundColor = '#dc3545';
                b.disabled = false;
            }
        }
    };

    // ── Init ──────────────────────────────────────────────────────────────────
    initChannel();
    addButtons();

})();
