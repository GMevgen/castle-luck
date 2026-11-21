/* Замок удачи — генератор случайных чисел.
 * Источник энтропии: crypto.getRandomValues (CSPRNG браузера / Node).
 * randInt(n) — равномерное целое 0..n-1 БЕЗ смещения по модулю (rejection sampling).
 * Каждый вызов независим, барабаны крутятся отдельными вызовами. */
(function (root) {
  'use strict';
  var CL = root.CL = root.CL || {};
  var TWO32 = 4294967296;

  function makeCryptoSource() {
    var c = root.crypto || (typeof require === 'function' ? require('crypto').webcrypto : null);
    if (!c || !c.getRandomValues) throw new Error('crypto.getRandomValues недоступен');
    var buf = new Uint32Array(256), pos = 256;
    return function next32() {
      if (pos >= buf.length) { c.getRandomValues(buf); pos = 0; }
      return buf[pos++];
    };
  }

  /* Детерминированный источник только для тестов/бота (xorshift128). В игре не используется. */
  function makeSeededSource(seed) {
    var x = seed >>> 0 || 123456789, y = 362436069, z = 521288629, w = 88675123;
    return function next32() {
      var t = x ^ (x << 11); x = y; y = z; z = w;
      w = (w ^ (w >>> 19) ^ (t ^ (t >>> 8))) >>> 0;
      return w;
    };
  }

  function Rng(source) {
    this.next32 = source || makeCryptoSource();
    this.rejections = 0;
  }
  /* Равномерное целое [0, n). Отбрасываем значения из «хвоста» 2^32 mod n, чтобы не было смещения. */
  Rng.prototype.int = function (n) {
    if (!(n >= 1) || n > TWO32 || n !== Math.floor(n)) throw new RangeError('n=' + n);
    var limit = TWO32 - (TWO32 % n); // наибольшее кратное n, не превышающее 2^32
    var x;
    for (;;) {
      x = this.next32();
      if (x < limit) return x % n;
      this.rejections++;
    }
  };
  /* Равномерное вещественное [0,1) с 53 битами точности. */
  Rng.prototype.float = function () {
    var hi = this.next32() >>> 5, lo = this.next32() >>> 6; // 27 + 26 бит
    return (hi * 67108864 + lo) / 9007199254740992;
  };
  Rng.prototype.chance = function (p) { return p > 0 && this.float() < p; };
  Rng.prototype.range = function (a, b) { return a + this.int(b - a + 1); }; // включительно
  Rng.prototype.pick = function (arr) { return arr[this.int(arr.length)]; };
  Rng.prototype.weighted = function (weights) {
    var sum = 0, i; for (i = 0; i < weights.length; i++) sum += weights[i];
    var r = this.float() * sum;
    for (i = 0; i < weights.length; i++) { r -= weights[i]; if (r < 0) return i; }
    return weights.length - 1;
  };

  CL.Rng = Rng;
  CL.makeCryptoSource = makeCryptoSource;
  CL.makeSeededSource = makeSeededSource;
  if (typeof module !== 'undefined' && module.exports) module.exports = CL;
})(typeof globalThis !== 'undefined' ? globalThis : this);
