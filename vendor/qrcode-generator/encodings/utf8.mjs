import n from "../core/qrcode.mjs";
function p(u) {
  for (var f = [], s = 0; s < u.length; s++) {
    var t = u.charCodeAt(s);
    t < 128 ? f.push(t) : t < 2048 ? f.push(
      192 | t >> 6,
      128 | t & 63
    ) : t < 55296 || t >= 57344 ? f.push(
      224 | t >> 12,
      128 | t >> 6 & 63,
      128 | t & 63
    ) : (s++, t = 65536 + ((t & 1023) << 10 | u.charCodeAt(s) & 1023), f.push(
      240 | t >> 18,
      128 | t >> 12 & 63,
      128 | t >> 6 & 63,
      128 | t & 63
    ));
  }
  return f;
}
n.registerEncoder("UTF-8", {
  encode: p,
  eci: 26,
  modes: ["Byte"]
});
//# sourceMappingURL=utf8.mjs.map
