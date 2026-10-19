'use strict';

/*
 * Argon2 hashing on top of the argon2-browser WebAssembly build in dist/.
 *
 * Works both on the main thread (window) and inside a Web Worker. The only
 * environment-specific parts are how dist/argon2.js is loaded and where the
 * dist/ directory lives, so both are passed in as options.
 *
 *   Argon2Hasher.hash(params, { distUrl }) -> Promise<{ hex, encoded, elapsedMs, simd }>
 */
(function (root) {
    var WASM_PAGE_SIZE = 64 * 1024;
    var MAX_PAGES = (2 * 1024 * 1024 * 1024 - 64 * 1024) / WASM_PAGE_SIZE; // just under 2 GiB
    var ARGON2_VERSION = 0x13;

    // Smallest valid module using a SIMD instruction (same probe as wasm-feature-detect).
    var SIMD_PROBE = new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10,
        10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
    ]);

    var simdSupported = null;
    var loading = null; // Promise for the module currently being loaded

    function supportsSimd() {
        if (simdSupported === null) {
            try {
                simdSupported = WebAssembly.validate(SIMD_PROBE);
            } catch (e) {
                simdSupported = false;
            }
        }
        return simdSupported;
    }

    function fetchBinary(url) {
        return fetch(url, { credentials: 'same-origin' }).then(function (res) {
            if (!res.ok) {
                throw new Error('Could not load ' + url + ' (HTTP ' + res.status + ')');
            }
            return res.arrayBuffer();
        });
    }

    function loadScript(url) {
        if (typeof importScripts === 'function') {
            importScripts(url);
            return Promise.resolve();
        }
        return new Promise(function (resolve, reject) {
            var el = document.createElement('script');
            el.src = url;
            el.onload = resolve;
            el.onerror = function () {
                reject(new Error('Could not load ' + url));
            };
            document.head.appendChild(el);
        });
    }

    function initialPages(memKiB) {
        var needed = Math.ceil((memKiB * 1024) / WASM_PAGE_SIZE);
        return Math.min(Math.max(needed, 256) + 256, MAX_PAGES);
    }

    // Loads (once) the Emscripten module and resolves with it.
    function loadModule(memKiB, distUrl) {
        if (root.Module && root.Module.calledRun && root.Module._argon2_hash_ext) {
            return Promise.resolve(root.Module);
        }
        if (loading) {
            return loading;
        }
        if (typeof WebAssembly !== 'object') {
            return Promise.reject(new Error('This browser does not support WebAssembly.'));
        }

        var simd = supportsSimd();
        var wasmUrl = distUrl + (simd ? 'argon2-simd.wasm' : 'argon2.wasm');

        loading = fetchBinary(wasmUrl)
            .then(function (binary) {
                return new Promise(function (resolve, reject) {
                    var memory = new WebAssembly.Memory({
                        initial: initialPages(memKiB),
                        maximum: MAX_PAGES,
                    });
                    root.Module = {
                        wasmBinary: binary,
                        wasmMemory: memory,
                        buffer: memory.buffer,
                        simd: simd,
                        print: function () {},
                        printErr: function (msg) {
                            if (root.console) {
                                console.error(msg);
                            }
                        },
                        onAbort: function (what) {
                            reject(new Error('WebAssembly module aborted: ' + what));
                        },
                        onRuntimeInitialized: function () {
                            resolve(root.Module);
                        },
                    };
                    loadScript(distUrl + 'argon2.js').catch(reject);
                });
            })
            .catch(function (err) {
                loading = null;
                root.Module = undefined;
                throw err;
            });
        return loading;
    }

    function toHex(bytes) {
        var out = '';
        for (var i = 0; i < bytes.length; i++) {
            out += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
        }
        return out;
    }

    function runHash(M, p) {
        var encoder = new TextEncoder();
        var passBytes = encoder.encode(p.pass);
        var saltBytes = encoder.encode(p.salt);

        var pwd = M.allocate(passBytes, M.ALLOC_NORMAL);
        var salt = M.allocate(saltBytes, M.ALLOC_NORMAL);
        var hash = M._malloc(p.hashLen);
        var encodedLen = M._argon2_encodedlen(
            p.time, p.mem, p.parallelism, saltBytes.length, p.hashLen, p.type
        );
        var encoded = M._malloc(encodedLen + 1);

        var started = now();
        var result;
        try {
            result = M._argon2_hash_ext(
                p.time, p.mem, p.parallelism,
                pwd, passBytes.length,
                salt, saltBytes.length,
                hash, p.hashLen,
                encoded, encodedLen,
                p.type,
                0, 0, // secret
                0, 0, // associated data
                ARGON2_VERSION
            );
            var elapsedMs = now() - started;

            if (result !== 0) {
                var message = '';
                try {
                    message = M.UTF8ToString(M._argon2_error_message(result));
                } catch (e) {}
                throw new Error(message || 'Argon2 failed with code ' + result);
            }

            return {
                hex: toHex(M.HEAPU8.subarray(hash, hash + p.hashLen)),
                encoded: M.UTF8ToString(encoded),
                elapsedMs: elapsedMs,
                simd: !!M.simd,
            };
        } finally {
            try {
                M._free(pwd);
                M._free(salt);
                M._free(hash);
                M._free(encoded);
            } catch (e) {}
        }
    }

    function now() {
        return root.performance ? performance.now() : Date.now();
    }

    root.Argon2Hasher = {
        /**
         * @param {{pass:string, salt:string, time:number, mem:number,
         *          hashLen:number, parallelism:number, type:number}} params
         *        type: 0 = Argon2d, 1 = Argon2i, 2 = Argon2id. mem is in KiB.
         * @param {{distUrl:string}} options  Absolute URL of the dist/ directory.
         */
        hash: function (params, options) {
            return loadModule(params.mem, options.distUrl).then(function (M) {
                return runHash(M, params);
            });
        },
        supportsSimd: supportsSimd,
    };
})(self);
