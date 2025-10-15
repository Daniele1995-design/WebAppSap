// ==UserScript==
// @name         Estrazione Dati MOD GRN + Stampa Etichette 10x10 e 10x5
// @namespace    http://tampermonkey.net/
// @version      7.0
// @description  Esporta seriali + PN in CSV e aggiunge funzionalità di stampa etichette 10x10 e 10x5
// @match        http://172.18.20.20/GRN/*
// @match        http://172.18.20.20:8095/GRN/*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @connect      script.google.com
// ==/UserScript==

(function () {
    'use strict';

    function sleep(ms) {
        return new Promise(res => setTimeout(res, ms));
    }

    async function waitForSerials(timeout = 10000) {
        let elapsed = 0, interval = 500;
        while (document.querySelectorAll("div[id^='dropdown-'] ul > li").length === 0 && elapsed < timeout) {
            await sleep(interval);
            elapsed += interval;
        }
    }

function toCSV(rows) {
    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    return 'sep=;\n' + rows.map(r => r.map(escape).join(';')).join('\n');
}

    function findDivTextByLabel(root, label) {
        const divs = root.querySelectorAll('div');
        for (const d of divs) {
            const t = (d.innerText || '').replace(/\s+/g, ' ').trim();
            if (t.startsWith(label)) {
                return t.slice(label.length).trim();
            }
        }
        return '';
    }

    function getDataFromLi(li) {
        const dropdown = li.querySelector("div[id^='dropdown-']");
        if (dropdown) dropdown.style.display = 'block';

        const articoloOriginale = findDivTextByLabel(li, 'Articolo:');
        const articolo = (articoloOriginale.split(' ')[0] || '').trim();
        const codiceBP = (articoloOriginale.split(' ')[1] ? articoloOriginale.split(' ')[1].replace(/[()]/g, '') : '').trim();

        const descrizione = findDivTextByLabel(li, 'Descrizione:');

        let riferimento = '';
        const rifDiv = Array.from(li.querySelectorAll('div')).find(d => /Riferimento:/i.test(d.innerText || ''));
        if (rifDiv) riferimento = (rifDiv.innerText || '').replace(/^.*Riferimento:\s*/i, '').trim();

        let riferimentoOrdine = '';
        const divRifOrd = Array.from(li.querySelectorAll('div')).find(d => d.querySelector('button[onclick*="modificaRiferimentoCliente"]'));
        if (divRifOrd) {
            const button = divRifOrd.querySelector('button');
            if (button && button.nextSibling) {
                riferimentoOrdine = (button.nextSibling.textContent || '').replace(/\s+/g,'').trim();
            }
        }

        let pn = '';
        const pnSpan = li.querySelector('span.pn-info');
        if (pnSpan && /\[PN:/i.test(pnSpan.textContent)) {
            pn = pnSpan.textContent.replace(/\[PN:\s*/i, '').replace(/\].*$/, '').trim();
        }

        const serialRows = li.querySelectorAll("div[id^='dropdown-'] ul > li");
        const serials = [];

        serialRows.forEach(sr => {
            let quantita = '', seriale = '', stato = '';
            Array.from(sr.querySelectorAll('strong')).forEach(str => {
                const label = (str.textContent || '').toLowerCase();
                const parentText = (str.parentElement.innerText || '').replace(/\s+/g, ' ').trim();
                if (label.includes('quantità')) quantita = parentText.replace(/.*Quantità:\s*/i, '').trim();
                if (label.includes('seriale')) seriale = parentText.replace(/.*Seriale:\s*/i, '').trim();
                if (label.includes('stato logico')) stato = parentText.replace(/.*Stato Logico:\s*/i, '').trim();
            });

            if (!seriale) {
                const txt = (sr.innerText || '').trim();
                const m = txt.match(/([0-9]{6,})/);
                if (m) seriale = m[1];
            }

            if (seriale) {
                serials.push({ quantita, seriale, stato });
            }
        });

        return {
            pn, articolo, codiceBP, descrizione, riferimento, riferimentoOrdine,
            riferimentoPulito: riferimento ? riferimento.trim().substring(0, 4) : '',
            serials
        };
    }

    function estraiRighe() {
        const out = [];
        out.push([
            'Part Number', 'Articolo', 'Codice BP', 'Descrizione',
            'Riferimento', 'Riferimento Ordine', 'Quantità', 'Seriale', 'Stato Logico', 'Ubicazione'
        ]);

        const righe = document.querySelectorAll('li.item-content.item-input.item-input-outline');
        let totalSeriali = 0;

        righe.forEach(li => {
            const data = getDataFromLi(li);

            data.serials.forEach(seriale => {
                out.push([
                    data.pn ? `="${data.pn}"`  : '',
                    data.articolo ? `="${data.articolo}"`  : '',
                    data.codiceBP ? `="${data.codiceBP}"`  : '',
                    data.descrizione,
                    data.riferimentoPulito,
                    data.riferimentoOrdine,
                    seriale.quantita ? `="${seriale.quantita}"`  : '',
                    `="${seriale.seriale}"` ,
                    seriale.stato || '',
                    '' // Colonna Ubicazione vuota
                ]);
                totalSeriali++;
            });
        });

        return { rows: out, total: totalSeriali };
    }

async function downloadCSV() {
    await waitForSerials();
    const { rows, total } = estraiRighe();

    if (total === 0) {
        alert('Nessun seriale trovato!');
        return;
    }

    // 🔹 Prende i valori dal select e dal campo input
    const commessa = document.querySelector('#commessaTestata')?.value || 'SenzaCommessa';
    const riferimento = document.querySelector('#Riferimento')?.value?.trim() || 'SenzaRif';
    const fileName = `${commessa} DDT Nr. ${riferimento}.csv`;

    const csv = toCSV(rows);

    // 🔹 Salva il file in locale
    GM_download({
        url: "data:text/csv;charset=utf-8," + encodeURIComponent(csv),
        name: fileName,
        saveAs: true
    });

    // 🔹 Codifica CSV per invio a Google Apps Script
    const base64Content = btoa(unescape(encodeURIComponent(csv)));
    const scriptUrl = "https://script.google.com/macros/s/AKfycbzr0H4pihMD_EKLyzEEBRPLitb7K5ZNlr3mm5hyVj0KHryrPb9_3-Y7Zuy7wT9sNY_jTA/exec";

    const payload = {
        fileName: fileName,
        content: base64Content
    };

    // 🔹 Invia a Google Drive con GM_xmlhttpRequest (ignora CORS)
    GM_xmlhttpRequest({
        method: "POST",
        url: scriptUrl,
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify(payload),
        onload: function (response) {
            try {
                const data = JSON.parse(response.responseText);
                if (data.success) {
                    console.log("✅ File caricato su Drive:", data.url);
                    // alert rimosso per non disturbare
                } else {
                    console.error("❌ Errore Drive:", data.error);
                    // alert rimosso per non disturbare
                }
            } catch (err) {
                // ⚠️ Ignora errori di parsing, il file è comunque caricato
                console.log("⚠️ Risposta non JSON, upload presumibilmente completato.");
            }
        },
        onerror: function (err) {
            // ⚠️ Ignora errori di rete, il file è comunque caricato
            console.log("⚠️ Errore rete verso Apps Script ignorato:", err);
        }
    });

    alert(`Estrazione completata! Seriali esportati: ${total}`);
}

    function printAllLabels() {
        const righe = document.querySelectorAll('li.item-content.item-input.item-input-outline');
        if (righe.length === 0) {
            alert('Nessuna riga trovata!');
            return;
        }

        const allLabels = [];
        righe.forEach(li => {
            const data = getDataFromLi(li);
            data.serials.forEach(s => {
                allLabels.push({
                    codiceBP: data.codiceBP || '',
                    articolo: data.articolo || '',
                    po: data.riferimentoOrdine || data.riferimento || '',
                    pn: data.pn || '',
                    seriale: s.seriale || ''
                });
            });
        });

        if (allLabels.length === 0) {
            alert('Nessun seriale trovato per la stampa delle etichette!');
            return;
        }

        printLabels(allLabels);
    }

function printLabels(labels) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert('Bloccato popup: permetti finestre popup per poter stampare.');
        return;
    }

    const payload = encodeURIComponent(JSON.stringify(labels));

    printWindow.document.write(`
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Etichette 10x10</title>
<style>
@page {
    size: 100mm 100mm;
    margin: 0;
}
html, body {
    margin: 0;
    padding: 0;
    font-family: Arial, Helvetica, sans-serif;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
.labels {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
}
.label {
    width: 100mm;
    height: 100mm;
    box-sizing: border-box;
    padding: 4mm;
    border: none;
    display: block;
    page-break-after: always;
}
.container {
    display: flex;
    height: 100%;
}
.left {
    flex: 1;
    padding-right: 4px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
}
.top-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
}
.codicebp {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 1px;
}
.small {
    font-size: 12px;
    color: #222;
}
.line {
    border-top: 1px solid #000;
    margin: 4px 0;
    width: 100%;
}
.barcode {
    width: 100%;
    height: 8mm;
}
.barcode-text {
    text-align: center;
    font-size: 12px;
    margin-top: 2px;
}
.right {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
}
.qr {
    width: 13mm;
    height: 13mm;
}
.vert {
    writing-mode: vertical-lr;
    transform: rotate(0deg);
    font-size: 8px;
    margin-left: 2px;
    white-space: nowrap;
}
.qr-container {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
}
.field-block {
    display: flex;
    flex-direction: column;
    margin-top: 2px;
}
.potext {
    font-size: 12px;
    color: #333;
}
.pn-block {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 4px;
}
.pn-block .qr-container {
    margin-top: -25px;
}
.serial-block {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 4px;
}
.serial-block .small {
    font-size: 12px;
    font-weight: bold;
}
.center-left {
    display: flex;
    flex-direction: column;
    justify-content: center;
}
.logo {
    max-height: 15mm;
    max-width: 30mm;
    margin-bottom: 2mm;
}
</style>
</head>
<body>
<div id="labels" class="labels"></div>

<script>var QRCode;!function(){function a(a){this.mode=c.MODE_8BIT_BYTE,this.data=a,this.parsedData=[];for(var b=[],d=0,e=this.data.length;e>d;d++){var f=this.data.charCodeAt(d);f>65536?(b[0]=240|(1835008&f)>>>18,b[1]=128|(258048&f)>>>12,b[2]=128|(4032&f)>>>6,b[3]=128|63&f):f>2048?(b[0]=224|(61440&f)>>>12,b[1]=128|(4032&f)>>>6,b[2]=128|63&f):f>128?(b[0]=192|(1984&f)>>>6,b[1]=128|63&f):b[0]=f,this.parsedData=this.parsedData.concat(b)}this.parsedData.length!=this.data.length&&(this.parsedData.unshift(191),this.parsedData.unshift(187),this.parsedData.unshift(239))}function b(a,b){this.typeNumber=a,this.errorCorrectLevel=b,this.modules=null,this.moduleCount=0,this.dataCache=null,this.dataList=[]}function i(a,b){if(void 0==a.length)throw new Error(a.length+"/"+b);for(var c=0;c<a.length&&0==a[c];)c++;this.num=new Array(a.length-c+b);for(var d=0;d<a.length-c;d++)this.num[d]=a[d+c]}function j(a,b){this.totalCount=a,this.dataCount=b}function k(){this.buffer=[],this.length=0}function m(){return"undefined"!=typeof CanvasRenderingContext2D}function n(){var a=!1,b=navigator.userAgent;return/android/i.test(b)&&(a=!0,aMat=b.toString().match(/android ([0-9]\.[0-9])/i),aMat&&aMat[1]&&(a=parseFloat(aMat[1]))),a}function r(a,b){for(var c=1,e=s(a),f=0,g=l.length;g>=f;f++){var h=0;switch(b){case d.L:h=l[f][0];break;case d.M:h=l[f][1];break;case d.Q:h=l[f][2];break;case d.H:h=l[f][3]}if(h>=e)break;c++}if(c>l.length)throw new Error("Too long data");return c}function s(a){var b=encodeURI(a).toString().replace(/\%[0-9a-fA-F]{2}/g,"a");return b.length+(b.length!=a?3:0)}a.prototype={getLength:function(){return this.parsedData.length},write:function(a){for(var b=0,c=this.parsedData.length;c>b;b++)a.put(this.parsedData[b],8)}},b.prototype={addData:function(b){var c=new a(b);this.dataList.push(c),this.dataCache=null},isDark:function(a,b){if(0>a||this.moduleCount<=a||0>b||this.moduleCount<=b)throw new Error(a+","+b);return this.modules[a][b]},getModuleCount:function(){return this.moduleCount},make:function(){this.makeImpl(!1,this.getBestMaskPattern())},makeImpl:function(a,c){this.moduleCount=4*this.typeNumber+17,this.modules=new Array(this.moduleCount);for(var d=0;d<this.moduleCount;d++){this.modules[d]=new Array(this.moduleCount);for(var e=0;e<this.moduleCount;e++)this.modules[d][e]=null}this.setupPositionProbePattern(0,0),this.setupPositionProbePattern(this.moduleCount-7,0),this.setupPositionProbePattern(0,this.moduleCount-7),this.setupPositionAdjustPattern(),this.setupTimingPattern(),this.setupTypeInfo(a,c),this.typeNumber>=7&&this.setupTypeNumber(a),null==this.dataCache&&(this.dataCache=b.createData(this.typeNumber,this.errorCorrectLevel,this.dataList)),this.mapData(this.dataCache,c)},setupPositionProbePattern:function(a,b){for(var c=-1;7>=c;c++)if(!(-1>=a+c||this.moduleCount<=a+c))for(var d=-1;7>=d;d++)-1>=b+d||this.moduleCount<=b+d||(this.modules[a+c][b+d]=c>=0&&6>=c&&(0==d||6==d)||d>=0&&6>=d&&(0==c||6==c)||c>=2&&4>=c&&d>=2&&4>=d?!0:!1)},getBestMaskPattern:function(){for(var a=0,b=0,c=0;8>c;c++){this.makeImpl(!0,c);var d=f.getLostPoint(this);(0==c||a>d)&&(a=d,b=c)}return b},createMovieClip:function(a,b,c){var d=a.createEmptyMovieClip(b,c),e=1;this.make();for(var f=0;f<this.modules.length;f++)for(var g=f*e,h=0;h<this.modules[f].length;h++){var i=h*e,j=this.modules[f][h];j&&(d.beginFill(0,100),d.moveTo(i,g),d.lineTo(i+e,g),d.lineTo(i+e,g+e),d.lineTo(i,g+e),d.endFill())}return d},setupTimingPattern:function(){for(var a=8;a<this.moduleCount-8;a++)null==this.modules[a][6]&&(this.modules[a][6]=0==a%2);for(var b=8;b<this.moduleCount-8;b++)null==this.modules[6][b]&&(this.modules[6][b]=0==b%2)},setupPositionAdjustPattern:function(){for(var a=f.getPatternPosition(this.typeNumber),b=0;b<a.length;b++)for(var c=0;c<a.length;c++){var d=a[b],e=a[c];if(null==this.modules[d][e])for(var g=-2;2>=g;g++)for(var h=-2;2>=h;h++)this.modules[d+g][e+h]=-2==g||2==g||-2==h||2==h||0==g&&0==h?!0:!1}},setupTypeNumber:function(a){for(var b=f.getBCHTypeNumber(this.typeNumber),c=0;18>c;c++){var d=!a&&1==(1&b>>c);this.modules[Math.floor(c/3)][c%3+this.moduleCount-8-3]=d}for(var c=0;18>c;c++){var d=!a&&1==(1&b>>c);this.modules[c%3+this.moduleCount-8-3][Math.floor(c/3)]=d}},setupTypeInfo:function(a,b){for(var c=this.errorCorrectLevel<<3|b,d=f.getBCHTypeInfo(c),e=0;15>e;e++){var g=!a&&1==(1&d>>e);6>e?this.modules[e][8]=g:8>e?this.modules[e+1][8]=g:this.modules[this.moduleCount-15+e][8]=g}for(var e=0;15>e;e++){var g=!a&&1==(1&d>>e);8>e?this.modules[8][this.moduleCount-e-1]=g:9>e?this.modules[8][15-e-1+1]=g:this.modules[8][15-e-1]=g}this.modules[this.moduleCount-8][8]=!a},mapData:function(a,b){for(var c=-1,d=this.moduleCount-1,e=7,g=0,h=this.moduleCount-1;h>0;h-=2)for(6==h&&h--;;){for(var i=0;2>i;i++)if(null==this.modules[d][h-i]){var j=!1;g<a.length&&(j=1==(1&a[g]>>>e));var k=f.getMask(b,d,h-i);k&&(j=!j),this.modules[d][h-i]=j,e--,-1==e&&(g++,e=7)}if(d+=c,0>d||this.moduleCount<=d){d-=c,c=-c;break}}}},b.PAD0=236,b.PAD1=17,b.createData=function(a,c,d){for(var e=j.getRSBlocks(a,c),g=new k,h=0;h<d.length;h++){var i=d[h];g.put(i.mode,4),g.put(i.getLength(),f.getLengthInBits(i.mode,a)),i.write(g)}for(var l=0,h=0;h<e.length;h++)l+=e[h].dataCount;if(g.getLengthInBits()>8*l)throw new Error("code length overflow. ("+g.getLengthInBits()+">"+8*l+")");for(g.getLengthInBits()+4<=8*l&&g.put(0,4);0!=g.getLengthInBits()%8;)g.putBit(!1);for(;;){if(g.getLengthInBits()>=8*l)break;if(g.put(b.PAD0,8),g.getLengthInBits()>=8*l)break;g.put(b.PAD1,8)}return b.createBytes(g,e)},b.createBytes=function(a,b){for(var c=0,d=0,e=0,g=new Array(b.length),h=new Array(b.length),j=0;j<b.length;j++){var k=b[j].dataCount,l=b[j].totalCount-k;d=Math.max(d,k),e=Math.max(e,l),g[j]=new Array(k);for(var m=0;m<g[j].length;m++)g[j][m]=255&a.buffer[m+c];c+=k;var n=f.getErrorCorrectPolynomial(l),o=new i(g[j],n.getLength()-1),p=o.mod(n);h[j]=new Array(n.getLength()-1);for(var m=0;m<h[j].length;m++){var q=m+p.getLength()-h[j].length;h[j][m]=q>=0?p.get(q):0}}for(var r=0,m=0;m<b.length;m++)r+=b[m].totalCount;for(var s=new Array(r),t=0,m=0;d>m;m++)for(var j=0;j<b.length;j++)m<g[j].length&&(s[t++]=g[j][m]);for(var m=0;e>m;m++)for(var j=0;j<b.length;j++)m<h[j].length&&(s[t++]=h[j][m]);return s};for(var c={MODE_NUMBER:1,MODE_ALPHA_NUM:2,MODE_8BIT_BYTE:4,MODE_KANJI:8},d={L:1,M:0,Q:3,H:2},e={PATTERN000:0,PATTERN001:1,PATTERN010:2,PATTERN011:3,PATTERN100:4,PATTERN101:5,PATTERN110:6,PATTERN111:7},f={PATTERN_POSITION_TABLE:[[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],[6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],[6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170]],G15:1335,G18:7973,G15_MASK:21522,getBCHTypeInfo:function(a){for(var b=a<<10;f.getBCHDigit(b)-f.getBCHDigit(f.G15)>=0;)b^=f.G15<<f.getBCHDigit(b)-f.getBCHDigit(f.G15);return(a<<10|b)^f.G15_MASK},getBCHTypeNumber:function(a){for(var b=a<<12;f.getBCHDigit(b)-f.getBCHDigit(f.G18)>=0;)b^=f.G18<<f.getBCHDigit(b)-f.getBCHDigit(f.G18);return a<<12|b},getBCHDigit:function(a){for(var b=0;0!=a;)b++,a>>>=1;return b},getPatternPosition:function(a){return f.PATTERN_POSITION_TABLE[a-1]},getMask:function(a,b,c){switch(a){case e.PATTERN000:return 0==(b+c)%2;case e.PATTERN001:return 0==b%2;case e.PATTERN010:return 0==c%3;case e.PATTERN011:return 0==(b+c)%3;case e.PATTERN100:return 0==(Math.floor(b/2)+Math.floor(c/3))%2;case e.PATTERN101:return 0==b*c%2+b*c%3;case e.PATTERN110:return 0==(b*c%2+b*c%3)%2;case e.PATTERN111:return 0==(b*c%3+(b+c)%2)%2;default:throw new Error("bad maskPattern:"+a)}},getErrorCorrectPolynomial:function(a){for(var b=new i([1],0),c=0;a>c;c++)b=b.multiply(new i([1,g.gexp(c)],0));return b},getLengthInBits:function(a,b){if(b>=1&&10>b)switch(a){case c.MODE_NUMBER:return 10;case c.MODE_ALPHA_NUM:return 9;case c.MODE_8BIT_BYTE:return 8;case c.MODE_KANJI:return 8;default:throw new Error("mode:"+a)}else if(27>b)switch(a){case c.MODE_NUMBER:return 12;case c.MODE_ALPHA_NUM:return 11;case c.MODE_8BIT_BYTE:return 16;case c.MODE_KANJI:return 10;default:throw new Error("mode:"+a)}else{if(!(41>b))throw new Error("type:"+b);switch(a){case c.MODE_NUMBER:return 14;case c.MODE_ALPHA_NUM:return 13;case c.MODE_8BIT_BYTE:return 16;case c.MODE_KANJI:return 12;default:throw new Error("mode:"+a)}}},getLostPoint:function(a){for(var b=a.getModuleCount(),c=0,d=0;b>d;d++)for(var e=0;b>e;e++){for(var f=0,g=a.isDark(d,e),h=-1;1>=h;h++)if(!(0>d+h||d+h>=b))for(var i=-1;1>=i;i++)0>e+i||e+i>=b||(0!=h||0!=i)&&g==a.isDark(d+h,e+i)&&f++;f>5&&(c+=3+f-5)}for(var d=0;b-1>d;d++)for(var e=0;b-1>e;e++){var j=0;a.isDark(d,e)&&j++,a.isDark(d+1,e)&&j++,a.isDark(d,e+1)&&j++,a.isDark(d+1,e+1)&&j++,(0==j||4==j)&&(c+=3)}for(var d=0;b>d;d++)for(var e=0;b-6>e;e++)a.isDark(d,e)&&!a.isDark(d,e+1)&&a.isDark(d,e+2)&&a.isDark(d,e+3)&&a.isDark(d,e+4)&&!a.isDark(d,e+5)&&a.isDark(d,e+6)&&(c+=40);for(var e=0;b>e;e++)for(var d=0;b-6>d;d++)a.isDark(d,e)&&!a.isDark(d+1,e)&&a.isDark(d+2,e)&&a.isDark(d+3,e)&&a.isDark(d+4,e)&&!a.isDark(d+5,e)&&a.isDark(d+6,e)&&(c+=40);for(var k=0,e=0;b>e;e++)for(var d=0;b>d;d++)a.isDark(d,e)&&k++;var l=Math.abs(100*k/b/b-50)/5;return c+=10*l}},g={glog:function(a){if(1>a)throw new Error("glog("+a+")");return g.LOG_TABLE[a]},gexp:function(a){for(;0>a;)a+=255;for(;a>=256;)a-=255;return g.EXP_TABLE[a]},EXP_TABLE:new Array(256),LOG_TABLE:new Array(256)},h=0;8>h;h++)g.EXP_TABLE[h]=1<<h;for(var h=8;256>h;h++)g.EXP_TABLE[h]=g.EXP_TABLE[h-4]^g.EXP_TABLE[h-5]^g.EXP_TABLE[h-6]^g.EXP_TABLE[h-8];for(var h=0;255>h;h++)g.LOG_TABLE[g.EXP_TABLE[h]]=h;i.prototype={get:function(a){return this.num[a]},getLength:function(){return this.num.length},multiply:function(a){for(var b=new Array(this.getLength()+a.getLength()-1),c=0;c<this.getLength();c++)for(var d=0;d<a.getLength();d++)b[c+d]^=g.gexp(g.glog(this.get(c))+g.glog(a.get(d)));return new i(b,0)},mod:function(a){if(this.getLength()-a.getLength()<0)return this;for(var b=g.glog(this.get(0))-g.glog(a.get(0)),c=new Array(this.getLength()),d=0;d<this.getLength();d++)c[d]=this.get(d);for(var d=0;d<a.getLength();d++)c[d]^=g.gexp(g.glog(a.get(d))+b);return new i(c,0).mod(a)}},j.RS_BLOCK_TABLE=[[1,26,19],[1,26,16],[1,26,13],[1,26,9],[1,44,34],[1,44,28],[1,44,22],[1,44,16],[1,70,55],[1,70,44],[2,35,17],[2,35,13],[1,100,80],[2,50,32],[2,50,24],[4,25,9],[1,134,108],[2,67,43],[2,33,15,2,34,16],[2,33,11,2,34,12],[2,86,68],[4,43,27],[4,43,19],[4,43,15],[2,98,78],[4,49,31],[2,32,14,4,33,15],[4,39,13,1,40,14],[2,121,97],[2,60,38,2,61,39],[4,40,18,2,41,19],[4,40,14,2,41,15],[2,146,116],[3,58,36,2,59,37],[4,36,16,4,37,17],[4,36,12,4,37,13],[2,86,68,2,87,69],[4,69,43,1,70,44],[6,43,19,2,44,20],[6,43,15,2,44,16],[4,101,81],[1,80,50,4,81,51],[4,50,22,4,51,23],[3,36,12,8,37,13],[2,116,92,2,117,93],[6,58,36,2,59,37],[4,46,20,6,47,21],[7,42,14,4,43,15],[4,133,107],[8,59,37,1,60,38],[8,44,20,4,45,21],[12,33,11,4,34,12],[3,145,115,1,146,116],[4,64,40,5,65,41],[11,36,16,5,37,17],[11,36,12,5,37,13],[5,109,87,1,110,88],[5,65,41,5,66,42],[5,54,24,7,55,25],[11,36,12],[5,122,98,1,123,99],[7,73,45,3,74,46],[15,43,19,2,44,20],[3,45,15,13,46,16],[1,135,107,5,136,108],[10,74,46,1,75,47],[1,50,22,15,51,23],[2,42,14,17,43,15],[5,150,120,1,151,121],[9,69,43,4,70,44],[17,50,22,1,51,23],[2,42,14,19,43,15],[3,141,113,4,142,114],[3,70,44,11,71,45],[17,47,21,4,48,22],[9,39,13,16,40,14],[3,135,107,5,136,108],[3,67,41,13,68,42],[15,54,24,5,55,25],[15,43,15,10,44,16],[4,144,116,4,145,117],[17,68,42],[17,50,22,6,51,23],[19,46,16,6,47,17],[2,139,111,7,140,112],[17,74,46],[7,54,24,16,55,25],[34,37,13],[4,151,121,5,152,122],[4,75,47,14,76,48],[11,54,24,14,55,25],[16,45,15,14,46,16],[6,147,117,4,148,118],[6,73,45,14,74,46],[11,54,24,16,55,25],[30,46,16,2,47,17],[8,132,106,4,133,107],[8,75,47,13,76,48],[7,54,24,22,55,25],[22,45,15,13,46,16],[10,142,114,2,143,115],[19,74,46,4,75,47],[28,50,22,6,51,23],[33,46,16,4,47,17],[8,152,122,4,153,123],[22,73,45,3,74,46],[8,53,23,26,54,24],[12,45,15,28,46,16],[3,147,117,10,148,118],[3,73,45,23,74,46],[4,54,24,31,55,25],[11,45,15,31,46,16],[7,146,116,7,147,117],[21,73,45,7,74,46],[1,53,23,37,54,24],[19,45,15,26,46,16],[5,145,115,10,146,116],[19,75,47,10,76,48],[15,54,24,25,55,25],[23,45,15,25,46,16],[13,145,115,3,146,116],[2,74,46,29,75,47],[42,54,24,1,55,25],[23,45,15,28,46,16],[17,145,115],[10,74,46,23,75,47],[10,54,24,35,55,25],[19,45,15,35,46,16],[17,145,115,1,146,116],[14,74,46,21,75,47],[29,54,24,19,55,25],[11,45,15,46,46,16],[13,145,115,6,146,116],[14,74,46,23,75,47],[44,54,24,7,55,25],[59,46,16,1,47,17],[12,151,121,7,152,122],[12,75,47,26,76,48],[39,54,24,14,55,25],[22,45,15,41,46,16],[6,151,121,14,152,122],[6,75,47,34,76,48],[46,54,24,10,55,25],[2,45,15,64,46,16],[17,152,122,4,153,123],[29,74,46,14,75,47],[49,54,24,10,55,25],[24,45,15,46,46,16],[4,152,122,18,153,123],[13,74,46,32,75,47],[48,54,24,14,55,25],[42,45,15,32,46,16],[20,147,117,4,148,118],[40,75,47,7,76,48],[43,54,24,22,55,25],[10,45,15,67,46,16],[19,148,118,6,149,119],[18,75,47,31,76,48],[34,54,24,34,55,25],[20,45,15,61,46,16]],j.getRSBlocks=function(a,b){var c=j.getRsBlockTable(a,b);if(void 0==c)throw new Error("bad rs block @ typeNumber:"+a+"/errorCorrectLevel:"+b);for(var d=c.length/3,e=[],f=0;d>f;f++)for(var g=c[3*f+0],h=c[3*f+1],i=c[3*f+2],k=0;g>k;k++)e.push(new j(h,i));return e},j.getRsBlockTable=function(a,b){switch(b){case d.L:return j.RS_BLOCK_TABLE[4*(a-1)+0];case d.M:return j.RS_BLOCK_TABLE[4*(a-1)+1];case d.Q:return j.RS_BLOCK_TABLE[4*(a-1)+2];case d.H:return j.RS_BLOCK_TABLE[4*(a-1)+3];default:return void 0}},k.prototype={get:function(a){var b=Math.floor(a/8);return 1==(1&this.buffer[b]>>>7-a%8)},put:function(a,b){for(var c=0;b>c;c++)this.putBit(1==(1&a>>>b-c-1))},getLengthInBits:function(){return this.length},putBit:function(a){var b=Math.floor(this.length/8);this.buffer.length<=b&&this.buffer.push(0),a&&(this.buffer[b]|=128>>>this.length%8),this.length++}};var l=[[17,14,11,7],[32,26,20,14],[53,42,32,24],[78,62,46,34],[106,84,60,44],[134,106,74,58],[154,122,86,64],[192,152,108,84],[230,180,130,98],[271,213,151,119],[321,251,177,137],[367,287,203,155],[425,331,241,177],[458,362,258,194],[520,412,292,220],[586,450,322,250],[644,504,364,280],[718,560,394,310],[792,624,442,338],[858,666,482,382],[929,711,509,403],[1003,779,565,439],[1091,857,611,461],[1171,911,661,511],[1273,997,715,535],[1367,1059,751,593],[1465,1125,805,625],[1528,1190,868,658],[1628,1264,908,698],[1732,1370,982,742],[1840,1452,1030,790],[1952,1538,1112,842],[2068,1628,1168,898],[2188,1722,1228,958],[2303,1809,1283,983],[2431,1911,1351,1051],[2563,1989,1423,1093],[2699,2099,1499,1139],[2809,2213,1579,1219],[2953,2331,1663,1273]],o=function(){var a=function(a,b){this._el=a,this._htOption=b};return a.prototype.draw=function(a){function g(a,b){var c=document.createElementNS("http://www.w3.org/2000/svg",a);for(var d in b)b.hasOwnProperty(d)&&c.setAttribute(d,b[d]);return c}var b=this._htOption,c=this._el,d=a.getModuleCount();Math.floor(b.width/d),Math.floor(b.height/d),this.clear();var h=g("svg",{viewBox:"0 0 "+String(d)+" "+String(d),width:"100%",height:"100%",fill:b.colorLight});h.setAttributeNS("http://www.w3.org/2000/xmlns/","xmlns:xlink","http://www.w3.org/1999/xlink"),c.appendChild(h),h.appendChild(g("rect",{fill:b.colorDark,width:"1",height:"1",id:"template"}));for(var i=0;d>i;i++)for(var j=0;d>j;j++)if(a.isDark(i,j)){var k=g("use",{x:String(i),y:String(j)});k.setAttributeNS("http://www.w3.org/1999/xlink","href","#template"),h.appendChild(k)}},a.prototype.clear=function(){for(;this._el.hasChildNodes();)this._el.removeChild(this._el.lastChild)},a}(),p="svg"===document.documentElement.tagName.toLowerCase(),q=p?o:m()?function(){function a(){this._elImage.src=this._elCanvas.toDataURL("image/png"),this._elImage.style.display="block",this._elCanvas.style.display="none"}function d(a,b){var c=this;if(c._fFail=b,c._fSuccess=a,null===c._bSupportDataURI){var d=document.createElement("img"),e=function(){c._bSupportDataURI=!1,c._fFail&&_fFail.call(c)},f=function(){c._bSupportDataURI=!0,c._fSuccess&&c._fSuccess.call(c)};return d.onabort=e,d.onerror=e,d.onload=f,d.src="data:image/gif;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==",void 0}c._bSupportDataURI===!0&&c._fSuccess?c._fSuccess.call(c):c._bSupportDataURI===!1&&c._fFail&&c._fFail.call(c)}if(this._android&&this._android<=2.1){var b=1/window.devicePixelRatio,c=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(a,d,e,f,g,h,i,j){if("nodeName"in a&&/img/i.test(a.nodeName))for(var l=arguments.length-1;l>=1;l--)arguments[l]=arguments[l]*b;else"undefined"==typeof j&&(arguments[1]*=b,arguments[2]*=b,arguments[3]*=b,arguments[4]*=b);c.apply(this,arguments)}}var e=function(a,b){this._bIsPainted=!1,this._android=n(),this._htOption=b,this._elCanvas=document.createElement("canvas"),this._elCanvas.width=b.width,this._elCanvas.height=b.height,a.appendChild(this._elCanvas),this._el=a,this._oContext=this._elCanvas.getContext("2d"),this._bIsPainted=!1,this._elImage=document.createElement("img"),this._elImage.style.display="none",this._el.appendChild(this._elImage),this._bSupportDataURI=null};return e.prototype.draw=function(a){var b=this._elImage,c=this._oContext,d=this._htOption,e=a.getModuleCount(),f=d.width/e,g=d.height/e,h=Math.round(f),i=Math.round(g);b.style.display="none",this.clear();for(var j=0;e>j;j++)for(var k=0;e>k;k++){var l=a.isDark(j,k),m=k*f,n=j*g;c.strokeStyle=l?d.colorDark:d.colorLight,c.lineWidth=1,c.fillStyle=l?d.colorDark:d.colorLight,c.fillRect(m,n,f,g),c.strokeRect(Math.floor(m)+.5,Math.floor(n)+.5,h,i),c.strokeRect(Math.ceil(m)-.5,Math.ceil(n)-.5,h,i)}this._bIsPainted=!0},e.prototype.makeImage=function(){this._bIsPainted&&d.call(this,a)},e.prototype.isPainted=function(){return this._bIsPainted},e.prototype.clear=function(){this._oContext.clearRect(0,0,this._elCanvas.width,this._elCanvas.height),this._bIsPainted=!1},e.prototype.round=function(a){return a?Math.floor(1e3*a)/1e3:a},e}():function(){var a=function(a,b){this._el=a,this._htOption=b};return a.prototype.draw=function(a){for(var b=this._htOption,c=this._el,d=a.getModuleCount(),e=Math.floor(b.width/d),f=Math.floor(b.height/d),g=['<table style="border:0;border-collapse:collapse;">'],h=0;d>h;h++){g.push("<tr>");for(var i=0;d>i;i++)g.push('<td style="border:0;border-collapse:collapse;padding:0;margin:0;width:'+e+"px;height:"+f+"px;background-color:"+(a.isDark(h,i)?b.colorDark:b.colorLight)+';"></td>');g.push("</tr>")}g.push("</table>"),c.innerHTML=g.join("");var j=c.childNodes[0],k=(b.width-j.offsetWidth)/2,l=(b.height-j.offsetHeight)/2;k>0&&l>0&&(j.style.margin=l+"px "+k+"px")},a.prototype.clear=function(){this._el.innerHTML=""},a}();QRCode=function(a,b){if(this._htOption={width:256,height:256,typeNumber:4,colorDark:"#000000",colorLight:"#ffffff",correctLevel:d.H},"string"==typeof b&&(b={text:b}),b)for(var c in b)this._htOption[c]=b[c];"string"==typeof a&&(a=document.getElementById(a)),this._android=n(),this._el=a,this._oQRCode=null,this._oDrawing=new q(this._el,this._htOption),this._htOption.text&&this.makeCode(this._htOption.text)},QRCode.prototype.makeCode=function(a){this._oQRCode=new b(r(a,this._htOption.correctLevel),this._htOption.correctLevel),this._oQRCode.addData(a),this._oQRCode.make(),this._el.title=a,this._oDrawing.draw(this._oQRCode),this.makeImage()},QRCode.prototype.makeImage=function(){"function"==typeof this._oDrawing.makeImage&&(!this._android||this._android>=3)&&this._oDrawing.makeImage()},QRCode.prototype.clear=function(){this._oDrawing.clear()},QRCode.CorrectLevel=d}();
</script>
<script src="https://cdn.jsdelivr.net/gh/Daniele1995-design/WebAppSap@main/JsBarcode.all.min.js"></script>




<script>
(function(){
    const labels = JSON.parse(decodeURIComponent("${payload}"));
    const container = document.getElementById('labels');

    function generateLabels() {
        labels.forEach((lab, idx) => {
            const label = document.createElement('div');
            label.className = 'label';

            const containerInner = document.createElement('div');
            containerInner.className = 'container';

            const left = document.createElement('div');
            left.className = 'left';

            // LOGO in alto a sinistra
            const logo = document.createElement('img');
            logo.src = "https://raw.githubusercontent.com/Daniele1995-design/WebAppSap/main/logo%20ats.jpg";
            logo.className = "logo";
            left.appendChild(logo);

            // Codice BP + QR
            const topRow = document.createElement('div');
            topRow.className = 'top-row';

            const leftTop = document.createElement('div');
            leftTop.className = 'center-left';
            const codLabel = document.createElement('div');
            codLabel.className = 'small';
            codLabel.innerText = 'Codice BP';
            const codVal = document.createElement('div');
            codVal.className = 'codicebp';
            codVal.innerText = lab.codiceBP || '';
            leftTop.appendChild(codLabel);
            leftTop.appendChild(codVal);

            const rightTop = document.createElement('div');
            rightTop.style.display = 'flex';
            rightTop.style.flexDirection = 'column';
            rightTop.style.alignItems = 'center';

            // Contenitore per QR Codice BP + testo
            const qrCodContainer = document.createElement('div');
            qrCodContainer.className = 'qr-container';
            const qrCod = document.createElement('div');
            qrCod.id = 'qr-codice-' + idx;
            qrCod.className = 'qr';
            const vertCod = document.createElement('div');
            vertCod.className = 'vert';
            vertCod.innerText = 'COD. BP';
            qrCodContainer.appendChild(qrCod);
            qrCodContainer.appendChild(vertCod);
            rightTop.appendChild(qrCodContainer);

            topRow.appendChild(leftTop);
            topRow.appendChild(rightTop);
            left.appendChild(topRow);

            const line1 = document.createElement('div');
            line1.className = 'line';
            left.appendChild(line1);

            // Articolo con barcode e testo sotto
            const artDiv = document.createElement('div');
            artDiv.style.display = 'flex';
            artDiv.style.flexDirection = 'column';
            const artLabel = document.createElement('div');
            artLabel.className = 'small';
            artLabel.innerText = 'Articolo';
            const svgBarcode = document.createElementNS('http://www.w3.org/2000/svg','svg');
            svgBarcode.setAttribute('id','barcode-art-' + idx);
            svgBarcode.classList.add('barcode');
            const barcodeText = document.createElement('div');
            barcodeText.id = 'barcode-text-' + idx;
            barcodeText.className = 'barcode-text';
            artDiv.appendChild(artLabel);
            artDiv.appendChild(svgBarcode);
            artDiv.appendChild(barcodeText);
            left.appendChild(artDiv);

            const line2 = document.createElement('div');
            line2.className = 'line';
            left.appendChild(line2);

            // Po Nr° + PN
            const poDiv = document.createElement('div');
            poDiv.className = 'field-block';
            const poLab = document.createElement('div');
            poLab.className = 'small';
            poLab.innerHTML = '<b>Po Nr°</b><div style="font-weight:700;font-size: 16px;">'+(lab.po||'')+'</div>';
            poDiv.appendChild(poLab);
            left.appendChild(poDiv);
            poDiv.style.marginBottom = '20px';

            const pnBlock = document.createElement('div');
            pnBlock.className = 'pn-block';
            const pnLeft = document.createElement('div');
            pnLeft.className = 'small';
            pnLeft.innerHTML = '<b>Part Number</b><div style="font-weight:700;font-size: 16px;">'+(lab.pn||'')+'</div>';
            const pnRight = document.createElement('div');
            pnRight.style.display='flex';
            pnRight.style.flexDirection='column';
            pnRight.style.alignItems='center';

            // Contenitore per QR TPN + testo
            const qrPnContainer = document.createElement('div');
            qrPnContainer.className = 'qr-container';
            const qrPn = document.createElement('div');
            qrPn.id = 'qr-pn-' + idx;
            qrPn.className = 'qr';
            const vertP = document.createElement('div');
            vertP.className = 'vert';
            vertP.innerText = 'TPN';
            qrPnContainer.appendChild(qrPn);
            qrPnContainer.appendChild(vertP);
            pnRight.appendChild(qrPnContainer);

            pnBlock.appendChild(pnLeft);
            pnBlock.appendChild(pnRight);
            left.appendChild(pnBlock);

            const line3 = document.createElement('div');
            line3.className = 'line';
            left.appendChild(line3);

            // Seriale
            const serialBlock = document.createElement('div');
            serialBlock.className = 'serial-block';
            const sLeft = document.createElement('div');
            sLeft.className = 'small';
            sLeft.innerHTML = '<b>Serial Number</b><div style="font-weight:700;font-size: 16px;">'+(lab.seriale||'')+'</div>';
            const sRight = document.createElement('div');
            sRight.style.display='flex';
            sRight.style.flexDirection='column';
            sRight.style.alignItems='center';

            // Contenitore per QR Seriale + testo
            const qrSerialContainer = document.createElement('div');
            qrSerialContainer.className = 'qr-container';
            const qrSerial = document.createElement('div');
            qrSerial.id = 'qr-serial-' + idx;
            qrSerial.className = 'qr';
            const vertS = document.createElement('div');
            vertS.className = 'vert';
            vertS.innerText = 'SN';
            qrSerialContainer.appendChild(qrSerial);
            qrSerialContainer.appendChild(vertS);
            sRight.appendChild(qrSerialContainer);

            serialBlock.appendChild(sLeft);
            serialBlock.appendChild(sRight);
            left.appendChild(serialBlock);

            containerInner.appendChild(left);
            label.appendChild(containerInner);
            container.appendChild(label);

            // Genera QR e barcode
            try {
                new QRCode(qrCod, {
                    text: lab.codiceBP || '',
                    width: 39,
                    height: 39,
                    correctLevel: QRCode.CorrectLevel.H
                });
                new QRCode(qrPn, {
                    text: lab.pn || '',
                    width: 39,
                    height: 39,
                    correctLevel: QRCode.CorrectLevel.H
                });
                new QRCode(qrSerial, {
                    text: lab.seriale || '',
                    width: 39,
                    height: 39,
                    correctLevel: QRCode.CorrectLevel.H
                });
                JsBarcode(svgBarcode, (lab.articolo||''), {
                    format: "CODE128",
                    width: 1.2,
                    height: 25,
                    displayValue: false,
                    margin: 0
                });
                document.getElementById('barcode-text-'+idx).innerText = lab.articolo || '';
            } catch(e) {
                console.error('Errore nella generazione dei codici:', e);
            }
        });

        // Avvia la stampa dopo che tutto è stato generato
        setTimeout(() => {
            window.print();
        }, 500);
    }

    // Chiudi la finestra dopo la stampa
    window.onafterprint = function() {
        setTimeout(() => {
            if (!window.closed) {
                window.close();
            }
        }, 100);
    };

    // Genera le etichette quando il DOM è pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', generateLabels);
    } else {
        generateLabels();
    }
})();
</script>
</body>
</html>
    `);

    // Chiudi la finestra se la stampa non parte
    printWindow.document.close();
    setTimeout(() => {
        if (printWindow && !printWindow.closed) {
            printWindow.close();
        }
    }, 3000000); // Chiudi dopo 30 minuti se ancora aperta
}
function printLabels10x5(labels) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert('Bloccato popup: permetti finestre popup per poter stampare.');
        return;
    }

    const payload = encodeURIComponent(JSON.stringify(labels));

    printWindow.document.write(`
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Etichette 10x5</title>
<style>
@page {
    size: 100mm 50mm;
    margin: 0;
}
body {
    margin: 0;
    padding: 0;
    font-family: Arial, sans-serif;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
.label {
    width: 100mm;
    height: 50mm;
    padding: 3mm;
    box-sizing: border-box;
    position: relative;
    overflow: hidden;
    page-break-after: always;
}
.header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 1px solid #000;
    padding-bottom: 1mm;
    margin-bottom: 1mm;
    height: 15mm;
}
.logo {
    height: 10mm;
    max-width: 40mm;
    margin-top: 0;
}
.bp-section {
    display: flex;
    align-items: center;
    gap: 1mm;
}
.bp-text {
    text-align: center;
    line-height: 1.0;
    margin-right: 4mm;
}
.bp-label {
    font-size: 15px;
    font-weight: bold;
}
.bp-value {
    font-size: 12px;
    font-weight: bold;
}
.qr-bp-container {
    display: flex;
    align-items: center;
    gap: 1mm;
}
.qr-bp {
    width: 9mm;
    height: 9mm;
}
.bp-vert {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font-size: 6px;
    font-weight: bold;
    height: 12mm;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: 1mm;
}
.barcode-container {
    text-align: center;
    margin: 1mm 0;
    height: 15mm;
    display: flex;
    flex-direction: column;
    justify-content: center;
    border-bottom: 1px solid #000;
    padding-bottom: 1mm;
    margin-bottom: 1mm;
}
.barcode {
    height: 10mm;
    max-width: 100%;
}
.barcode-text {
    font-size: 9px;
    margin-top: 1px;
    text-align: left;
    font-weight: bold;
    letter-spacing: 0.5px;
}
.details {
    margin-top: 1mm;
    font-size: 9px;
    line-height: 1.3;
}
.detail-row {
    display: flex;
    margin-bottom: 1mm;
    align-items: center;
    position: relative;
}
.detail-label {
    font-weight: bold;
    margin-right: 1mm;
    white-space: nowrap;
    width: 20mm;
}
.detail-value {
    flex-grow: 1;
    text-align: left;
    word-break: break-all;
    font-size: 11px;
}
.qr-serial-container {
    position: absolute;
    right: 0;
    top: -5%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    gap: 1mm;
    height: 20px;
}
.qr-serial {
    width: 9mm;
    height: 9mm;
}
.sn-vert {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font-size: 6px;
    height: 9mm;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    margin-left: 1mm;
    line-height: 1;
    transform-origin: center;
}
</style>
</head>
<body>
<div id="labels"></div>

<script>var QRCode;!function(){function a(a){this.mode=c.MODE_8BIT_BYTE,this.data=a,this.parsedData=[];for(var b=[],d=0,e=this.data.length;e>d;d++){var f=this.data.charCodeAt(d);f>65536?(b[0]=240|(1835008&f)>>>18,b[1]=128|(258048&f)>>>12,b[2]=128|(4032&f)>>>6,b[3]=128|63&f):f>2048?(b[0]=224|(61440&f)>>>12,b[1]=128|(4032&f)>>>6,b[2]=128|63&f):f>128?(b[0]=192|(1984&f)>>>6,b[1]=128|63&f):b[0]=f,this.parsedData=this.parsedData.concat(b)}this.parsedData.length!=this.data.length&&(this.parsedData.unshift(191),this.parsedData.unshift(187),this.parsedData.unshift(239))}function b(a,b){this.typeNumber=a,this.errorCorrectLevel=b,this.modules=null,this.moduleCount=0,this.dataCache=null,this.dataList=[]}function i(a,b){if(void 0==a.length)throw new Error(a.length+"/"+b);for(var c=0;c<a.length&&0==a[c];)c++;this.num=new Array(a.length-c+b);for(var d=0;d<a.length-c;d++)this.num[d]=a[d+c]}function j(a,b){this.totalCount=a,this.dataCount=b}function k(){this.buffer=[],this.length=0}function m(){return"undefined"!=typeof CanvasRenderingContext2D}function n(){var a=!1,b=navigator.userAgent;return/android/i.test(b)&&(a=!0,aMat=b.toString().match(/android ([0-9]\.[0-9])/i),aMat&&aMat[1]&&(a=parseFloat(aMat[1]))),a}function r(a,b){for(var c=1,e=s(a),f=0,g=l.length;g>=f;f++){var h=0;switch(b){case d.L:h=l[f][0];break;case d.M:h=l[f][1];break;case d.Q:h=l[f][2];break;case d.H:h=l[f][3]}if(h>=e)break;c++}if(c>l.length)throw new Error("Too long data");return c}function s(a){var b=encodeURI(a).toString().replace(/\%[0-9a-fA-F]{2}/g,"a");return b.length+(b.length!=a?3:0)}a.prototype={getLength:function(){return this.parsedData.length},write:function(a){for(var b=0,c=this.parsedData.length;c>b;b++)a.put(this.parsedData[b],8)}},b.prototype={addData:function(b){var c=new a(b);this.dataList.push(c),this.dataCache=null},isDark:function(a,b){if(0>a||this.moduleCount<=a||0>b||this.moduleCount<=b)throw new Error(a+","+b);return this.modules[a][b]},getModuleCount:function(){return this.moduleCount},make:function(){this.makeImpl(!1,this.getBestMaskPattern())},makeImpl:function(a,c){this.moduleCount=4*this.typeNumber+17,this.modules=new Array(this.moduleCount);for(var d=0;d<this.moduleCount;d++){this.modules[d]=new Array(this.moduleCount);for(var e=0;e<this.moduleCount;e++)this.modules[d][e]=null}this.setupPositionProbePattern(0,0),this.setupPositionProbePattern(this.moduleCount-7,0),this.setupPositionProbePattern(0,this.moduleCount-7),this.setupPositionAdjustPattern(),this.setupTimingPattern(),this.setupTypeInfo(a,c),this.typeNumber>=7&&this.setupTypeNumber(a),null==this.dataCache&&(this.dataCache=b.createData(this.typeNumber,this.errorCorrectLevel,this.dataList)),this.mapData(this.dataCache,c)},setupPositionProbePattern:function(a,b){for(var c=-1;7>=c;c++)if(!(-1>=a+c||this.moduleCount<=a+c))for(var d=-1;7>=d;d++)-1>=b+d||this.moduleCount<=b+d||(this.modules[a+c][b+d]=c>=0&&6>=c&&(0==d||6==d)||d>=0&&6>=d&&(0==c||6==c)||c>=2&&4>=c&&d>=2&&4>=d?!0:!1)},getBestMaskPattern:function(){for(var a=0,b=0,c=0;8>c;c++){this.makeImpl(!0,c);var d=f.getLostPoint(this);(0==c||a>d)&&(a=d,b=c)}return b},createMovieClip:function(a,b,c){var d=a.createEmptyMovieClip(b,c),e=1;this.make();for(var f=0;f<this.modules.length;f++)for(var g=f*e,h=0;h<this.modules[f].length;h++){var i=h*e,j=this.modules[f][h];j&&(d.beginFill(0,100),d.moveTo(i,g),d.lineTo(i+e,g),d.lineTo(i+e,g+e),d.lineTo(i,g+e),d.endFill())}return d},setupTimingPattern:function(){for(var a=8;a<this.moduleCount-8;a++)null==this.modules[a][6]&&(this.modules[a][6]=0==a%2);for(var b=8;b<this.moduleCount-8;b++)null==this.modules[6][b]&&(this.modules[6][b]=0==b%2)},setupPositionAdjustPattern:function(){for(var a=f.getPatternPosition(this.typeNumber),b=0;b<a.length;b++)for(var c=0;c<a.length;c++){var d=a[b],e=a[c];if(null==this.modules[d][e])for(var g=-2;2>=g;g++)for(var h=-2;2>=h;h++)this.modules[d+g][e+h]=-2==g||2==g||-2==h||2==h||0==g&&0==h?!0:!1}},setupTypeNumber:function(a){for(var b=f.getBCHTypeNumber(this.typeNumber),c=0;18>c;c++){var d=!a&&1==(1&b>>c);this.modules[Math.floor(c/3)][c%3+this.moduleCount-8-3]=d}for(var c=0;18>c;c++){var d=!a&&1==(1&b>>c);this.modules[c%3+this.moduleCount-8-3][Math.floor(c/3)]=d}},setupTypeInfo:function(a,b){for(var c=this.errorCorrectLevel<<3|b,d=f.getBCHTypeInfo(c),e=0;15>e;e++){var g=!a&&1==(1&d>>e);6>e?this.modules[e][8]=g:8>e?this.modules[e+1][8]=g:this.modules[this.moduleCount-15+e][8]=g}for(var e=0;15>e;e++){var g=!a&&1==(1&d>>e);8>e?this.modules[8][this.moduleCount-e-1]=g:9>e?this.modules[8][15-e-1+1]=g:this.modules[8][15-e-1]=g}this.modules[this.moduleCount-8][8]=!a},mapData:function(a,b){for(var c=-1,d=this.moduleCount-1,e=7,g=0,h=this.moduleCount-1;h>0;h-=2)for(6==h&&h--;;){for(var i=0;2>i;i++)if(null==this.modules[d][h-i]){var j=!1;g<a.length&&(j=1==(1&a[g]>>>e));var k=f.getMask(b,d,h-i);k&&(j=!j),this.modules[d][h-i]=j,e--,-1==e&&(g++,e=7)}if(d+=c,0>d||this.moduleCount<=d){d-=c,c=-c;break}}}},b.PAD0=236,b.PAD1=17,b.createData=function(a,c,d){for(var e=j.getRSBlocks(a,c),g=new k,h=0;h<d.length;h++){var i=d[h];g.put(i.mode,4),g.put(i.getLength(),f.getLengthInBits(i.mode,a)),i.write(g)}for(var l=0,h=0;h<e.length;h++)l+=e[h].dataCount;if(g.getLengthInBits()>8*l)throw new Error("code length overflow. ("+g.getLengthInBits()+">"+8*l+")");for(g.getLengthInBits()+4<=8*l&&g.put(0,4);0!=g.getLengthInBits()%8;)g.putBit(!1);for(;;){if(g.getLengthInBits()>=8*l)break;if(g.put(b.PAD0,8),g.getLengthInBits()>=8*l)break;g.put(b.PAD1,8)}return b.createBytes(g,e)},b.createBytes=function(a,b){for(var c=0,d=0,e=0,g=new Array(b.length),h=new Array(b.length),j=0;j<b.length;j++){var k=b[j].dataCount,l=b[j].totalCount-k;d=Math.max(d,k),e=Math.max(e,l),g[j]=new Array(k);for(var m=0;m<g[j].length;m++)g[j][m]=255&a.buffer[m+c];c+=k;var n=f.getErrorCorrectPolynomial(l),o=new i(g[j],n.getLength()-1),p=o.mod(n);h[j]=new Array(n.getLength()-1);for(var m=0;m<h[j].length;m++){var q=m+p.getLength()-h[j].length;h[j][m]=q>=0?p.get(q):0}}for(var r=0,m=0;m<b.length;m++)r+=b[m].totalCount;for(var s=new Array(r),t=0,m=0;d>m;m++)for(var j=0;j<b.length;j++)m<g[j].length&&(s[t++]=g[j][m]);for(var m=0;e>m;m++)for(var j=0;j<b.length;j++)m<h[j].length&&(s[t++]=h[j][m]);return s};for(var c={MODE_NUMBER:1,MODE_ALPHA_NUM:2,MODE_8BIT_BYTE:4,MODE_KANJI:8},d={L:1,M:0,Q:3,H:2},e={PATTERN000:0,PATTERN001:1,PATTERN010:2,PATTERN011:3,PATTERN100:4,PATTERN101:5,PATTERN110:6,PATTERN111:7},f={PATTERN_POSITION_TABLE:[[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],[6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],[6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170]],G15:1335,G18:7973,G15_MASK:21522,getBCHTypeInfo:function(a){for(var b=a<<10;f.getBCHDigit(b)-f.getBCHDigit(f.G15)>=0;)b^=f.G15<<f.getBCHDigit(b)-f.getBCHDigit(f.G15);return(a<<10|b)^f.G15_MASK},getBCHTypeNumber:function(a){for(var b=a<<12;f.getBCHDigit(b)-f.getBCHDigit(f.G18)>=0;)b^=f.G18<<f.getBCHDigit(b)-f.getBCHDigit(f.G18);return a<<12|b},getBCHDigit:function(a){for(var b=0;0!=a;)b++,a>>>=1;return b},getPatternPosition:function(a){return f.PATTERN_POSITION_TABLE[a-1]},getMask:function(a,b,c){switch(a){case e.PATTERN000:return 0==(b+c)%2;case e.PATTERN001:return 0==b%2;case e.PATTERN010:return 0==c%3;case e.PATTERN011:return 0==(b+c)%3;case e.PATTERN100:return 0==(Math.floor(b/2)+Math.floor(c/3))%2;case e.PATTERN101:return 0==b*c%2+b*c%3;case e.PATTERN110:return 0==(b*c%2+b*c%3)%2;case e.PATTERN111:return 0==(b*c%3+(b+c)%2)%2;default:throw new Error("bad maskPattern:"+a)}},getErrorCorrectPolynomial:function(a){for(var b=new i([1],0),c=0;a>c;c++)b=b.multiply(new i([1,g.gexp(c)],0));return b},getLengthInBits:function(a,b){if(b>=1&&10>b)switch(a){case c.MODE_NUMBER:return 10;case c.MODE_ALPHA_NUM:return 9;case c.MODE_8BIT_BYTE:return 8;case c.MODE_KANJI:return 8;default:throw new Error("mode:"+a)}else if(27>b)switch(a){case c.MODE_NUMBER:return 12;case c.MODE_ALPHA_NUM:return 11;case c.MODE_8BIT_BYTE:return 16;case c.MODE_KANJI:return 10;default:throw new Error("mode:"+a)}else{if(!(41>b))throw new Error("type:"+b);switch(a){case c.MODE_NUMBER:return 14;case c.MODE_ALPHA_NUM:return 13;case c.MODE_8BIT_BYTE:return 16;case c.MODE_KANJI:return 12;default:throw new Error("mode:"+a)}}},getLostPoint:function(a){for(var b=a.getModuleCount(),c=0,d=0;b>d;d++)for(var e=0;b>e;e++){for(var f=0,g=a.isDark(d,e),h=-1;1>=h;h++)if(!(0>d+h||d+h>=b))for(var i=-1;1>=i;i++)0>e+i||e+i>=b||(0!=h||0!=i)&&g==a.isDark(d+h,e+i)&&f++;f>5&&(c+=3+f-5)}for(var d=0;b-1>d;d++)for(var e=0;b-1>e;e++){var j=0;a.isDark(d,e)&&j++,a.isDark(d+1,e)&&j++,a.isDark(d,e+1)&&j++,a.isDark(d+1,e+1)&&j++,(0==j||4==j)&&(c+=3)}for(var d=0;b>d;d++)for(var e=0;b-6>e;e++)a.isDark(d,e)&&!a.isDark(d,e+1)&&a.isDark(d,e+2)&&a.isDark(d,e+3)&&a.isDark(d,e+4)&&!a.isDark(d,e+5)&&a.isDark(d,e+6)&&(c+=40);for(var e=0;b>e;e++)for(var d=0;b-6>d;d++)a.isDark(d,e)&&!a.isDark(d+1,e)&&a.isDark(d+2,e)&&a.isDark(d+3,e)&&a.isDark(d+4,e)&&!a.isDark(d+5,e)&&a.isDark(d+6,e)&&(c+=40);for(var k=0,e=0;b>e;e++)for(var d=0;b>d;d++)a.isDark(d,e)&&k++;var l=Math.abs(100*k/b/b-50)/5;return c+=10*l}},g={glog:function(a){if(1>a)throw new Error("glog("+a+")");return g.LOG_TABLE[a]},gexp:function(a){for(;0>a;)a+=255;for(;a>=256;)a-=255;return g.EXP_TABLE[a]},EXP_TABLE:new Array(256),LOG_TABLE:new Array(256)},h=0;8>h;h++)g.EXP_TABLE[h]=1<<h;for(var h=8;256>h;h++)g.EXP_TABLE[h]=g.EXP_TABLE[h-4]^g.EXP_TABLE[h-5]^g.EXP_TABLE[h-6]^g.EXP_TABLE[h-8];for(var h=0;255>h;h++)g.LOG_TABLE[g.EXP_TABLE[h]]=h;i.prototype={get:function(a){return this.num[a]},getLength:function(){return this.num.length},multiply:function(a){for(var b=new Array(this.getLength()+a.getLength()-1),c=0;c<this.getLength();c++)for(var d=0;d<a.getLength();d++)b[c+d]^=g.gexp(g.glog(this.get(c))+g.glog(a.get(d)));return new i(b,0)},mod:function(a){if(this.getLength()-a.getLength()<0)return this;for(var b=g.glog(this.get(0))-g.glog(a.get(0)),c=new Array(this.getLength()),d=0;d<this.getLength();d++)c[d]=this.get(d);for(var d=0;d<a.getLength();d++)c[d]^=g.gexp(g.glog(a.get(d))+b);return new i(c,0).mod(a)}},j.RS_BLOCK_TABLE=[[1,26,19],[1,26,16],[1,26,13],[1,26,9],[1,44,34],[1,44,28],[1,44,22],[1,44,16],[1,70,55],[1,70,44],[2,35,17],[2,35,13],[1,100,80],[2,50,32],[2,50,24],[4,25,9],[1,134,108],[2,67,43],[2,33,15,2,34,16],[2,33,11,2,34,12],[2,86,68],[4,43,27],[4,43,19],[4,43,15],[2,98,78],[4,49,31],[2,32,14,4,33,15],[4,39,13,1,40,14],[2,121,97],[2,60,38,2,61,39],[4,40,18,2,41,19],[4,40,14,2,41,15],[2,146,116],[3,58,36,2,59,37],[4,36,16,4,37,17],[4,36,12,4,37,13],[2,86,68,2,87,69],[4,69,43,1,70,44],[6,43,19,2,44,20],[6,43,15,2,44,16],[4,101,81],[1,80,50,4,81,51],[4,50,22,4,51,23],[3,36,12,8,37,13],[2,116,92,2,117,93],[6,58,36,2,59,37],[4,46,20,6,47,21],[7,42,14,4,43,15],[4,133,107],[8,59,37,1,60,38],[8,44,20,4,45,21],[12,33,11,4,34,12],[3,145,115,1,146,116],[4,64,40,5,65,41],[11,36,16,5,37,17],[11,36,12,5,37,13],[5,109,87,1,110,88],[5,65,41,5,66,42],[5,54,24,7,55,25],[11,36,12],[5,122,98,1,123,99],[7,73,45,3,74,46],[15,43,19,2,44,20],[3,45,15,13,46,16],[1,135,107,5,136,108],[10,74,46,1,75,47],[1,50,22,15,51,23],[2,42,14,17,43,15],[5,150,120,1,151,121],[9,69,43,4,70,44],[17,50,22,1,51,23],[2,42,14,19,43,15],[3,141,113,4,142,114],[3,70,44,11,71,45],[17,47,21,4,48,22],[9,39,13,16,40,14],[3,135,107,5,136,108],[3,67,41,13,68,42],[15,54,24,5,55,25],[15,43,15,10,44,16],[4,144,116,4,145,117],[17,68,42],[17,50,22,6,51,23],[19,46,16,6,47,17],[2,139,111,7,140,112],[17,74,46],[7,54,24,16,55,25],[34,37,13],[4,151,121,5,152,122],[4,75,47,14,76,48],[11,54,24,14,55,25],[16,45,15,14,46,16],[6,147,117,4,148,118],[6,73,45,14,74,46],[11,54,24,16,55,25],[30,46,16,2,47,17],[8,132,106,4,133,107],[8,75,47,13,76,48],[7,54,24,22,55,25],[22,45,15,13,46,16],[10,142,114,2,143,115],[19,74,46,4,75,47],[28,50,22,6,51,23],[33,46,16,4,47,17],[8,152,122,4,153,123],[22,73,45,3,74,46],[8,53,23,26,54,24],[12,45,15,28,46,16],[3,147,117,10,148,118],[3,73,45,23,74,46],[4,54,24,31,55,25],[11,45,15,31,46,16],[7,146,116,7,147,117],[21,73,45,7,74,46],[1,53,23,37,54,24],[19,45,15,26,46,16],[5,145,115,10,146,116],[19,75,47,10,76,48],[15,54,24,25,55,25],[23,45,15,25,46,16],[13,145,115,3,146,116],[2,74,46,29,75,47],[42,54,24,1,55,25],[23,45,15,28,46,16],[17,145,115],[10,74,46,23,75,47],[10,54,24,35,55,25],[19,45,15,35,46,16],[17,145,115,1,146,116],[14,74,46,21,75,47],[29,54,24,19,55,25],[11,45,15,46,46,16],[13,145,115,6,146,116],[14,74,46,23,75,47],[44,54,24,7,55,25],[59,46,16,1,47,17],[12,151,121,7,152,122],[12,75,47,26,76,48],[39,54,24,14,55,25],[22,45,15,41,46,16],[6,151,121,14,152,122],[6,75,47,34,76,48],[46,54,24,10,55,25],[2,45,15,64,46,16],[17,152,122,4,153,123],[29,74,46,14,75,47],[49,54,24,10,55,25],[24,45,15,46,46,16],[4,152,122,18,153,123],[13,74,46,32,75,47],[48,54,24,14,55,25],[42,45,15,32,46,16],[20,147,117,4,148,118],[40,75,47,7,76,48],[43,54,24,22,55,25],[10,45,15,67,46,16],[19,148,118,6,149,119],[18,75,47,31,76,48],[34,54,24,34,55,25],[20,45,15,61,46,16]],j.getRSBlocks=function(a,b){var c=j.getRsBlockTable(a,b);if(void 0==c)throw new Error("bad rs block @ typeNumber:"+a+"/errorCorrectLevel:"+b);for(var d=c.length/3,e=[],f=0;d>f;f++)for(var g=c[3*f+0],h=c[3*f+1],i=c[3*f+2],k=0;g>k;k++)e.push(new j(h,i));return e},j.getRsBlockTable=function(a,b){switch(b){case d.L:return j.RS_BLOCK_TABLE[4*(a-1)+0];case d.M:return j.RS_BLOCK_TABLE[4*(a-1)+1];case d.Q:return j.RS_BLOCK_TABLE[4*(a-1)+2];case d.H:return j.RS_BLOCK_TABLE[4*(a-1)+3];default:return void 0}},k.prototype={get:function(a){var b=Math.floor(a/8);return 1==(1&this.buffer[b]>>>7-a%8)},put:function(a,b){for(var c=0;b>c;c++)this.putBit(1==(1&a>>>b-c-1))},getLengthInBits:function(){return this.length},putBit:function(a){var b=Math.floor(this.length/8);this.buffer.length<=b&&this.buffer.push(0),a&&(this.buffer[b]|=128>>>this.length%8),this.length++}};var l=[[17,14,11,7],[32,26,20,14],[53,42,32,24],[78,62,46,34],[106,84,60,44],[134,106,74,58],[154,122,86,64],[192,152,108,84],[230,180,130,98],[271,213,151,119],[321,251,177,137],[367,287,203,155],[425,331,241,177],[458,362,258,194],[520,412,292,220],[586,450,322,250],[644,504,364,280],[718,560,394,310],[792,624,442,338],[858,666,482,382],[929,711,509,403],[1003,779,565,439],[1091,857,611,461],[1171,911,661,511],[1273,997,715,535],[1367,1059,751,593],[1465,1125,805,625],[1528,1190,868,658],[1628,1264,908,698],[1732,1370,982,742],[1840,1452,1030,790],[1952,1538,1112,842],[2068,1628,1168,898],[2188,1722,1228,958],[2303,1809,1283,983],[2431,1911,1351,1051],[2563,1989,1423,1093],[2699,2099,1499,1139],[2809,2213,1579,1219],[2953,2331,1663,1273]],o=function(){var a=function(a,b){this._el=a,this._htOption=b};return a.prototype.draw=function(a){function g(a,b){var c=document.createElementNS("http://www.w3.org/2000/svg",a);for(var d in b)b.hasOwnProperty(d)&&c.setAttribute(d,b[d]);return c}var b=this._htOption,c=this._el,d=a.getModuleCount();Math.floor(b.width/d),Math.floor(b.height/d),this.clear();var h=g("svg",{viewBox:"0 0 "+String(d)+" "+String(d),width:"100%",height:"100%",fill:b.colorLight});h.setAttributeNS("http://www.w3.org/2000/xmlns/","xmlns:xlink","http://www.w3.org/1999/xlink"),c.appendChild(h),h.appendChild(g("rect",{fill:b.colorDark,width:"1",height:"1",id:"template"}));for(var i=0;d>i;i++)for(var j=0;d>j;j++)if(a.isDark(i,j)){var k=g("use",{x:String(i),y:String(j)});k.setAttributeNS("http://www.w3.org/1999/xlink","href","#template"),h.appendChild(k)}},a.prototype.clear=function(){for(;this._el.hasChildNodes();)this._el.removeChild(this._el.lastChild)},a}(),p="svg"===document.documentElement.tagName.toLowerCase(),q=p?o:m()?function(){function a(){this._elImage.src=this._elCanvas.toDataURL("image/png"),this._elImage.style.display="block",this._elCanvas.style.display="none"}function d(a,b){var c=this;if(c._fFail=b,c._fSuccess=a,null===c._bSupportDataURI){var d=document.createElement("img"),e=function(){c._bSupportDataURI=!1,c._fFail&&_fFail.call(c)},f=function(){c._bSupportDataURI=!0,c._fSuccess&&c._fSuccess.call(c)};return d.onabort=e,d.onerror=e,d.onload=f,d.src="data:image/gif;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==",void 0}c._bSupportDataURI===!0&&c._fSuccess?c._fSuccess.call(c):c._bSupportDataURI===!1&&c._fFail&&c._fFail.call(c)}if(this._android&&this._android<=2.1){var b=1/window.devicePixelRatio,c=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(a,d,e,f,g,h,i,j){if("nodeName"in a&&/img/i.test(a.nodeName))for(var l=arguments.length-1;l>=1;l--)arguments[l]=arguments[l]*b;else"undefined"==typeof j&&(arguments[1]*=b,arguments[2]*=b,arguments[3]*=b,arguments[4]*=b);c.apply(this,arguments)}}var e=function(a,b){this._bIsPainted=!1,this._android=n(),this._htOption=b,this._elCanvas=document.createElement("canvas"),this._elCanvas.width=b.width,this._elCanvas.height=b.height,a.appendChild(this._elCanvas),this._el=a,this._oContext=this._elCanvas.getContext("2d"),this._bIsPainted=!1,this._elImage=document.createElement("img"),this._elImage.style.display="none",this._el.appendChild(this._elImage),this._bSupportDataURI=null};return e.prototype.draw=function(a){var b=this._elImage,c=this._oContext,d=this._htOption,e=a.getModuleCount(),f=d.width/e,g=d.height/e,h=Math.round(f),i=Math.round(g);b.style.display="none",this.clear();for(var j=0;e>j;j++)for(var k=0;e>k;k++){var l=a.isDark(j,k),m=k*f,n=j*g;c.strokeStyle=l?d.colorDark:d.colorLight,c.lineWidth=1,c.fillStyle=l?d.colorDark:d.colorLight,c.fillRect(m,n,f,g),c.strokeRect(Math.floor(m)+.5,Math.floor(n)+.5,h,i),c.strokeRect(Math.ceil(m)-.5,Math.ceil(n)-.5,h,i)}this._bIsPainted=!0},e.prototype.makeImage=function(){this._bIsPainted&&d.call(this,a)},e.prototype.isPainted=function(){return this._bIsPainted},e.prototype.clear=function(){this._oContext.clearRect(0,0,this._elCanvas.width,this._elCanvas.height),this._bIsPainted=!1},e.prototype.round=function(a){return a?Math.floor(1e3*a)/1e3:a},e}():function(){var a=function(a,b){this._el=a,this._htOption=b};return a.prototype.draw=function(a){for(var b=this._htOption,c=this._el,d=a.getModuleCount(),e=Math.floor(b.width/d),f=Math.floor(b.height/d),g=['<table style="border:0;border-collapse:collapse;">'],h=0;d>h;h++){g.push("<tr>");for(var i=0;d>i;i++)g.push('<td style="border:0;border-collapse:collapse;padding:0;margin:0;width:'+e+"px;height:"+f+"px;background-color:"+(a.isDark(h,i)?b.colorDark:b.colorLight)+';"></td>');g.push("</tr>")}g.push("</table>"),c.innerHTML=g.join("");var j=c.childNodes[0],k=(b.width-j.offsetWidth)/2,l=(b.height-j.offsetHeight)/2;k>0&&l>0&&(j.style.margin=l+"px "+k+"px")},a.prototype.clear=function(){this._el.innerHTML=""},a}();QRCode=function(a,b){if(this._htOption={width:256,height:256,typeNumber:4,colorDark:"#000000",colorLight:"#ffffff",correctLevel:d.H},"string"==typeof b&&(b={text:b}),b)for(var c in b)this._htOption[c]=b[c];"string"==typeof a&&(a=document.getElementById(a)),this._android=n(),this._el=a,this._oQRCode=null,this._oDrawing=new q(this._el,this._htOption),this._htOption.text&&this.makeCode(this._htOption.text)},QRCode.prototype.makeCode=function(a){this._oQRCode=new b(r(a,this._htOption.correctLevel),this._htOption.correctLevel),this._oQRCode.addData(a),this._oQRCode.make(),this._el.title=a,this._oDrawing.draw(this._oQRCode),this.makeImage()},QRCode.prototype.makeImage=function(){"function"==typeof this._oDrawing.makeImage&&(!this._android||this._android>=3)&&this._oDrawing.makeImage()},QRCode.prototype.clear=function(){this._oDrawing.clear()},QRCode.CorrectLevel=d}();
</script>
<script src="https://cdn.jsdelivr.net/gh/Daniele1995-design/WebAppSap@main/JsBarcode.all.min.js"></script>

<script>
(function(){
    const labels = JSON.parse(decodeURIComponent("${payload}"));
    const container = document.getElementById('labels');

    function generateLabels() {
        labels.forEach((lab, idx) => {
            const label = document.createElement('div');
            label.className = 'label';

            // Header con logo e codice BP
            const header = document.createElement('div');
            header.className = 'header';

            // Logo
            const logo = document.createElement('img');
            logo.src = "https://raw.githubusercontent.com/Daniele1995-design/WebAppSap/main/logo%20ats.jpg";
            logo.className = "logo";
            logo.alt = "ATS";

            // Sezione BP
            const bpSection = document.createElement('div');
            bpSection.className = 'bp-section';

            // Testo BP
            const bpText = document.createElement('div');
            bpText.className = 'bp-text';
            const codLabel = document.createElement('div');
            codLabel.className = 'bp-label';
            codLabel.innerText = 'Codice BP';
            const codVal = document.createElement('div');
            codVal.className = 'bp-value';
            codVal.innerText = lab.codiceBP || '';
            bpText.appendChild(codLabel);
            bpText.appendChild(codVal);

            // QR Code BP
            const qrBpContainer = document.createElement('div');
            qrBpContainer.className = 'qr-bp-container';
            const qrBp = document.createElement('div');
            qrBp.id = 'qr-bp-' + idx;
            qrBp.className = 'qr-bp';
            const bpVert = document.createElement('div');
            bpVert.className = 'bp-vert';
            bpVert.innerText = 'BP';
            qrBpContainer.appendChild(qrBp);
            qrBpContainer.appendChild(bpVert);

            bpSection.appendChild(bpText);
            bpSection.appendChild(qrBpContainer);
            header.appendChild(logo);
            header.appendChild(bpSection);
            label.appendChild(header);

            // Barcode
            const barcodeContainer = document.createElement('div');
            barcodeContainer.className = 'barcode-container';
            const barcodeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            barcodeSvg.id = 'barcode-' + idx;
            barcodeSvg.className = 'barcode';
            const barcodeText = document.createElement('div');
            barcodeText.className = 'barcode-text';
            barcodeText.textContent = lab.articolo || '';
            barcodeContainer.appendChild(barcodeSvg);
            barcodeContainer.appendChild(barcodeText);
            label.appendChild(barcodeContainer);

            // Dettagli
            const details = document.createElement('div');
            details.className = 'details';

            // PO Number
            const poRow = document.createElement('div');
            poRow.className = 'detail-row';
            poRow.innerHTML = \`<span class="detail-label">Po Nr°:</span><span class="detail-value">\${lab.po || ''}</span>\`;

            // Part Number
            const pnRow = document.createElement('div');
            pnRow.className = 'detail-row';
            pnRow.innerHTML = \`<span class="detail-label">Part Number:</span><span class="detail-value">\${lab.pn || ''}</span>\`;

            // Seriale con QR
            const serialRow = document.createElement('div');
            serialRow.className = 'detail-row';
            serialRow.style.marginBottom = '0';
            const serialContent = document.createElement('div');
            serialContent.style.flexGrow = '1';
            serialContent.innerHTML = \`<span class="detail-label">Seriale:</span><span class="detail-value">\${lab.seriale || ''}</span>\`;

            // QR Seriale
            const qrSerialContainer = document.createElement('div');
            qrSerialContainer.className = 'qr-serial-container';
            const qrSerial = document.createElement('div');
            qrSerial.id = 'qr-serial-' + idx;
            qrSerial.className = 'qr-serial';
            const snVert = document.createElement('div');
            snVert.className = 'sn-vert';
            snVert.innerText = 'SN';
            qrSerialContainer.appendChild(qrSerial);
            qrSerialContainer.appendChild(snVert);

            serialRow.appendChild(serialContent);
            serialRow.appendChild(qrSerialContainer);
            details.appendChild(poRow);
            details.appendChild(pnRow);
            details.appendChild(serialRow);
            label.appendChild(details);
            container.appendChild(label);

            // Genera codici
            try {
                const paddedSeriale = String(lab.seriale || '').padStart(4, '0');
                const paddedCodiceBP = String(lab.codiceBP || '').padStart(4, '0');

                new QRCode(qrBp, {
                    text: paddedCodiceBP || '',
                    width: 30,
                    height: 30,
                    correctLevel: QRCode.CorrectLevel.H
                });

                new QRCode(qrSerial, {
                    text: paddedSeriale,
                    width: 30,
                    height: 30,
                    correctLevel: QRCode.CorrectLevel.H
                });

                JsBarcode(barcodeSvg, lab.articolo || '', {
                    format: "CODE128",
                    width: 1,
                    height: 20,
                    displayValue: false,
                    margin: 0
                });
            } catch(e) {
                console.error('Errore generazione codici:', e);
            }
        });

        // Avvia la stampa
        setTimeout(() => {
            window.print();
        }, 500);
    }

    // Chiudi dopo la stampa
    window.onafterprint = function() {
        setTimeout(() => {
            if (!window.closed) window.close();
        }, 100);
    };

    // Avvia la generazione
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', generateLabels);
    } else {
        generateLabels();
    }
})();
</script>
</body>
</html>
    `);

    // Chiudi se la stampa non parte
    printWindow.document.close();
    setTimeout(() => {
        if (printWindow && !printWindow.closed) {
            printWindow.close();
        }
    }, 30000);
}
    function printAllLabels10x5() {
        const righe = document.querySelectorAll('li.item-content.item-input.item-input-outline');
        if (righe.length === 0) {
            alert('Nessuna riga trovata!');
            return;
        }

        const allLabels = [];
        righe.forEach(li => {
            const data = getDataFromLi(li);
            data.serials.forEach(s => {
                allLabels.push({
                    codiceBP: data.codiceBP || '',
                    articolo: data.articolo || '',
                    po: data.riferimentoOrdine || data.riferimento || '',
                    pn: data.pn || '',
                    seriale: s.seriale || ''
                });
            });
        });

        if (allLabels.length === 0) {
            alert('Nessun seriale trovato per la stampa delle etichette!');
            return;
        }

        printLabels10x5(allLabels);
    }
    function printAllLabelsFromPNInfo() {
    const righe = document.querySelectorAll('li.item-content.item-input.item-input-outline');
    if (righe.length === 0) {
        alert('Nessuna riga trovata!');
        return;
    }

    const allLabels = [];

    righe.forEach(li => {
        // Salta la riga di ricerca
        if (li.querySelector('#shootInput')) {
            return;
        }

        const pnInfo = li.querySelector('span.pn-info');
        if (!pnInfo) return;

        const pnText = pnInfo.textContent || '';
        const serialeMatch = pnText.match(/Seriale:\s*([^\s|]+)/i);
        if (!serialeMatch) return;

        const data = getDataFromLi(li);
        const seriale = serialeMatch[1].trim();

        allLabels.push({
            codiceBP: data.codiceBP || '',
            articolo: data.articolo || '',
            po: data.riferimentoOrdine || data.riferimento || '',
            pn: data.pn || '',
            seriale: seriale
        });
    });

    if (allLabels.length === 0) {
        alert('Nessun seriale trovato nel formato corretto!');
        return;
    }

    printLabels10x5(allLabels);
}

    function printLabelsForRow(dataRow) {
        const labels = dataRow.serials.map(s => ({
            codiceBP: dataRow.codiceBP || '',
            articolo: dataRow.articolo || '',
            po: dataRow.riferimentoOrdine || dataRow.riferimento || '',
            pn: dataRow.pn || '',
            seriale: s.seriale || ''
        }));

        printLabels(labels);
    }

    function printLabels10x5ForRow(dataRow) {
        const labels = dataRow.serials.map(s => ({
            codiceBP: dataRow.codiceBP || '',
            articolo: dataRow.articolo || '',
            po: dataRow.riferimentoOrdine || dataRow.riferimento || '',
            pn: dataRow.pn || '',
            seriale: s.seriale || ''
        }));

        printLabels10x5(labels);
    }

