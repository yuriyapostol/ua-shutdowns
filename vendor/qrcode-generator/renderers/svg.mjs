import { registerRenderer as k } from "./utils/registry.mjs";
import { escapeXml as l } from "./utils/xml.mjs";
k("svg", {
  args: [
    { name: "cellSize", type: "number" },
    { name: "margin", type: "number" },
    { name: "cellColor", type: "string" },
    { name: "backgroundColor", type: "string" }
  ],
  render: function(t) {
    const n = t.id || "qrcode", y = t.class || "qrcode", b = t.style || "";
    let e = t.cell || {};
    typeof e == "string" && (e = { color: e }), (typeof e != "object" || !e) && (e = {});
    const p = typeof t.scalable < "u" ? t.scalable : !(typeof t.cellSize == "number" || typeof e.size == "number"), m = typeof t.crispEdges < "u" ? t.crispEdges : "auto";
    typeof e.size != "number" && (e.size = typeof t.cellSize == "number" ? t.cellSize : 1), typeof e.color != "string" && (e.color = typeof t.cellColor == "string" ? t.cellColor : "black"), typeof e.style != "string" && (e.style = ""), typeof e.class != "string" && (e.class = `${y}-cells`), typeof e.id != "string" && (e.id = `${n}-cells`);
    let a = t.margin;
    typeof a != "number" && (a = typeof a > "u" ? e.size * 4 : 0);
    let i = t.background || {};
    typeof i == "string" && (i = { color: i }), (typeof i != "object" || !i) && (i = {}), typeof i.color != "string" && (i.color = typeof t.backgroundColor == "string" ? t.backgroundColor : "white"), typeof i.style != "string" && (i.style = ""), typeof i.class != "string" && (i.class = `${y}-background`), typeof i.id != "string" && (i.id = `${n}-background`);
    let o = typeof t.alt == "string" ? { text: t.alt } : t.alt || {};
    o.id = o.text ? o.id || `${n}-description` : null;
    let c = typeof t.title == "string" ? { text: t.title } : t.title || {};
    c.id = c.text ? c.id || `${n}-title` : null;
    const $ = Number(this.getModuleCount()), s = Number(e.size), u = Number(a), d = $ * s + u * 2;
    let r = "";
    const x = `l${s},0 0,${s} -${s},0 0,-${s}z `;
    r += '<svg version="1.1" xmlns="http://www.w3.org/2000/svg"', r += p ? "" : ` width="${d}px" height="${d}px"`, r += ` viewBox="0 0 ${d} ${d}" preserveAspectRatio="xMinYMin meet" id="${l(n)}" class="${l(y)}" style="${l(b)}"`, r += m === !0 || m === "auto" && Math.abs(s - Math.round(s)) < 1e-3 ? ' shape-rendering="crispEdges"' : "", r += c.text || o.text ? ` role="img" aria-labelledby="${l([c.id, o.id].join(" ").trim())}"` : "", r += ">", c.text && (r += `<title id="${l(c.id)}">${l(c.text)}</title>`), o.text && (r += `<description id="${l(o.id)}">${l(o.text)}</description>`), r += `<rect id="${l(i.id)}"${i.class ? ` class="${l(i.class)}"` : ""}${i.style ? ` style="${l(i.style)}"` : ""} width="100%" height="100%"${i.color ? ` fill="${i.color}"` : ""}/>`, r += `<path id="${l(e.id)}"${e.class ? ` class="${l(e.class)}"` : ""}${e.style ? ` style="${l(e.style)}"` : ""} d="`;
    for (let f = 0; f < $; f += 1) {
      const h = f * s + u;
      for (let g = 0; g < $; g += 1)
        if (this.isDark(f, g)) {
          const z = g * s + u;
          r += `M${z},${h}${x}`;
        }
    }
    return r += `"${e.color ? ` fill="${e.color}"` : ""}/></svg>`, r;
  }
});
//# sourceMappingURL=svg.mjs.map
