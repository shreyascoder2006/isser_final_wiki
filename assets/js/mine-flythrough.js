/*
  Mine flythrough — scroll-pinned 2D map -> 3D terrain scene, adapted from
  https://github.com/bilawalsidhu/gods-eye-view for Sanjeevani.

  Real elevation (AWS/Mapzen "Terrarium" tiles) + real satellite imagery
  (Esri) are fetched at runtime and used to build an actual 3D terrain mesh
  for the Khetri copper belt. If either can't load (offline, blocked), it
  falls back to a procedurally generated open-pit shape so the effect still
  works, with an on-screen note saying so.

  The three "voices" that appear as you scroll are a composite, illustrative
  conversation written by the team to represent what affected communities
  describe (see the Human Practices section) — not a transcript of one
  real conversation. Said plainly in the on-screen credit line.
*/
(function () {
  "use strict";

  const root = document.querySelector("[data-mf-root]");
  if (!root) return;

  const errEl = document.getElementById("mf-err");
  function showError(msg) {
    errEl.style.display = "block";
    errEl.textContent = "Error: " + msg;
    const l = document.getElementById("mf-loader");
    if (l) l.style.display = "none";
  }
  window.addEventListener("error", (e) => showError(e.message || "script error"));
  window.addEventListener("unhandledrejection", (e) =>
    showError((e.reason && e.reason.message) || String(e.reason))
  );
  if (typeof THREE === "undefined") {
    showError("Three.js did not load from the CDN. Check the internet connection.");
    return;
  }
  const withTimeout = (promise, ms, label) =>
    Promise.race([
      promise,
      new Promise((_, rej) => setTimeout(() => rej(new Error(label + " timed out")), ms)),
    ]);

  /* ---------------------------------------------------------------
     CONFIG
     --------------------------------------------------------------- */

  // Khetri copper belt, Rajasthan — one of the hotspots in Sanjeevani's own
  // research (see the Where It Happens map/table). Coordinates are
  // approximate (town-level), for illustration.
  const SITE = {
    name: "Khetri copper belt, Rajasthan",
    lon: 75.7847,
    lat: 28.0038,
    sizeM: 10000,
  };

  const TERRAIN_Z = 13,
    IMAGERY_Z = 14;
  const terrainUrl = (z, x, y) =>
    "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/" + z + "/" + x + "/" + y + ".png";
  const imageryUrl = (z, x, y) =>
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/" +
    z +
    "/" +
    y +
    "/" +
    x;

  // Three voices from the pit, appearing in sequence as the camera descends.
  // Composite/illustrative dialogue (see file header) — not a transcript.
  const PATHS = [
    {
      id: "voiceA",
      t: 0.42,
      bearing: 70,
      radii: [500, 1100, 1800, 2500, 3200, 3900],
      wiggle: [0, 4, -3, 5, -2, 3],
      who: "A miner",
      side: "a",
      text: "They said the pit would bring jobs. It did — for a while.",
    },
    {
      id: "voiceB",
      t: 0.62,
      bearing: 190,
      radii: [500, 1000, 1700, 2400, 3100, 3800],
      wiggle: [0, -4, 3, -5, 3, -2],
      who: "Another miner",
      side: "b",
      text: "The water changed before anyone told us why.",
    },
    {
      id: "voiceC",
      t: 0.82,
      bearing: 310,
      radii: [500, 1100, 1700, 2300, 3000, 3700],
      wiggle: [0, 3, -4, 2, -3, 5],
      who: "A third voice",
      side: "c",
      text: "Compensation came. It didn't cover what we actually lost.",
    },
  ];

  const MAX_EXAGGERATION = 1.8;
  const POPUP_HALF_WINDOW = 0.085;
  const PATH_LIFT = 35;

  /* --------------------------------------------------------------- */

  const rad = (a) => (a * Math.PI) / 180;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, s) => a + (b - a) * s;
  const smooth = (t) => t * t * (3 - 2 * t);
  const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const EARTH_CIRC = 40075016.686;

  document.getElementById("mf-site-name").textContent = SITE.name;
  const stage = document.getElementById("mf-stage"),
    scroller = document.getElementById("mf-scroller");

  const renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById("mf-gl"),
    antialias: !isMobile,
  });
  renderer.outputEncoding = THREE.sRGBEncoding;
  // Filmic tone mapping + atmospheric haze, the two cheapest wins for making a
  // bare terrain mesh read as photoreal aerial footage instead of a flat render
  // (same idea gods-eye-view leans on via Cesium's built-in atmosphere/fog —
  // reimplemented here with Three.js's own primitives, not its code).
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x06211e, 1);
  const scene = new THREE.Scene();
  // Linear fog, not exponential: the flight path's own range runs 500-15000m
  // (see sampleKeys), and FogExp2's distance-squared falloff whites out the
  // two widest shots entirely at any density that still reads as haze
  // up close. Linear near/far keeps close shots clear and far ones hazy
  // without either extreme blowing out.
  scene.fog = new THREE.Fog(0x0c3430, 4500, 16000);
  const camera = new THREE.PerspectiveCamera(50, 1, 20, 80000);
  // Hemisphere light stands in for bounced sky/ground color (teal sky above,
  // warm ochre terrain below) instead of flat white ambient.
  scene.add(new THREE.HemisphereLight(0x8fb6ae, 0x4a3420, 0.65));
  scene.add(new THREE.AmbientLight(0xffffff, 0.22));
  const sun = new THREE.DirectionalLight(0xfff3df, 0.75);
  sun.position.set(-3000, 4000, 2500);
  scene.add(sun);
  const world = new THREE.Group();
  scene.add(world);

  let dirty = true;
  function resize() {
    const W = stage.clientWidth,
      H = stage.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    dirty = true;
  }

  function buildPath(p) {
    const ctrl = p.radii.map((r, i) => {
      const b = rad(p.bearing + (p.wiggle[i] || 0));
      return { x: r * Math.sin(b), z: -r * Math.cos(b) };
    });
    const cr = (a, b, c, d, u) =>
      0.5 *
      (2 * b +
        (-a + c) * u +
        (2 * a - 5 * b + 4 * c - d) * u * u +
        (-a + 3 * b - 3 * c + d) * u * u * u);
    const out = [],
      STEPS = 8,
      last = ctrl.length - 1;
    for (let i = 0; i < last; i++) {
      const a = ctrl[Math.max(i - 1, 0)],
        b = ctrl[i],
        c = ctrl[i + 1],
        d = ctrl[Math.min(i + 2, last)];
      for (let s = 0; s < STEPS; s++) {
        const u = s / STEPS;
        out.push({ x: cr(a.x, b.x, c.x, d.x, u), z: cr(a.z, b.z, c.z, d.z, u) });
      }
    }
    out.push(ctrl[last]);
    return out;
  }

  function loadImg(url) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => res(im);
      im.onerror = () => rej(new Error("tile failed: " + url));
      im.src = url;
    });
  }
  const lonLatToTile = (lon, lat, z) => {
    const n = Math.pow(2, z),
      s = Math.sin(rad(lat));
    return {
      x: ((lon + 180) / 360) * n,
      y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n,
    };
  };

  async function buildReal() {
    const TEX = isMobile ? 1024 : 1536;
    const c14 = lonLatToTile(SITE.lon, SITE.lat, IMAGERY_Z);
    const mpt14 = (EARTH_CIRC * Math.cos(rad(SITE.lat))) / Math.pow(2, IMAGERY_Z);
    const span14 = SITE.sizeM / mpt14;
    const ix0 = Math.floor(c14.x - span14 / 2),
      ix1 = Math.floor(c14.x + span14 / 2);
    const iy0 = Math.floor(c14.y - span14 / 2),
      iy1 = Math.floor(c14.y + span14 / 2);
    const tz = TERRAIN_Z - IMAGERY_Z;
    const k = Math.pow(2, tz);
    const tx0 = Math.floor((c14.x - span14 / 2) * k),
      tx1 = Math.floor((c14.x + span14 / 2) * k);
    const ty0 = Math.floor((c14.y - span14 / 2) * k),
      ty1 = Math.floor((c14.y + span14 / 2) * k);

    const imgCanvas = document.createElement("canvas");
    imgCanvas.width = (ix1 - ix0 + 1) * 256;
    imgCanvas.height = (iy1 - iy0 + 1) * 256;
    const ictx = imgCanvas.getContext("2d");
    const terCanvas = document.createElement("canvas");
    terCanvas.width = (tx1 - tx0 + 1) * 256;
    terCanvas.height = (ty1 - ty0 + 1) * 256;
    const tctx = terCanvas.getContext("2d", { willReadFrequently: true });

    const jobs = [];
    let imgFail = 0,
      imgTotal = 0;
    for (let y = iy0; y <= iy1; y++)
      for (let x = ix0; x <= ix1; x++) {
        imgTotal++;
        jobs.push(
          loadImg(imageryUrl(IMAGERY_Z, x, y))
            .then((im) => ictx.drawImage(im, (x - ix0) * 256, (y - iy0) * 256))
            .catch(() => {
              imgFail++;
            })
        );
      }
    for (let y = ty0; y <= ty1; y++)
      for (let x = tx0; x <= tx1; x++) {
        jobs.push(
          loadImg(terrainUrl(TERRAIN_Z, x, y)).then((im) =>
            tctx.drawImage(im, (x - tx0) * 256, (y - ty0) * 256)
          )
        );
      }
    await Promise.all(jobs);
    if (imgFail > imgTotal / 2) throw new Error("imagery tiles failed");

    const out = document.createElement("canvas");
    out.width = out.height = TEX;
    out
      .getContext("2d")
      .drawImage(
        imgCanvas,
        (c14.x - span14 / 2 - ix0) * 256,
        (c14.y - span14 / 2 - iy0) * 256,
        span14 * 256,
        span14 * 256,
        0,
        0,
        TEX,
        TEX
      );

    const W = terCanvas.width,
      H = terCanvas.height;
    const px = tctx.getImageData(0, 0, W, H).data,
      hts = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++)
      hts[i] = px[4 * i] * 256 + px[4 * i + 1] + px[4 * i + 2] / 256 - 32768;
    const sample = (fx, fy) => {
      fx = clamp(fx, 0, W - 1.001);
      fy = clamp(fy, 0, H - 1.001);
      const x0 = fx | 0,
        y0 = fy | 0,
        ax = fx - x0,
        ay = fy - y0;
      return lerp(
        lerp(hts[y0 * W + x0], hts[y0 * W + x0 + 1], ax),
        lerp(hts[(y0 + 1) * W + x0], hts[(y0 + 1) * W + x0 + 1], ax),
        ay
      );
    };
    const heightFn = (x, z) =>
      sample(((c14.x + x / mpt14) * k - tx0) * 256 - 0.5, ((c14.y + z / mpt14) * k - ty0) * 256 - 0.5);
    return { heightFn, canvas: out };
  }

  function buildProcedural() {
    const S = SITE.sizeM;
    const heightFn = (x, z) => {
      const r = Math.hypot(x, z);
      const base = 60 * Math.sin(x / 1300) * Math.cos(z / 1700) + 40 * Math.sin((x + z) / 700) + r * 0.04;
      const Rp = 2400 * (1 + 0.08 * Math.sin(3 * Math.atan2(z, x)));
      if (r < Rp) {
        const q = (1000 * (1 - Math.pow(r / Rp, 1.3))) / 80,
          f = q - Math.floor(q);
        return base + 150 - (Math.floor(q) + smooth(clamp((f - 0.7) / 0.3, 0, 1))) * 80;
      }
      return base + 150 * Math.exp(-Math.pow((r - Rp) / 900, 2));
    };
    const N = isMobile ? 512 : 768,
      c = document.createElement("canvas");
    c.width = c.height = N;
    const ctx = c.getContext("2d"),
      img = ctx.createImageData(N, N),
      d = img.data;
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const x = (j / N - 0.5) * S,
          z = (i / N - 0.5) * S,
          h = heightFn(x, z);
        const slope = (heightFn(x + 40, z) - heightFn(x - 40, z)) / 80;
        const shade = clamp(0.85 - slope * 1.2, 0.45, 1.15);
        const t = clamp((h + 300) / 700, 0, 1);
        const o = 4 * (i * N + j);
        d[o] = (110 + 60 * t) * shade;
        d[o + 1] = (98 + 55 * t) * shade;
        d[o + 2] = (80 + 40 * t) * shade;
        d[o + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    return { heightFn, canvas: c };
  }

  let keys = [];
  function buildKeys() {
    const unwrap = (prev, h) => prev + (((h - prev + 540) % 360) - 180);
    const headingFor = (p) => p.bearing + 180;
    const k = [{ t: 0, h: 0, pitch: -90, range: 15000, x: 0, y: 0, ex: 0 }];
    let h = unwrap(0, headingFor(PATHS[0]) - 35);
    k.push({ t: 0.28, h, pitch: -50, range: 10500, x: 0, y: 0, ex: MAX_EXAGGERATION });
    PATHS.forEach((p) => {
      h = unwrap(h, headingFor(p));
      const m = p.pts[Math.floor(p.pts.length * 0.55)];
      k.push({ t: p.t, h, pitch: -40, range: 6500, x: m.x * 0.45, y: -m.z * 0.45, ex: MAX_EXAGGERATION });
    });
    h = unwrap(h, headingFor(PATHS[PATHS.length - 1]) + 70);
    k.push({ t: 1, h, pitch: -45, range: 11000, x: 0, y: 0, ex: MAX_EXAGGERATION });
    keys = k;
  }
  function sampleKeys(p) {
    let i = 0;
    while (i < keys.length - 2 && p > keys[i + 1].t) i++;
    const a = keys[i],
      b = keys[i + 1];
    const s = smooth(clamp((p - a.t) / (b.t - a.t), 0, 1));
    return {
      h: lerp(a.h, b.h, s),
      pitch: lerp(a.pitch, b.pitch, s),
      range: lerp(a.range, b.range, s),
      x: lerp(a.x, b.x, s),
      y: lerp(a.y, b.y, s),
      ex: lerp(a.ex, b.ex, s),
    };
  }

  let curExag = 0.001,
    curP = 0,
    targetP = 0,
    ready = false,
    activeIdx = -2;
  const lineEls = [],
    cardEls = [],
    dotEls = [];
  const IDLE = 0xf6f1e7,
    ACTIVE = 0xe8a33d;

  function setActive(idx) {
    if (idx === activeIdx) return;
    activeIdx = idx;
    PATHS.forEach((p, i) => {
      p.thin.visible = i !== idx;
      p.thick.visible = i === idx;
    });
    dirty = true;
  }

  function buildCards() {
    const cards = document.getElementById("mf-cards"),
      svg = document.getElementById("mf-lines");
    const NS = "http://www.w3.org/2000/svg";
    PATHS.forEach((p, i) => {
      const c = document.createElement("div");
      c.className = "mf-card mf-card--" + p.side;
      c.innerHTML = "<b></b><p></p>";
      c.firstElementChild.textContent = p.who;
      c.lastElementChild.textContent = "“" + p.text + "”";
      cards.appendChild(c);
      cardEls[i] = c;
      const l = document.createElementNS(NS, "line"),
        d = document.createElementNS(NS, "circle");
      d.setAttribute("r", 4);
      svg.appendChild(l);
      svg.appendChild(d);
      lineEls[i] = l;
      dotEls[i] = d;
    });
  }

  const tmpV = new THREE.Vector3();
  function updatePopups(p) {
    let best = -1,
      bestO = 0;
    PATHS.forEach((pa, i) => {
      pa.opacity = clamp((POPUP_HALF_WINDOW - Math.abs(p - pa.t)) / 0.03, 0, 1);
      if (pa.opacity > bestO) {
        bestO = pa.opacity;
        best = i;
      }
    });
    setActive(best);

    const W = stage.clientWidth,
      H = stage.clientHeight;
    PATHS.forEach((pa, i) => {
      const card = cardEls[i],
        line = lineEls[i],
        dot = dotEls[i];
      let pos = null;
      if (pa.opacity > 0) {
        tmpV.set(pa.anchor.x, pa.anchor.y * curExag, pa.anchor.z).project(camera);
        if (tmpV.z < 1) pos = { x: (tmpV.x * 0.5 + 0.5) * W, y: (-tmpV.y * 0.5 + 0.5) * H };
      }
      if (!pos) {
        card.style.visibility = "hidden";
        card.style.opacity = 0;
        line.setAttribute("visibility", "hidden");
        dot.setAttribute("visibility", "hidden");
        return;
      }
      const cw = card.offsetWidth,
        ch = card.offsetHeight;
      let left, top;
      if (W < 600) {
        left = (W - cw) / 2;
        top = H - ch - 48;
      } else {
        left = clamp(pos.x + 36, 12, W - cw - 12);
        top = clamp(pos.y - ch - 36, 12, H - ch - 12);
      }
      card.style.transform = "translate(" + left + "px," + top + "px)";
      card.style.visibility = "visible";
      card.style.opacity = pa.opacity;
      const ex = clamp(pos.x, left, left + cw),
        ey = clamp(pos.y, top, top + ch);
      line.setAttribute("x1", pos.x);
      line.setAttribute("y1", pos.y);
      line.setAttribute("x2", ex);
      line.setAttribute("y2", ey);
      line.setAttribute("visibility", "visible");
      line.style.opacity = pa.opacity;
      dot.setAttribute("cx", pos.x);
      dot.setAttribute("cy", pos.y);
      dot.setAttribute("visibility", "visible");
      dot.style.opacity = pa.opacity;
    });
  }

  const hintEl = document.getElementById("mf-hint"),
    barEl = document.getElementById("mf-bar");
  const look = new THREE.Vector3(),
    target = new THREE.Vector3();
  function apply(p) {
    const k = sampleKeys(p);
    curExag = Math.max(k.ex, 0.001);
    world.scale.y = curExag;
    const h = rad(k.h),
      pc = rad(k.pitch),
      dx = Math.sin(h),
      dz = -Math.cos(h),
      cp = Math.cos(pc);
    look.set(cp * dx, Math.sin(pc), cp * dz);
    target.set(k.x, 0, -k.y);
    camera.position.copy(target).addScaledVector(look, -k.range);
    camera.up.set(dx, 0, dz);
    camera.lookAt(target);
    hintEl.style.opacity = p > 0.03 ? 0 : 1;
    barEl.style.height = p * 100 + "%";
    dirty = true;
  }

  function readScroll() {
    const total = scroller.offsetHeight - stage.clientHeight;
    targetP = clamp(-scroller.getBoundingClientRect().top / total, 0, 1);
  }
  window.addEventListener("scroll", readScroll, { passive: true });
  window.addEventListener("resize", () => {
    resize();
    readScroll();
  });

  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    const d = targetP - curP;
    if (Math.abs(d) > 0.0002) {
      curP += d * (1 - Math.exp(-dt * 7));
      apply(curP);
    } else if (curP !== targetP) {
      curP = targetP;
      apply(curP);
    }
    if (dirty && ready) {
      dirty = false;
      renderer.render(scene, camera);
      updatePopups(curP);
      if (dirty) {
        renderer.render(scene, camera);
        dirty = false;
      }
    }
    requestAnimationFrame(frame);
  }

  const loader = document.getElementById("mf-loader");
  let hidden = false;
  const hide = () => {
    if (hidden) return;
    hidden = true;
    loader.style.opacity = 0;
    setTimeout(() => loader.remove(), 450);
  };
  setTimeout(hide, 15000);

  (async function init() {
    try {
      resize();
      let src,
        real = true;
      try {
        src = await withTimeout(buildReal(), 20000, "Map tiles");
      } catch (e) {
        console.warn("Map tiles unavailable, using made-up terrain:", e);
        src = buildProcedural();
        real = false;
        const n = document.getElementById("mf-note");
        n.textContent = "Map tiles couldn't be loaded here, so this is made-up terrain.";
        n.style.display = "block";
      }
      document.getElementById("mf-credit").textContent = real
        ? "Imagery © Esri, Maxar, Earthstar Geographics · Elevation: Mapzen / AWS Terrain Tiles. Dialogue is composite/illustrative, not a transcript."
        : "Dialogue is composite/illustrative, not a transcript.";

      const S = SITE.sizeM,
        N = isMobile ? 200 : 260,
        hFn = src.heightFn;
      const h0 = hFn(0, 0);

      const pos = new Float32Array((N + 1) * (N + 1) * 3),
        uv = new Float32Array((N + 1) * (N + 1) * 2);
      for (let i = 0; i <= N; i++)
        for (let j = 0; j <= N; j++) {
          const v = i * (N + 1) + j,
            x = (j / N - 0.5) * S,
            z = (i / N - 0.5) * S;
          pos[3 * v] = x;
          pos[3 * v + 1] = hFn(x, z) - h0;
          pos[3 * v + 2] = z;
          uv[2 * v] = j / N;
          uv[2 * v + 1] = 1 - i / N;
        }
      const idx = new Uint32Array(N * N * 6);
      let q = 0;
      for (let i = 0; i < N; i++)
        for (let j = 0; j < N; j++) {
          const a = i * (N + 1) + j,
            b = a + 1,
            c = a + (N + 1),
            d = c + 1;
          idx[q++] = a;
          idx[q++] = c;
          idx[q++] = b;
          idx[q++] = b;
          idx[q++] = c;
          idx[q++] = d;
        }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeVertexNormals();

      const tex = new THREE.CanvasTexture(src.canvas);
      tex.encoding = THREE.sRGBEncoding;
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const ac = document.createElement("canvas");
      ac.width = ac.height = 256;
      const actx = ac.getContext("2d"),
        grad = actx.createRadialGradient(128, 128, 128 * 0.84, 128, 128, 128);
      grad.addColorStop(0, "#fff");
      grad.addColorStop(1, "#000");
      actx.fillStyle = grad;
      actx.fillRect(0, 0, 256, 256);
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshLambertMaterial({ map: tex, alphaMap: new THREE.CanvasTexture(ac), transparent: true })
      );
      mesh.renderOrder = 0;
      world.add(mesh);

      PATHS.forEach((p) => {
        p.pts = buildPath(p);
        const pts3 = p.pts.map((o) => new THREE.Vector3(o.x, hFn(o.x, o.z) - h0 + PATH_LIFT, o.z));
        const curve = new THREE.CatmullRomCurve3(pts3);
        p.thin = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 240, 24, 6, false),
          new THREE.MeshBasicMaterial({ color: IDLE, transparent: true, opacity: 0.6 })
        );
        p.thick = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 240, 48, 6, false),
          new THREE.MeshBasicMaterial({ color: ACTIVE })
        );
        p.thin.renderOrder = p.thick.renderOrder = 1;
        p.thick.visible = false;
        world.add(p.thin, p.thick);
        const m = pts3[Math.floor(pts3.length * 0.55)];
        p.anchor = { x: m.x, y: m.y, z: m.z };
      });
      buildKeys();
      buildCards();
      activeIdx = -2;
      setActive(-1);

      readScroll();
      curP = targetP;
      apply(curP);
      ready = true;
      dirty = true;
      requestAnimationFrame(frame);
      requestAnimationFrame(() => requestAnimationFrame(hide));
    } catch (e) {
      console.error(e);
      showError((e && e.message) || String(e));
    }
  })();
})();
