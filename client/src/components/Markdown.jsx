import React from 'react';

// Tiny markdown renderer that builds React elements only (text is escaped by React,
// no HTML is ever interpreted). Supports headings, paragraphs, lists, fenced code,
// inline code and bold/italic.
const inline = (text, keyBase) => {
  const out = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith('`')) out.push(<code key={key} className="bg-sand rounded px-1 text-[0.9em]">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith('**')) out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    else out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
};

const Markdown = ({ text = '' }) => {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const code = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i += 1;
      blocks.push(<pre key={k++} className="bg-sand border border-line rounded-2xl p-4 text-sm overflow-x-auto whitespace-pre">{code.join('\n')}</pre>);
    } else if (/^#{1,4}\s/.test(line)) {
      const level = line.match(/^#+/)[0].length;
      const cls = level <= 2 ? 'font-display text-lg font-semibold text-ink mt-3' : 'font-semibold text-ink mt-2';
      blocks.push(<div key={k++} role="heading" aria-level={level + 1} className={cls}>{inline(line.replace(/^#+\s/, ''), `h${k}`)}</div>);
      i += 1;
    } else if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ''));
      blocks.push(<ul key={k++} className="list-disc pl-6">{items.map((t, j) => <li key={j}>{inline(t, `u${k}${j}`)}</li>)}</ul>);
    } else if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s+/, ''));
      blocks.push(<ol key={k++} className="list-decimal pl-6">{items.map((t, j) => <li key={j}>{inline(t, `o${k}${j}`)}</li>)}</ol>);
    } else if (line.trim() === '') {
      i += 1;
    } else {
      const para = [];
      while (i < lines.length && lines[i].trim() !== '' && !/^(```|#{1,4}\s|\s*[-*]\s+|\s*\d+\.\s+)/.test(lines[i])) para.push(lines[i++]);
      blocks.push(<p key={k++} className="whitespace-pre-wrap">{inline(para.join('\n'), `p${k}`)}</p>);
    }
  }
  return <div className="space-y-2 text-sm text-ink-2 break-words">{blocks}</div>;
};

export default Markdown;
