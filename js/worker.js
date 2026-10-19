'use strict';

// Runs Argon2 off the main thread so the page stays responsive while hashing.
importScripts('argon2-hasher.js');

self.onmessage = function (event) {
    var msg = event.data;
    self.Argon2Hasher.hash(msg.params, { distUrl: msg.distUrl }).then(
        function (result) {
            self.postMessage({ id: msg.id, result: result });
        },
        function (err) {
            self.postMessage({ id: msg.id, error: String(err && err.message ? err.message : err) });
        }
    );
};
