'use strict';

document.getElementById('frm').addEventListener('submit', function (e) {
    e.preventDefault();
});
document
    .getElementById('btnCalcWasm')
    .addEventListener('click', calc(calcWasm));

function loadScript(src, onload, onerror) {
    var el = document.createElement('script');
    el.src = src;
    el.onload = onload;
    el.onerror = onerror;
    document.body.appendChild(el);
}

function getArg() {
    return {
        pass: document.getElementById('txtPassword').value || 'password',
        salt: document.getElementById('txtSalt').value || 'somesalt',
        time: +(document.getElementById('txtIt').value || 1),
        mem: +(document.getElementById('txtMem').value || 1024),
        hashLen: +(document.getElementById('txtLen').value || 32),
        parallelism: +(document.getElementById('txtPar').value || 1),
        type: +document.querySelector('[name=radioType]:checked').value,
    };
}

var logTs = 0;

function log(msg) {
    if (!msg) {
        return;
    }
    var txtRes = document.getElementById('txtRes');
    var elapsedMs = Math.round(performance.now() - logTs);
    var elapsedSec = (elapsedMs / 1000).toFixed(3);
    var elapsed = leftPad(elapsedSec, 6);
    txtRes.value += (txtRes.value ? '\n' : '') + msg;
}

function leftPad(str, len) {
    str = str.toString();
    while (str.length < len) {
        str = '0' + str;
    }
    return str;
}

function clearLog() {
    logTs = performance.now();
    document.getElementById('txtRes').value = '';
}

document.getElementById('copyButton').addEventListener('click', function() {
    // Get the text value from the input field
    const copyText = document.getElementById('txtRes');

    // Select the text in the input field
    copyText.select();
    copyText.setSelectionRange(0, 99999); // For mobile devices

    // Copy the selected text to the clipboard
    document.execCommand('copy');

    // Optionally, you can provide user feedback that the text has been copied
    // alert('Copied to clipboard: ' + copyText.value);
});
