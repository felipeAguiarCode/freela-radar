/* ============================================================
   Freela Radar — Docs · JS puro (sem dependências, standalone)
   Roteamento por hash, TOC com scroll-spy, tema, menu mobile,
   copiar código e realce de sintaxe leve.
   ============================================================ */
(function () {
  'use strict';

  var pages = Array.prototype.slice.call(document.querySelectorAll('.page'));
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.menu__link'));
  var content = document.getElementById('content');
  var tocList = document.getElementById('tocList');
  var sidebar = document.getElementById('sidebar');
  var overlay = document.getElementById('overlay');
  var burger = document.getElementById('burger');
  var themeToggle = document.getElementById('themeToggle');

  var spyObserver = null;

  /* ---------------- Tema ---------------- */
  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem('docs-theme'); } catch (e) {}
    if (!saved) {
      saved = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', saved);
  }
  themeToggle.addEventListener('click', function () {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('docs-theme', next); } catch (e) {}
  });

  /* ---------------- Slug / utilidades ---------------- */
  function slugify(text) {
    return (text || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'sec';
  }
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---------------- Realce de sintaxe (leve e seguro) ---------------- */
  function highlight(pre) {
    var code = pre.querySelector('code');
    if (!code || code.dataset.hl) return;
    var lang = pre.getAttribute('data-lang') || '';
    var raw = code.textContent;
    var html = escapeHtml(raw);
    try {
      if (lang === 'bash') {
        html = html
          .replace(/(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;)/g, '<span class="tok-string">$1</span>')
          .replace(/(^|\n)(\s*)(#[^\n]*)/g, '$1$2<span class="tok-comment">$3</span>')
          .replace(/(^|\n)(\s*\$)\s/g, '$1<span class="tok-prompt">$2</span> ')
          .replace(/(\s)(--?[a-z][\w-]*)/g, '$1<span class="tok-flag">$2</span>');
      } else if (lang === 'text') {
        html = html
          .replace(/(^|\n)(#[^\n]*)/g, '$1<span class="tok-key">$2</span>')
          .replace(/(\{[^}\n]+\})/g, '<span class="tok-flag">$1</span>');
      }
    } catch (e) { html = escapeHtml(raw); }
    code.innerHTML = html;
    code.dataset.hl = '1';
  }

  /* ---------------- Botão copiar ---------------- */
  function addCopyButtons() {
    Array.prototype.slice.call(document.querySelectorAll('pre')).forEach(function (pre) {
      highlight(pre);
      if (pre.querySelector('.copy-btn')) return;
      var btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.type = 'button';
      btn.textContent = 'Copiar';
      btn.addEventListener('click', function () {
        var text = pre.querySelector('code').textContent;
        var done = function () {
          btn.textContent = 'Copiado!';
          btn.classList.add('copied');
          setTimeout(function () { btn.textContent = 'Copiar'; btn.classList.remove('copied'); }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
        } else { fallbackCopy(text); done(); }
      });
      pre.appendChild(btn);
    });
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  /* ---------------- TOC + scroll-spy ---------------- */
  function buildToc(page) {
    tocList.innerHTML = '';
    if (spyObserver) { spyObserver.disconnect(); spyObserver = null; }

    var headings = Array.prototype.slice.call(page.querySelectorAll('h2, h3'));
    if (!headings.length) { return; }

    var links = [];
    headings.forEach(function (h) {
      if (!h.id) h.id = slugify(h.textContent);
      var a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent;
      if (h.tagName === 'H3') a.className = 'lvl-3';
      a.addEventListener('click', function (e) {
        e.preventDefault();
        h.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      var li = document.createElement('li');
      li.appendChild(a);
      tocList.appendChild(li);
      links.push(a);
    });

    // Scroll-spy: marca o heading visível mais próximo do topo.
    var navH = 60;
    spyObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var id = entry.target.id;
          links.forEach(function (l) {
            l.classList.toggle('is-active', l.getAttribute('href') === '#' + id);
          });
        }
      });
    }, { rootMargin: '-' + (navH + 12) + 'px 0px -72% 0px', threshold: 0 });
    headings.forEach(function (h) { spyObserver.observe(h); });
    if (links[0]) links[0].classList.add('is-active');
  }

  /* ---------------- Roteamento ---------------- */
  function currentRoute() {
    var hash = location.hash || '';
    if (hash.indexOf('#/') === 0) return hash.slice(2);
    return null; // âncoras in-page (#id) não trocam de rota
  }

  function showRoute(route) {
    var target = null;
    pages.forEach(function (p) {
      var match = p.getAttribute('data-route') === route;
      p.classList.toggle('is-active', match);
      if (match) target = p;
    });
    if (!target) {
      target = pages[0];
      target.classList.add('is-active');
      route = target.getAttribute('data-route');
    }

    navLinks.forEach(function (l) {
      l.classList.toggle('is-active', l.getAttribute('href') === '#/' + route);
    });

    document.title = target.getAttribute('data-title') + ' · Freela Radar Docs';
    buildToc(target);
    closeSidebar();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function route() {
    var r = currentRoute();
    if (r === null) {
      // hash de âncora (#id) ou vazio: garante uma página ativa sem trocar
      if (!document.querySelector('.page.is-active')) showRoute('introducao');
      return;
    }
    showRoute(r);
  }

  /* ---------------- Sidebar mobile ---------------- */
  function openSidebar() { sidebar.classList.add('is-open'); overlay.classList.add('is-open'); }
  function closeSidebar() { sidebar.classList.remove('is-open'); overlay.classList.remove('is-open'); }
  burger.addEventListener('click', function () {
    if (sidebar.classList.contains('is-open')) closeSidebar(); else openSidebar();
  });
  overlay.addEventListener('click', closeSidebar);

  /* ---------------- Boot ---------------- */
  initTheme();
  addCopyButtons();
  window.addEventListener('hashchange', route);
  if (location.hash.indexOf('#/') !== 0) location.replace('#/introducao');
  route();
})();
