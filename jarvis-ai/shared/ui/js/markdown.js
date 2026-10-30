// Small, safe Markdown renderer for AI replies. Everything is HTML-escaped
// first; only a fixed set of formatting is turned back into tags, and links
// must be http(s). Also converts replies to plain text for speech.

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function safeUrl(url) {
  return /^https?:\/\//i.test(url) ? url.replace(/"/g, '%22') : null;
}

function inline(text) {
  // Pull out code spans first so their contents stay literal.
  const codes = [];
  let s = text.replace(/`([^`\n]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
    const u = safeUrl(url.replace(/&amp;/g, '&'));
    return u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
  });
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:!?'"])/g, (m, pre, url) => `${pre}<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>').replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[Number(i)])}</code>`);
}

function table(lines) {
  const cells = (l) => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
  const head = cells(lines[0]);
  const rows = lines.slice(2).map(cells);
  return `<table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
}

export function renderMarkdown(src) {
  const lines = String(src).replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  let para = [];
  const flush = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    para = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    const fence = /^\s*(```|~~~)\s*([\w#+.-]*)\s*$/.exec(line);
    if (fence) {
      flush();
      const lang = fence[2];
      const body = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++; // closing fence (or end of a still-streaming reply)
      out.push(
        `<div class="codeblock"><div class="code-head"><span>${esc(lang || 'code')}</span><button class="code-copy" type="button">Copy</button></div><pre><code>${esc(body.join('\n'))}</code></pre></div>`,
      );
      continue;
    }
    if (/^\s*$/.test(line)) { flush(); i++; continue; }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const level = Math.min(heading[1].length + 1, 4);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }
    if (/^\s*([-*_])\s*\1\s*\1[\s\1]*$/.test(line)) { flush(); out.push('<hr>'); i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] || '')) {
      flush();
      const block = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) block.push(lines[i++]);
      out.push(table(block));
      continue;
    }
    if (/^\s*>/.test(line)) {
      flush();
      const block = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) block.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${renderMarkdown(block.join('\n'))}</blockquote>`);
      continue;
    }
    const listMatch = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (listMatch) {
      flush();
      const ordered = /\d/.test(listMatch[2]);
      const items = [];
      while (i < lines.length) {
        const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (m && /\d/.test(m[2]) === ordered) { items.push(m[3]); i++; continue; }
        if (items.length && /^\s{2,}\S/.test(lines[i])) { items[items.length - 1] += ' ' + lines[i].trim(); i++; continue; }
        break;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it.replace(/^\[( |x)\]\s*/i, (m, x) => (x.trim() ? '☑ ' : '☐ ')))}</li>`).join('')}</${tag}>`);
      continue;
    }
    para.push(line);
    i++;
  }
  flush();
  return out.join('');
}

// Plain text suitable for text-to-speech: no code, no markup.
export function toSpeakable(src) {
  let s = String(src);
  s = s.replace(/```[\s\S]*?(```|$)/g, ' I have put the code on screen. ');
  s = s.replace(/`([^`]+)`/g, '$1');
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  s = s.replace(/https?:\/\/\S+/g, 'a link');
  s = s.replace(/^\s*\|.*\|\s*$/gm, '');
  s = s.replace(/^#{1,6}\s+/gm, '').replace(/^\s*>\s?/gm, '').replace(/^\s*[-*+]\s+/gm, '').replace(/^\s*(\d+)[.)]\s+/gm, '$1. ');
  s = s.replace(/(\*\*|__|~~)(.*?)\1/g, '$2').replace(/(^|\W)[*_]([^*_\n]+)[*_](?=\W|$)/g, '$1$2');
  s = s.replace(/[#*_~`|]/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

// Splits streaming text into sentences to speak as soon as each is complete,
// skipping anything inside code fences.
export function createSentenceSplitter(onSentence) {
  let buffer = '';
  let inCode = false;
  let pendingCodeNotice = false;
  const push = (text) => {
    const t = toSpeakable(text);
    if (t) onSentence(t);
  };
  return {
    add(delta) {
      buffer += delta;
      for (;;) {
        if (inCode) {
          const end = buffer.indexOf('```');
          if (end < 0) return;
          buffer = buffer.slice(end + 3).replace(/^[^\n]*\n?/, '');
          inCode = false;
          continue;
        }
        const fence = buffer.indexOf('```');
        const sentenceEnd = /([.!?…:;])(\s|$)|\n\n/.exec(buffer.slice(0, fence >= 0 ? fence : undefined));
        if (sentenceEnd && sentenceEnd.index + sentenceEnd[0].length < buffer.length) {
          const cut = sentenceEnd.index + sentenceEnd[0].length;
          push(buffer.slice(0, cut));
          buffer = buffer.slice(cut);
          continue;
        }
        if (fence >= 0) {
          push(buffer.slice(0, fence));
          if (!pendingCodeNotice) { onSentence('I have put the code on screen.'); pendingCodeNotice = true; }
          buffer = buffer.slice(fence + 3);
          inCode = true;
          continue;
        }
        return;
      }
    },
    flush() {
      if (!inCode) push(buffer);
      buffer = '';
      inCode = false;
      pendingCodeNotice = false;
    },
  };
}
