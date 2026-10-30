import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, toSpeakable, createSentenceSplitter } from '../shared/ui/js/markdown.js';

test('HTML in replies is escaped, never executed', () => {
  const html = renderMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1)> [x](javascript:alert(1))');
  assert.doesNotMatch(html, /<script|<img|href="javascript/);
  assert.match(html, /&lt;script&gt;/);
});

test('code blocks keep their contents literally', () => {
  const html = renderMarkdown('```csharp\nif (a < b && c) { Debug.Log("**hi**"); }\n```');
  assert.match(html, /<div class="codeblock">/);
  assert.match(html, /<span>csharp<\/span>/);
  assert.match(html, /if \(a &lt; b &amp;&amp; c\)/);
  assert.doesNotMatch(html, /<strong>/);
});

test('common formatting', () => {
  const html = renderMarkdown('# Title\n\n- **one**\n- `two`\n\n1. a\n2. b\n\n> quote\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nSee https://example.com.');
  for (const s of ['<h2>Title</h2>', '<ul><li><strong>one</strong></li><li><code>two</code></li></ul>', '<ol><li>a</li><li>b</li></ol>', '<blockquote>', '<table>', '<td>2</td>', 'href="https://example.com"']) {
    assert.ok(html.includes(s), s);
  }
});

test('speech text drops code and markup', () => {
  const s = toSpeakable('## Steps\n1. Add **Rigidbody**\n```cs\nvoid Update(){}\n```\nSee [docs](https://x.y).');
  assert.doesNotMatch(s, /[#*`]|void Update|https/);
  assert.match(s, /Add Rigidbody/);
  assert.match(s, /code on screen/);
  assert.match(s, /See docs/);
});

test('sentences are spoken as soon as they complete, code is skipped', () => {
  const said = [];
  const sp = createSentenceSplitter((t) => said.push(t));
  for (const chunk of ['Hello the', 're. How are', ' you? Here:\n```js\nconst a = 1;', '\n```\nDone', ' now']) sp.add(chunk);
  assert.deepEqual(said.slice(0, 2), ['Hello there.', 'How are you?']);
  sp.flush();
  assert.ok(said.includes('I have put the code on screen.'));
  assert.equal(said.at(-1), 'Done now');
  assert.ok(!said.join(' ').includes('const a'));
});
