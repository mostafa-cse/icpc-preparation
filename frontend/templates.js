(function () {
  "use strict";

  const STORE = "icpc_templates";
  const META_STORE = "icpc_templates_meta";

  // Section order mirrors the notebook.pdf table of contents.
  const CATEGORIES = [
    "Data Structure",
    "Dynamic Programming",
    "Flow",
    "Game Theory",
    "Geometry",
    "Graph",
    "Math",
    "Misc",
    "String",
    "Random",
  ];

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- Storage ----------
  // Ids are UUIDs because they double as the primary key in Supabase.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  let templates = [];
  try { templates = JSON.parse(localStorage.getItem(STORE) || "[]"); } catch (e) {}
  if (!Array.isArray(templates)) templates = [];
  // Upgrade ids saved by earlier versions ("t1699…") to UUIDs.
  templates.forEach(t => { if (!UUID_RE.test(t.id || "")) t.id = newId(); });

  let meta = { title: "ICPC Team Notebook", authors: "", date: "" };
  try { Object.assign(meta, JSON.parse(localStorage.getItem(META_STORE) || "{}")); } catch (e) {}

  function persist() {
    localStorage.setItem(STORE, JSON.stringify(templates));
    const sync = window.ICPCTemplates && window.ICPCTemplates.onChange;
    if (typeof sync === "function") sync(templates);
  }
  function persistMeta() { localStorage.setItem(META_STORE, JSON.stringify(meta)); }

  // ---------- Notebook hash ----------
  // Mirrors the notebook's `cpp -dD -P -fpreprocessed | tr -d '[:space:]' | md5sum | cut -c-6`
  // so a template typed from the printed page can be verified against its printed hash.
  function stripCommentsAndSpace(code) {
    let out = "";
    let i = 0;
    const n = code.length;
    while (i < n) {
      const c = code[i], d = code[i + 1];
      if (c === "/" && d === "/") { while (i < n && code[i] !== "\n") i++; continue; }
      if (c === "/" && d === "*") { i += 2; while (i < n && !(code[i] === "*" && code[i + 1] === "/")) i++; i += 2; continue; }
      if (c === '"' || c === "'") {
        const q = c; out += c; i++;
        while (i < n) {
          if (code[i] === "\\") { out += code.slice(i, i + 2); i += 2; continue; }
          out += code[i];
          if (code[i] === q) { i++; break; }
          i++;
        }
        continue;
      }
      if (!/\s/.test(c)) out += c;
      i++;
    }
    return out;
  }

  function md5Hex(str) {
    const bytes = new TextEncoder().encode(str);
    const len = bytes.length;
    const words = new Array((((len + 8) >> 6) + 1) * 16).fill(0);
    for (let i = 0; i < len; i++) words[i >> 2] |= bytes[i] << ((i % 4) * 8);
    words[len >> 2] |= 0x80 << ((len % 4) * 8);
    words[words.length - 2] = len * 8;

    function add(x, y) { const l = (x & 0xffff) + (y & 0xffff); return (((x >> 16) + (y >> 16) + (l >> 16)) << 16) | (l & 0xffff); }
    function rol(x, c) { return (x << c) | (x >>> (32 - c)); }
    function cmn(q, a, b, x, s, t) { return add(rol(add(add(a, q), add(x, t)), s), b); }
    function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
    function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
    function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
    function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }

    let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
    for (let i = 0; i < words.length; i += 16) {
      const oa = a, ob = b, oc = c, od = d, x = words;
      a = ff(a, b, c, d, x[i], 7, -680876936); d = ff(d, a, b, c, x[i + 1], 12, -389564586);
      c = ff(c, d, a, b, x[i + 2], 17, 606105819); b = ff(b, c, d, a, x[i + 3], 22, -1044525330);
      a = ff(a, b, c, d, x[i + 4], 7, -176418897); d = ff(d, a, b, c, x[i + 5], 12, 1200080426);
      c = ff(c, d, a, b, x[i + 6], 17, -1473231341); b = ff(b, c, d, a, x[i + 7], 22, -45705983);
      a = ff(a, b, c, d, x[i + 8], 7, 1770035416); d = ff(d, a, b, c, x[i + 9], 12, -1958414417);
      c = ff(c, d, a, b, x[i + 10], 17, -42063); b = ff(b, c, d, a, x[i + 11], 22, -1990404162);
      a = ff(a, b, c, d, x[i + 12], 7, 1804603682); d = ff(d, a, b, c, x[i + 13], 12, -40341101);
      c = ff(c, d, a, b, x[i + 14], 17, -1502002290); b = ff(b, c, d, a, x[i + 15], 22, 1236535329);

      a = gg(a, b, c, d, x[i + 1], 5, -165796510); d = gg(d, a, b, c, x[i + 6], 9, -1069501632);
      c = gg(c, d, a, b, x[i + 11], 14, 643717713); b = gg(b, c, d, a, x[i], 20, -373897302);
      a = gg(a, b, c, d, x[i + 5], 5, -701558691); d = gg(d, a, b, c, x[i + 10], 9, 38016083);
      c = gg(c, d, a, b, x[i + 15], 14, -660478335); b = gg(b, c, d, a, x[i + 4], 20, -405537848);
      a = gg(a, b, c, d, x[i + 9], 5, 568446438); d = gg(d, a, b, c, x[i + 14], 9, -1019803690);
      c = gg(c, d, a, b, x[i + 3], 14, -187363961); b = gg(b, c, d, a, x[i + 8], 20, 1163531501);
      a = gg(a, b, c, d, x[i + 13], 5, -1444681467); d = gg(d, a, b, c, x[i + 2], 9, -51403784);
      c = gg(c, d, a, b, x[i + 7], 14, 1735328473); b = gg(b, c, d, a, x[i + 12], 20, -1926607734);

      a = hh(a, b, c, d, x[i + 5], 4, -378558); d = hh(d, a, b, c, x[i + 8], 11, -2022574463);
      c = hh(c, d, a, b, x[i + 11], 16, 1839030562); b = hh(b, c, d, a, x[i + 14], 23, -35309556);
      a = hh(a, b, c, d, x[i + 1], 4, -1530992060); d = hh(d, a, b, c, x[i + 4], 11, 1272893353);
      c = hh(c, d, a, b, x[i + 7], 16, -155497632); b = hh(b, c, d, a, x[i + 10], 23, -1094730640);
      a = hh(a, b, c, d, x[i + 13], 4, 681279174); d = hh(d, a, b, c, x[i], 11, -358537222);
      c = hh(c, d, a, b, x[i + 3], 16, -722521979); b = hh(b, c, d, a, x[i + 6], 23, 76029189);
      a = hh(a, b, c, d, x[i + 9], 4, -640364487); d = hh(d, a, b, c, x[i + 12], 11, -421815835);
      c = hh(c, d, a, b, x[i + 15], 16, 530742520); b = hh(b, c, d, a, x[i + 2], 23, -995338651);

      a = ii(a, b, c, d, x[i], 6, -198630844); d = ii(d, a, b, c, x[i + 7], 10, 1126891415);
      c = ii(c, d, a, b, x[i + 14], 15, -1416354905); b = ii(b, c, d, a, x[i + 5], 21, -57434055);
      a = ii(a, b, c, d, x[i + 12], 6, 1700485571); d = ii(d, a, b, c, x[i + 3], 10, -1894986606);
      c = ii(c, d, a, b, x[i + 10], 15, -1051523); b = ii(b, c, d, a, x[i + 1], 21, -2054922799);
      a = ii(a, b, c, d, x[i + 8], 6, 1873313359); d = ii(d, a, b, c, x[i + 15], 10, -30611744);
      c = ii(c, d, a, b, x[i + 6], 15, -1560198380); b = ii(b, c, d, a, x[i + 13], 21, 1309151649);
      a = ii(a, b, c, d, x[i + 4], 6, -145523070); d = ii(d, a, b, c, x[i + 11], 10, -1120210379);
      c = ii(c, d, a, b, x[i + 2], 15, 718787259); b = ii(b, c, d, a, x[i + 9], 21, -343485551);

      a = add(a, oa); b = add(b, ob); c = add(c, oc); d = add(d, od);
    }
    return [a, b, c, d].map(w => {
      let s = "";
      for (let j = 0; j < 4; j++) s += ((w >> (j * 8)) & 0xff).toString(16).padStart(2, "0");
      return s;
    }).join("");
  }

  function lineCount(code) { return code.replace(/\n+$/, "").split("\n").length; }
  function hashOf(code) { return md5Hex(stripCommentsAndSpace(code)).slice(0, 6); }

  // ---------- LaTeX generation ----------
  const UNICODE_TEX = {
    "≤": "$\\le$", "≥": "$\\ge$", "≠": "$\\ne$", "×": "$\\times$", "·": "$\\cdot$",
    "→": "$\\rightarrow$", "←": "$\\leftarrow$", "⇒": "$\\Rightarrow$", "∈": "$\\in$",
    "√": "$\\sqrt{}$", "∑": "$\\sum$", "∏": "$\\prod$", "∞": "$\\infty$", "α": "$\\alpha$",
    "β": "$\\beta$", "θ": "$\\theta$", "π": "$\\pi$", "φ": "$\\varphi$", "μ": "$\\mu$",
    "—": "---", "–": "--", "’": "'", "‘": "'", "“": "``", "”": "''", "…": "\\ldots{}",
    "⌊": "$\\lfloor$", "⌋": "$\\rfloor$", "⌈": "$\\lceil$", "⌉": "$\\rceil$", "≡": "$\\equiv$",
  };

  // Code goes into lstlisting verbatim, which is right for code but means
  // listings sees the raw bytes — and it splits multi-byte UTF-8, so a single
  // "n ≤ 2e5" in a comment aborts the whole build with "Invalid UTF-8 byte
  // sequence" and no PDF at all.
  //
  // Symbols are mapped to their ASCII code equivalents rather than to math
  // macros: inside a listing "<=" reads correctly and can be retyped at a
  // contest, whereas $\le$ would print literally. Anything left unmapped
  // becomes "?" so an unusual character can never cost you the notebook.
  //
  // Signatures are unaffected: hashOf() strips comments and whitespace first,
  // which is where these characters live.
  const UNICODE_CODE = {
    "≤": "<=", "≥": ">=", "≠": "!=", "×": "*", "·": "*", "÷": "/",
    "→": "->", "←": "<-", "⇒": "=>", "∈": " in ", "∞": "inf",
    "√": "sqrt", "∑": "sum", "∏": "prod", "≡": "==",
    "α": "alpha", "β": "beta", "θ": "theta", "π": "pi", "φ": "phi", "μ": "mu",
    "⌊": "floor(", "⌋": ")", "⌈": "ceil(", "⌉": ")",
    "—": "--", "–": "-", "’": "'", "‘": "'", "“": '"', "”": '"',
    "…": "...", " ": " ",
  };

  function texListing(code) {
    return String(code == null ? "" : code)
      .replace(/[^\x00-\x7F]/g, ch => (UNICODE_CODE[ch] !== undefined ? UNICODE_CODE[ch] : "?"))
      // A listing cannot contain its own terminator.
      .replace(/\\end\{lstlisting\}/g, "\\end {lstlisting}");
  }

  function texEscape(s) {
    let out = String(s == null ? "" : s);
    // Park real backslashes so the escapes injected below are not themselves escaped.
    out = out.replace(/\\/g, "\u0000");
    out = out.replace(/([&%$#_{}])/g, "\\$1");
    out = out.replace(/~/g, "\\textasciitilde{}");
    out = out.replace(/\^/g, "\\textasciicircum{}");
    out = out.replace(/\u0000/g, "\\textbackslash{}");
    // Every non-ASCII character, not just the listed ones: inputenc utf8 leaves
    // most of them undefined, and one stray character is enough to abort the
    // build. Known symbols become proper macros, the rest degrade to "?".
    out = out.replace(/[^\x00-\x7F]/g, ch => (UNICODE_TEX[ch] !== undefined ? UNICODE_TEX[ch] : "?"));
    return out;
  }

  function texPreamble() {
    const title = texEscape(meta.title || "ICPC Team Notebook");
    const authors = texEscape(meta.authors || "");
    const date = texEscape(meta.date || new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }));
    return String.raw`% Generated by ICPC Tracker - template library export.
% Compile with:  pdflatex notebook.tex   (run twice so the table of contents resolves)
% Needs: extsizes, geometry, multicol, listings, xcolor, titlesec, tocloft, eso-pic, hyperref.
\documentclass[8pt,a4paper,landscape]{extarticle}

\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage[landscape,a4paper,top=0.9cm,bottom=1.0cm,left=0.8cm,right=1.5cm]{geometry}
\usepackage{multicol}
\usepackage{listings}
\usepackage{xcolor}
\usepackage{amsmath}
\usepackage{amssymb}
\usepackage{graphicx}
\usepackage{titlesec}
\usepackage{tocloft}
\usepackage{eso-pic}
\usepackage[hidelinks]{hyperref}

\newcommand{\nbTitle}{` + title + String.raw`}
\newcommand{\nbAuthors}{` + authors + String.raw`}
\newcommand{\nbDate}{` + date + String.raw`}

% ---------- page furniture: rotated banner down the right margin ----------
\pagestyle{empty}
\AddToShipoutPictureBG{%
  \put(\LenToUnit{\dimexpr\paperwidth-0.62cm\relax},\LenToUnit{2.4cm}){%
    \rotatebox{90}{\scriptsize\sffamily \nbTitle{} - \nbDate}}%
  \put(\LenToUnit{\dimexpr\paperwidth-0.62cm\relax},\LenToUnit{0.9cm}){%
    \rotatebox{90}{\scriptsize\sffamily \thepage}}%
}

% ---------- columns ----------
\setlength{\columnsep}{0.7cm}
\setlength{\columnseprule}{0.4pt}
\renewcommand{\columnseprulecolor}{\color{black!35}}
\setlength{\parindent}{0pt}

% ---------- headings ----------
\titleformat{\section}{\normalfont\Large\bfseries}{\thesection}{0.5em}{}
\titlespacing*{\section}{0pt}{1.6ex plus .2ex}{0.7ex}
\titleformat{\subsection}[hang]{\normalfont\normalsize\bfseries}{\thesubsection}{0.45em}{}%
  [{\vspace{-0.9ex}{\color{black!55}\rule{\linewidth}{0.4pt}}}]
\titlespacing*{\subsection}{0pt}{1.5ex plus .2ex}{0.6ex}

% ---------- contents ----------
\setcounter{tocdepth}{2}
\setlength{\cftbeforesecskip}{0.35ex}
\setlength{\cftbeforesubsecskip}{0.05ex}
\renewcommand{\cfttoctitlefont}{\Large\bfseries}
\renewcommand{\cftaftertoctitle}{\hfill}

% ---------- code listings ----------
\definecolor{nbkw}{HTML}{0B41B8}
\definecolor{nbtype}{HTML}{B02A6B}
\definecolor{nbcomment}{HTML}{0F8A7A}
\definecolor{nbstring}{HTML}{B03030}
\definecolor{nbfaint}{HTML}{7A7A7A}

\lstdefinestyle{nbcpp}{%
  language=C++,
  basicstyle=\ttfamily\fontsize{6.4pt}{7.2pt}\selectfont,
  keywordstyle=\color{nbkw}\bfseries,
  keywordstyle=[2]\color{nbtype},
  commentstyle=\color{nbcomment}\itshape,
  stringstyle=\color{nbstring},
  showstringspaces=false,
  breaklines=true,
  breakatwhitespace=false,
  breakindent=1.2em,
  postbreak=\mbox{\textcolor{nbfaint}{$\hookrightarrow$}\space},
  columns=fullflexible,
  keepspaces=true,
  tabsize=2,
  aboveskip=0.4ex,
  belowskip=0.6ex,
  xleftmargin=0pt,
  upquote=true,
  morekeywords=[2]{ll,ull,vll,vi,vll,pii,pll,int64,int64_t,uint64_t,size_t,string,vector,%
    pair,map,set,queue,stack,priority_queue,bitset,array,tuple,unordered_map,unordered_set,%
    deque,multiset,multimap,complex,ostream,istream}%
}
\lstset{style=nbcpp}

% ---------- template helpers ----------
\newcommand{\nbtpl}[3]{\subsection{#1 \texorpdfstring{{\normalfont\footnotesize [#2 lines] - #3}}{[#2 lines] - #3}}}
\newcommand{\nbdesc}[1]{{\footnotesize #1\par\vspace{0.25em}}}
\newcommand{\nbcx}[2]{{\footnotesize\textbf{Time:}~#1\quad\textbf{Space:}~#2\par\vspace{0.3em}}}
`;
  }

  // The notebook colours user-defined type names the same red as STL containers.
  // listings can't infer them, so harvest declarations and feed them in as `emph`.
  const CPP_RESERVED = new Set(["int","long","char","bool","void","double","float","unsigned","signed",
    "short","const","static","namespace","std","public","private","protected","return","if","else","for",
    "while","do","switch","case","break","continue","new","delete","this","true","false","nullptr",
    "template","typename","operator","friend","inline","virtual","auto","struct","class","union","enum",
    "typedef","using","sizeof","define","include"]);

  function collectTypeNames(list) {
    const names = new Set();
    const add = n => { if (n && n.length > 1 && !CPP_RESERVED.has(n)) names.add(n); };
    const patterns = [
      /\b(?:struct|class|union|enum)\s+([A-Za-z_]\w*)/g,
      /\btypedef\s+[^;]*?([A-Za-z_]\w*)\s*;/g,
      /\busing\s+([A-Za-z_]\w*)\s*=/g,
    ];
    list.forEach(t => {
      const code = t.code || "";
      patterns.forEach(re => {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(code)) !== null) add(m[1]);
      });
    });
    return [...names].sort();
  }

  function buildLatex(list, notes) {
    const used = CATEGORIES.filter(c => list.some(t => t.category === c));
    const extra = [...new Set(list.map(t => t.category))].filter(c => !CATEGORIES.includes(c)).sort();
    const order = [...used, ...extra];

    const parts = [texPreamble()];
    const emph = collectTypeNames(list);
    if (emph.length) {
      parts.push("\n% Type names declared in these templates, coloured like STL types.\n");
      parts.push("\\lstset{emph={" + emph.join(",") + "},emphstyle=\\color{nbtype}}\n");
    }
    parts.push("\n\\begin{document}\n\\thispagestyle{empty}\n");
    // Starred form: columns fill top-to-bottom instead of being balanced on the last page.
    parts.push("\\begin{multicols*}{3}\n");
    parts.push("{\\centering\n  {\\LARGE\\bfseries \\nbTitle\\par}\n  \\vspace{0.4em}\n");
    if (meta.authors) parts.push("  {\\normalsize \\nbAuthors\\par}\n  \\vspace{0.25em}\n");
    parts.push("  \\vspace{0.6em}\n}\n\n");
    parts.push("\\tableofcontents\n\\vspace{0.8em}\n\n");

    order.forEach(cat => {
      parts.push("\\section{" + texEscape(cat) + "}\n");
      list.filter(t => t.category === cat).forEach(t => {
        const code = (t.code || "").replace(/\r\n/g, "\n").replace(/\n+$/, "");
        parts.push("\\nbtpl{" + texEscape(t.title) + "}{" + lineCount(code) + "}{" + texEscape(hashOf(code)) + "}\n");
        if (notes && t.description) parts.push("\\nbdesc{" + texEscape(t.description) + "}\n");
        if (notes && (t.timeComplexity || t.spaceComplexity)) {
          parts.push("\\nbcx{" + texEscape(t.timeComplexity || "--") + "}{" + texEscape(t.spaceComplexity || "--") + "}\n");
        }
        parts.push("\\begin{lstlisting}\n" + texListing(code) + "\n\\end{lstlisting}\n\n");
      });
    });

    parts.push("\\end{multicols*}\n\\end{document}\n");
    return parts.join("");
  }

  function buildMarkdown(list) {
    const used = CATEGORIES.filter(c => list.some(t => t.category === c));
    const extra = [...new Set(list.map(t => t.category))].filter(c => !CATEGORIES.includes(c)).sort();
    const out = ["# " + (meta.title || "ICPC Team Notebook")];
    if (meta.authors) out.push("", meta.authors);
    out.push("");
    [...used, ...extra].forEach(cat => {
      out.push("## " + cat, "");
      list.filter(t => t.category === cat).forEach(t => {
        const code = (t.code || "").replace(/\n+$/, "");
        out.push("### " + t.title + " [" + lineCount(code) + " lines] - " + hashOf(code), "");
        if (t.description) out.push(t.description, "");
        if (t.timeComplexity || t.spaceComplexity) {
          out.push("**Time:** " + (t.timeComplexity || "—") + " · **Space:** " + (t.spaceComplexity || "—"), "");
        }
        out.push("```cpp", code, "```", "");
      });
    });
    return out.join("\n");
  }

  function buildCpp(list) {
    const out = ["// " + (meta.title || "ICPC Team Notebook"), "// Exported from ICPC Tracker", ""];
    list.forEach(t => {
      const code = (t.code || "").replace(/\n+$/, "");
      out.push("// " + "=".repeat(72));
      out.push("// [" + t.category + "] " + t.title + "  [" + lineCount(code) + " lines] - " + hashOf(code));
      if (t.description) out.push("// " + t.description.replace(/\n/g, "\n// "));
      if (t.timeComplexity || t.spaceComplexity) out.push("// Time: " + (t.timeComplexity || "—") + " | Space: " + (t.spaceComplexity || "—"));
      out.push("// " + "=".repeat(72), code, "");
    });
    return out.join("\n");
  }

  function download(name, text, mime) {
    const blob = new Blob([text], { type: mime + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- DOM ----------
  const listEl = document.getElementById("tplList");
  const emptyEl = document.getElementById("tplEmpty");
  const statsEl = document.getElementById("tplStats");
  const editorEl = document.getElementById("tplEditor");
  const searchEl = document.getElementById("tplSearch");
  const catFilterEl = document.getElementById("tplCatFilter");
  const fTitle = document.getElementById("tplTitle");
  const fCat = document.getElementById("tplCat");
  const fDesc = document.getElementById("tplDesc");
  const fTime = document.getElementById("tplTime");
  const fSpace = document.getElementById("tplSpace");
  const fCode = document.getElementById("tplCode");
  const editorHead = document.getElementById("tplEditorHead");

  let editingId = null;

  CATEGORIES.forEach(c => {
    fCat.appendChild(new Option(c, c));
    catFilterEl.appendChild(new Option(c, c));
  });

  function filtered() {
    const q = (searchEl.value || "").trim().toLowerCase();
    const cat = catFilterEl.value;
    return templates.filter(t => {
      if (cat && t.category !== cat) return false;
      if (!q) return true;
      return (t.title + " " + t.description + " " + t.code + " " + t.category).toLowerCase().includes(q);
    });
  }

  function openEditor(id) {
    editingId = id || null;
    const t = id ? templates.find(x => x.id === id) : null;
    editorHead.textContent = t ? "Edit template" : "New template";
    fTitle.value = t ? t.title : "";
    fCat.value = t ? t.category : CATEGORIES[0];
    fDesc.value = t ? t.description : "";
    fTime.value = t ? t.timeComplexity : "";
    fSpace.value = t ? t.spaceComplexity : "";
    fCode.value = t ? t.code : "";
    editorEl.hidden = false;
    fTitle.focus();
    editorEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function closeEditor() { editorEl.hidden = true; editingId = null; }

  function saveTemplate() {
    const title = fTitle.value.trim();
    const code = fCode.value.replace(/\r\n/g, "\n");
    if (!title) { fTitle.focus(); return; }
    if (!code.trim()) { fCode.focus(); return; }
    const payload = {
      title,
      category: fCat.value,
      description: fDesc.value.trim(),
      timeComplexity: fTime.value.trim(),
      spaceComplexity: fSpace.value.trim(),
      code,
    };
    if (editingId) {
      const t = templates.find(x => x.id === editingId);
      Object.assign(t, payload, { updatedAt: new Date().toISOString() });
    } else {
      templates.push(Object.assign({ id: newId(), createdAt: new Date().toISOString() }, payload));
    }
    persist(); closeEditor(); render();
  }

  function render() {
    const list = filtered();
    listEl.innerHTML = "";
    emptyEl.style.display = list.length ? "none" : "";

    const totalLines = templates.reduce((n, t) => n + lineCount(t.code || ""), 0);
    statsEl.innerHTML =
      '<div class="stat"><span class="num">' + templates.length + '</span><span class="label">Templates</span></div>' +
      '<div class="stat"><span class="num">' + new Set(templates.map(t => t.category)).size + '</span><span class="label">Sections</span></div>' +
      '<div class="stat"><span class="num">' + totalLines.toLocaleString() + '</span><span class="label">Lines of code</span></div>';

    const used = CATEGORIES.filter(c => list.some(t => t.category === c));
    const extra = [...new Set(list.map(t => t.category))].filter(c => !CATEGORIES.includes(c)).sort();

    [...used, ...extra].forEach((cat, ci) => {
      const items = list.filter(t => t.category === cat);
      const block = document.createElement("section");
      block.className = "tpl-cat";
      block.innerHTML = '<h3><span class="tpl-cat-num">' + (ci + 1) + '</span>' + esc(cat) + '<span class="tpl-cat-count">' + items.length + '</span></h3>';

      items.forEach((t, ti) => {
        const code = (t.code || "").replace(/\n+$/, "");
        const card = document.createElement("article");
        card.className = "tpl-card";

        const head = document.createElement("header");
        head.className = "tpl-card-head";
        head.innerHTML =
          '<h4><span class="tpl-num">' + (ci + 1) + "." + (ti + 1) + '</span>' + esc(t.title) +
          ' <span class="tpl-sig">[' + lineCount(code) + " lines] - " + esc(hashOf(code)) + '</span></h4>';

        const actions = document.createElement("div");
        actions.className = "tpl-actions";
        ["Copy", "Edit", "Delete"].forEach(label => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "btn" + (label === "Delete" ? " danger" : "");
          b.textContent = label;
          actions.appendChild(b);
          if (label === "Copy") {
            b.addEventListener("click", () => {
              navigator.clipboard.writeText(code).then(() => {
                b.textContent = "Copied";
                setTimeout(() => { b.textContent = "Copy"; }, 1200);
              });
            });
          } else if (label === "Edit") {
            b.addEventListener("click", () => openEditor(t.id));
          } else {
            let armed = false, timer;
            b.addEventListener("click", () => {
              if (!armed) {
                armed = true; b.textContent = "Confirm?";
                timer = setTimeout(() => { armed = false; b.textContent = "Delete"; }, 3000);
                return;
              }
              clearTimeout(timer);
              templates = templates.filter(x => x.id !== t.id);
              persist(); render();
            });
          }
        });
        head.appendChild(actions);
        card.appendChild(head);

        if (t.description) {
          const p = document.createElement("p");
          p.className = "tpl-desc";
          p.textContent = t.description;
          card.appendChild(p);
        }
        if (t.timeComplexity || t.spaceComplexity) {
          const cx = document.createElement("div");
          cx.className = "tpl-cx";
          cx.innerHTML =
            '<span><b>Time</b> <span class="mono">' + esc(t.timeComplexity || "—") + '</span></span>' +
            '<span><b>Space</b> <span class="mono">' + esc(t.spaceComplexity || "—") + '</span></span>';
          card.appendChild(cx);
        }

        const pre = document.createElement("pre");
        pre.className = "tpl-code";
        const codeEl = document.createElement("code");
        codeEl.textContent = code;
        pre.appendChild(codeEl);
        card.appendChild(pre);

        block.appendChild(card);
      });

      listEl.appendChild(block);
    });
  }

  // ---------- Syntax highlighting for the print view ----------
  // listings does this in the LaTeX export; the browser needs its own pass so the
  // printed page carries the same blue keywords / red types / teal comments.
  const CPP_KEYWORDS = new Set(["alignas","alignof","asm","auto","bool","break","case","catch","char",
    "class","const","constexpr","continue","decltype","default","delete","do","double","else","enum",
    "explicit","extern","false","float","for","friend","goto","if","inline","int","long","mutable",
    "namespace","new","noexcept","nullptr","operator","private","protected","public","register","return",
    "short","signed","sizeof","static","struct","switch","template","this","throw","true","try","typedef",
    "typename","union","unsigned","using","virtual","void","volatile","while"]);

  const STL_TYPES = new Set(["vector","pair","map","set","queue","stack","priority_queue","bitset","array",
    "tuple","unordered_map","unordered_set","deque","multiset","multimap","complex","string","ll","ull",
    "vll","vi","pii","pll","size_t","int64_t","uint64_t","int64","ostream","istream"]);

  function highlightCpp(code, types) {
    let out = "", i = 0;
    const n = code.length;
    // Keep newlines outside spans (block comments span lines) so the result can be
    // split into per-line blocks afterwards for hanging-indent wrapping.
    const wrap = (cls, txt) => txt.split("\n")
      .map(part => (part ? '<span class="' + cls + '">' + esc(part) + "</span>" : ""))
      .join("\n");
    while (i < n) {
      const c = code[i], d = code[i + 1];
      if (c === "/" && d === "/") {
        let j = code.indexOf("\n", i); if (j < 0) j = n;
        out += wrap("c-cm", code.slice(i, j)); i = j; continue;
      }
      if (c === "/" && d === "*") {
        let j = code.indexOf("*/", i + 2); j = j < 0 ? n : j + 2;
        out += wrap("c-cm", code.slice(i, j)); i = j; continue;
      }
      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < n) {
          if (code[j] === "\\") { j += 2; continue; }
          if (code[j] === c) { j++; break; }
          j++;
        }
        out += wrap("c-st", code.slice(i, j)); i = j; continue;
      }
      if (c === "#") {
        let j = i + 1;
        while (j < n && /[ \t]/.test(code[j])) j++;
        while (j < n && /[A-Za-z]/.test(code[j])) j++;
        out += wrap("c-kw", code.slice(i, j)); i = j; continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        let j = i;
        while (j < n && /[A-Za-z0-9_]/.test(code[j])) j++;
        const w = code.slice(i, j);
        out += CPP_KEYWORDS.has(w) ? wrap("c-kw", w)
          : (types.has(w) || STL_TYPES.has(w)) ? wrap("c-ty", w)
          : esc(w);
        i = j; continue;
      }
      out += esc(c); i++;
    }
    // One block per source line, so a long line wraps with a hanging indent
    // instead of running back to the column edge.
    return out.split("\n")
      .map(line => '<span class="ln">' + (line || "&#8203;") + "</span>")
      .join("");
  }

  // ---------- Print view (browser "Save as PDF") ----------
  // notebook.pdf runs heading → rule → code, so notes stay off in exports by default.
  function withNotes() {
    const el = document.getElementById("tplExportNotes");
    return !!(el && el.checked);
  }

  function orderedCategories(list) {
    const used = CATEGORIES.filter(c => list.some(t => t.category === c));
    const extra = [...new Set(list.map(t => t.category))].filter(c => !CATEGORIES.includes(c)).sort();
    return [...used, ...extra];
  }

  function buildPrintView(list, withNotes) {
    const root = document.getElementById("printRoot");
    const types = new Set(collectTypeNames(list));
    root.innerHTML = "";

    // Everything lives in one 3-column flow, exactly like the LaTeX multicols*.
    const flow = document.createElement("div");
    flow.className = "print-flow";

    const head = document.createElement("div");
    head.className = "print-head";
    head.innerHTML = "<h1>" + esc(meta.title || "ICPC Team Notebook") + "</h1>" +
      (meta.authors ? '<p class="print-authors">' + esc(meta.authors) + "</p>" : "");
    flow.appendChild(head);

    const cats = orderedCategories(list);

    // Contents, with dotted leaders like the notebook.
    const toc = document.createElement("div");
    toc.className = "print-toc";
    let tocHtml = "<h2 class='print-contents'>Contents</h2>";
    cats.forEach((cat, ci) => {
      tocHtml += '<div class="toc-1"><span class="toc-n">' + (ci + 1) + "</span>" +
        '<span class="toc-t">' + esc(cat) + '</span><span class="toc-d"></span></div>';
      list.filter(t => t.category === cat).forEach((t, ti) => {
        const code = (t.code || "").replace(/\n+$/, "");
        tocHtml += '<div class="toc-2"><span class="toc-n">' + (ci + 1) + "." + (ti + 1) + "</span>" +
          '<span class="toc-t">' + esc(t.title) +
          ' <span class="print-sig">[' + lineCount(code) + " lines] - " + esc(hashOf(code)) + "</span></span>" +
          '<span class="toc-d"></span></div>';
      });
    });
    toc.innerHTML = tocHtml;
    flow.appendChild(toc);

    cats.forEach((cat, ci) => {
      const h2 = document.createElement("h2");
      h2.className = "print-sec";
      h2.innerHTML = '<span class="print-secn">' + (ci + 1) + "</span>" + esc(cat);
      flow.appendChild(h2);

      list.filter(t => t.category === cat).forEach((t, ti) => {
        const code = (t.code || "").replace(/\n+$/, "");
        const h3 = document.createElement("h3");
        h3.className = "print-sub";
        h3.innerHTML = '<span class="print-subn">' + (ci + 1) + "." + (ti + 1) + "</span>" + esc(t.title) +
          ' <span class="print-sig">[' + lineCount(code) + " lines] - " + esc(hashOf(code)) + "</span>";
        flow.appendChild(h3);

        if (withNotes && t.description) {
          const p = document.createElement("p");
          p.className = "print-desc";
          p.textContent = t.description;
          flow.appendChild(p);
        }
        if (withNotes && (t.timeComplexity || t.spaceComplexity)) {
          const p = document.createElement("p");
          p.className = "print-cx";
          p.innerHTML = "<b>Time:</b> " + esc(t.timeComplexity || "—") +
            " &nbsp; <b>Space:</b> " + esc(t.spaceComplexity || "—");
          flow.appendChild(p);
        }

        const pre = document.createElement("pre");
        pre.className = "print-code";
        const c = document.createElement("code");
        c.innerHTML = highlightCpp(code, types);
        pre.appendChild(c);
        flow.appendChild(pre);
      });
    });

    root.appendChild(flow);
  }

  // ---------- Wiring ----------
  document.getElementById("tplNewBtn").addEventListener("click", () => openEditor(null));
  document.getElementById("tplSaveBtn").addEventListener("click", saveTemplate);
  document.getElementById("tplCancelBtn").addEventListener("click", closeEditor);
  searchEl.addEventListener("input", render);
  catFilterEl.addEventListener("change", render);

  document.getElementById("tplExportBtn").addEventListener("click", () => {
    const list = filtered();
    if (!list.length) return;
    const fmt = document.getElementById("tplExportFmt").value;
    const base = (meta.title || "notebook").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "notebook";
    if (fmt === "tex") download(base + ".tex", buildLatex(list, withNotes()), "application/x-tex");
    else if (fmt === "md") download(base + ".md", buildMarkdown(list), "text/markdown");
    else if (fmt === "cpp") download(base + ".cpp", buildCpp(list), "text/x-c++src");
    else if (fmt === "json") download(base + "-templates.json", JSON.stringify({ meta, templates: list }, null, 2), "application/json");
    else if (fmt === "print") {
      buildPrintView(list, withNotes());
      document.documentElement.style.setProperty("--nb-size", document.getElementById("tplPrintSize").value + "pt");
      document.body.classList.add("printing");
      window.print();
    }
  });

  window.addEventListener("afterprint", () => document.body.classList.remove("printing"));

  document.getElementById("tplImportBtn").addEventListener("click", () => document.getElementById("tplImportFile").click());
  document.getElementById("tplImportFile").addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(reader.result);
        const incoming = Array.isArray(payload) ? payload : payload.templates;
        if (!Array.isArray(incoming)) throw new Error("bad shape");
        const known = new Set(templates.map(t => t.id));
        incoming.forEach(t => {
          if (!t || !t.title || !t.code) return;
          const id = (!t.id || known.has(t.id) || !UUID_RE.test(t.id)) ? newId() : t.id;
          templates.push({
            id,
            title: String(t.title),
            category: CATEGORIES.includes(t.category) ? t.category : (t.category || "Misc"),
            description: String(t.description || ""),
            timeComplexity: String(t.timeComplexity || ""),
            spaceComplexity: String(t.spaceComplexity || ""),
            code: String(t.code),
            createdAt: t.createdAt || new Date().toISOString(),
          });
        });
        if (payload.meta) { Object.assign(meta, payload.meta); persistMeta(); syncMetaInputs(); }
        persist(); render();
      } catch (err) {
        alert("Could not read that file — expected a templates JSON export.");
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  });

  // Notebook identity fields
  // Let account.js swap the library in from the signed-in user's rows.
  window.ICPCTemplates = Object.assign(window.ICPCTemplates || {}, {
    replaceAll(list) {
      templates = Array.isArray(list) ? list : [];
      localStorage.setItem(STORE, JSON.stringify(templates));
      render();
    },
    snapshot: () => templates.slice(),
  });

  const mTitle = document.getElementById("tplMetaTitle");
  const mAuthors = document.getElementById("tplMetaAuthors");
  function syncMetaInputs() { mTitle.value = meta.title || ""; mAuthors.value = meta.authors || ""; }
  syncMetaInputs();
  function pushMeta() {
    const sync = window.ICPCSettings && window.ICPCSettings.onChange;
    if (typeof sync === "function") {
      sync({ notebook_title: meta.title || "", notebook_authors: meta.authors || "" });
    }
  }
  mTitle.addEventListener("input", () => { meta.title = mTitle.value; persistMeta(); pushMeta(); });
  mAuthors.addEventListener("input", () => { meta.authors = mAuthors.value; persistMeta(); pushMeta(); });

  // Notebook cover comes back from the account on sign-in.
  document.addEventListener("icpc:settings", e => {
    const d = e.detail || {};
    if (d.notebook_title != null) meta.title = d.notebook_title;
    if (d.notebook_authors != null) meta.authors = d.notebook_authors;
    persistMeta();
    syncMetaInputs();
  });

  render();
})();
