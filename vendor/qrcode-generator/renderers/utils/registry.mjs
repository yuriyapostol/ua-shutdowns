import a from "../../core/qrcode.mjs";
const A = {}, s = function(e) {
  if (typeof e != "object" || e === null) return !1;
  const n = Object.getPrototypeOf(e);
  return n === Object.prototype || n === null;
}, C = function(e, n) {
  const t = s(e) ? { ...e } : {};
  return typeof n == "string" ? t.color = n : s(n) && Object.assign(t, n), t;
}, g = function(e, n) {
  return s(e[n]) || (e[n] = {}), e[n];
}, z = function(e, n, t) {
  if (n !== "renderer") {
    if (n === "cell" || n === "background") {
      e[n] = C(e[n], t), n === "cell" ? (typeof e.cell.size == "number" && (e.cellSize = e.cell.size), typeof e.cell.color == "string" && (e.cellColor = e.cell.color)) : typeof e.background.color == "string" && (e.backgroundColor = e.background.color);
      return;
    }
    e[n] = t, n === "cellSize" && typeof t == "number" ? g(e, "cell").size = t : n === "cellColor" && typeof t == "string" ? g(e, "cell").color = t : n === "backgroundColor" && typeof t == "string" && (g(e, "background").color = t);
  }
}, R = function(e, n) {
  Object.keys(n).forEach((t) => {
    z(e, t, n[t]);
  });
}, k = function(e) {
  return e.toLowerCase() === "dataurl" ? "dataUrl" : e;
}, j = function(e, n) {
  const t = n.toLowerCase();
  if (t === "dataurl" || t === "html" || t === "element" || t === "canvas" || t === "file") {
    e.output = k(n);
    return;
  }
  if (t === "img" || t === "image") {
    e.output = "html", e.tagName = "img";
    return;
  }
  e.output = n;
}, O = function(e) {
  if (typeof e == "string") {
    const n = e.split(":"), t = {};
    return n.slice(1).forEach((r) => {
      r && j(t, r);
    }), { name: n[0], opts: t };
  }
  if (s(e)) {
    const { renderer: n, type: t, ...r } = e;
    return { name: n || t, opts: r };
  }
  return { name: void 0, opts: {} };
}, h = function(e) {
  return typeof e?.tagName == "string" ? e.tagName.toLowerCase() : void 0;
}, u = function(e, n) {
  if (typeof e?.getAttribute != "function") return;
  const t = e.getAttribute(n);
  return t === null ? void 0 : t;
}, N = function(e, n) {
  const t = u(e, n);
  if (typeof t > "u" || t === "") return;
  const r = Number(t);
  return Number.isFinite(r) ? r : void 0;
}, w = function(e, n) {
  const t = u(e, n);
  if (typeof t > "u" || t === "") return;
  const r = t.toLowerCase();
  if (r === "true") return !0;
  if (r === "false") return !1;
  const o = Number(t);
  return Number.isFinite(o) ? o : t;
}, S = function(e, n) {
  const t = u(e, n);
  if (!(typeof t > "u" || t === ""))
    return JSON.parse(t);
}, f = function(e) {
  return `data-qrcode-${e}`;
}, v = function(e) {
  const n = {};
  if (!e) return n;
  const t = h(e);
  t && (n.tagName = t);
  const r = u(e, f("renderer")), o = u(e, f("output")), l = u(e, f("tag-name")), c = N(e, f("cell-size")), i = N(e, f("margin")), d = u(e, f("cell-color")), p = u(e, f("background-color")), m = u(e, "alt"), b = u(e, "title");
  if (r) {
    const y = O(r);
    y.name && (n.renderer = y.name), Object.assign(n, y.opts);
  }
  return o && (n.output = k(o)), l && (n.tagName = l), typeof c == "number" && (n.cellSize = c), typeof i == "number" && (n.margin = i), d && (n.cellColor = d), p && (n.backgroundColor = p), m && (n.alt = m), b && (n.title = b), !n.renderer && t === "canvas" && (n.renderer = "canvas"), !n.renderer && t === "img" && (n.renderer = "png"), !n.output && t === "canvas" && (n.output = "canvas"), !n.output && t === "img" && (n.output = "element"), !n.context && t === "canvas" && typeof e.getContext == "function" && (n.context = e.getContext("2d")), n;
}, L = function(e) {
  const n = {};
  if (!e) return n;
  const t = N(e, f("type-number")), r = u(e, f("error-correction-level")), o = u(e, f("value")), l = u(e, f("mode")), c = u(e, f("encoding")), i = w(e, f("eci")), d = S(e, f("values"));
  return typeof t == "number" && (n.typeNumber = t), r && (n.errorCorrectionLevel = r), d ? n.data = d : typeof o == "string" && (n.data = o), l && (n.mode = l), (c || typeof i < "u") && (n.opts = {}, c && (n.opts.encoding = c), typeof i < "u" && (n.opts.eci = i)), n;
}, T = function(e) {
  if (typeof e == "string") {
    if (typeof document > "u")
      throw "a selector target requires a DOM document";
    return Array.from(document.querySelectorAll(e));
  }
  return Array.isArray(e) ? e : e && typeof e.getAttribute == "function" ? null : e && typeof e[Symbol.iterator] == "function" || e && typeof e.length == "number" ? Array.from(e) : null;
}, q = function(e, n) {
  return !e.type || e.type === "any" ? !0 : e.type === "object" ? typeof n == "object" && n !== null : typeof n === e.type;
}, x = function(e, n, t) {
  for (let r = 0; r < e.length; r += 1)
    if (typeof n[e[r].name] > "u" && q(e[r], t))
      return e[r];
  return null;
}, D = function(e, n, t, r) {
  const o = { renderer: e }, l = n.args || [];
  return r && R(o, r), t.forEach((c) => {
    const i = x(l, o, c);
    if (s(c) && !i?.positionalOnly) {
      R(o, c);
      return;
    }
    i && z(o, i.name, c);
  }), typeof o.cell == "string" || s(o.cell) ? o.cell = C(void 0, o.cell) : s(o.cell) || (o.cell = {}), typeof o.background == "string" || s(o.background) ? o.background = C(void 0, o.background) : s(o.background) || (o.background = {}), typeof o.cellSize == "number" && typeof o.cell.size != "number" && (o.cell.size = o.cellSize), typeof o.cell.size == "number" && typeof o.cellSize != "number" && (o.cellSize = o.cell.size), typeof o.cellColor == "string" && typeof o.cell.color != "string" && (o.cell.color = o.cellColor), typeof o.cell.color == "string" && typeof o.cellColor != "string" && (o.cellColor = o.cell.color), typeof o.backgroundColor == "string" && typeof o.background.color != "string" && (o.background.color = o.backgroundColor), typeof o.background.color == "string" && typeof o.backgroundColor != "string" && (o.backgroundColor = o.background.color), o;
}, E = function(e, n) {
  e.render = function(t, ...r) {
    let o, l;
    if (typeof t == "string") {
      const i = O(t);
      o = i.name, l = i.opts;
    } else if (s(t) && t?.renderer) {
      const i = t, { renderer: d, ...p } = i, m = O(d), b = v(p.target);
      o = m.name || b.renderer, l = { ...b, ...m.opts, ...p };
    } else if (s(t)) {
      const i = t, d = v(i.target);
      o = d.renderer, l = { ...d, ...i };
    }
    if (!o) return "[QRCode Object]";
    const c = n.getRenderer(o);
    if (!c)
      throw "unknown renderer: " + o;
    return e.make(), c.render.call(e, D(o, c, r, l));
  };
};
a.registerRenderer = function(e, n) {
  A[e] = n;
};
a.getRenderer = function(e) {
  return A[e];
};
a.render = function(e) {
  const n = T(e?.target);
  if (n) {
    if (typeof e.data < "u")
      throw "data must be provided by data-qrcode-value or data-qrcode-values for multiple targets";
    return n.map((i) => a.render({ ...e, target: i }));
  }
  const r = { ...L(e?.target), ...e || {} }, o = typeof r.typeNumber == "number" ? r.typeNumber : 0, l = r.errorCorrectionLevel || "L", c = a(o, l);
  if (typeof r.data == "string")
    c.addData(r.data, r.mode, r.opts);
  else if (Array.isArray(r.data))
    c.addData(r.data);
  else
    throw "data is required";
  return c.render(r);
};
a.use(E);
const F = a.registerRenderer, J = a.getRenderer;
export {
  J as getRenderer,
  F as registerRenderer
};
//# sourceMappingURL=registry.mjs.map
