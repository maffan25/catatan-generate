/**
 * Mesin Report Writing — berjalan sepenuhnya di browser (tanpa AI, tanpa server).
 *
 * Alur: teks PDF → bersihkan → deteksi judul/subjudul → pecah kalimat →
 *       beri skor (ekstraktif) → baku-kan bahasa → ubah kalimat langsung jadi tidak langsung →
 *       susun: Judul · Byline · Tanggal & Tempat · Pendahuluan · Rincian · Kesimpulan.
 *
 * Mesin ini menyusun ulang kalimat yang ADA di dokumen; ia tidak mengarang fakta baru.
 */
(() => {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const CG = (root.CG = root.CG || {});

  /* ====================== Konstanta ====================== */

  const LABELS = {
    en: { by: 'By', datePlace: 'Date and Place', intro: 'Introduction', body: 'Main Details', conclusion: 'Conclusion' },
    id: { by: 'Oleh', datePlace: 'Tanggal dan Tempat', intro: 'Pendahuluan', body: 'Rincian Utama', conclusion: 'Kesimpulan' },
  };
  const PLACEHOLDER = {
    en: { by: "[Writer's name]", datePlace: '[Date and place not stated in the source]' },
    id: { by: '[Nama penulis]', datePlace: '[Tanggal dan tempat belum disebutkan]' },
  };
  const LENGTHS = {
    short: { words: 300, maxSections: 3 },
    medium: { words: 550, maxSections: 5 },
    long: { words: 950, maxSections: 8 },
  };

  const STOP_ID = new Set(('yang dan di ke dari dalam untuk pada dengan ini itu atau juga adalah akan telah sudah dapat tidak oleh sebagai karena agar bahwa para serta saat ketika jika maka lebih sangat hanya masih belum ada seperti antara tersebut kami kita saya aku anda mereka dia ia nya pun lah kah yaitu yakni sehingga namun tetapi tapi bagi atas bawah setiap semua beberapa banyak satu dua tiga sedang bisa harus perlu kepada tentang terhadap melalui sebuah suatu hal dalam bukan merupakan menjadi sebagian lain lainnya sampai hingga setelah sebelum selama sejak olehnya adanya apa siapa mana kapan bagaimana mengapa').split(' '));
  const STOP_EN = new Set(('the a an and or but of to in on at for with by from as is are was were be been being this that these those it its i you he she we they them his her our their not no do does did have has had will would can could may might must shall should about into over under than then there here which who whom what when where why how also more most such other some any all each both very just only so if while during after before between through').split(' '));

  const MONTHS_ID = 'Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember';
  const MONTHS_EN = 'January|February|March|April|May|June|July|August|September|October|November|December';
  const DATE_RE = new RegExp(
    `\\b(?:\\d{1,2}(?:\\s*[-–]\\s*\\d{1,2})?\\s+(?:${MONTHS_ID}|${MONTHS_EN})\\s+\\d{4}|(?:${MONTHS_EN})\\s+\\d{1,2},?\\s+\\d{4}|(?:${MONTHS_ID}|${MONTHS_EN})\\s+\\d{4})\\b`,
    'i',
  );

  const CUE_RE = /\b(tujuan|bertujuan|hasil|kesimpulan|simpulan|menunjukkan|diperoleh|penting|utama|pokok|rekomendasi|saran|dilaksanakan|diselenggarakan|dihadiri|berlangsung|purpose|aim|objective|result|conclusion|shows?|found|important|main|key|recommend\w*|held|attended|took place)\b/i;
  const PURPOSE_RE = /\b(tujuan|bertujuan|dimaksudkan untuk|purpose|aims? to|objectives?)\b/i;
  const CONCLUSION_RE = /\b(kesimpulan|simpulan|disimpulkan|secara keseluruhan|akhirnya|dengan demikian|in conclusion|overall|to sum up|in summary|therefore|thus)\b/i;
  const EVENT_RE = /(seminar|workshop|pelatihan|rapat|kegiatan|acara|musyawarah|kunjungan|lomba|penelitian|pertemuan|rakor|webinar|diskusi|konferensi|conference|meeting|training|event|visit|programme|program)/i;

  /* ====================== Util teks ====================== */

  const wordCount = (s) => (s.match(/\S+/g) || []).length;
  const capFirst = (s) => s.replace(/^([^\p{L}\p{N}]*)(\p{L})/u, (m, a, b) => a + b.toUpperCase());

  function lowFirst(s) {
    const m = s.match(/^([^\p{L}\p{N}]*)(\S+)(?:\s+(\S+))?/u);
    if (!m) return s;
    const w1 = m[2];
    const w2 = m[3] || '';
    if (/^[A-Z]{2,}/.test(w1)) return s; // singkatan
    if (w2 && /^\p{Lu}/u.test(w2)) return s; // kemungkinan nama
    return s.replace(/^([^\p{L}\p{N}]*)(\p{L})/u, (mm, a, b) => a + b.toLowerCase());
  }

  function titleCase(s) {
    const small = new Set(['dan', 'di', 'ke', 'dari', 'untuk', 'pada', 'dengan', 'yang', 'of', 'the', 'and', 'in', 'on', 'for', 'to', 'a', 'an']);
    return s
      .toLowerCase()
      .split(/\s+/)
      .map((w, i) => (i > 0 && small.has(w) ? w : w.replace(/^(\p{L})/u, (c) => c.toUpperCase())))
      .join(' ');
  }

  function tokens(s) {
    return (s.toLowerCase().match(/\p{L}[\p{L}\p{N}'-]*/gu) || []).filter((w) => w.length > 2);
  }

  function detectLanguage(text) {
    const toks = (text.slice(0, 8000).toLowerCase().match(/\p{L}+/gu) || []);
    let id = 0;
    let en = 0;
    for (const w of toks) {
      if (STOP_ID.has(w) && !STOP_EN.has(w)) id++;
      else if (STOP_EN.has(w) && !STOP_ID.has(w)) en++;
    }
    return id >= en ? 'id' : 'en';
  }

  /* ====================== Bersihkan & strukturkan ====================== */

  const BULLET_RE = /^(?:[•▪●◦■□–—*-]|\(?\d{1,2}[.)]|\(?[a-z][.)])\s+/;
  const PAGE_NO_RE = /^\s*(?:halaman|page|hal\.?)?\s*\d+(?:\s*(?:dari|of|\/)\s*\d+)?\s*$/i;

  function normalize(raw) {
    return String(raw)
      .replace(/\r/g, '')
      .replace(/\u00ad/g, '')
      .replace(/[\u200b-\u200d\ufeff]/g, '')
      .replace(/\u00a0/g, ' ')
      .replace(/[“”„«»]/g, '"')
      .replace(/[‘’‚]/g, "'")
      .replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2')
      .replace(/[ \t]+/g, ' ');
  }

  const KNOWN_HEAD = /^(pendahuluan|penutup|kesimpulan|simpulan|abstrak|latar belakang|tujuan|metode|metodologi|hasil|pembahasan|saran|rekomendasi|agenda|jadwal|rincian|uraian|kegiatan|introduction|background|methods?|methodology|results?|discussion|conclusions?|summary|recommendations?|agenda|schedule|overview|objectives?)(?:\s+(?:dan|and|&)\s+\p{L}+)?$/iu;

  function isHeading(line, next) {
    if (line.length > 90 || line.length < 3) return false;
    if (KNOWN_HEAD.test(line.replace(/[:：]$/, '').trim())) return true;
    if (/[.,;!?]$/.test(line)) return false;
    const words = line.split(/\s+/);
    const n = words.length;
    if (n > 12) return false;
    const letters = (line.match(/\p{L}/gu) || []).length;
    if (letters < 3 || letters / line.length < 0.55) return false;
    const upper = (line.match(/\p{Lu}/gu) || []).length;
    if (letters >= 4 && upper / letters > 0.8) return true; // HURUF KAPITAL
    if (/^(?:\d+(?:\.\d+){0,3}|[IVXLC]+|[A-Z])[.)]\s+\S/.test(line) && n <= 9) return true; // bernomor
    if (n >= 2) {
      const big = words.filter((w) => w.length > 3);
      const cap = big.filter((w) => /^\p{Lu}/u.test(w)).length;
      if (big.length && cap / big.length >= 0.66 && !(next && /^\p{Ll}/u.test(next))) return true; // Title Case
    }
    return false;
  }

  /** Mengembalikan { title, blocks:[{h:string|null, text:string}] } */
  function structure(raw) {
    const text = normalize(raw);
    let lines = text.split('\n').map((l) => l.trim());

    // buang header/footer berulang, nomor halaman, titik-titik daftar isi
    const freq = new Map();
    lines.forEach((l) => { if (l && l.length < 80) freq.set(l, (freq.get(l) || 0) + 1); });
    lines = lines.filter((l) => {
      if (!l) return true;
      if (PAGE_NO_RE.test(l)) return false;
      if (/\.{5,}/.test(l)) return false;
      if (!/[\p{L}\p{N}]/u.test(l)) return false;
      if ((freq.get(l) || 0) >= 3 && l.length < 70 && !/[.!?]$/.test(l)) return false;
      return true;
    });

    // judul: baris mirip-judul di awal dokumen
    let title = '';
    let titleAt = -1;
    const nonEmpty = [];
    lines.forEach((l, i) => { if (l) nonEmpty.push(i); });
    for (const i of nonEmpty.slice(0, 14)) {
      const l = lines[i];
      const w = wordCount(l);
      if (w < 2 || w > 16 || /[.;!?]$/.test(l)) continue;
      if (/^(daftar isi|table of contents|contents|abstrak|abstract|kata pengantar|halaman|page|bab\b|chapter\b)/i.test(l)) continue;
      if (/^\d/.test(l) || DATE_RE.test(l)) continue;
      title = l;
      titleAt = i;
      break;
    }
    if (titleAt >= 0) lines[titleAt] = '';

    const blocks = [];
    let cur = { h: null, text: '' };
    const flush = () => {
      if (cur.text.trim()) blocks.push({ h: cur.h, text: cur.text.trim() });
    };

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l) continue;
      let next = '';
      for (let j = i + 1; j < lines.length; j++) { if (lines[j]) { next = lines[j]; break; } }
      if (isHeading(l, next) && i !== titleAt) {
        flush();
        cur = { h: l.replace(/^(?:\d+(?:\.\d+){0,3}|[IVXLC]+|[A-Z])[.)]\s+/, '').replace(/[:：]$/, '').trim(), text: '' };
        continue;
      }
      let piece = l;
      if (BULLET_RE.test(piece)) {
        piece = piece.replace(BULLET_RE, '');
        if (cur.text && !/[.!?:]$/.test(cur.text.trim())) cur.text = cur.text.trim() + '.';
        if (!/[.!?]$/.test(piece)) piece += '.';
      }
      cur.text += (cur.text && !cur.text.endsWith(' ') ? ' ' : '') + piece;
    }
    flush();

    // heading bertanda ALL CAPS → Title Case
    blocks.forEach((b) => {
      if (b.h && b.h === b.h.toUpperCase()) b.h = titleCase(b.h);
    });
    if (title && title === title.toUpperCase()) title = titleCase(title);
    return { title, blocks };
  }

  /* ====================== Pecah kalimat ====================== */

  const D = '\u0001';
  function protect(s) {
    return s
      .replace(/\b(dr|drs|dra|prof|ir|hj|kh|mr|mrs|ms|st|no|nos|hal|tgl|jl|jln|yth|dll|dsb|dst|dkk|sdr|sdri|bpk|vs|etc|fig|al|ca|cf|inc|ltd|co|jr|sr|approx|eg|ie)\./gi, `$1${D}`)
      .replace(/\b(?:\p{L}\.){2,}/gu, (m) => m.replace(/\./g, D))
      .replace(/(\d)\.(\d)/g, `$1${D}$2`)
      .replace(/\b(\p{Lu})\.(?=\s?\p{Lu})/gu, `$1${D}`);
  }

  function splitSentences(text) {
    const t = protect(text);
    const parts = t.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) || [];
    return parts.map((p) => p.replace(new RegExp(D, 'g'), '.').trim()).filter(Boolean);
  }

  /* ====================== Pembakuan bahasa ====================== */

  const INFORMAL_ID = [
    [/\b(?:nggak|ngga|gak|enggak|tdk)\b/gi, 'tidak'],
    [/\b(?:udah|sdh|dah)\b/gi, 'sudah'],
    [/\b(?:belom|blm)\b/gi, 'belum'],
    [/\b(?:banget|bgt)\b/gi, 'sekali'],
    [/\bbikin\b/gi, 'membuat'],
    [/\baja\b/gi, 'saja'],
    [/\bkayak\b/gi, 'seperti'],
    [/\b(?:cuma|cuman)\b/gi, 'hanya'],
    [/\bgimana\b/gi, 'bagaimana'],
    [/\bkalo\b/gi, 'jika'],
    [/\bemang\b/gi, 'memang'],
    [/\byg\b/gi, 'yang'],
    [/\bdgn\b/gi, 'dengan'],
    [/\butk\b/gi, 'untuk'],
    [/\bdll\b\.?/gi, 'dan lain-lain'],
    [/\bdst\b\.?/gi, 'dan seterusnya'],
    [/\b(?:krn|karna)\b/gi, 'karena'],
    [/\bsbg\b/gi, 'sebagai'],
    [/\bspt\b/gi, 'seperti'],
    [/\bjg\b/gi, 'juga'],
    [/\bhrs\b/gi, 'harus'],
    [/\btp\b/gi, 'tetapi'],
    [/\btrus\b/gi, 'kemudian'],
    [/\bbilang\b/gi, 'mengatakan'],
    [/\bpake\b/gi, 'memakai'],
    [/\bngomong\b/gi, 'berbicara'],
    [/\bliat\b/gi, 'melihat'],
    [/\bgede\b/gi, 'besar'],
    [/\b(?:ya|dong|deh|sih|lho|kok|nih|tuh|wah|wow|hehe|haha)\b,?\s*/gi, ''],
  ];
  const INFORMAL_EN = [
    [/\bgonna\b/gi, 'going to'],
    [/\bwanna\b/gi, 'want to'],
    [/\bgotta\b/gi, 'have to'],
    [/\bkinda\b/gi, 'somewhat'],
    [/\ba lot of\b/gi, 'many'],
    [/\blots of\b/gi, 'many'],
    [/\bcan't\b/gi, 'cannot'],
    [/\bwon't\b/gi, 'will not'],
    [/\bshan't\b/gi, 'shall not'],
    [/(\w+)n't\b/gi, '$1 not'],
    [/(\w+)'re\b/gi, '$1 are'],
    [/(\w+)'ve\b/gi, '$1 have'],
    [/(\w+)'ll\b/gi, '$1 will'],
    [/\bI'm\b/g, 'I am'],
    [/\b(?:awesome|amazing|fantastic|wonderful|incredible)\b/gi, 'notable'],
    [/\b(?:wow|hey|oh)\b,?\s*/gi, ''],
  ];

  function formalize(s, lang) {
    let t = s
      .replace(/\p{Extended_Pictographic}/gu, '')
      .replace(/!+/g, '.')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.;:])/g, '$1');
    const table = lang === 'id' ? INFORMAL_ID : INFORMAL_EN;
    table.forEach(([re, rep]) => { t = t.replace(re, rep); });

    // kata ganti orang pertama → orang ketiga
    if (lang === 'id') {
      t = t.replace(/\b(?:saya|aku)\b/gi, 'penulis').replace(/\b(?:kami|kita)\b/gi, 'mereka');
    } else {
      t = t
        .replace(/\bI am\b/g, 'the writer is')
        .replace(/\bI have\b/g, 'the writer has')
        .replace(/\bI\b/g, 'the writer')
        .replace(/\b[Mm]y\b/g, "the writer's")
        .replace(/\bme\b/g, 'the writer')
        .replace(/\b[Ww]e\b/g, 'they')
        .replace(/\b[Oo]ur\b/g, 'their')
        .replace(/\bus\b/g, 'them');
    }
    t = t.replace(/\s{2,}/g, ' ').replace(/^[\s,;:]+/, '').trim();
    return capFirst(t);
  }

  /* ====================== Kalimat langsung → tidak langsung ====================== */

  const TIME_ID = [
    [/\bhari ini\b/gi, 'pada hari itu'],
    [/\bbesok\b/gi, 'keesokan harinya'],
    [/\bkemarin\b/gi, 'hari sebelumnya'],
    [/\bsekarang\b/gi, 'saat itu'],
    [/\bdi sini\b/gi, 'di tempat itu'],
    [/\bminggu depan\b/gi, 'minggu berikutnya'],
    [/\bminggu lalu\b/gi, 'minggu sebelumnya'],
    [/\bmalam ini\b/gi, 'pada malam itu'],
    [/\b(?:saya|aku)\b/gi, 'ia'],
    [/\bkami\b/gi, 'pihaknya'],
    [/\b(?:kita|kalian|anda|kamu)\b/gi, 'mereka'],
  ];

  const EN_VERBS = {
    go: 'went', come: 'came', make: 'made', take: 'took', give: 'gave', get: 'got', see: 'saw', know: 'knew',
    think: 'thought', feel: 'felt', want: 'wanted', need: 'needed', hope: 'hoped', believe: 'believed',
    like: 'liked', love: 'loved', work: 'worked', plan: 'planned', expect: 'expected', appreciate: 'appreciated',
    support: 'supported', join: 'joined', attend: 'attended', hold: 'held', start: 'started', begin: 'began',
    bring: 'brought', find: 'found', tell: 'told', ask: 'asked', say: 'said',
  };
  const TIME_EN = [
    [/\btoday\b/gi, 'that day'],
    [/\btomorrow\b/gi, 'the next day'],
    [/\byesterday\b/gi, 'the previous day'],
    [/\btonight\b/gi, 'that night'],
    [/\bnext week\b/gi, 'the following week'],
    [/\blast week\b/gi, 'the previous week'],
    [/\bnow\b/gi, 'then'],
    [/\bhere\b/gi, 'there'],
    [/\bthese\b/gi, 'those'],
    [/\bthis\b/gi, 'that'],
    [/\bago\b/gi, 'before'],
  ];

  const SAY_ID = 'berkata|mengatakan|menyatakan|menjelaskan|mengungkapkan|menegaskan|menyampaikan|menambahkan|bertanya|menanyakan|mengumumkan|menyebutkan|berujar|ujar|kata|tutur|menuturkan|mengimbau|meminta|berpesan|berharap|mengingatkan|tanya';
  const SAY_EN = 'said|says|stated|states|explained|explains|announced|announces|added|adds|asked|asks|told|replied|replies|emphasised|emphasized|emphasises|emphasizes|noted|notes|remarked|declared|exclaimed|reminded|urged|requested|advised';
  const SPEAKER = "((?:[\\p{L}][\\p{L}.'’-]*,?\\s+){0,5}?[\\p{L}][\\p{L}.'’-]*,?)";
  const ROLE = 'ketua|kepala|direktur|rektor|dekan|menteri|bupati|walikota|gubernur|presiden|sekretaris|bendahara|panitia|narasumber|moderator|pembicara|peserta|mayor|chairman|chair|coordinator|director|speaker|manager|teacher|president|minister|professor';
  const SPK_B = `(?:(?:he|she|they)(?=[\\s.,;]|$)|(?:the|a|an)\\s+\\p{L}+(?:\\s\\p{L}+)?|(?:${ROLE})(?:\\s+\\p{Lu}[\\p{L}.'’-]*){0,3}|(?:\\p{Lu}[\\p{L}'’-]*\\s?){1,5})`;

  const WH_ID = /^(apa|siapa|kapan|di mana|dimana|mengapa|kenapa|bagaimana|berapa|mana)\b/i;
  const WH_EN = /^(what|who|whom|when|where|why|how|which|whose)\b/i;

  function quoteBody(q, lang) {
    let s = q.trim().replace(/[\s,;:]+$/, '');
    const parts = s.split(/(?<=[.!?])\s+(?=\p{Lu})/u).map((p) => p.replace(/[.!?]+$/, '').trim()).filter(Boolean);
    s = parts.map((p, i) => (i ? lowFirst(p) : p)).join('; ');
    return { text: s, question: /\?\s*$/.test(q.trim()) };
  }

  function shiftQuoteID(s) {
    let t = s;
    TIME_ID.forEach(([re, rep]) => { t = t.replace(re, rep); });
    return t;
  }

  function shiftQuoteEN(s) {
    let t = s
      .replace(/\b(?:I am|[Ww]e are|[Yy]ou are)\b/g, 'they were')
      .replace(/\bI\b/g, 'they')
      .replace(/\b[Mm]y\b/g, 'their')
      .replace(/\b[Mm]e\b/g, 'them')
      .replace(/\b[Ww]e\b/g, 'they')
      .replace(/\b[Oo]ur\b/g, 'their')
      .replace(/\bus\b/g, 'them')
      .replace(/\b[Yy]ou\b/g, 'they')
      .replace(/\b[Yy]our\b/g, 'their');
    TIME_EN.forEach(([re, rep]) => { t = t.replace(re, rep); });
    t = t
      .replace(/\b(?:have|has) to\b/gi, 'had to')
      .replace(/\b(?:do not|does not)\b/gi, 'did not')
      .replace(/\b(?:am|is)\b/gi, 'was')
      .replace(/\bare\b/gi, 'were')
      .replace(/\bwill\b/gi, 'would')
      .replace(/\bcan\b/gi, 'could')
      .replace(/\bmay\b/gi, 'might')
      .replace(/\bmust\b/gi, 'had to')
      .replace(/\b(?:have|has)\b/gi, 'had');
    t = t.replace(/\b(they)\s+([a-z]+)\b/gi, (m, subj, verb) => {
      const past = EN_VERBS[verb.toLowerCase()];
      return past ? `${subj} ${past}` : m;
    });
    return t;
  }

  function buildReportedID(speaker, verb, q) {
    const v = verb.toLowerCase();
    const { text, question } = quoteBody(q, 'id');
    let body = shiftQuoteID(text);
    const sp = speaker.trim().replace(/[,\s]+$/, '');
    if (question || /^(?:bertanya|menanyakan|tanya)$/.test(v)) {
      body = body.replace(/^apakah\s+/i, '');
      const head = WH_ID.test(body) ? '' : 'apakah ';
      return `${sp} menanyakan ${head}${lowFirst(body)}.`;
    }
    if (/^(?:mari|ayo)\b/i.test(body)) return `${sp} mengajak agar ${body.replace(/^(?:mari|ayo)\s+/i, '')}.`;
    if (/^(?:harap|tolong|mohon|jangan|silakan|silahkan)\b/i.test(body)) {
      return `${sp} meminta agar ${body.replace(/^(?:harap|tolong|mohon)\s+/i, '')}.`;
    }
    if (/^(?:meminta|mengimbau|berpesan|mengingatkan)$/.test(v)) return `${sp} ${v} agar ${lowFirst(body)}.`;
    const rv = /^(?:kata|ujar|tutur|berkata|berujar|mengatakan)$/.test(v) ? 'menyatakan' : v;
    return `${sp} ${rv} bahwa ${lowFirst(body)}.`;
  }

  const PAST_EN = {
    say: 'said', says: 'said', states: 'stated', explains: 'explained', announces: 'announced', adds: 'added',
    asks: 'asked', replies: 'replied', emphasises: 'emphasised', emphasizes: 'emphasised', emphasized: 'emphasised', notes: 'noted',
  };

  function buildReportedEN(speaker, verb, q) {
    const v = verb.toLowerCase();
    const past = PAST_EN[v] || v;
    const { text, question } = quoteBody(q, 'en');
    const sp = speaker.trim().replace(/[,\s]+$/, '');
    if (question || past === 'asked') {
      let q = text;
      if (WH_EN.test(q)) return `${sp} asked ${lowFirst(shiftQuoteEN(q))}.`;
      const inv = q.match(/^(am|is|are|was|were|can|could|will|would|shall|should|may|might|must|have|has|had)\s+(\S+)\s+(.*)$/i);
      const dos = q.match(/^(?:do|does|did)\s+(.*)$/i);
      if (inv) q = `${inv[2]} ${inv[1].toLowerCase()} ${inv[3]}`;
      else if (dos) q = dos[1];
      return `${sp} asked whether ${lowFirst(shiftQuoteEN(q))}.`;
    }
    let body = shiftQuoteEN(text);
    if (past === 'requested' || past === 'urged' || past === 'advised') {
      return `${sp} ${past} that ${lowFirst(body)}.`;
    }
    return `${sp} ${past === 'told' ? 'said' : past} that ${lowFirst(body)}.`;
  }

  function convertQuotes(text, lang) {
    const base = lang === 'id' ? SAY_ID : SAY_EN;
    // tanpa flag "i" (agar \p{Lu} tetap huruf kapital); varian kapital disertakan manual
    const sayRe = `${base}|${base.split('|').map((v) => v[0].toUpperCase() + v.slice(1)).join('|')}`;
    const build = lang === 'id' ? buildReportedID : buildReportedEN;
    let t = text;

    for (let pass = 0; pass < 6; pass++) {
      const before = t;

      // A: Pembicara + kata kerja + "kutipan"
      const reA = new RegExp(`(^|[.!?]["']?\\s+)${SPEAKER}\\s+(${sayRe})\\s*[,:]?\\s*"([^"]{3,500})"`, 'gu');
      t = t.replace(reA, (m, pre, speaker, verb, q) => `${pre}${build(speaker, verb, q)}`);

      // B1: "kutipan," kata Pembicara.   (kata kerja sebelum pembicara)
      const reB = new RegExp(`"([^"]{3,500}?)([,.!?]?)"\\s*,?\\s*(${sayRe})\\s+(${SPK_B})(?=[.,;]|\\s|$)\\.?`, 'gu');
      t = t.replace(reB, (m, q, pu, verb, speaker) => build(speaker.trim(), verb, q + (pu === '?' ? '?' : '')));

      // B2: "kutipan," the coordinator said.   (pembicara sebelum kata kerja, Inggris)
      if (lang === 'en') {
        const reC = new RegExp(`"([^"]{3,500}?)([,.!?]?)"\\s*,?\\s*(${SPK_B})\\s+(${sayRe})\\b\\.?`, 'gu');
        t = t.replace(reC, (m, q, pu, speaker, verb) => build(capFirst(speaker.trim()), verb, q + (pu === '?' ? '?' : '')));
      }
      if (t === before) break;
    }
    return t;
  }

  /* ====================== Skor kalimat ====================== */

  function buildStop(lang) { return lang === 'id' ? STOP_ID : STOP_EN; }

  const GENERIC_HEAD = /^(pendahuluan|penutup|kesimpulan|simpulan|abstrak|abstract|introduction|conclusion|summary|ringkasan|latar belakang|saran|referensi|daftar pustaka|references|lampiran|appendix)$/i;
  const GENERIC_WORDS = new Set(('acara kegiatan dokumen laporan peserta hasil bagian proses pihak tahun waktu orang hal cara salah satu document report event activity part people time year result results said stated explained announced added asked told noted menyatakan mengatakan menjelaskan').split(' '));

  /** Frasa kunci: bigram yang berulang lebih dulu, lalu kata tunggal. */
  function keywordsOf(sentences, lang, n, boost) {
    const stop = buildStop(lang);
    const uni = new Map();
    const bi = new Map();
    const bump = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
    sentences.forEach((s) => {
      const toks = (s.toLowerCase().match(/\p{L}[\p{L}\p{N}'-]*/gu) || []);
      toks.forEach((w, i) => {
        const ok = (x) => x && x.length > 3 && !stop.has(x) && !GENERIC_WORDS.has(x) && !/^\d+$/.test(x);
        if (ok(w)) bump(uni, w, 1);
        if (ok(w) && ok(toks[i + 1])) bump(bi, `${w} ${toks[i + 1]}`, 1);
      });
    });
    const bw = boost || new Set();
    const out = [];
    const taken = new Set();
    const rankedBi = [...bi.entries()].filter((e) => e[1] >= 2).sort((a, b) => b[1] - a[1]);
    for (const [k] of rankedBi) {
      const ws = k.split(' ');
      if (ws.some((w) => taken.has(w))) continue;
      out.push(k);
      ws.forEach((w) => taken.add(w));
      if (out.length >= n) return out;
    }
    const rankedUni = [...uni.entries()].map(([k, v]) => [k, v + (bw.has(k) ? 3 : 0)]).sort((a, b) => b[1] - a[1]);
    for (const [k, v] of rankedUni) {
      if (taken.has(k) || v < 2) continue;
      out.push(k);
      taken.add(k);
      if (out.length >= n) break;
    }
    return out;
  }

  function similarity(a, b) {
    const A = new Set(a);
    const B = new Set(b);
    if (!A.size || !B.size) return 0;
    let inter = 0;
    A.forEach((x) => { if (B.has(x)) inter++; });
    return inter / (A.size + B.size - inter);
  }

  function isJunk(s) {
    const letters = (s.match(/\p{L}/gu) || []).length;
    if (wordCount(s) < 5 || letters / s.length < 0.6) return true;
    if (/(?:https?:\/\/|www\.)\S+/i.test(s) && wordCount(s) < 9) return true;
    if (/\.{4,}/.test(s)) return true;
    if (/@\S+\.\S+/.test(s) && wordCount(s) < 8) return true;
    return false;
  }

  function scoreAll(all, lang, focus) {
    const stop = buildStop(lang);
    const freq = new Map();
    all.forEach((o) => o.toks.forEach((w) => { if (!stop.has(w)) freq.set(w, (freq.get(w) || 0) + 1); }));
    const maxF = Math.max(1, ...freq.values());
    const total = all.length;
    all.forEach((o, i) => {
      const content = o.toks.filter((w) => !stop.has(w));
      let sc = content.reduce((a, w) => a + (freq.get(w) || 0) / maxF, 0) / Math.pow(Math.max(content.length, 1), 0.72);
      if (/\d/.test(o.text)) sc *= 1.12;
      if (DATE_RE.test(o.text)) sc *= 1.15;
      if (CUE_RE.test(o.text)) sc *= 1.25;
      if (o.first) sc *= 1.2;
      if (i < total * 0.1) sc *= 1.12;
      if (i > total * 0.9) sc *= 1.08;
      const w = wordCount(o.text);
      if (w < 8) sc *= 0.6;
      if (w > 55) sc *= 0.7;
      if (/\b(?:saya|aku|kami|kita|I|we|my|our)\b/.test(o.raw)) sc *= 0.75;
      if (focus.size) {
        let hit = 0;
        o.toks.forEach((t) => { if (focus.has(t)) hit++; });
        sc *= 1 + Math.min(1.2, hit * 0.45);
      }
      o.score = sc;
    });
  }

  function pickTop(items, budgetWords, minOne) {
    const chosen = [];
    let used = 0;
    const sorted = [...items].sort((a, b) => b.score - a.score);
    for (const it of sorted) {
      const w = wordCount(it.text);
      if (chosen.some((c) => similarity(c.toks, it.toks) > 0.6)) continue;
      if (used + w > budgetWords && chosen.length >= (minOne ? 1 : 0)) {
        if (used >= budgetWords * 0.85) break;
        continue;
      }
      chosen.push(it);
      used += w;
      if (used >= budgetWords) break;
    }
    return chosen.sort((a, b) => a.idx - b.idx);
  }

  /* ====================== Tanggal & tempat ====================== */

  function detectDatePlace(text) {
    const head = text.slice(0, 4000);
    const d = head.match(DATE_RE);
    if (!d) return null;
    const date = d[0].replace(/\s+/g, ' ');
    const around = head.slice(Math.max(0, d.index - 140), d.index + date.length + 140);
    const loc = around.match(/\b(?:di|at|in)\s+((?:\p{Lu}[\p{L}-]+)(?:\s+(?:\p{Lu}[\p{L}-]+|dan|and)){0,3})/u)
      || around.match(new RegExp(`(\\p{Lu}[\\p{L}-]+(?:\\s\\p{Lu}[\\p{L}-]+)?),\\s*${date.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u'));
    return { date, place: loc ? loc[1].trim() : '' };
  }

  /* ====================== Susun laporan ====================== */

  function listJoin(items, lang) {
    if (items.length <= 1) return items.join('');
    const and = lang === 'id' ? 'dan' : 'and';
    if (items.some((i) => new RegExp(`\\s${and}\\s`, 'i').test(i))) {
      if (items.length === 2) return `${items[0]} ${lang === 'id' ? 'serta' : 'as well as'} ${items[1]}`;
      return `${items.slice(0, -1).join('; ')}; ${lang === 'id' ? 'serta' : 'and'} ${items[items.length - 1]}`;
    }
    return `${items.slice(0, -1).join(', ')}${lang === 'en' && items.length > 2 ? ',' : ''} ${and} ${items[items.length - 1]}`;
  }

  function stemName(fileName) {
    const base = String(fileName || 'Dokumen').replace(/\.pdf$/i, '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Dokumen';
    return base === base.toLowerCase() ? titleCase(base) : base;
  }

  function generate({ text, fileName, pages, options }) {
    const opt = options || {};
    const lang = opt.language && opt.language !== 'auto' ? opt.language : detectLanguage(text);
    const L = LABELS[lang];
    const target = (LENGTHS[opt.length] || LENGTHS.medium);
    const notes = [];

    const struct = structure(text);
    const sourceLang = detectLanguage(text);
    if (opt.language && opt.language !== 'auto' && opt.language !== sourceLang) {
      notes.push(`Dokumen berbahasa ${sourceLang === 'id' ? 'Indonesia' : 'Inggris'}; kalimat isi tetap memakai bahasa aslinya, sedangkan judul, label, dan kalimat penghubung mengikuti bahasa pilihan.`);
    }

    // Kalimat per blok
    let idx = 0;
    const sections = [];
    struct.blocks.forEach((b) => {
      const converted = convertQuotes(b.text, sourceLang);
      const sents = splitSentences(converted)
        .map((raw, k) => ({ raw, text: formalize(raw, sourceLang), first: k === 0 }))
        .filter((s) => !isJunk(s.text))
        .map((s) => ({ ...s, idx: idx++, toks: tokens(s.text), score: 0 }));
      if (sents.length) sections.push({ h: b.h, sents });
    });

    const all = sections.flatMap((s) => s.sents);
    if (all.length < 3) throw new Error('Teks yang terbaca terlalu sedikit untuk dijadikan laporan.');

    const focus = new Set();
    if (opt.notes) tokens(opt.notes).forEach((w) => { if (!buildStop(lang).has(w) && !buildStop(sourceLang).has(w) && w.length > 3) focus.add(w); });
    scoreAll(all, sourceLang, focus);

    /* --- judul --- */
    const rawTitle = (struct.title || '').replace(/\s+/g, ' ').trim();
    const docTitle = rawTitle || stemName(fileName);
    let h1;
    if (/\b(laporan|report)\b/i.test(docTitle)) h1 = docTitle;
    else if (lang === 'id') h1 = `${EVENT_RE.test(docTitle) ? 'Laporan' : 'Laporan tentang'} ${docTitle}`;
    else h1 = `Report on ${docTitle}`;
    h1 = h1.replace(/[.\s]+$/, '');
    if (!rawTitle) notes.push('Judul diambil dari nama berkas karena judul dokumen tidak terdeteksi. Ganti dengan judul yang lebih spesifik.');

    /* --- byline, tanggal & tempat --- */
    const by = opt.author || PLACEHOLDER[lang].by;
    const found = detectDatePlace(text);
    let datePlace = opt.datePlace;
    if (!datePlace && found) datePlace = found.place ? `${found.date}, ${found.place}` : found.date;
    if (!datePlace) { datePlace = PLACEHOLDER[lang].datePlace; notes.push('Tanggal dan tempat tidak ditemukan di dokumen. Isi di kolom "Tanggal & tempat" atau langsung di kertas kerja.'); }
    if (!opt.author) notes.push('Nama penulis belum diisi (byline masih berupa tanda kurung siku).');

    /* --- pendahuluan --- */
    const headingList = sections.map((s) => s.h).filter((h) => h && !GENERIC_HEAD.test(h.trim()));
    const titleWords = new Set(tokens(docTitle));
    const topics = headingList.length >= 2 ? headingList.slice(0, 4) : keywordsOf(all.map((a) => a.text), sourceLang, 4, titleWords);
    const purpose = all.find((s) => PURPOSE_RE.test(s.text) && wordCount(s.text) <= 45);
    const intro = [];
    if (lang === 'id') {
      intro.push(`Laporan ini menguraikan pokok-pokok isi dokumen berjudul "${docTitle}"${pages ? ` yang terdiri atas ${pages} halaman` : ''}.`);
      if (purpose) intro.push(purpose.text);
      if (topics.length) intro.push(`Pembahasan meliputi ${listJoin(topics, 'id')}.`);
    } else {
      intro.push(`This report outlines the main points of the document titled "${docTitle}"${pages ? `, which consists of ${pages} pages` : ''}.`);
      if (purpose) intro.push(purpose.text);
      if (topics.length) intro.push(`The discussion covers ${listJoin(topics, 'en')}.`);
    }

    /* --- kesimpulan (pilih dulu supaya tidak dobel di rincian) --- */
    const concCandidates = all.filter((s) => CONCLUSION_RE.test(s.text) && wordCount(s.text) <= 50);
    const lastSlice = all.slice(Math.floor(all.length * 0.85));
    const concSentence = concCandidates.length
      ? concCandidates[concCandidates.length - 1]
      : [...lastSlice].sort((a, b) => b.score - a.score)[0];
    const kw = headingList.length >= 2 ? headingList.slice(0, 3) : keywordsOf(all.map((a) => a.text), sourceLang, 3, titleWords);
    const concl = [];
    if (concSentence) concl.push(concSentence.text);
    if (kw.length >= 2) {
      concl.push(lang === 'id'
        ? `Secara keseluruhan, dokumen ini memaparkan ${listJoin(kw, 'id')} beserta rincian pendukungnya.`
        : `Overall, the document presents ${listJoin(kw, 'en')} together with supporting details.`);
    }

    /* --- rincian utama --- */
    const used = new Set([concSentence && concSentence.idx, purpose && purpose.idx]);
    const introW = intro.reduce((a, s) => a + wordCount(s), 0);
    const conclW = concl.reduce((a, s) => a + wordCount(s), 0);
    const bodyBudget = Math.max(120, target.words - introW - conclW);

    const bodyBlocks = [];
    let secs = sections.filter((s) => s.sents.length);
    const useHeads = secs.filter((s) => s.h).length >= 2;

    if (useHeads) {
      if (secs.length > target.maxSections) {
        const rank = secs.map((s, i) => ({ s, i, v: s.sents.reduce((a, b) => a + b.score, 0) / Math.sqrt(s.sents.length) }))
          .sort((a, b) => b.v - a.v).slice(0, target.maxSections).sort((a, b) => a.i - b.i);
        secs = rank.map((r) => r.s);
      }
      const totalScore = secs.reduce((a, s) => a + s.sents.reduce((x, y) => x + y.score, 0), 0) || 1;
      secs.forEach((s) => {
        const share = s.sents.reduce((x, y) => x + y.score, 0) / totalScore;
        const budget = Math.max(28, Math.round(bodyBudget * share));
        const cands = s.sents.filter((x) => !used.has(x.idx));
        if (!cands.length) return;
        const chosen = pickTop(cands, budget, true);
        if (!chosen.length) return;
        if (s.h && !GENERIC_HEAD.test(s.h.trim())) bodyBlocks.push({ t: 'h3', v: capFirst(s.h) });
        for (let i = 0; i < chosen.length; i += 3) bodyBlocks.push({ t: 'p', v: chosen.slice(i, i + 3).map((c) => c.text).join(' ') });
      });
    } else {
      const cands = all.filter((x) => !used.has(x.idx));
      const chosen = pickTop(cands, bodyBudget, true);
      for (let i = 0; i < chosen.length; i += 3) bodyBlocks.push({ t: 'p', v: chosen.slice(i, i + 3).map((c) => c.text).join(' ') });
    }
    if (!bodyBlocks.length) throw new Error('Tidak ada kalimat yang cukup layak untuk dijadikan rincian.');

    const blocks = [
      { t: 'h1', v: h1 },
      { t: 'meta', label: `${L.by}:`, v: by },
      { t: 'meta', label: `${L.datePlace}:`, v: datePlace },
      { t: 'h2', v: L.intro },
      { t: 'p', v: intro.join(' ') },
      { t: 'h2', v: L.body },
      ...bodyBlocks,
      { t: 'h2', v: L.conclusion },
      { t: 'p', v: concl.join(' ') },
    ];
    return { blocks, lang, notes };
  }

  /* ====================== Render ====================== */

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function toHtml(blocks) {
    return blocks.map((b) => {
      if (b.t === 'meta') return `<p><strong>${esc(b.label)}</strong> ${esc(b.v)}</p>`;
      return `<${b.t}>${esc(b.v)}</${b.t}>`;
    }).join('\n');
  }

  /** Potong blok sampai n karakter (untuk efek mengetik). */
  function partial(blocks, n) {
    const out = [];
    let left = n;
    for (const b of blocks) {
      if (left <= 0) break;
      const len = (b.label ? b.label.length + 1 : 0) + b.v.length;
      if (len <= left) { out.push(b); left -= len; continue; }
      if (b.label) {
        if (left <= b.label.length) { out.push({ ...b, label: b.label.slice(0, left), v: '' }); }
        else out.push({ ...b, v: b.v.slice(0, left - b.label.length - 1) });
      } else out.push({ ...b, v: b.v.slice(0, left) });
      left = 0;
    }
    return out;
  }

  const size = (blocks) => blocks.reduce((a, b) => a + (b.label ? b.label.length + 1 : 0) + b.v.length, 0);

  CG.engine = { generate, toHtml, partial, size, detectLanguage, splitSentences, convertQuotes, formalize, structure };
  if (typeof module !== 'undefined' && module.exports) module.exports = CG.engine;
})();
