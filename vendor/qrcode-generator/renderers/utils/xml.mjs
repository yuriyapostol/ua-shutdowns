const r = function(t) {
  let e = "";
  for (let a = 0; a < t.length; a += 1) {
    const c = t.charAt(a);
    switch (c) {
      case "<":
        e += "&lt;";
        break;
      case ">":
        e += "&gt;";
        break;
      case "&":
        e += "&amp;";
        break;
      case '"':
        e += "&quot;";
        break;
      default:
        e += c;
        break;
    }
  }
  return e;
};
export {
  r as escapeXml
};
//# sourceMappingURL=xml.mjs.map
