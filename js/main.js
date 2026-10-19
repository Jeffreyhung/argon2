'use strict';

(function () {
    var DIST_URL = new URL('dist/', document.baseURI).href;
    var DEFAULT_SALT = 'somesalt';
    var DEFAULTS = { time: 2, mem: 1024, hashLen: 12, parallelism: 2, type: 2 };
    var TYPE_NAMES = ['Argon2d', 'Argon2i', 'Argon2id'];

    var $ = function (id) {
        return document.getElementById(id);
    };
    var form = $('frm');
    var inputPass = $('txtPassword');
    var inputSalt = $('txtSalt');
    var inputTime = $('txtIt');
    var inputMem = $('txtMem');
    var inputLen = $('txtLen');
    var inputPar = $('txtPar');
    var btnCalc = $('btnCalc');
    var btnCopy = $('copyButton');
    var btnToggle = $('btnToggle');
    var btnReset = $('btnReset');
    var output = $('txtRes');
    var status = $('status');
    var details = $('advanced');
    var summaryHint = $('advancedHint');

    // ---- Hashing backend: Web Worker when available, main thread otherwise ----

    var worker = null;
    var pending = {};
    var nextId = 1;

    function createWorker() {
        if (typeof Worker === 'undefined') {
            return null;
        }
        try {
            var w = new Worker('js/worker.js');
            w.onmessage = function (event) {
                var msg = event.data;
                var p = pending[msg.id];
                if (!p) {
                    return;
                }
                delete pending[msg.id];
                if (msg.error) {
                    p.reject(new Error(msg.error));
                } else {
                    p.resolve(msg.result);
                }
            };
            w.onerror = function (event) {
                // The worker itself failed (for example a script that could not
                // load). Fail every pending request and fall back to the main thread.
                worker = null;
                Object.keys(pending).forEach(function (id) {
                    pending[id].reject(new Error(event.message || 'Worker failed'));
                });
                pending = {};
            };
            return w;
        } catch (e) {
            return null;
        }
    }

    function hashInWorker(params) {
        return new Promise(function (resolve, reject) {
            var id = nextId++;
            pending[id] = { resolve: resolve, reject: reject };
            worker.postMessage({ id: id, params: params, distUrl: DIST_URL });
        });
    }

    function hashOnMainThread(params) {
        return new Promise(function (resolve, reject) {
            if (window.Argon2Hasher) {
                resolve();
                return;
            }
            var el = document.createElement('script');
            el.src = 'js/argon2-hasher.js';
            el.onload = resolve;
            el.onerror = function () {
                reject(new Error('Could not load the hashing script.'));
            };
            document.head.appendChild(el);
        }).then(function () {
            return window.Argon2Hasher.hash(params, { distUrl: DIST_URL });
        });
    }

    function hash(params) {
        if (worker === null) {
            worker = createWorker();
        }
        if (worker) {
            return hashInWorker(params).catch(function (err) {
                if (worker === null) {
                    // Worker died; retry once on the main thread.
                    return hashOnMainThread(params);
                }
                throw err;
            });
        }
        return hashOnMainThread(params);
    }

    // ---- Form handling ----

    function readInt(el, label, min) {
        var raw = el.value.trim();
        var n = Number(raw);
        if (raw === '' || !isFinite(n) || Math.floor(n) !== n) {
            throw new Error(label + ' must be a whole number.');
        }
        if (n < min) {
            throw new Error(label + ' must be at least ' + min + '.');
        }
        return n;
    }

    function getParams() {
        var pass = inputPass.value;
        if (pass === '') {
            inputPass.focus();
            throw new Error('Enter something to hash.');
        }
        var parallelism = readInt(inputPar, 'Parallelism', 1);
        var mem = readInt(inputMem, 'Memory', 8 * parallelism);
        return {
            pass: pass,
            salt: inputSalt.value || DEFAULT_SALT,
            time: readInt(inputTime, 'Iterations', 1),
            mem: mem,
            hashLen: readInt(inputLen, 'Hash length', 4),
            parallelism: parallelism,
            type: +form.elements.radioType.value,
        };
    }

    function setStatus(text, kind) {
        status.textContent = text;
        status.className = 'status' + (kind ? ' status--' + kind : '');
    }

    function setBusy(busy) {
        btnCalc.disabled = busy;
        btnCalc.textContent = busy ? 'Calculating…' : 'Calculate';
        form.setAttribute('aria-busy', busy ? 'true' : 'false');
    }

    function describe(params, result) {
        var parts = [
            TYPE_NAMES[params.type],
            params.mem + ' KiB',
            params.time + (params.time === 1 ? ' iteration' : ' iterations'),
            'parallelism ' + params.parallelism,
            params.hashLen + ' bytes',
            Math.round(result.elapsedMs) + ' ms' + (result.simd ? ' (SIMD)' : ''),
        ];
        return parts.join(' · ');
    }

    var running = false;

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (running) {
            return;
        }
        var params;
        try {
            params = getParams();
        } catch (err) {
            setStatus(err.message, 'error');
            return;
        }

        running = true;
        setBusy(true);
        output.value = '';
        btnCopy.disabled = true;
        setStatus('Calculating…');

        hash(params).then(
            function (result) {
                output.value = result.hex;
                btnCopy.disabled = false;
                setStatus(describe(params, result));
            },
            function (err) {
                setStatus('Error: ' + err.message, 'error');
            }
        ).then(function () {
            running = false;
            setBusy(false);
        });
    });

    // ---- Show / hide the input ----

    btnToggle.addEventListener('click', function () {
        var show = inputPass.type === 'password';
        inputPass.type = show ? 'text' : 'password';
        btnToggle.textContent = show ? 'Hide' : 'Show';
        btnToggle.setAttribute('aria-pressed', show ? 'true' : 'false');
        inputPass.focus();
    });

    // ---- Copy ----

    var copyTimer = null;

    function copied(ok) {
        btnCopy.textContent = ok ? 'Copied' : 'Copy failed';
        clearTimeout(copyTimer);
        copyTimer = setTimeout(function () {
            btnCopy.textContent = 'Copy';
        }, 1500);
    }

    btnCopy.addEventListener('click', function () {
        var text = output.value;
        if (!text) {
            return;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(
                function () { copied(true); },
                function () { copied(legacyCopy()); }
            );
        } else {
            copied(legacyCopy());
        }
    });

    function legacyCopy() {
        output.focus();
        output.select();
        output.setSelectionRange(0, output.value.length);
        try {
            return document.execCommand('copy');
        } catch (e) {
            return false;
        }
    }

    // ---- Advanced parameters ----

    function updateHint() {
        var type = TYPE_NAMES[+form.elements.radioType.value] || '';
        summaryHint.textContent =
            type + ', m=' + inputMem.value + ', t=' + inputTime.value +
            ', p=' + inputPar.value + ', ' + inputLen.value + ' bytes';
    }

    function applyDefaults() {
        inputTime.value = DEFAULTS.time;
        inputMem.value = DEFAULTS.mem;
        inputLen.value = DEFAULTS.hashLen;
        inputPar.value = DEFAULTS.parallelism;
        form.elements.radioType.value = String(DEFAULTS.type);
        updateHint();
    }

    btnReset.addEventListener('click', function () {
        applyDefaults();
        setStatus('');
    });
    details.addEventListener('input', updateHint);
    details.addEventListener('change', updateHint);

    // Browsers restore form values on reload; start from the real defaults instead.
    applyDefaults();
    inputPass.focus();
})();