function addPrintButtonsToRows() {
    const righe = document.querySelectorAll('li.item-content.item-input.item-input-outline');
    if (righe.length === 0) {
        console.log('Nessuna riga trovata nella pagina');
        return;
    }

    righe.forEach((li, idx) => {
        // Salta la riga di ricerca (contiene l'input con id 'shootInput')
        if (li.querySelector('#shootInput')) {
            console.log('Trovata riga di ricerca, salto');
            return; // Salta questa iterazione
        }

        // Salta la riga se contiene il checkbox con id "odaSelected"
        if (li.querySelector('input#odaSelected')) {
            console.log('Trovato checkbox odaSelected, salto la riga');
            return; // Salta questa iterazione
        }

        console.log('Aggiungo pulsanti alla riga', idx);

        // Rimuovi i pulsanti esistenti
        const existingBtns = li.querySelectorAll('.btn-print-etichetta, .btn-print-etichetta-small, .btn-container');
        existingBtns.forEach(btn => btn.remove());

        // Crea un contenitore per i pulsanti
        const btnContainer = document.createElement('div');
        btnContainer.className = 'btn-container';
        btnContainer.style.cssText = 'display: flex; flex-wrap: nowrap; gap: 4px; margin-left: 8px;';

        // Crea il pulsante per l'etichetta 10x10
        const btn10x10 = document.createElement('button');
        btn10x10.className = 'btn-print-etichetta';
        btn10x10.style.cssText = 'padding: 4px 6px; border-radius: 4px; cursor: pointer; background: #28a745; border: 1px solid #218838; color: white; font-size: 12px; white-space: nowrap;';
        btn10x10.title = 'Stampa etichetta 10x10';
        btn10x10.innerText = '🖨️ 10x10';

        btn10x10.addEventListener('click', async (ev) => {
            ev.preventDefault();
            await waitForSerials(5000);
            const data = getDataFromLi(li);
            printLabelsForRow(data);
        });

        // Crea il pulsante per l'etichetta 10x5
        const btn10x5 = document.createElement('button');
        btn10x5.className = 'btn-print-etichetta-small';
        btn10x5.style.cssText = 'padding: 4px 6px; border-radius: 4px; cursor: pointer; background: #17a2b8; border: 1px solid #117a8b; color: white; font-size: 12px; white-space: nowrap;';
        btn10x5.title = 'Stampa etichetta 10x5';
        btn10x5.innerText = '🖨️ 10x5';

        btn10x5.addEventListener('click', async (ev) => {
            ev.preventDefault();
            await waitForSerials(5000);
            const data = getDataFromLi(li);
            printLabels10x5ForRow(data);
        });

        // Aggiungi i pulsanti al contenitore
        btnContainer.appendChild(btn10x10);
        btnContainer.appendChild(btn10x5);

        // Aggiungi il contenitore all'area azioni
        const actionArea = li.querySelector('.item-media, .item-after, .item-title, .item-inner') || li;

        if (actionArea) {
            if (actionArea.classList.contains('item-inner')) {
                actionArea.style.display = 'flex';
                actionArea.style.alignItems = 'center';
                actionArea.style.justifyContent = 'space-between';
                actionArea.style.width = '100%';

                // Crea un contenitore per il testo esistente
                const textContainer = document.createElement('div');
                while (actionArea.firstChild) {
                    textContainer.appendChild(actionArea.firstChild);
                }

                // Aggiungi il contenitore del testo e i pulsanti
                actionArea.appendChild(textContainer);
                actionArea.appendChild(btnContainer);
            } else {
                actionArea.appendChild(btnContainer);
            }
        }
    });
}
    function addExportAndPrintUI() {
        const modal = document.querySelector('.sheet-modal-inner .sheet-modal-swipe-step');
        if (!modal) return;

        // Rimuovi i pulsanti esistenti se ci sono
        const existingWrapper = document.getElementById('export-print-wrapper');
        if (existingWrapper) existingWrapper.remove();

        // Crea il wrapper per i pulsanti
        const wrapper = document.createElement('div');
        wrapper.id = 'export-print-wrapper';

        // Stile per il wrapper
        Object.assign(wrapper.style, {
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: '10px',
            padding: '10px',
            marginTop: '20px',
            borderTop: '1px solid #ddd',
            justifyContent: 'space-between',
            width: '100%',
            boxSizing: 'border-box'
        });

        // Stile per i pulsanti
        const buttonStyle = {
            flex: '1',
            minWidth: '120px',
            textAlign: 'center',
            padding: '8px 5px',
            margin: '2px',
            fontSize: '12px',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            color: 'white',
            fontWeight: 'bold'
        };

        // Crea i pulsanti
        const buttons = [
            { text: '📤 Estrai Dati', color: '#0d6efd', click: downloadCSV },
            { text: '🖨️ 10x10', color: '#28a745', click: printAllLabels },
            { text: '🖨️ 10x5', color: '#17a2b8', click: printAllLabels10x5 },
            { text: '🖨️ 10x5 Seriale Atteso', color: '#6f42c1', click: printAllLabelsFromPNInfo }
        ];

        buttons.forEach(btnData => {
            const btn = document.createElement('button');
            btn.innerText = btnData.text;
            Object.assign(btn.style, buttonStyle, { backgroundColor: btnData.color });
            btn.addEventListener('click', btnData.click);
            wrapper.appendChild(btn);
        });

        // Aggiungi il wrapper alla modale
        modal.appendChild(wrapper);

        // Aggiungi stili globali per i pulsanti
        const style = document.createElement('style');
        style.textContent = `
            #export-print-wrapper button {
                transition: opacity 0.2s;
            }
            #export-print-wrapper button:hover {
                opacity: 0.9;
            }
            #export-print-wrapper button:active {
                transform: translateY(1px);
            }
        `;
        document.head.appendChild(style);

        // Aggiungi i pulsanti alle singole righe
        addPrintButtonsToRows();
    }

    // Avvio dello script
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            addExportAndPrintUI();
            setInterval(addPrintButtonsToRows, 1500);
        });
    } else {
        addExportAndPrintUI();
        setInterval(addPrintButtonsToRows, 1500);
    }
// Salviamo la funzione originale
const originalSalvaDocumento = grn.salvaDocumento;

// Sovrascriviamo
grn.salvaDocumento = function(...args) {
    // Prima chiamiamo la funzione originale
    originalSalvaDocumento.apply(this, args);

    // Poi eseguiamo downloadCSV
    console.log("✅ Conferma Entrata Merci cliccato, avvio downloadCSV");
    downloadCSV();
};

})();
