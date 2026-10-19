# Argon2 Calculator

A small static web page that derives an [Argon2](https://github.com/P-H-C/phc-winner-argon2) hash from an input and a salt. Everything runs in the browser using the [argon2-browser](https://github.com/antelle/argon2-browser) WebAssembly build; nothing is sent to a server.

Live at <https://hash.dante.tw>.

## Defaults

| Parameter   | Value    |
| ----------- | -------- |
| Variant     | Argon2id |
| Memory      | 1024 KiB |
| Iterations  | 2        |
| Parallelism | 2        |
| Hash length | 12 bytes |
| Salt        | `somesalt` when left blank |

The result is the raw hash, hex-encoded. All parameters can be changed under **Advanced parameters**.

## Running locally

The page uses a Web Worker and `fetch`, so it has to be served over HTTP rather than opened from the file system:

```bash
python3 -m http.server 8000
```

then open <http://localhost:8000>.

## Layout

- `index.html`, `css/app.css` – the page; no CSS or JS frameworks.
- `js/main.js` – form handling, copy button, worker management.
- `js/worker.js` – Web Worker that runs the hash off the main thread.
- `js/argon2-hasher.js` – loads the WebAssembly module and calls `argon2_hash_ext`; shared by the worker and the main-thread fallback.
- `dist/` – unmodified argon2-browser build (`argon2.js`, `argon2.wasm`, `argon2-simd.wasm`). The SIMD build is used automatically when the browser supports it.

## License

MIT, see [LICENSE](LICENSE).
