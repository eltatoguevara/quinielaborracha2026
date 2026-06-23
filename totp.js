// ══════════════════════════════════════════════════════════════
// TOTP — Quiniela Borracha 2026 (v6.5, 2FA admin)
// ══════════════════════════════════════════════════════════════
// Funciones puras, sin estado global, sin dependencias externas (usa
// SubtleCrypto nativo del navegador para HMAC-SHA1 — disponible en todos
// los browsers modernos sin librería ni CDN nuevo). Implementa el
// algoritmo TOTP estándar (RFC 6238), compatible con Google Authenticator,
// Authy, 1Password, etc.
//
// Por qué este archivo existe separado de app.js: son funciones puras
// testeables de forma aislada (igual que utils.js), y este es código de
// seguridad — conviene que esté en un solo lugar chico y auditable, no
// mezclado entre la lógica de UI de app.js.
//
// Se carga ANTES de app.js en index.html (mismo criterio que utils.js).

const TOTP_PERIOD_SECONDS = 30; // estándar TOTP — todas las apps Authenticator asumen 30s
const TOTP_DIGITS = 6;
const TOTP_BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

// ── Base32 encode/decode (RFC 4648) ──────────────────────────────────
// TOTP estándar representa el secreto en Base32 (no Base64) porque es lo
// que las apps Authenticator esperan que el usuario tipee a mano.
function base32Encode(bytes) {
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, "0");
    out += TOTP_BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  return out;
}

function base32Decode(str) {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const c of clean) {
    const idx = TOTP_BASE32_ALPHABET.indexOf(c);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return new Uint8Array(bytes);
}

// ── Generar un secreto nuevo (160 bits / 20 bytes, tamaño estándar) ──
function generateTOTPSecret() {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

// ── Generar un código de respaldo de un solo uso (formato legible: 4+4) ──
// No es TOTP — es un valor fijo random que se guarda hasheado (no en texto
// plano) y se invalida tras un solo uso exitoso.
function generateBackupCode() {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  const raw = base32Encode(bytes).slice(0, 8);
  return raw.slice(0, 4) + "-" + raw.slice(4, 8);
}

// ── Hash simple del código de respaldo para no guardarlo en texto plano ──
// SHA-256 vía SubtleCrypto. No es para password hashing robusto (no hace
// falta acá: es un código random de un solo uso, no una contraseña humana
// reusada) — solo para no dejarlo legible en el documento de Firestore.
async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const hashBuf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── HMAC-SHA1 vía SubtleCrypto (núcleo del algoritmo TOTP, RFC 6238) ──
async function hmacSha1(keyBytes, msgBytes) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", cryptoKey, msgBytes);
  return new Uint8Array(sigBuf);
}

// ── Generar el código TOTP de 6 dígitos para un secreto + instante dado ──
// `forTime` en milisegundos (Date.now() por defecto); `step` permite pedir
// el código de una ventana de tiempo adyacente (ver verifyTOTPCode, para
// tolerar pequeños desfasajes de reloj entre el teléfono y el servidor).
async function getTOTPCode(secretBase32, forTime = Date.now(), step = 0) {
  const keyBytes = base32Decode(secretBase32);
  const counter = Math.floor(forTime / 1000 / TOTP_PERIOD_SECONDS) + step;

  // Counter como 8 bytes big-endian (requerido por el algoritmo HOTP/TOTP)
  const counterBytes = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = c & 0xff;
    c = Math.floor(c / 256);
  }

  const hmac = await hmacSha1(keyBytes, counterBytes);
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const code = binCode % 10 ** TOTP_DIGITS;
  return code.toString().padStart(TOTP_DIGITS, "0");
}

// ── Verificar un código ingresado por el usuario ──────────────────────
// Tolera ±1 ventana de 30s (es decir, hasta ~30-60s de desfasaje de reloj
// entre el teléfono del admin y el momento de verificación) — esto es
// estándar en cualquier implementación TOTP seria, porque los relojes de
// los teléfonos no son perfectamente exactos.
async function verifyTOTPCode(secretBase32, userCode) {
  const clean = String(userCode || "").trim().replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  for (const step of [0, -1, 1]) {
    const expected = await getTOTPCode(secretBase32, Date.now(), step);
    if (expected === clean) return true;
  }
  return false;
}

// ── Construir la URL otpauth:// (informativa — se muestra como texto en
// el setup para quien prefiera pegarla en vez de tipear el secreto a
// mano; no se usa para generar ningún QR). ──
function buildOtpauthUrl(secretBase32, accountLabel, issuer) {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  const params = `secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`;
  return `otpauth://totp/${label}?${params}`;
}
