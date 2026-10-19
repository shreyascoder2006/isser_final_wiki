/* ============================================================
   Shreyas Kale — portfolio behaviour
   ============================================================ */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(pointer: fine)').matches;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  /* ---------- intro ---------- */
  (function intro() {
    var el = document.getElementById('intro');
    if (!el) return;
    document.body.style.overflow = 'hidden';
    var done = function () {
      el.classList.add('is-done');
      document.body.style.overflow = '';
      window.setTimeout(function () { el.remove(); }, 800);
    };
    window.setTimeout(done, reduced ? 350 : 2000);
  })();

  /* ---------- ruler ticks ---------- */
  (function ruler() {
    var host = document.getElementById('rulerTicks');
    if (!host) return;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < 60; i++) {
      var t = document.createElement('span');
      t.className = 'ruler__tick' + (i % 5 === 0 ? ' ruler__tick--major' : '');
      if (i % 5 === 0 && i > 0) t.setAttribute('data-n', String(i * 20));
      frag.appendChild(t);
    }
    host.appendChild(frag);
  })();

  /* ---------- clocks ---------- */
  (function clocks() {
    var live = document.getElementById('clock');
    var mumbai = document.getElementById('mumbaiTime');
    var tick = function () {
      var now = new Date();
      if (live) {
        live.textContent = now.toLocaleTimeString('en-US', {
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
        });
      }
      if (mumbai) {
        mumbai.textContent = now.toLocaleTimeString('en-US', {
          timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true
        });
      }
    };
    tick();
    window.setInterval(tick, 1000);
  })();

  /* ---------- custom cursor ---------- */
  (function cursor() {
    var layer = document.getElementById('cursorLayer');
    if (!layer || !finePointer || reduced) return;
    var arrow = layer.querySelector('.cursor__arrow');
    var tag = layer.querySelector('.cursor__tag');
    var tx = window.innerWidth / 2, ty = window.innerHeight / 2, cx = tx, cy = ty;

    document.addEventListener('pointermove', function (e) {
      tx = e.clientX; ty = e.clientY;
      var hit = e.target instanceof Element
        ? e.target.closest('a,button,[data-clickable],[data-lift],[data-mail],input,textarea')
        : null;
      layer.classList.toggle('is-link', !!hit);
      if (tag) {
        tag.textContent = hit && hit.hasAttribute('data-mail') ? 'Say hi'
          : hit && hit.hasAttribute('data-lift') ? 'Peek'
            : hit ? 'Click' : 'You';
      }
    }, { passive: true });

    (function loop() {
      cx += (tx - cx) * 0.22;
      cy += (ty - cy) * 0.22;
      var s = 'translate3d(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px,0)';
      if (arrow) arrow.style.transform = s;
      if (tag) tag.style.transform = s;
      window.requestAnimationFrame(loop);
    })();

    document.addEventListener('pointerdown', function () { layer.classList.add('is-down'); });
    document.addEventListener('pointerup', function () { layer.classList.remove('is-down'); });
  })();

  /* ---------- hero: dot-matrix headline with cursor repulsion ---------- */
  (function heroType() {
    var canvas = document.getElementById('heroCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d', { alpha: true });
    var wrap = canvas.parentElement;
    var dots = [];
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0, step = 6, dotSize = 3.4;
    var pointer = { x: -9999, y: -9999, active: false };
    var RADIUS = 108;

    var linesFor = function (w) {
      if (w < 520) return ['Solving', 'real world', 'problems with', 'technology.'];
      return ['Solving real', 'world problems', 'with technology.'];
    };

    function build() {
      var cssW = wrap.clientWidth || window.innerWidth - 40;
      var lines = linesFor(cssW);

      // fit the widest line to the available width
      var probe = 200;
      ctx.font = '700 ' + probe + 'px "Clash Display", system-ui, sans-serif';
      var widest = 0;
      lines.forEach(function (l) { widest = Math.max(widest, ctx.measureText(l).width); });
      var fontSize = Math.floor(probe * ((cssW * 0.99) / widest));
      fontSize = clamp(fontSize, 34, 124);
      var lineH = Math.round(fontSize * 0.9);

      W = Math.round(cssW);
      H = Math.round(lineH * lines.length + fontSize * 0.34);
      step = clamp(Math.round(fontSize / 21), 4, 7);
      dotSize = Math.max(2, step * 0.6);

      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // render text once, then sample it into a dot grid
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 ' + fontSize + 'px "Clash Display", system-ui, sans-serif';
      lines.forEach(function (l, i) {
        ctx.fillText(l, W / 2, fontSize * 0.17 + lineH * i + lineH / 2);
      });

      var data;
      try {
        data = ctx.getImageData(0, 0, W * dpr, H * dpr).data;
      } catch (err) {
        return; // tainted canvas — leave the accessible <h1> to do the talking
      }

      dots = [];
      for (var y = step / 2; y < H; y += step) {
        for (var x = step / 2; x < W; x += step) {
          var px = Math.floor(x * dpr), py = Math.floor(y * dpr);
          var alpha = data[(py * Math.floor(W * dpr) + px) * 4 + 3];
          if (alpha > 128) {
            dots.push({
              x: x, y: y, ox: x, oy: y, vx: 0, vy: 0,
              accent: ((x * 7 + y * 13) % 11) < 2
            });
          }
        }
      }
      ctx.clearRect(0, 0, W, H);
      draw();
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        ctx.fillStyle = d.accent ? '#ff5a1f' : '#12203a';
        ctx.fillRect(d.x - dotSize / 2, d.y - dotSize / 2, dotSize, dotSize);
      }
    }

    function frame() {
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        if (pointer.active) {
          var dx = d.x - pointer.x, dy = d.y - pointer.y;
          var dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
          if (dist < RADIUS) {
            var force = (1 - dist / RADIUS) * 5.2;
            d.vx += (dx / dist) * force;
            d.vy += (dy / dist) * force;
          }
        }
        d.vx += (d.ox - d.x) * 0.075;
        d.vy += (d.oy - d.y) * 0.075;
        d.vx *= 0.82;
        d.vy *= 0.82;
        d.x += d.vx;
        d.y += d.vy;
      }
      draw();
      window.requestAnimationFrame(frame);
    }

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(build).catch(build);
    }
    build();
    window.setTimeout(build, 900); // once the webfont has certainly landed

    var rt;
    window.addEventListener('resize', function () {
      window.clearTimeout(rt);
      rt = window.setTimeout(build, 180);
    });

    if (!reduced && finePointer) {
      window.addEventListener('pointermove', function (e) {
        var r = canvas.getBoundingClientRect();
        pointer.x = e.clientX - r.left;
        pointer.y = e.clientY - r.top;
        pointer.active = pointer.x > -RADIUS && pointer.x < W + RADIUS &&
          pointer.y > -RADIUS && pointer.y < H + RADIUS;
      }, { passive: true });
      window.requestAnimationFrame(frame);
    }
  })();

  /* ---------- scroll progress + ruler fill ---------- */
  (function progress() {
    var pct = document.getElementById('scrollPct');
    var fill = document.getElementById('rulerFill');
    var onScroll = function () {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var p = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
      if (pct) pct.textContent = Math.round(p * 100) + '%';
      if (fill) fill.style.right = (100 - p * 100) + '%';
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
  })();

  /* ---------- reveals + frame activation ---------- */
  (function reveals() {
    var targets = document.querySelectorAll(
      '.section .card, .thread, .exprow, .statpill, .wins, .work__head, .contact__lede, .display, .eyebrow'
    );
    Array.prototype.forEach.call(targets, function (el) { el.classList.add('reveal'); });

    if (!('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(targets, function (el) { el.classList.add('is-in'); });
      document.querySelectorAll('.frame').forEach(function (f) { f.classList.add('is-on'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    Array.prototype.forEach.call(targets, function (el) { io.observe(el); });

    var fio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { e.target.classList.toggle('is-on', e.isIntersecting); });
    }, { rootMargin: '-6% 0px -6% 0px', threshold: 0.08 });
    document.querySelectorAll('.frame').forEach(function (f) { fio.observe(f); });
  })();

  /* ---------- metric count-up ---------- */
  (function counters() {
    var nodes = document.querySelectorAll('[data-count]');
    if (!nodes.length || !('IntersectionObserver' in window) || reduced) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        io.unobserve(el);
        var target = parseFloat(el.getAttribute('data-count'));
        var suffix = el.getAttribute('data-suffix') || '';
        var decimals = (el.getAttribute('data-count').split('.')[1] || '').length;
        var t0 = performance.now(), dur = 1100;
        (function run(now) {
          var p = clamp((now - t0) / dur, 0, 1);
          var eased = 1 - Math.pow(1 - p, 3);
          el.textContent = (target * eased).toFixed(decimals) + suffix;
          if (p < 1) window.requestAnimationFrame(run);
        })(t0);
      });
    }, { threshold: 0.5 });
    Array.prototype.forEach.call(nodes, function (n) { io.observe(n); });
  })();

  /* ---------- pinned horizontal work rail ---------- */
  (function rail() {
    var section = document.getElementById('work');
    var track = document.getElementById('railTrack');
    var viewport = document.getElementById('rail');
    var counter = document.getElementById('workCount');
    var bar = document.getElementById('workProgress');
    if (!section || !track || !viewport) return;

    var cards = track.children.length;
    var maxShift = 0;

    var measure = function () {
      maxShift = Math.max(0, track.scrollWidth - viewport.clientWidth);
      // the pinned run needs enough scroll length to cover the rail
      if (window.innerWidth >= 900) {
        var needed = maxShift + window.innerHeight * 0.9;
        section.style.height = Math.max(window.innerHeight * 2.4, needed) + 'px';
      } else {
        section.style.height = '';
        track.style.transform = '';
      }
    };

    var onScroll = function () {
      if (window.innerWidth < 900) return;
      var rect = section.getBoundingClientRect();
      var total = section.offsetHeight - window.innerHeight;
      var p = total > 0 ? clamp(-rect.top / total, 0, 1) : 0;
      track.style.transform = 'translate3d(' + (-p * maxShift).toFixed(1) + 'px,0,0)';
      var idx = clamp(Math.round(p * (cards - 1)) + 1, 1, cards);
      if (counter) counter.textContent = ('0' + idx).slice(-2) + ' / 0' + cards + ' PROJECTS';
      if (bar) bar.style.width = Math.max(8, p * 100) + '%';
    };

    measure();
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function () { measure(); onScroll(); });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { measure(); onScroll(); });
    }
    window.setTimeout(function () { measure(); onScroll(); }, 1200);
  })();

  /* ---------- nav: smooth scroll + active state ---------- */
  (function nav() {
    document.querySelectorAll('[data-nav]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        var id = link.getAttribute('href');
        if (!id || id.charAt(0) !== '#') return;
        var target = document.querySelector(id);
        if (!target) return;
        e.preventDefault();
        window.scrollTo({
          top: target.getBoundingClientRect().top + window.scrollY - 54,
          behavior: reduced ? 'auto' : 'smooth'
        });
        history.replaceState(null, '', id);
      });
    });

    var links = document.querySelectorAll('.island__link');
    var ids = ['home', 'about', 'work', 'experience', 'contact'];
    var setActive = function (id) {
      links.forEach(function (l) {
        l.classList.toggle('is-active', l.getAttribute('href') === '#' + id);
      });
    };
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) setActive(e.target.id);
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) io.observe(el);
    });
  })();

  /* ---------- copy email ---------- */
  (function copyMail() {
    var btn = document.getElementById('copyMail');
    var label = document.getElementById('copyMailText');
    if (!btn || !label) return;
    btn.addEventListener('click', function () {
      var address = 'shreyaskale06@gmail.com';
      var done = function () {
        label.textContent = 'Copied ✓';
        window.setTimeout(function () { label.textContent = 'Copy address'; }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(address).then(done).catch(done);
      } else {
        var ta = document.createElement('textarea');
        ta.value = address;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) { /* no-op */ }
        document.body.removeChild(ta);
        done();
      }
    });
  })();

  /* ---------- contact form → mail compose ---------- */
  (function form() {
    var f = document.getElementById('contactForm');
    var note = document.getElementById('formNote');
    if (!f) return;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = f.elements.name.value.trim();
      var email = f.elements.email.value.trim();
      var brief = f.elements.brief.value.trim();
      if (!name || !email || !brief) {
        if (note) { note.textContent = 'All three fields, please — then it reaches me in one go.'; note.className = 'form__note is-error'; }
        return;
      }
      var subject = 'Portfolio enquiry — ' + name;
      var body = 'Who: ' + name + '\nReply to: ' + email + '\n\n' + brief;
      window.location.href = 'mailto:shreyaskale06@gmail.com?subject=' +
        encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      if (note) { note.textContent = 'Opening your mail app with the message ready ✓'; note.className = 'form__note is-ok'; }
    });
  })();

  /* ---------- to top ---------- */
  (function toTop() {
    var btn = document.getElementById('toTop');
    if (!btn) return;
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    });
  })();

  /* ---------- wins marquee: duplicate for a seamless loop ---------- */
  (function marquee() {
    var track = document.querySelector('.wins__track');
    if (!track) return;
    track.innerHTML += track.innerHTML;
  })();

  /* ---------- ambient sound (generated, no asset) ---------- */
  (function ambient() {
    var btn = document.getElementById('soundBtn');
    if (!btn) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { btn.style.display = 'none'; return; }
    var ctx = null, master = null, voices = [];

    var start = function () {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);

      var filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      filter.connect(master);

      [146.83, 220, 293.66, 369.99].forEach(function (freq, i) {
        var osc = ctx.createOscillator();
        var g = ctx.createGain();
        osc.type = i % 2 ? 'sine' : 'triangle';
        osc.frequency.value = freq;
        g.gain.value = 0.16 / (i + 1);
        osc.connect(g).connect(filter);

        var lfo = ctx.createOscillator();
        var lfoGain = ctx.createGain();
        lfo.frequency.value = 0.05 + i * 0.017;
        lfoGain.gain.value = 0.07 / (i + 1);
        lfo.connect(lfoGain).connect(g.gain);

        osc.start(); lfo.start();
        voices.push(osc, lfo);
      });
      master.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 1.6);
    };

    var stop = function () {
      if (!ctx) return;
      var c = ctx;
      master.gain.linearRampToValueAtTime(0, c.currentTime + 0.5);
      window.setTimeout(function () {
        voices.forEach(function (v) { try { v.stop(); } catch (e) { /* already stopped */ } });
        voices = [];
        c.close();
      }, 600);
      ctx = null;
    };

    btn.addEventListener('click', function () {
      var on = btn.getAttribute('aria-pressed') === 'true';
      if (on) { stop(); btn.setAttribute('aria-pressed', 'false'); }
      else { start(); btn.setAttribute('aria-pressed', 'true'); }
    });
  })();
})();
