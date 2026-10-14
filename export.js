/**
 * Ekspor dokumen: HTML mandiri, Word (.doc berbasis HTML), Markdown, teks polos.
 */
(() => {
  'use strict';
  const CG = (window.CG = window.CG || {});

  const DOC_CSS = `
    body{font-family:'Times New Roman',Times,serif;font-size:12pt;line-height:1.6;color:#111;max-width:780px;margin:0 auto;padding:32px;}
    h1{font-size:22pt;text-align:center;margin:0 0 8pt;line-height:1.25;}
    p.meta{text-align:center;font-style:italic;color:#444;margin:0 0 4pt;}
    h2{font-size:11.5pt;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #999;padding-bottom:3pt;margin:20pt 0 8pt;}
    h3{font-size:13pt;margin:14pt 0 6pt;}
    p{margin:0 0 9pt;text-align:justify;}
    ul,ol{margin:0 0 9pt 22pt;}
    blockquote{margin:0 0 9pt;padding-left:12pt;border-left:3px solid #999;color:#333;font-style:italic;}
    table{border-collapse:collapse;width:100%;margin:8pt 0;}
    td,th{border:1px solid #999;padding:4pt 6pt;text-align:left;}
  `;

  const META_RE = /^\s*(by|oleh|date and place|tanggal)\b/i;

  function cleanClone(paper) {
    const c = paper.cloneNode(true);
    ['contenteditable', 'spellcheck', 'id', 'class', 'role', 'aria-label', 'aria-multiline'].forEach((a) => c.removeAttribute(a));
    c.querySelectorAll('*').forEach((el) => {
      el.removeAttribute('style');
      el.removeAttribute('class');
    });
    // tandai baris byline / tanggal setelah judul agar rapi di Word
    const h1 = c.querySelector('h1');
    if (h1) {
      let n = h1.nextElementSibling;
      let i = 0;
      while (n && n.tagName === 'P' && i < 2 && META_RE.test(n.textContent)) {
        n.className = 'meta';
        n = n.nextElementSibling;
        i++;
      }
    }
    return c;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  }

  function toStandaloneHtml(paper, title) {
    const body = cleanClone(paper).innerHTML;
    return `<!doctype html>\n<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>${DOC_CSS}</style></head><body>\n${body}\n</body></html>`;
  }

  function toWordHtml(paper, title) {
    const body = cleanClone(paper).innerHTML;
    return (
      '﻿<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
      `<head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
      '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->' +
      `<style>@page{size:21cm 29.7cm;margin:2.5cm 2.2cm;}${DOC_CSS}</style></head><body>\n${body}\n</body></html>`
    );
  }

  function inlineMd(node) {
    let out = '';
    node.childNodes.forEach((c) => {
      if (c.nodeType === 3) { out += c.textContent.replace(/\s+/g, ' '); return; }
      if (c.nodeType !== 1) return;
      const t = c.tagName;
      const inner = inlineMd(c);
      if (t === 'STRONG' || t === 'B') out += inner.trim() ? `**${inner.trim()}** ` : '';
      else if (t === 'EM' || t === 'I') out += inner.trim() ? `*${inner.trim()}* ` : '';
      else if (t === 'BR') out += '  \n';
      else if (t === 'A') out += `[${inner}](${c.getAttribute('href') || ''})`;
      else out += inner;
    });
    return out;
  }

  function toMarkdown(paper) {
    const c = cleanClone(paper);
    const out = [];
    c.childNodes.forEach((node) => {
      if (node.nodeType === 3) { const t = node.textContent.trim(); if (t) out.push(t, ''); return; }
      if (node.nodeType !== 1) return;
      const tag = node.tagName;
      const text = inlineMd(node).replace(/[ \t]+/g, ' ').trim();
      if (/^H[1-6]$/.test(tag)) out.push(`${'#'.repeat(Number(tag[1]))} ${text}`, '');
      else if (tag === 'UL' || tag === 'OL') {
        [...node.children].forEach((li, i) => out.push(`${tag === 'OL' ? `${i + 1}.` : '-'} ${inlineMd(li).trim()}`));
        out.push('');
      } else if (tag === 'BLOCKQUOTE') out.push(`> ${text}`, '');
      else if (tag === 'TABLE') {
        const rows = [...node.querySelectorAll('tr')].map((tr) => `| ${[...tr.children].map((x) => x.textContent.trim()).join(' | ')} |`);
        if (rows.length) {
          const cols = node.querySelector('tr').children.length;
          rows.splice(1, 0, `| ${Array(cols).fill('---').join(' | ')} |`);
          out.push(...rows, '');
        }
      } else if (text) out.push(text, '');
    });
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  function blockText(el) {
    return el.textContent.replace(/\s+/g, ' ').trim();
  }

  function toPlainText(paper) {
    const out = [];
    paper.childNodes.forEach((node) => {
      if (node.nodeType === 3) {
        const t = node.textContent.trim();
        if (t) out.push(t, '');
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.tagName;
      if (tag === 'H1') {
        const t = blockText(node);
        out.push(t.toUpperCase(), '='.repeat(Math.min(t.length, 70)), '');
      } else if (tag === 'H2') {
        const t = blockText(node);
        out.push(t.toUpperCase(), '-'.repeat(Math.min(t.length, 70)), '');
      } else if (/^H[3-6]$/.test(tag)) {
        out.push(blockText(node), '');
      } else if (tag === 'UL' || tag === 'OL') {
        [...node.children].forEach((li, i) => out.push((tag === 'OL' ? `${i + 1}. ` : '• ') + blockText(li)));
        out.push('');
      } else if (tag === 'BLOCKQUOTE') {
        out.push('> ' + blockText(node), '');
      } else if (tag === 'TABLE') {
        node.querySelectorAll('tr').forEach((tr) => out.push([...tr.children].map(blockText).join(' | ')));
        out.push('');
      } else {
        const t = blockText(node);
        if (t) out.push(t, '');
      }
    });
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  function slug(s) {
    return (
      String(s || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'catatan'
    );
  }

  function download(content, filename, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  CG.exporter = { toStandaloneHtml, toWordHtml, toMarkdown, toPlainText, cleanClone, slug, download };
})();
