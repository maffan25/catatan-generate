/**
 * Catatan Generator — logika klien
 * Alur: PDF → ekstraksi teks (pdf.js, di browser) → mesin Report Writing (js/engine.js, di browser)
 *       → kertas kerja (bisa diedit) → ekspor.
 * Tidak ada server, tidak ada AI eksternal: teks dokumen tidak pernah meninggalkan perangkat.
 */
(() => {
  'use strict';

  const CG = window.CG || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const PDFJS_VERSION = '4.4.168';
  const PDFJS_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`;
  const PDFJS_WORKER = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
  const MAX_FILE_MB = 30;
  const MAX_CHARS = 120000;
  const MAX_PAGES = 250;
  const LS = { theme: 'cg-theme', draft: 'cg-draft', opts: 'cg-opts' };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* abaikan */ } },
    del(k) { try { localStorage.removeItem(k); } catch (_) { /* abaikan */ } },
  };

  const state = {
    file: null,
    fileState: 'idle',
    metaText: '',
    text: '',
    pages: 0,
    model: 'report-writing',
    busy: false,
    cancel: false,
  };

  const el = {
    paper: $('#paper'),
    wrap: $('#paperWrap'),
    pill: $('#statusPill'),
    dropzone: $('#dropzone'),
    fileInput: $('#fileInput'),
    fileChip: $('#fileChip'),
    fileName: $('#fileName'),
    fileMeta: $('#fileMeta'),
    btnGenerate: $('#btnGenerate'),
    btnStop: $('#btnStop'),
    hint: $('#generateHint'),
    fieldset: $('#controlsFieldset'),
    toolbar: $('#toolbar'),
    menu: $('#exportMenu'),
    btnExport: $('#btnExport'),
  };

  /* ---------------- Util UI ---------------- */

  function toast(msg, kind = 'info', ms = 4200) {
    const t = document.createElement('div');
    t.className = `toast${kind === 'error' ? ' is-error' : kind === 'success' ? ' is-success' : kind === 'warn' ? ' is-warn' : ''}`;
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 320); }, ms);
  }

  function setStatus(kind, text) {
    el.pill.dataset.kind = kind;
    el.pill.textContent = text;
  }

  function formatBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  /** Sanitizer ringan untuk draf dari localStorage (buang skrip, handler on*, URL javascript:). */
  function sanitizeHtml(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(html);
    tpl.content.querySelectorAll('script,style,iframe,object,embed,link,meta,form,input,button,svg,math').forEach((n) => n.remove());
    tpl.content.querySelectorAll('*').forEach((n) => {
      [...n.attributes].forEach((a) => {
        if (/^on/i.test(a.name) || /^(?:javascript|data|vbscript):/i.test(a.value.trim())) n.removeAttribute(a.name);
      });
    });
    return tpl.innerHTML;
  }

  /* ---------------- Tema ---------------- */

  $('#btnTheme').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.set(LS.theme, next);
  });

  /* ---------------- Model ---------------- */

  function renderModels() {
    const list = $('#modelList');
    list.innerHTML = '';
    (CG.MODELS || []).forEach((m) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'model';
      b.dataset.id = m.id;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(m.id === state.model));
      b.disabled = !m.available;
      b.innerHTML =
        `<span class="model-ico"><svg class="ico"><use href="#i-${esc(m.icon)}"/></svg></span>` +
        `<span class="model-body"><span class="model-name">${esc(m.name)}</span><span class="model-tag">${esc(m.tagline)}</span></span>` +
        (m.available ? '<span class="model-check"><svg class="ico"><use href="#i-check"/></svg></span>' : '<span class="badge">Segera</span>');
      b.addEventListener('click', () => {
        state.model = m.id;
        renderModels();
      });
      list.appendChild(b);
    });
    const current = (CG.MODELS || []).find((m) => m.id === state.model);
    const detail = $('#modelDetail');
    if (current && current.available) {
      detail.innerHTML =
        `<p>${esc(current.description)}</p><div class="flow">` +
        current.flow.map((f, i) => `${i ? '<span class="flow-arrow">→</span>' : ''}<span class="flow-chip" title="${esc(f.d)}">${esc(f.k)}</span>`).join('') +
        '</div>';
    } else {
      detail.innerHTML = '';
    }
  }

  /* ---------------- PDF ---------------- */

  let pdfjsPromise;
  function loadPdfjs() {
    if (!pdfjsPromise) {
      pdfjsPromise = import(PDFJS_URL).then((m) => {
        m.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        return m;
      });
    }
    return pdfjsPromise;
  }

  async function extractPdfText(file, onProgress) {
    const pdfjs = await loadPdfjs();
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    const total = doc.numPages;
    const limit = Math.min(total, MAX_PAGES);
    const pages = [];
    for (let i = 1; i <= limit; i++) {
      onProgress && onProgress(i, limit);
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let out = '';
      let prev = null;
      for (const it of content.items) {
        if (!('str' in it)) continue;
        if (prev) {
          if (Math.abs(it.transform[5] - prev.transform[5]) > 2) {
            if (!out.endsWith('\n')) out += '\n';
          } else {
            const gap = it.transform[4] - (prev.transform[4] + prev.width);
            if (gap > 1 && !/\s$/.test(out) && it.str) out += ' ';
          }
        }
        out += it.str;
        if (it.hasEOL && !out.endsWith('\n')) out += '\n';
        if (it.str) prev = it;
      }
      pages.push(out);
    }
    doc.destroy && doc.destroy();
    const text = pages.join('\n\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return { text, pages: total, truncated: total > limit };
  }

  function renderFile() {
    const has = !!state.file;
    el.dropzone.hidden = has;
    el.fileChip.hidden = !has;
    if (has) {
      el.fileName.textContent = state.file.name;
      el.fileMeta.textContent = state.metaText;
      el.fileChip.dataset.state = state.fileState;
    }
    refreshReady();
  }

  function resetFile() {
    state.file = null;
    state.fileState = 'idle';
    state.metaText = '';
    state.text = '';
    state.pages = 0;
    el.fileInput.value = '';
    renderFile();
  }

  async function handleFile(file) {
    if (!file) return;
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
      toast('Hanya berkas PDF yang didukung.', 'error');
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      toast(`Ukuran PDF maksimal ${MAX_FILE_MB} MB.`, 'error');
      return;
    }
    resetFile();
    state.file = file;
    state.fileState = 'loading';
    state.metaText = `${formatBytes(file.size)} · membaca…`;
    renderFile();

    try {
      const { text, pages, truncated } = await extractPdfText(file, (p, t) => {
        el.fileMeta.textContent = `${formatBytes(file.size)} · membaca halaman ${p}/${t}…`;
      });
      state.pages = pages;
      state.text = text;
      const chars = text.replace(/\s/g, '').length;
      if (chars < 200) {
        state.fileState = 'error';
        state.metaText = 'PDF ini tidak memiliki teks (kemungkinan hasil pindaian/gambar). Generator hanya membaca PDF berteks.';
      } else {
        state.fileState = 'ready';
        const clipped = text.length > MAX_CHARS ? ` · dibaca ${MAX_CHARS.toLocaleString('id-ID')} karakter pertama` : '';
        state.metaText = `${formatBytes(file.size)} · ${pages} hlm · ${text.length.toLocaleString('id-ID')} karakter${truncated ? ` · hanya ${MAX_PAGES} hlm pertama` : ''}${clipped}`;
      }
    } catch (err) {
      console.error(err);
      state.fileState = 'error';
      state.metaText = 'Gagal membaca PDF. Berkas mungkin rusak atau berpassword, atau pustaka pembaca PDF belum termuat (butuh internet saat pertama kali).';
    }
    renderFile();
  }

  el.fileInput.addEventListener('change', (e) => handleFile(e.target.files && e.target.files[0]));
  $('#btnRemoveFile').addEventListener('click', resetFile);
  ['dragenter', 'dragover'].forEach((ev) =>
    el.dropzone.addEventListener(ev, (e) => { e.preventDefault(); el.dropzone.classList.add('is-drag'); }));
  ['dragleave', 'drop'].forEach((ev) =>
    el.dropzone.addEventListener(ev, (e) => { e.preventDefault(); el.dropzone.classList.remove('is-drag'); }));
  el.dropzone.addEventListener('drop', (e) => handleFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]));
  ['dragover', 'drop'].forEach((ev) => window.addEventListener(ev, (e) => { if (!e.target.closest || !e.target.closest('#dropzone')) e.preventDefault(); }));

  function ready() {
    return !!state.file && state.fileState === 'ready' && state.text.trim().length >= 50;
  }

  function refreshReady() {
    el.btnGenerate.disabled = state.busy || !ready();
    el.hint.innerHTML = ready()
      ? 'Siap · <kbd>Ctrl</kbd> + <kbd>Enter</kbd>'
      : state.file && state.fileState === 'loading' ? 'Membaca PDF…' : 'Unggah PDF terlebih dahulu';
  }

  /* ---------------- Opsi ---------------- */

  function readOptions() {
    return {
      author: $('#optAuthor').value.trim(),
      datePlace: $('#optDatePlace').value.trim(),
      language: $('#optLang').value,
      length: ($('input[name="length"]:checked') || {}).value || 'medium',
      notes: $('#optNotes').value.trim(),
    };
  }

  function loadOptions() {
    try {
      const o = JSON.parse(store.get(LS.opts) || '{}');
      if (o.author) $('#optAuthor').value = o.author;
      if (o.language) $('#optLang').value = o.language;
      if (o.length) { const r = $(`input[name="length"][value="${o.length}"]`); if (r) r.checked = true; }
    } catch (_) { /* abaikan */ }
  }

  function saveOptions() {
    const o = readOptions();
    store.set(LS.opts, JSON.stringify({ author: o.author, language: o.language, length: o.length }));
  }
  $('#optionsForm').addEventListener('change', saveOptions);
  $('#optAuthor').addEventListener('input', saveOptions);

  /* ---------------- Kertas kerja ---------------- */

  function updateEmpty() {
    const empty = !el.paper.textContent.trim() && !el.paper.querySelector('table,img');
    if (empty && el.paper.innerHTML) el.paper.innerHTML = '';
    el.wrap.dataset.empty = String(empty);
  }

  function setEditable(on) {
    el.paper.contentEditable = String(on);
    $$('button', el.toolbar).forEach((b) => { b.disabled = !on; });
  }

  function saveDraft() {
    if (!el.paper.textContent.trim()) { store.del(LS.draft); return; }
    store.set(LS.draft, JSON.stringify({ html: el.paper.innerHTML, ts: Date.now() }));
  }

  /* ---------------- Final Check ---------------- */

  const FIRST_PERSON = /\b(?:we|my|our|ours|saya|aku|kami|kita)\b|\bI(?:['’](?:m|d|ll|ve)|\s+(?:am|was|have|had|will|would|can|could|think|believe|feel|saw|went|did|do))\b/gi;
  const STRUCT = [
    { key: 'title', label: 'Judul' },
    { key: 'byline', label: 'Byline' },
    { key: 'dateplace', label: 'Tanggal & Tempat' },
    { key: 'intro', label: 'Pendahuluan' },
    { key: 'body', label: 'Rincian' },
    { key: 'conclusion', label: 'Kesimpulan' },
  ];

  function setTile(name, stateName, note) {
    const tile = $(`.fc-tile[data-check="${name}"]`);
    tile.dataset.state = stateName;
    if (note != null) $('.fc-note', tile).textContent = note;
  }

  function runChecks() {
    const text = (el.paper.innerText || el.paper.textContent || '').trim();
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    const paras = $$('p', el.paper).filter((p) => p.textContent.trim()).length;
    $('#statWords').textContent = words.toLocaleString('id-ID');
    $('#statParas').textContent = String(paras);
    $('#statRead').textContent = String(words ? Math.max(1, Math.ceil(words / 200)) : 0);

    if (!words) {
      ['title', 'language', 'organised'].forEach((n) => setTile(n, 'idle', 'Menunggu isi'));
      setTile('facts', 'idle', 'Cocokkan dengan PDF, lalu centang');
      $('#fcChips').innerHTML = '';
      $('#fcSummary').textContent = 'Belum ada isi';
      return;
    }

    // 1) Judul
    const h1 = $('h1', el.paper);
    const hw = h1 ? h1.textContent.trim().split(/\s+/).filter(Boolean).length : 0;
    if (hw >= 3 && hw <= 20) setTile('title', 'ok', 'Judul jelas dan spesifik');
    else if (!h1) setTile('title', 'warn', 'Tambahkan judul (H1) yang menjelaskan isi laporan');
    else setTile('title', 'warn', hw < 3 ? 'Judul terlalu singkat' : 'Judul terlalu panjang');

    // 2) Fakta (manual)
    const factsOk = $('#chkFacts').checked;
    setTile('facts', factsOk ? 'ok' : 'idle', factsOk ? 'Sudah dicocokkan dengan PDF' : 'Cocokkan dengan PDF, lalu centang');

    // 3) Bahasa formal: tanpa kata ganti orang pertama
    const found = {};
    (text.match(FIRST_PERSON) || []).forEach((w) => { const k = w.toLowerCase(); found[k] = (found[k] || 0) + 1; });
    const keys = Object.keys(found);
    if (!keys.length) setTile('language', 'ok', 'Tanpa kata ganti orang pertama');
    else setTile('language', 'warn', 'Ditemukan: ' + keys.slice(0, 4).map((k) => `${k} ×${found[k]}`).join(', ') + ' — ubah ke orang ketiga');

    // 4) Struktur & kerapian
    const h2s = $$('h2', el.paper).map((h) => h.textContent.trim());
    const has = {
      title: !!h1,
      byline: /(^|\n)\s*(by|oleh)\s*:/i.test(text),
      dateplace: /(date and place|tanggal\s*(dan|&)\s*tempat)\s*:/i.test(text),
      intro: h2s.some((t) => /(introduction|pendahuluan|pembukaan)/i.test(t)),
      conclusion: h2s.some((t) => /(conclusion|kesimpulan|penutup)/i.test(t)),
      body: h2s.some((t) => !/(introduction|pendahuluan|pembukaan|conclusion|kesimpulan|penutup)/i.test(t)),
    };
    $('#fcChips').innerHTML = STRUCT.map((s) => `<span class="chip ${has[s.key] ? 'is-ok' : 'is-miss'}">${esc(s.label)}</span>`).join('');
    const missing = STRUCT.filter((s) => !has[s.key]).map((s) => s.label);
    const ps = $$('p', el.paper).map((p) => p.textContent.trim().split(/\s+/).filter(Boolean).length).filter(Boolean);
    const avg = ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 0;
    if (!missing.length && avg <= 110) setTile('organised', 'ok', 'Struktur lengkap, paragraf ringkas');
    else if (missing.length) setTile('organised', 'warn', 'Belum ada: ' + missing.join(', '));
    else setTile('organised', 'warn', 'Paragraf terlalu panjang — pecah menjadi lebih pendek');

    const okCount = $$('.fc-tile').filter((t) => t.dataset.state === 'ok').length;
    $('#fcSummary').textContent = `${okCount}/4 lolos`;
  }

  let debounce;
  function onInput() {
    updateEmpty();
    clearTimeout(debounce);
    debounce = setTimeout(() => { runChecks(); saveDraft(); }, 300);
  }

  el.paper.addEventListener('input', onInput);
  $('#chkFacts').addEventListener('change', runChecks);
  el.paper.addEventListener('paste', (e) => {
    e.preventDefault();
    const t = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, t);
  });

  /* ---------------- Toolbar ---------------- */

  el.toolbar.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  el.toolbar.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-cmd]');
    if (!b || state.busy) return;
    el.paper.focus();
    const c = b.dataset.cmd;
    if (['h1', 'h2', 'h3', 'p', 'blockquote'].includes(c)) {
      const cur = (document.queryCommandValue('formatBlock') || '').toLowerCase().replace(/[<>]/g, '');
      document.execCommand('formatBlock', false, `<${c !== 'p' && cur === c ? 'p' : c}>`);
    } else if (c === 'ul') document.execCommand('insertUnorderedList');
    else if (c === 'ol') document.execCommand('insertOrderedList');
    else document.execCommand(c);
    onInput();
    syncToolbar();
  });

  function syncToolbar() {
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode || !el.paper.contains(sel.anchorNode)) return;
    const block = (document.queryCommandValue('formatBlock') || '').toLowerCase().replace(/[<>]/g, '');
    $$('button[data-cmd]', el.toolbar).forEach((b) => {
      const c = b.dataset.cmd;
      let on = false;
      if (['bold', 'italic', 'underline'].includes(c)) on = document.queryCommandState(c);
      else if (['h1', 'h2', 'h3', 'blockquote'].includes(c)) on = block === c;
      else if (c === 'ul') on = document.queryCommandState('insertUnorderedList');
      else if (c === 'ol') on = document.queryCommandState('insertOrderedList');
      b.setAttribute('aria-pressed', String(on));
    });
  }
  document.addEventListener('selectionchange', syncToolbar);

  /* ---------------- Generate ---------------- */

  function setBusy(b) {
    state.busy = b;
    el.fieldset.disabled = b;
    el.btnGenerate.hidden = b;
    el.btnStop.hidden = !b;
    el.paper.classList.toggle('is-writing', b);
    setEditable(!b);
    refreshReady();
  }

  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Menampilkan hasil bertahap (efek menulis). Mengembalikan false bila dihentikan. */
  async function typeOut(blocks) {
    const E = CG.engine;
    const total = E.size(blocks);
    const frames = Math.min(110, Math.max(30, Math.round(total / 18)));
    const step = Math.ceil(total / frames);
    for (let n = step; n < total; n += step) {
      if (state.cancel) return false;
      el.paper.innerHTML = E.toHtml(E.partial(blocks, n));
      el.wrap.dataset.empty = 'false';
      await nextFrame();
    }
    return !state.cancel;
  }

  async function generate() {
    if (state.busy || !ready()) return;
    if (!CG.engine) { toast('Mesin penulis belum termuat. Muat ulang halaman.', 'error'); return; }
    if (el.paper.textContent.trim() && !confirm('Isi kertas kerja saat ini akan diganti hasil baru. Lanjutkan?')) return;

    const prevHtml = el.paper.innerHTML;
    state.cancel = false;
    setBusy(true);
    setStatus('writing', 'Menyusun');
    $('#chkFacts').checked = false;
    el.paper.innerHTML = '';
    el.wrap.dataset.empty = 'false';
    if (window.matchMedia('(max-width: 980px)').matches) el.wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
      await wait(60); // beri kesempatan UI menampilkan status "Menyusun"
      const result = CG.engine.generate({
        text: state.text.slice(0, MAX_CHARS),
        fileName: state.file.name,
        pages: state.pages,
        options: readOptions(),
      });
      const finished = await typeOut(result.blocks);
      if (!finished) {
        el.paper.innerHTML = prevHtml;
        setStatus('idle', 'Dihentikan');
        toast('Penyusunan dihentikan.');
      } else {
        el.paper.innerHTML = CG.engine.toHtml(result.blocks);
        setStatus('done', 'Selesai');
        toast('Catatan selesai disusun. Silakan edit dan cocokkan faktanya dengan PDF.', 'success');
        if (result.notes.length) setTimeout(() => toast(result.notes[0], 'warn', 7000), 900);
      }
    } catch (err) {
      console.error(err);
      el.paper.innerHTML = prevHtml;
      setStatus('error', 'Gagal');
      toast(err.message || 'Terjadi galat saat menyusun catatan.', 'error', 7000);
    } finally {
      setBusy(false);
      updateEmpty();
      runChecks();
      saveDraft();
    }
  }

  el.btnGenerate.addEventListener('click', () => generate());
  el.btnStop.addEventListener('click', () => { state.cancel = true; });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); generate(); }
    if (e.key === 'Escape') closeMenu();
  });

  /* ---------------- Ekspor ---------------- */

  function docTitle() {
    const h1 = $('h1', el.paper);
    return (h1 && h1.textContent.trim()) || (state.file && state.file.name.replace(/\.pdf$/i, '')) || 'Catatan';
  }

  function hasContent() {
    if (!el.paper.textContent.trim()) { toast('Kertas kerja masih kosong.', 'warn'); return false; }
    return true;
  }

  function closeMenu() { el.menu.hidden = true; el.btnExport.setAttribute('aria-expanded', 'false'); }
  el.btnExport.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = el.menu.hidden;
    el.menu.hidden = !open;
    el.btnExport.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.menu-wrap')) closeMenu(); });

  el.menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-export]');
    if (!b) return;
    closeMenu();
    if (!hasContent()) return;
    const X = CG.exporter;
    const title = docTitle();
    const base = X.slug(title);
    switch (b.dataset.export) {
      case 'pdf': {
        const prev = document.title;
        document.title = title;
        const restore = () => { document.title = prev; window.removeEventListener('afterprint', restore); };
        window.addEventListener('afterprint', restore);
        window.print();
        break;
      }
      case 'doc': X.download(X.toWordHtml(el.paper, title), `${base}.doc`, 'application/msword'); toast('Berkas Word diunduh.', 'success'); break;
      case 'md': X.download(X.toMarkdown(el.paper), `${base}.md`, 'text/markdown;charset=utf-8'); toast('Berkas Markdown diunduh.', 'success'); break;
      case 'html': X.download(X.toStandaloneHtml(el.paper, title), `${base}.html`, 'text/html;charset=utf-8'); toast('Berkas HTML diunduh.', 'success'); break;
      case 'txt': X.download(X.toPlainText(el.paper), `${base}.txt`, 'text/plain;charset=utf-8'); toast('Berkas teks diunduh.', 'success'); break;
      default: break;
    }
  });

  $('#btnCopy').addEventListener('click', async () => {
    if (!hasContent()) return;
    const X = CG.exporter;
    const plain = X.toPlainText(el.paper);
    const html = X.cleanClone(el.paper).innerHTML;
    try {
      if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        })]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
      toast('Isi disalin ke papan klip.', 'success');
    } catch (_) {
      toast('Tidak dapat menyalin otomatis. Pilih teks lalu salin manual.', 'error');
    }
  });

  $('#btnClear').addEventListener('click', () => {
    if (state.busy) return;
    if (el.paper.textContent.trim() && !confirm('Kosongkan kertas kerja? Isi yang belum diunduh akan hilang.')) return;
    el.paper.innerHTML = '';
    $('#chkFacts').checked = false;
    store.del(LS.draft);
    setStatus('idle', 'Siap');
    updateEmpty();
    runChecks();
  });

  /* ---------------- Init ---------------- */

  function init() {
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (_) { /* abaikan */ }
    renderModels();
    loadOptions();
    renderFile();
    try {
      const d = JSON.parse(store.get(LS.draft) || 'null');
      if (d && d.html) {
        el.paper.innerHTML = sanitizeHtml(d.html);
        setStatus('idle', 'Draf dipulihkan');
        toast('Draf terakhir dipulihkan.');
      }
    } catch (_) { /* abaikan */ }
    updateEmpty();
    runChecks();
  }

  init();
})();
