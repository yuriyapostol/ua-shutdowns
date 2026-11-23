const q = {}, tt = {}, nt = [], et = [], k = function(i = 0, d = "M") {
  const _ = i;
  let o = i;
  const p = K[d];
  let l = null, t = 0, u = null;
  const c = [], h = function(e, a) {
    t = o * 4 + 17, l = (function(n) {
      const s = new Array(n);
      for (let r = 0; r < n; r += 1) {
        s[r] = new Array(n);
        for (let A = 0; A < n; A += 1)
          s[r][A] = null;
      }
      return s;
    })(t), x(0, 0), x(t - 7, 0), x(0, t - 7), T(), f(), J(e, a), o >= 7 && j(e), u == null && (u = I(o, p, c)), E(u, a);
  }, x = function(e, a) {
    for (let n = -1; n <= 7; n += 1)
      if (!(e + n <= -1 || t <= e + n))
        for (let s = -1; s <= 7; s += 1)
          a + s <= -1 || t <= a + s || (0 <= n && n <= 6 && (s == 0 || s == 6) || 0 <= s && s <= 6 && (n == 0 || n == 6) || 2 <= n && n <= 4 && 2 <= s && s <= 4 ? l[e + n][a + s] = !0 : l[e + n][a + s] = !1);
  }, g = function() {
    let e = 0, a = 0;
    for (let n = 0; n < 8; n += 1) {
      h(!0, n);
      const s = H.getLostPoint(Q);
      (n == 0 || e > s) && (e = s, a = n);
    }
    return a;
  }, f = function() {
    for (let e = 8; e < t - 8; e += 1)
      l[e][6] == null && (l[e][6] = e % 2 == 0);
    for (let e = 8; e < t - 8; e += 1)
      l[6][e] == null && (l[6][e] = e % 2 == 0);
  }, T = function() {
    const e = H.getPatternPosition(o);
    for (let a = 0; a < e.length; a += 1)
      for (let n = 0; n < e.length; n += 1) {
        const s = e[a], r = e[n];
        if (l[s][r] == null)
          for (let A = -2; A <= 2; A += 1)
            for (let L = -2; L <= 2; L += 1)
              A == -2 || A == 2 || L == -2 || L == 2 || A == 0 && L == 0 ? l[s + A][r + L] = !0 : l[s + A][r + L] = !1;
      }
  }, j = function(e) {
    const a = H.getBCHTypeNumber(o);
    for (let n = 0; n < 18; n += 1) {
      const s = !e && (a >> n & 1) == 1;
      l[Math.floor(n / 3)][n % 3 + t - 8 - 3] = s;
    }
    for (let n = 0; n < 18; n += 1) {
      const s = !e && (a >> n & 1) == 1;
      l[n % 3 + t - 8 - 3][Math.floor(n / 3)] = s;
    }
  }, J = function(e, a) {
    const n = p << 3 | a, s = H.getBCHTypeInfo(n);
    for (let r = 0; r < 15; r += 1) {
      const A = !e && (s >> r & 1) == 1;
      r < 6 ? l[r][8] = A : r < 8 ? l[r + 1][8] = A : l[t - 15 + r][8] = A;
    }
    for (let r = 0; r < 15; r += 1) {
      const A = !e && (s >> r & 1) == 1;
      r < 8 ? l[8][t - r - 1] = A : r < 9 ? l[8][15 - r - 1 + 1] = A : l[8][15 - r - 1] = A;
    }
    l[t - 8][8] = !e;
  }, E = function(e, a) {
    let n = -1, s = t - 1, r = 7, A = 0;
    const L = H.getMaskFunction(a);
    for (let y = t - 1; y > 0; y -= 2)
      for (y == 6 && (y -= 1); ; ) {
        for (let R = 0; R < 2; R += 1)
          if (l[s][y - R] == null) {
            let m = !1;
            A < e.length && (m = (e[A] >>> r & 1) == 1), L(s, y - R) && (m = !m), l[s][y - R] = m, r -= 1, r == -1 && (A += 1, r = 7);
          }
        if (s += n, s < 0 || t <= s) {
          s -= n, n = -n;
          break;
        }
      }
  }, w = function(e, a) {
    let n = 0, s = 0, r = 0;
    const A = new Array(a.length), L = new Array(a.length);
    for (let B = 0; B < a.length; B += 1) {
      const C = a[B].dataCount, $ = a[B].totalCount - C;
      s = Math.max(s, C), r = Math.max(r, $), A[B] = new Array(C);
      for (let O = 0; O < A[B].length; O += 1)
        A[B][O] = 255 & e.getBuffer()[O + n];
      n += C;
      const Y = H.getErrorCorrectPolynomial($), X = v(A[B], Y.getLength() - 1).mod(Y);
      L[B] = new Array(Y.getLength() - 1);
      for (let O = 0; O < L[B].length; O += 1) {
        const Z = O + X.getLength() - L[B].length;
        L[B][O] = Z >= 0 ? X.getAt(Z) : 0;
      }
    }
    let y = 0;
    for (let B = 0; B < a.length; B += 1)
      y += a[B].totalCount;
    const R = new Array(y);
    let m = 0;
    for (let B = 0; B < s; B += 1)
      for (let C = 0; C < a.length; C += 1)
        B < A[C].length && (R[m] = A[C][B], m += 1);
    for (let B = 0; B < r; B += 1)
      for (let C = 0; C < a.length; C += 1)
        B < L[C].length && (R[m] = L[C][B], m += 1);
    return R;
  }, I = function(e, a, n) {
    const s = z.getRSBlocks(e, a), r = V();
    for (let L = 0; L < n.length; L += 1) {
      const y = n[L];
      r.put(y.getMode(), 4), y.getMode() !== P.MODE_ECI && r.put(y.getLength(), H.getLengthInBits(y.getMode(), e)), y.write(r);
    }
    let A = 0;
    for (let L = 0; L < s.length; L += 1)
      A += s[L].dataCount;
    if (r.getLengthInBits() > A * 8)
      throw "code length overflow. (" + r.getLengthInBits() + ">" + A * 8 + ")";
    for (r.getLengthInBits() + 4 <= A * 8 && r.put(0, 4); r.getLengthInBits() % 8 != 0; )
      r.putBit(!1);
    for (; !(r.getLengthInBits() >= A * 8 || (r.put(236, 8), r.getLengthInBits() >= A * 8)); )
      r.put(17, 8);
    return w(r, s);
  }, F = function(e, a) {
    if (typeof a?.encoding == "string")
      return a.encoding;
    const n = k.getDefaultEncoding(e);
    if (typeof n == "string")
      return n;
    if (e === "Byte" && k.getEncoder("UTF-8"))
      return "UTF-8";
    if (e === "Kanji" && k.getEncoder("SJIS"))
      return "SJIS";
  }, b = function(e, a) {
    const n = F(e, a);
    if (!n)
      return;
    const s = k.getEncoder(n);
    if (!s)
      throw "unknown encoding: " + n;
    if (s.modes && s.modes.indexOf(e) < 0)
      throw "encoding not supported for mode: " + e + "/" + n;
    return s;
  }, N = function(e, a) {
    let n;
    if (typeof e?.eci == "number")
      n = e.eci;
    else if (e?.eci === !0 && (n = a.eci, typeof n != "number"))
      throw "eci not supported for encoding";
    typeof n == "number" && c.push(ct(n));
  }, G = function(e, a, n) {
    if (Array.isArray(e)) {
      e.forEach((r) => {
        G(r[0], r[1], r[2]);
      });
      return;
    }
    a = a || "Byte";
    let s = null;
    switch (a) {
      case "Numeric":
        if (typeof n < "u")
          throw "options not supported for mode:" + a;
        s = ot(e);
        break;
      case "Alphanumeric":
        if (typeof n < "u")
          throw "options not supported for mode:" + a;
        s = rt(e);
        break;
      case "Byte": {
        const r = b("Byte", n);
        if (r)
          N(n, r), s = W(e, r.encode);
        else {
          if (typeof n?.eci < "u")
            throw "eci not supported without encoding";
          s = W(e);
        }
        break;
      }
      case "Kanji": {
        const r = b("Kanji", n);
        if (!r)
          throw "sjis not supported.";
        N(n, r), s = it(e, r.encode);
        break;
      }
      default:
        throw "mode:" + a;
    }
    c.push(s), u = null, _ < 1 && (o = _);
  }, Q = {
    addData: G,
    clear: function() {
      o = _, l = null, t = 0, u = null, c.length = 0;
    },
    isDark: function(e, a) {
      if (e < 0 || t <= e || a < 0 || t <= a)
        throw e + "," + a;
      return l[e][a];
    },
    getModuleCount: function() {
      return t;
    },
    make: function() {
      if (_ < 1) {
        let e = 1;
        for (; e < 40; e++) {
          const a = z.getRSBlocks(e, p), n = V();
          for (let r = 0; r < c.length; r++) {
            const A = c[r];
            n.put(A.getMode(), 4), A.getMode() !== P.MODE_ECI && n.put(A.getLength(), H.getLengthInBits(A.getMode(), e)), A.write(n);
          }
          let s = 0;
          for (let r = 0; r < a.length; r++)
            s += a[r].dataCount;
          if (n.getLengthInBits() <= s * 8)
            break;
        }
        o = e;
      }
      h(!1, g());
    }
  };
  return nt.forEach((e) => {
    e(Q, k);
  }), et.push(Q), Q;
};
k.registerEncoder = function(i, d) {
  q[i] = d;
};
k.getEncoder = function(i) {
  return q[i];
};
k.setDefaultEncoding = function(i, d) {
  if (!k.getEncoder(d))
    throw "unknown encoding: " + d;
  tt[i] = d;
};
k.getDefaultEncoding = function(i) {
  return tt[i];
};
k.use = function(i) {
  nt.push(i), et.forEach((d) => {
    i(d, k);
  });
};
k.stringToBytes = function(i) {
  const d = [];
  for (let M = 0; M < i.length; M += 1) {
    const D = i.charCodeAt(M);
    d.push(D & 255);
  }
  return d;
};
const P = {
  MODE_NUMBER: 1,
  MODE_ALPHA_NUM: 2,
  MODE_8BIT_BYTE: 4,
  MODE_ECI: 7,
  MODE_KANJI: 8
}, K = {
  L: 1,
  M: 0,
  Q: 3,
  H: 2
}, S = {
  PATTERN000: 0,
  PATTERN001: 1,
  PATTERN010: 2,
  PATTERN011: 3,
  PATTERN100: 4,
  PATTERN101: 5,
  PATTERN110: 6,
  PATTERN111: 7
}, H = /* @__PURE__ */ (function() {
  const i = [
    [],
    [6, 18],
    [6, 22],
    [6, 26],
    [6, 30],
    [6, 34],
    [6, 22, 38],
    [6, 24, 42],
    [6, 26, 46],
    [6, 28, 50],
    [6, 30, 54],
    [6, 32, 58],
    [6, 34, 62],
    [6, 26, 46, 66],
    [6, 26, 48, 70],
    [6, 26, 50, 74],
    [6, 30, 54, 78],
    [6, 30, 56, 82],
    [6, 30, 58, 86],
    [6, 34, 62, 90],
    [6, 28, 50, 72, 94],
    [6, 26, 50, 74, 98],
    [6, 30, 54, 78, 102],
    [6, 28, 54, 80, 106],
    [6, 32, 58, 84, 110],
    [6, 30, 58, 86, 114],
    [6, 34, 62, 90, 118],
    [6, 26, 50, 74, 98, 122],
    [6, 30, 54, 78, 102, 126],
    [6, 26, 52, 78, 104, 130],
    [6, 30, 56, 82, 108, 134],
    [6, 34, 60, 86, 112, 138],
    [6, 30, 58, 86, 114, 142],
    [6, 34, 62, 90, 118, 146],
    [6, 30, 54, 78, 102, 126, 150],
    [6, 24, 50, 76, 102, 128, 154],
    [6, 28, 54, 80, 106, 132, 158],
    [6, 32, 58, 84, 110, 136, 162],
    [6, 26, 54, 82, 110, 138, 166],
    [6, 30, 58, 86, 114, 142, 170]
  ], d = 1335, M = 7973, D = 21522, _ = function(g) {
    let f = 0;
    for (; g != 0; )
      f += 1, g >>>= 1;
    return f;
  };
  return {
    getBCHTypeInfo: function(g) {
      let f = g << 10;
      for (; _(f) - _(d) >= 0; )
        f ^= d << _(f) - _(d);
      return (g << 10 | f) ^ D;
    },
    getBCHTypeNumber: function(g) {
      let f = g << 12;
      for (; _(f) - _(M) >= 0; )
        f ^= M << _(f) - _(M);
      return g << 12 | f;
    },
    getPatternPosition: function(g) {
      return i[g - 1];
    },
    getMaskFunction: function(g) {
      switch (g) {
        case S.PATTERN000:
          return function(f, T) {
            return (f + T) % 2 == 0;
          };
        case S.PATTERN001:
          return function(f, T) {
            return f % 2 == 0;
          };
        case S.PATTERN010:
          return function(f, T) {
            return T % 3 == 0;
          };
        case S.PATTERN011:
          return function(f, T) {
            return (f + T) % 3 == 0;
          };
        case S.PATTERN100:
          return function(f, T) {
            return (Math.floor(f / 2) + Math.floor(T / 3)) % 2 == 0;
          };
        case S.PATTERN101:
          return function(f, T) {
            return f * T % 2 + f * T % 3 == 0;
          };
        case S.PATTERN110:
          return function(f, T) {
            return (f * T % 2 + f * T % 3) % 2 == 0;
          };
        case S.PATTERN111:
          return function(f, T) {
            return (f * T % 3 + (f + T) % 2) % 2 == 0;
          };
        default:
          throw "bad maskPattern:" + g;
      }
    },
    getErrorCorrectPolynomial: function(g) {
      let f = v([1], 0);
      for (let T = 0; T < g; T += 1)
        f = f.multiply(v([1, U.gexp(T)], 0));
      return f;
    },
    getLengthInBits: function(g, f) {
      if (1 <= f && f < 10)
        switch (g) {
          case P.MODE_NUMBER:
            return 10;
          case P.MODE_ALPHA_NUM:
            return 9;
          case P.MODE_8BIT_BYTE:
            return 8;
          case P.MODE_KANJI:
            return 8;
          default:
            throw "mode:" + g;
        }
      else if (f < 27)
        switch (g) {
          case P.MODE_NUMBER:
            return 12;
          case P.MODE_ALPHA_NUM:
            return 11;
          case P.MODE_8BIT_BYTE:
            return 16;
          case P.MODE_KANJI:
            return 10;
          default:
            throw "mode:" + g;
        }
      else if (f < 41)
        switch (g) {
          case P.MODE_NUMBER:
            return 14;
          case P.MODE_ALPHA_NUM:
            return 13;
          case P.MODE_8BIT_BYTE:
            return 16;
          case P.MODE_KANJI:
            return 12;
          default:
            throw "mode:" + g;
        }
      else
        throw "type:" + f;
    },
    getLostPoint: function(g) {
      const f = g.getModuleCount();
      let T = 0;
      for (let E = 0; E < f; E += 1)
        for (let w = 0; w < f; w += 1) {
          let I = 0;
          const F = g.isDark(E, w);
          for (let b = -1; b <= 1; b += 1)
            if (!(E + b < 0 || f <= E + b))
              for (let N = -1; N <= 1; N += 1)
                w + N < 0 || f <= w + N || b == 0 && N == 0 || F == g.isDark(E + b, w + N) && (I += 1);
          I > 5 && (T += 3 + I - 5);
        }
      for (let E = 0; E < f - 1; E += 1)
        for (let w = 0; w < f - 1; w += 1) {
          let I = 0;
          g.isDark(E, w) && (I += 1), g.isDark(E + 1, w) && (I += 1), g.isDark(E, w + 1) && (I += 1), g.isDark(E + 1, w + 1) && (I += 1), (I == 0 || I == 4) && (T += 3);
        }
      for (let E = 0; E < f; E += 1)
        for (let w = 0; w < f - 6; w += 1)
          g.isDark(E, w) && !g.isDark(E, w + 1) && g.isDark(E, w + 2) && g.isDark(E, w + 3) && g.isDark(E, w + 4) && !g.isDark(E, w + 5) && g.isDark(E, w + 6) && (T += 40);
      for (let E = 0; E < f; E += 1)
        for (let w = 0; w < f - 6; w += 1)
          g.isDark(w, E) && !g.isDark(w + 1, E) && g.isDark(w + 2, E) && g.isDark(w + 3, E) && g.isDark(w + 4, E) && !g.isDark(w + 5, E) && g.isDark(w + 6, E) && (T += 40);
      let j = 0;
      for (let E = 0; E < f; E += 1)
        for (let w = 0; w < f; w += 1)
          g.isDark(w, E) && (j += 1);
      const J = Math.abs(100 * j / f / f - 50) / 5;
      return T += J * 10, T;
    }
  };
})(), U = (function() {
  const i = new Array(256), d = new Array(256);
  for (let o = 0; o < 8; o += 1)
    i[o] = 1 << o;
  for (let o = 8; o < 256; o += 1)
    i[o] = i[o - 4] ^ i[o - 5] ^ i[o - 6] ^ i[o - 8];
  for (let o = 0; o < 255; o += 1)
    d[i[o]] = o;
  return {
    glog: function(o) {
      if (o < 1)
        throw "glog(" + o + ")";
      return d[o];
    },
    gexp: function(o) {
      for (; o < 0; )
        o += 255;
      for (; o >= 256; )
        o -= 255;
      return i[o];
    }
  };
})(), v = function(i, d) {
  if (typeof i.length > "u")
    throw i.length + "/" + d;
  const M = (function() {
    let t = 0;
    for (; t < i.length && i[t] == 0; )
      t += 1;
    const u = new Array(i.length - t + d);
    for (let c = 0; c < i.length - t; c += 1)
      u[c] = i[c + t];
    return u;
  })(), l = {
    getAt: function(t) {
      return M[t];
    },
    getLength: function() {
      return M.length;
    },
    multiply: function(t) {
      const u = new Array(l.getLength() + t.getLength() - 1);
      for (let c = 0; c < l.getLength(); c += 1)
        for (let h = 0; h < t.getLength(); h += 1)
          u[c + h] ^= U.gexp(U.glog(l.getAt(c)) + U.glog(t.getAt(h)));
      return v(u, 0);
    },
    mod: function(t) {
      if (l.getLength() - t.getLength() < 0)
        return l;
      const u = U.glog(l.getAt(0)) - U.glog(t.getAt(0)), c = new Array(l.getLength());
      for (let h = 0; h < l.getLength(); h += 1)
        c[h] = l.getAt(h);
      for (let h = 0; h < t.getLength(); h += 1)
        c[h] ^= U.gexp(U.glog(t.getAt(h)) + u);
      return v(c, 0).mod(t);
    }
  };
  return l;
}, z = /* @__PURE__ */ (function() {
  const i = [
    // L
    // M
    // Q
    // H
    // 1
    [1, 26, 19],
    [1, 26, 16],
    [1, 26, 13],
    [1, 26, 9],
    // 2
    [1, 44, 34],
    [1, 44, 28],
    [1, 44, 22],
    [1, 44, 16],
    // 3
    [1, 70, 55],
    [1, 70, 44],
    [2, 35, 17],
    [2, 35, 13],
    // 4
    [1, 100, 80],
    [2, 50, 32],
    [2, 50, 24],
    [4, 25, 9],
    // 5
    [1, 134, 108],
    [2, 67, 43],
    [2, 33, 15, 2, 34, 16],
    [2, 33, 11, 2, 34, 12],
    // 6
    [2, 86, 68],
    [4, 43, 27],
    [4, 43, 19],
    [4, 43, 15],
    // 7
    [2, 98, 78],
    [4, 49, 31],
    [2, 32, 14, 4, 33, 15],
    [4, 39, 13, 1, 40, 14],
    // 8
    [2, 121, 97],
    [2, 60, 38, 2, 61, 39],
    [4, 40, 18, 2, 41, 19],
    [4, 40, 14, 2, 41, 15],
    // 9
    [2, 146, 116],
    [3, 58, 36, 2, 59, 37],
    [4, 36, 16, 4, 37, 17],
    [4, 36, 12, 4, 37, 13],
    // 10
    [2, 86, 68, 2, 87, 69],
    [4, 69, 43, 1, 70, 44],
    [6, 43, 19, 2, 44, 20],
    [6, 43, 15, 2, 44, 16],
    // 11
    [4, 101, 81],
    [1, 80, 50, 4, 81, 51],
    [4, 50, 22, 4, 51, 23],
    [3, 36, 12, 8, 37, 13],
    // 12
    [2, 116, 92, 2, 117, 93],
    [6, 58, 36, 2, 59, 37],
    [4, 46, 20, 6, 47, 21],
    [7, 42, 14, 4, 43, 15],
    // 13
    [4, 133, 107],
    [8, 59, 37, 1, 60, 38],
    [8, 44, 20, 4, 45, 21],
    [12, 33, 11, 4, 34, 12],
    // 14
    [3, 145, 115, 1, 146, 116],
    [4, 64, 40, 5, 65, 41],
    [11, 36, 16, 5, 37, 17],
    [11, 36, 12, 5, 37, 13],
    // 15
    [5, 109, 87, 1, 110, 88],
    [5, 65, 41, 5, 66, 42],
    [5, 54, 24, 7, 55, 25],
    [11, 36, 12, 7, 37, 13],
    // 16
    [5, 122, 98, 1, 123, 99],
    [7, 73, 45, 3, 74, 46],
    [15, 43, 19, 2, 44, 20],
    [3, 45, 15, 13, 46, 16],
    // 17
    [1, 135, 107, 5, 136, 108],
    [10, 74, 46, 1, 75, 47],
    [1, 50, 22, 15, 51, 23],
    [2, 42, 14, 17, 43, 15],
    // 18
    [5, 150, 120, 1, 151, 121],
    [9, 69, 43, 4, 70, 44],
    [17, 50, 22, 1, 51, 23],
    [2, 42, 14, 19, 43, 15],
    // 19
    [3, 141, 113, 4, 142, 114],
    [3, 70, 44, 11, 71, 45],
    [17, 47, 21, 4, 48, 22],
    [9, 39, 13, 16, 40, 14],
    // 20
    [3, 135, 107, 5, 136, 108],
    [3, 67, 41, 13, 68, 42],
    [15, 54, 24, 5, 55, 25],
    [15, 43, 15, 10, 44, 16],
    // 21
    [4, 144, 116, 4, 145, 117],
    [17, 68, 42],
    [17, 50, 22, 6, 51, 23],
    [19, 46, 16, 6, 47, 17],
    // 22
    [2, 139, 111, 7, 140, 112],
    [17, 74, 46],
    [7, 54, 24, 16, 55, 25],
    [34, 37, 13],
    // 23
    [4, 151, 121, 5, 152, 122],
    [4, 75, 47, 14, 76, 48],
    [11, 54, 24, 14, 55, 25],
    [16, 45, 15, 14, 46, 16],
    // 24
    [6, 147, 117, 4, 148, 118],
    [6, 73, 45, 14, 74, 46],
    [11, 54, 24, 16, 55, 25],
    [30, 46, 16, 2, 47, 17],
    // 25
    [8, 132, 106, 4, 133, 107],
    [8, 75, 47, 13, 76, 48],
    [7, 54, 24, 22, 55, 25],
    [22, 45, 15, 13, 46, 16],
    // 26
    [10, 142, 114, 2, 143, 115],
    [19, 74, 46, 4, 75, 47],
    [28, 50, 22, 6, 51, 23],
    [33, 46, 16, 4, 47, 17],
    // 27
    [8, 152, 122, 4, 153, 123],
    [22, 73, 45, 3, 74, 46],
    [8, 53, 23, 26, 54, 24],
    [12, 45, 15, 28, 46, 16],
    // 28
    [3, 147, 117, 10, 148, 118],
    [3, 73, 45, 23, 74, 46],
    [4, 54, 24, 31, 55, 25],
    [11, 45, 15, 31, 46, 16],
    // 29
    [7, 146, 116, 7, 147, 117],
    [21, 73, 45, 7, 74, 46],
    [1, 53, 23, 37, 54, 24],
    [19, 45, 15, 26, 46, 16],
    // 30
    [5, 145, 115, 10, 146, 116],
    [19, 75, 47, 10, 76, 48],
    [15, 54, 24, 25, 55, 25],
    [23, 45, 15, 25, 46, 16],
    // 31
    [13, 145, 115, 3, 146, 116],
    [2, 74, 46, 29, 75, 47],
    [42, 54, 24, 1, 55, 25],
    [23, 45, 15, 28, 46, 16],
    // 32
    [17, 145, 115],
    [10, 74, 46, 23, 75, 47],
    [10, 54, 24, 35, 55, 25],
    [19, 45, 15, 35, 46, 16],
    // 33
    [17, 145, 115, 1, 146, 116],
    [14, 74, 46, 21, 75, 47],
    [29, 54, 24, 19, 55, 25],
    [11, 45, 15, 46, 46, 16],
    // 34
    [13, 145, 115, 6, 146, 116],
    [14, 74, 46, 23, 75, 47],
    [44, 54, 24, 7, 55, 25],
    [59, 46, 16, 1, 47, 17],
    // 35
    [12, 151, 121, 7, 152, 122],
    [12, 75, 47, 26, 76, 48],
    [39, 54, 24, 14, 55, 25],
    [22, 45, 15, 41, 46, 16],
    // 36
    [6, 151, 121, 14, 152, 122],
    [6, 75, 47, 34, 76, 48],
    [46, 54, 24, 10, 55, 25],
    [2, 45, 15, 64, 46, 16],
    // 37
    [17, 152, 122, 4, 153, 123],
    [29, 74, 46, 14, 75, 47],
    [49, 54, 24, 10, 55, 25],
    [24, 45, 15, 46, 46, 16],
    // 38
    [4, 152, 122, 18, 153, 123],
    [13, 74, 46, 32, 75, 47],
    [48, 54, 24, 14, 55, 25],
    [42, 45, 15, 32, 46, 16],
    // 39
    [20, 147, 117, 4, 148, 118],
    [40, 75, 47, 7, 76, 48],
    [43, 54, 24, 22, 55, 25],
    [10, 45, 15, 67, 46, 16],
    // 40
    [19, 148, 118, 6, 149, 119],
    [18, 75, 47, 31, 76, 48],
    [34, 54, 24, 34, 55, 25],
    [20, 45, 15, 61, 46, 16]
  ], d = function(o, p) {
    return {
      totalCount: o,
      dataCount: p
    };
  }, M = function(o, p) {
    switch (p) {
      case K.L:
        return i[(o - 1) * 4 + 0];
      case K.M:
        return i[(o - 1) * 4 + 1];
      case K.Q:
        return i[(o - 1) * 4 + 2];
      case K.H:
        return i[(o - 1) * 4 + 3];
      default:
        return;
    }
  };
  return {
    getRSBlocks: function(o, p) {
      const l = M(o, p);
      if (typeof l > "u")
        throw "bad rs block @ typeNumber:" + o + "/errorCorrectionLevel:" + p;
      const t = l.length / 3, u = [];
      for (let c = 0; c < t; c += 1) {
        const h = l[c * 3 + 0], x = l[c * 3 + 1], g = l[c * 3 + 2];
        for (let f = 0; f < h; f += 1)
          u.push(d(x, g));
      }
      return u;
    }
  };
})(), V = function() {
  const i = [];
  let d = 0;
  const l = {
    getBuffer: function() {
      return i;
    },
    getAt: function(t) {
      const u = Math.floor(t / 8);
      return (i[u] >>> 7 - t % 8 & 1) == 1;
    },
    put: function(t, u) {
      for (let c = 0; c < u; c += 1)
        l.putBit((t >>> u - c - 1 & 1) == 1);
    },
    getLengthInBits: function() {
      return d;
    },
    putBit: function(t) {
      const u = Math.floor(d / 8);
      i.length <= u && i.push(0), t && (i[u] |= 128 >>> d % 8), d += 1;
    }
  };
  return l;
}, ot = function(i) {
  const d = P.MODE_NUMBER, M = i, D = function() {
    return d;
  }, _ = function() {
    return M.length;
  }, o = function(u) {
    const c = M;
    let h = 0;
    for (; h + 2 < c.length; )
      u.put(p(c.substring(h, h + 3)), 10), h += 3;
    h < c.length && (c.length - h == 1 ? u.put(p(c.substring(h, h + 1)), 4) : c.length - h == 2 && u.put(p(c.substring(h, h + 2)), 7));
  }, p = function(u) {
    let c = 0;
    for (let h = 0; h < u.length; h += 1)
      c = c * 10 + l(u.charAt(h));
    return c;
  }, l = function(u) {
    if ("0" <= u && u <= "9")
      return u.charCodeAt(0) - 48;
    throw "illegal char :" + u;
  };
  return { getMode: D, getLength: _, write: o };
}, rt = function(i) {
  const d = P.MODE_ALPHA_NUM, M = i, D = function() {
    return d;
  }, _ = function() {
    return M.length;
  }, o = function(t) {
    const u = M;
    let c = 0;
    for (; c + 1 < u.length; )
      t.put(
        p(u.charAt(c)) * 45 + p(u.charAt(c + 1)),
        11
      ), c += 2;
    c < u.length && t.put(p(u.charAt(c)), 6);
  }, p = function(t) {
    if ("0" <= t && t <= "9")
      return t.charCodeAt(0) - 48;
    if ("A" <= t && t <= "Z")
      return t.charCodeAt(0) - 65 + 10;
    switch (t) {
      case " ":
        return 36;
      case "$":
        return 37;
      case "%":
        return 38;
      case "*":
        return 39;
      case "+":
        return 40;
      case "-":
        return 41;
      case ".":
        return 42;
      case "/":
        return 43;
      case ":":
        return 44;
      default:
        throw "illegal char :" + t;
    }
  };
  return { getMode: D, getLength: _, write: o };
}, W = function(i, d) {
  const M = P.MODE_8BIT_BYTE, D = (d || k.stringToBytes)(i);
  return { getMode: function() {
    return M;
  }, getLength: function() {
    return D.length;
  }, write: function(t) {
    for (let u = 0; u < D.length; u += 1)
      t.put(D[u], 8);
  } };
}, it = function(i, d) {
  const M = P.MODE_KANJI;
  (function(t, u) {
    const c = d(t);
    if (c.length != 2 || (c[0] << 8 | c[1]) != u)
      throw "sjis not supported.";
  })("友", 38726);
  const D = d(i);
  return { getMode: function() {
    return M;
  }, getLength: function() {
    return ~~(D.length / 2);
  }, write: function(t) {
    const u = D;
    let c = 0;
    for (; c + 1 < u.length; ) {
      let h = (255 & u[c]) << 8 | 255 & u[c + 1];
      if (33088 <= h && h <= 40956)
        h -= 33088;
      else if (57408 <= h && h <= 60351)
        h -= 49472;
      else
        throw "illegal char at " + (c + 1) + "/" + h;
      h = (h >>> 8 & 255) * 192 + (h & 255), t.put(h, 13), c += 2;
    }
    if (c < u.length)
      throw "illegal char at " + (c + 1);
  } };
}, ct = function(i) {
  const d = P.MODE_ECI;
  if (i < 0 || i > 999999)
    throw "bad eci assignment number: " + i;
  return { getMode: function() {
    return d;
  }, getLength: function() {
    return 0;
  }, write: function(o) {
    i < 128 ? o.put(i, 8) : i < 16384 ? o.put(32768 | i, 16) : o.put(12582912 | i, 24);
  } };
}, st = function(i) {
  const d = i;
  let M = 0, D = 0, _ = 0;
  const o = function() {
    for (; _ < 8; ) {
      if (M >= d.length) {
        if (_ == 0)
          return -1;
        throw "unexpected end of file./" + _;
      }
      const u = d.charAt(M);
      if (M += 1, u == "=")
        return _ = 0, -1;
      if (u.match(/^\s$/))
        continue;
      D = D << 6 | p(u.charCodeAt(0)), _ += 6;
    }
    const t = D >>> _ - 8 & 255;
    return _ -= 8, t;
  }, p = function(t) {
    if (65 <= t && t <= 90)
      return t - 65;
    if (97 <= t && t <= 122)
      return t - 97 + 26;
    if (48 <= t && t <= 57)
      return t - 48 + 52;
    if (t == 43)
      return 62;
    if (t == 47)
      return 63;
    throw "c:" + t;
  };
  return { read: o };
}, ht = function(i, d) {
  const M = (function() {
    const _ = st(i), o = function() {
      const t = _.read();
      if (t == -1) throw "eof";
      return t;
    };
    let p = 0;
    const l = {};
    for (; ; ) {
      const t = _.read();
      if (t == -1) break;
      const u = o(), c = o(), h = o(), x = String.fromCharCode(t << 8 | u), g = c << 8 | h;
      l[x] = g, p += 1;
    }
    if (p != d)
      throw p + " != " + d;
    return l;
  })(), D = 63;
  return function(_) {
    const o = [];
    for (let p = 0; p < _.length; p += 1) {
      const l = _.charCodeAt(p);
      if (l < 128)
        o.push(l);
      else {
        const t = M[_.charAt(p)];
        typeof t == "number" ? (t & 255) == t ? o.push(t) : (o.push(t >>> 8), o.push(t & 255)) : o.push(D);
      }
    }
    return o;
  };
}, dt = k.stringToBytes;
export {
  ht as createStringToBytes,
  k as default,
  k as qrcode,
  dt as stringToBytes
};
//# sourceMappingURL=qrcode.mjs.map
