// Tiny SVG chart library: line, horizontal bars, columns, heatmap, 100% stacked columns.
// No dependencies. Colors come from CSS custom properties, so each site's theme just works.
// Charts animate in the first time they scroll into view (see .chart.animate in style.css).
const Charts = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const registry = [];
  let uid = 0;

  let tip;
  function showTip(evt, html) {
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "chart-tip";
      document.body.appendChild(tip);
    }
    tip.innerHTML = html;
    tip.style.opacity = 1;
    const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
    let x = evt.clientX + pad, y = evt.clientY + pad;
    if (x + w > innerWidth - 8) x = evt.clientX - w - pad;
    if (y + h > innerHeight - 8) y = evt.clientY - h - pad;
    tip.style.transform = `translate(${x}px, ${y}px)`;
  }
  function hideTip() { if (tip) tip.style.opacity = 0; }
  function hover(node, html) {
    node.addEventListener("pointermove", (e) => showTip(e, html()));
    node.addEventListener("pointerleave", hideTip);
  }

  function el(tag, attrs = {}, parent) {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
  }
  function svgFor(container, height) {
    container.innerHTML = "";
    const width = container.clientWidth;
    const svg = el("svg", { width, height, viewBox: `0 0 ${width} ${height}`, role: "img" }, container);
    return { svg, width };
  }
  // Clean axis ticks: about `steps` steps of 1/2/2.5/5 x 10^n.
  function scale(v, fixedMax = null, steps = 5) {
    const raw = (fixedMax ?? v) / steps || 1;
    const p = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= raw);
    const top = fixedMax ?? step * Math.ceil(v / step);
    const ticks = [];
    for (let t = 0; t <= top + 1e-9; t += step) ticks.push(t);
    return { top, ticks };
  }
  // Path for a bar with a rounded data-end and a square baseline.
  function barPath(x, y, w, h, horizontal, radius = 4) {
    const r = Math.max(0, Math.min(radius, horizontal ? w : h, horizontal ? h / 2 : w / 2));
    if (horizontal) {
      return `M${x},${y}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(w - r)}z`;
    }
    return `M${x},${y + h}v${-(h - r)}a${r},${r} 0 0 1 ${r},${-r}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${h - r}z`;
  }
  // Monotone cubic curve through points (never overshoots the real values).
  function smoothPath(pts) {
    if (pts.length < 3) return "M" + pts.map((p) => p.join(",")).join("L");
    const n = pts.length, d = [], m = [];
    for (let i = 0; i < n - 1; i++) d.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0]));
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    let path = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < n - 1; i++) {
      const dx = (pts[i + 1][0] - pts[i][0]) / 3;
      path += `C${pts[i][0] + dx},${pts[i][1] + m[i] * dx} ${pts[i + 1][0] - dx},${pts[i + 1][1] - m[i + 1] * dx} ${pts[i + 1][0]},${pts[i + 1][1]}`;
    }
    return path;
  }

  // Each chart animates on its first draw only; redraws (resize, theme) are instant.
  const observer = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("in"); observer.unobserve(e.target); }
      }), { threshold: 0.25 })
    : null;
  function register(container, draw) {
    let first = true;
    const run = () => {
      draw();
      container.classList.toggle("animate", first);
      first = false;
    };
    registry.push(run);
    if (observer) observer.observe(container); else container.classList.add("in");
    run();
  }
  function yAxis(svg, ticks, py, m, width, fmt) {
    ticks.forEach((v) => {
      el("line", { x1: m.l, x2: width - m.r, y1: py(v), y2: py(v), class: v ? "grid" : "axis" }, svg);
      el("text", { x: m.l - 10, y: py(v) + 4, "text-anchor": "end", class: "tick" }, svg).textContent = fmt(v, true);
    });
  }

  // Smooth line with a gradient area, single series, crosshair tooltip.
  function line(container, rows, { x, y, fmt = String, xfmt = String, height = 280, color = "--s1", label = "" }) {
    register(container, () => {
      const { svg, width } = svgFor(container, height);
      const m = { t: 16, r: 16, b: 30, l: 52 };
      const iw = width - m.l - m.r, ih = height - m.t - m.b;
      const { top: max, ticks } = scale(Math.max(...rows.map((r) => r[y])), null, 4);
      const px = (i) => m.l + (rows.length === 1 ? iw / 2 : (i / (rows.length - 1)) * iw);
      const py = (v) => m.t + ih - (v / max) * ih;
      yAxis(svg, ticks, py, m, width, fmt);
      const step = Math.ceil(rows.length / Math.max(2, Math.floor(iw / 72)));
      rows.forEach((r, i) => {
        if (i % step === 0) el("text", { x: px(i), y: height - 8, "text-anchor": "middle", class: "tick" }, svg).textContent = xfmt(r[x]);
      });
      const pts = rows.map((r, i) => [px(i), py(r[y])]);
      const c = css(color), id = `g${++uid}`;
      const grad = el("linearGradient", { id, x1: 0, x2: 0, y1: 0, y2: 1 }, el("defs", {}, svg));
      el("stop", { offset: "0%", "stop-color": c, "stop-opacity": 0.28 }, grad);
      el("stop", { offset: "100%", "stop-color": c, "stop-opacity": 0 }, grad);
      const curve = smoothPath(pts);
      el("path", { d: `${curve}L${pts.at(-1)[0]},${py(0)}L${pts[0][0]},${py(0)}Z`, fill: `url(#${id})`, class: "fade" }, svg);
      el("path", { d: curve, fill: "none", stroke: c, "stroke-width": 2.5, "stroke-linecap": "round", pathLength: 1, class: "line-draw" }, svg);
      const end = pts.at(-1);
      el("circle", { cx: end[0], cy: end[1], r: 4.5, fill: c, stroke: css("--surface"), "stroke-width": 2, class: "fade late" }, svg);
      const cross = el("line", { y1: m.t, y2: m.t + ih, class: "crosshair", opacity: 0 }, svg);
      const dot = el("circle", { r: 5.5, fill: c, stroke: css("--surface"), "stroke-width": 2.5, opacity: 0 }, svg);
      const hit = el("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent" }, svg);
      hit.addEventListener("pointermove", (e) => {
        const box = svg.getBoundingClientRect();
        const i = Math.max(0, Math.min(rows.length - 1, Math.round(((e.clientX - box.left - m.l) / iw) * (rows.length - 1))));
        const [cx, cy] = pts[i];
        cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.setAttribute("opacity", 1);
        dot.setAttribute("cx", cx); dot.setAttribute("cy", cy); dot.setAttribute("opacity", 1);
        showTip(e, `<b>${xfmt(rows[i][x], true)}</b><br>${label} ${fmt(rows[i][y])}`);
      });
      hit.addEventListener("pointerleave", () => { cross.setAttribute("opacity", 0); dot.setAttribute("opacity", 0); hideTip(); });
    });
  }

  // Horizontal bars: label on the left, value at the bar tip, optional faint track.
  function bars(container, rows, { label, value, fmt = String, color = () => "--s1", tip = null, max = null, rowH = 32, barH = 16, track = false, labelMax = 180 }) {
    register(container, () => {
      const height = rows.length * rowH + 4;
      const { svg, width } = svgFor(container, height);
      const labelW = Math.min(labelMax, width * 0.38), valueW = 60;
      const iw = Math.max(40, width - labelW - valueW - 12);
      const top = max ?? Math.max(...rows.map((r) => r[value]));
      rows.forEach((r, i) => {
        const y = i * rowH;
        const w = Math.max(3, (r[value] / top) * iw);
        const by = y + (rowH - barH) / 2;
        const g = el("g", { class: "hover-row" }, svg);
        el("rect", { x: 0, y, width, height: rowH, fill: "transparent" }, g);
        const name = el("text", { x: labelW - 12, y: y + rowH / 2 + 4.5, "text-anchor": "end", class: "label" }, g);
        name.textContent = r[label];
        let text = String(r[label]);
        while (text.length > 3 && name.getComputedTextLength() > labelW - 16) {
          text = text.slice(0, -1);
          name.textContent = text.trimEnd() + "…";
        }
        if (track) el("rect", { x: labelW, y: by, width: iw, height: barH, rx: barH / 2, class: "track" }, g);
        el("path", { d: barPath(labelW, by, w, barH, true, track ? barH / 2 : 4), fill: css(color(r)), class: "bar-x", style: `--i:${i}` }, g);
        el("text", { x: labelW + w + 8, y: y + rowH / 2 + 4.5, class: "value fade late", style: `--i:${i}` }, g).textContent = fmt(r[value]);
        hover(g, () => (tip ? tip(r) : `<b>${r[label]}</b><br>${fmt(r[value])}`));
      });
    });
  }

  // Vertical columns. With xfmt, labels are thinned for long time series.
  function columns(container, rows, { label, value, fmt = String, color = () => "--s1", tip = null, height = 280, max = null, xfmt = null, values = true }) {
    register(container, () => {
      const { svg, width } = svgFor(container, height);
      const m = { t: 26, r: 8, b: xfmt ? 30 : 44, l: 40 };
      const iw = width - m.l - m.r, ih = height - m.t - m.b;
      const { top, ticks } = scale(Math.max(...rows.map((r) => r[value])), max, max ? 5 : 4);
      const band = iw / rows.length, bw = Math.max(3, Math.min(44, band * (xfmt ? 0.62 : 0.5)));
      const py = (v) => m.t + ih - (v / top) * ih;
      yAxis(svg, ticks, py, m, width, fmt);
      const every = Math.ceil(rows.length / Math.max(2, Math.floor(iw / 60)));
      rows.forEach((r, i) => {
        const cx = m.l + band * i + band / 2;
        const g = el("g", { class: "hover-row" }, svg);
        el("rect", { x: cx - band / 2, y: m.t, width: band, height: ih, fill: "transparent" }, g);
        el("path", { d: barPath(cx - bw / 2, py(r[value]), bw, py(0) - py(r[value]), false), fill: css(color(r)), class: "bar-y", style: `--i:${i}` }, g);
        if (values) el("text", { x: cx, y: py(r[value]) - 8, "text-anchor": "middle", class: "value fade late", style: `--i:${i}` }, g).textContent = fmt(r[value]);
        if (xfmt) {
          if (i % every === 0) el("text", { x: cx, y: height - 8, "text-anchor": "middle", class: "tick" }, g).textContent = xfmt(r[label]);
        } else {
          const words = String(r[label]).split(" ");
          const half = Math.ceil(words.length / 2);
          [words.slice(0, half).join(" "), words.slice(half).join(" ")].forEach((part, k) => {
            if (part) el("text", { x: cx, y: height - 26 + k * 14, "text-anchor": "middle", class: "tick" }, g).textContent = part;
          });
        }
        hover(g, () => (tip ? tip(r) : `<b>${xfmt ? xfmt(r[label], true) : r[label]}</b><br>${fmt(r[value])}`));
      });
    });
  }

  // Weekday x hour heatmap with a one-hue sequential ramp.
  function heatmap(container, grid, { rowLabels, fmt = String, unit = "" }) {
    register(container, () => {
      const width = container.clientWidth;
      const m = { t: 2, l: 40, b: 24 };
      const cell = Math.max(8, (width - m.l) / 24);
      const height = m.t + cell * rowLabels.length + m.b;
      const { svg } = svgFor(container, height);
      const max = Math.max(...grid.flat());
      const ramp = ["--seq1", "--seq2", "--seq3", "--seq4", "--seq5", "--seq6"].map(css);
      grid.forEach((row, d) => {
        el("text", { x: m.l - 10, y: m.t + d * cell + cell / 2 + 4, "text-anchor": "end", class: "tick" }, svg).textContent = rowLabels[d];
        row.forEach((v, h) => {
          const idx = v === 0 ? -1 : Math.min(5, Math.floor((v / max) * 6));
          const r = el("rect", {
            x: m.l + h * cell + 1.5, y: m.t + d * cell + 1.5, width: cell - 3, height: cell - 3, rx: Math.min(4, cell / 4),
            fill: idx < 0 ? css("--grid") : ramp[idx], class: "cell", style: `--i:${h}`,
          }, svg);
          hover(r, () => `<b>${rowLabels[d]} ${String(h).padStart(2, "0")}:00</b><br>${fmt(v)} ${unit}`);
        });
      });
      [0, 6, 12, 18, 23].forEach((h) => {
        el("text", { x: m.l + h * cell + cell / 2, y: height - 6, "text-anchor": "middle", class: "tick" }, svg).textContent =
          h === 0 ? "12am" : h === 12 ? "12pm" : h < 12 ? `${h}am` : `${h - 12}pm`;
      });
    });
  }

  // 100% stacked columns. series: [{key, name, color}]
  function stacked(container, rows, { x, series, xfmt = String, height = 280 }) {
    register(container, () => {
      const { svg, width } = svgFor(container, height);
      const m = { t: 8, r: 8, b: 30, l: 44 };
      const iw = width - m.l - m.r, ih = height - m.t - m.b;
      const band = iw / rows.length, bw = Math.min(30, band * 0.66);
      [0, 50, 100].forEach((p) => {
        const y = m.t + ih - (p / 100) * ih;
        el("line", { x1: m.l, x2: width - m.r, y1: y, y2: y, class: p ? "grid" : "axis" }, svg);
        el("text", { x: m.l - 10, y: y + 4, "text-anchor": "end", class: "tick" }, svg).textContent = p + "%";
      });
      const every = Math.ceil(rows.length / Math.max(2, Math.floor(iw / 56)));
      rows.forEach((r, i) => {
        const total = series.reduce((s, sr) => s + r[sr.key], 0);
        const cx = m.l + band * i + band / 2;
        let y = m.t + ih;
        const g = el("g", { class: "hover-row" }, svg);
        el("rect", { x: cx - band / 2, y: m.t, width: band, height: ih, fill: "transparent" }, g);
        series.forEach((sr, k) => {
          const h = (r[sr.key] / total) * ih;
          if (h <= 0) return;
          const gap = k === series.length - 1 ? 0 : 2;
          const d = k === series.length - 1 ? barPath(cx - bw / 2, y - h, bw, h, false) : `M${cx - bw / 2},${y}v${-(h - gap)}h${bw}v${h - gap}z`;
          el("path", { d, fill: css(sr.color), class: "bar-y", style: `--i:${i}` }, g);
          y -= h;
        });
        if (i % every === 0) el("text", { x: cx, y: height - 8, "text-anchor": "middle", class: "tick" }, g).textContent = xfmt(r[x]);
        hover(g, () => `<b>${xfmt(r[x], true)}</b>` + series.map((sr) =>
          `<br><span class="key" style="background:${css(sr.color)}"></span>${sr.name} ${Math.round((100 * r[sr.key]) / total)}%`).join(""));
      });
    });
  }

  let pending;
  const redraw = () => { cancelAnimationFrame(pending); pending = requestAnimationFrame(() => registry.forEach((d) => d())); };
  let lastWidth = innerWidth;
  addEventListener("resize", () => { if (innerWidth !== lastWidth) { lastWidth = innerWidth; redraw(); } });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);

  return { line, bars, columns, heatmap, stacked, redraw };
})();
