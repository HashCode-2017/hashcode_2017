// Minimal PDF writer: one full-page JPEG per page. Page size follows each image (1 px = 0.5 pt for slides).
export function pdfFromJpegs(imgs) {
  const chunks = []; const offsets = []; let len = 0;
  const push = b => { const buf = typeof b === 'string' ? Buffer.from(b, 'latin1') : b; chunks.push(buf); len += buf.length; };
  const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n`); for (const b of body) push(b); push('\nendobj\n'); };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const n = imgs.length;
  const pageIds = imgs.map((_, i) => 3 + i * 3);
  obj(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  obj(2, [`<< /Type /Pages /Count ${n} /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] >>`]);
  imgs.forEach(({ img, width, height, scale = 0.5 }, i) => {
    const p = 3 + i * 3, im = p + 1, c = p + 2;
    const pw = Math.round(width * scale), ph = Math.round(height * scale);
    const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
    obj(p, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${c} 0 R >>`]);
    obj(im, [`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`, img, '\nendstream']);
    obj(c, [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
  });
  const xref = len; const total = 3 + n * 3;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let i = 1; i < total; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(chunks);
}
