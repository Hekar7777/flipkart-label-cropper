'use strict';
/* Generates synthetic "combined Flipkart" style PDFs for testing index.html.
   No dependencies: hand-rolled PDF writer (A4, Helvetica + Helvetica-Bold).
   Run: node dev-test/make-fixtures.js  -> dev-test/fixtures/*.pdf */
const fs = require('fs');
const path = require('path');

const A4 = { w: 595.276, h: 841.89 };

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const text = (x, y, size, str, font) =>
  `BT /${font || 'F1'} ${size} Tf ${x} ${y} Td (${esc(str)}) Tj ET\n`;
const rect = (x, y, w, h, gray) => `${gray === undefined ? 0 : gray} g ${x} ${y} ${w} ${h} re f\n`;
const hline = (x1, y, x2, w) => `${w || 0.7} w 0 G ${x1} ${y} m ${x2} ${y} l S\n`;
const bars = (x, y, h, widths) => {
  let out = `0 g\n`, cx = x;
  widths.forEach((wd, i) => {
    if (i % 2 === 0) out += `${cx} ${y} ${wd} ${h} re f\n`;
    cx += wd;
  });
  return out;
};
const pseudoRandomBars = (seed, count, maxw) => {
  let s = seed, out = [];
  for (let i = 0; i < count; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; out.push(1 + (s % maxw)); }
  return out;
};

/* ------------------------------------------------------------------ pages */

function page1() {
  let c = '';
  // ---- SHIPPING LABEL (top section)
  c += text(60, 800, 9, 'FLIPKART  |  Ekart Logistics  |  Surface');
  c += bars(60, 756, 34, pseudoRandomBars(7, 90, 4));
  c += text(60, 742, 7, 'AWB 1234567890123456');
  c += text(60, 728, 6.5, '1234567890123456789012');
  // light shading block (counts as ink, but is not dark)
  c += rect(40, 640, 515, 70, '0.92');
  c += text(60, 690, 10, 'SHIP TO: Test Customer', 'F2');
  c += text(60, 672, 8.5, 'Flat 402, Sample Residency, 4th Cross');
  c += text(60, 658, 8.5, 'Bengaluru, Karnataka - 560001');
  c += text(60, 646, 8, 'Phone: 9876543210');
  c += rect(480, 646, 60, 60, 0);                       // QR-like block
  c += rect(25, 620, 2, 2, 0);                          // left-most ink
  c += rect(568, 620, 2, 2, 0);                         // right-most ink
  c += text(60, 604, 7, 'Not for resale. Flipkart Internet Pvt. Ltd. - SKU table below');
  c += hline(40, 596, 555, 0.9);

  // ---- TAX INVOICE (bottom section)
  c += text(50, 470, 12, 'Tax Invoice', 'F2');
  c += text(50, 448, 9, 'GSTIN: 29ABCDE1234F1Z5     Invoice No: FKT/2026/000123');
  c += text(50, 434, 9, 'Billing Address: Same as shipping address');
  c += hline(45, 400, 550);
  c += text(50, 384, 8.5, 'SKU | HSN | Qty | Taxable Value | Tax');
  c += hline(45, 374, 550);
  c += text(50, 358, 8.5, 'SKU-0001 | 6109 | 1 | 1,045.76 | 188.24');
  c += hline(45, 348, 550);
  c += text(50, 330, 10, 'Total: Rs 1,234.00', 'F2');
  c += text(50, 60, 8, 'Seller: Flipkart Internet Pvt Ltd, Bengaluru');
  c += text(50, 45, 7, 'This is a computer generated invoice.');
  return c;
}

function page2() {
  // ink touching all four page edges -> exercises margin clamping
  let c = '';
  c += rect(0, 700, A4.w, 80, '0.88');                              // full-bleed band, label
  c += rect(0, 838, A4.w, 4, 0);                                    // ink at the very top
  c += rect(0, 0, A4.w, 6, 0);                                      // ink at the very bottom
  c += rect(0, 300, 4, 300, 0);                                     // ink at the very left
  c += rect(A4.w - 4, 300, 4, 300, 0);                              // ink at the very right
  c += text(30, 745, 11, 'SHIP TO: Edge Clamp Test', 'F2');
  c += text(30, 726, 9, 'AWB 9999000011112222   |   Prepaid');
  c += bars(30, 640, 30, pseudoRandomBars(11, 70, 3));
  c += text(30, 610, 8, 'Not for resale. Flipkart Internet Pvt. Ltd.');

  c += text(40, 450, 12, 'Tax Invoice', 'F2');
  c += text(40, 430, 9, 'GSTIN: 29ABCDE1234F1Z5');
  c += text(40, 414, 9, 'Invoice No: FKT/2026/000456');
  c += hline(35, 380, 560);
  c += text(40, 364, 9, 'Total: Rs 499.00', 'F2');
  c += text(40, 40, 7, 'Computer generated invoice.');
  return c;
}

function page3() {
  // no "Tax Invoice" text anywhere -> exercises the fallback split (58% from top)
  let c = '';
  c += text(60, 790, 10, 'FLIPKART  |  Ekart  |  AWB 555000111222', 'F2');
  c += bars(60, 740, 34, pseudoRandomBars(3, 80, 4));
  c += text(60, 715, 9, 'SHIP TO: Fallback Split Test');
  c += text(60, 700, 9, 'Some address, Pune - 411001');
  c += rect(480, 690, 55, 55, 0);
  c += text(60, 660, 7.5, 'Not for resale. Flipkart Internet Pvt. Ltd.');
  c += hline(40, 645, 555, 0.9);

  c += text(50, 300, 12, 'INVOICE (ORIGINAL FOR RECIPIENT)', 'F2');
  c += text(50, 278, 9, 'GSTIN: 29ABCDE1234F1Z5     Invoice No: FKT/2026/000789');
  c += hline(45, 250, 550);
  c += text(50, 234, 9, 'Total: Rs 2,499.00', 'F2');
  c += text(50, 55, 7.5, 'Seller: Flipkart Internet Pvt Ltd.');
  return c;
}

function pageRunSplitA() {
  // "Tax Invoice" emitted as two separate text runs (separate BT/ET blocks)
  let c = '';
  c += text(60, 800, 9, 'FLIPKART  |  run-split heading test');
  c += text(60, 700, 10, 'SHIP TO: Run Split Test');
  c += text(60, 660, 7.5, 'Not for resale. Flipkart Internet Pvt. Ltd.');
  c += 'BT /F2 12 Tf 50 470 Td (Tax) Tj ET\n';
  c += 'BT /F2 12 Tf 74 470 Td (Invoice) Tj ET\n';
  c += text(50, 440, 9, 'GSTIN: 29ABCDE1234F1Z5     Invoice No: FKT/2026/000900');
  c += text(50, 60, 7.5, 'Seller: Flipkart Internet Pvt Ltd.');
  return c;
}

function pageRunSplitB() {
  // "Tax Inv" + "oice" - the phrase is broken mid-word
  let c = '';
  c += text(60, 800, 9, 'FLIPKART  |  mid-word split test');
  c += text(60, 700, 10, 'SHIP TO: Mid Word Test');
  c += text(60, 660, 7.5, 'Not for resale. Flipkart Internet Pvt. Ltd.');
  c += 'BT /F2 12 Tf 50 470 Td (Tax Inv) Tj ET\n';
  c += 'BT /F2 12 Tf 91 470 Td (oice) Tj ET\n';
  c += text(50, 440, 9, 'GSTIN: 29ABCDE1234F1Z5     Invoice No: FKT/2026/000901');
  c += text(50, 60, 7.5, 'Seller: Flipkart Internet Pvt Ltd.');
  return c;
}

function pageFaintFrame() {
  // A faint (0.9 gray ≈ 229) frame touching all four page edges plus a 0.97
  // wash over the whole page. Under a naive "any pixel < 250" scan this frame
  // defines the crop and the output fills up with blank space; the two-level
  // detection must ignore it because it is far from the dark content.
  let c = '';
  c += rect(0, 0, A4.w, A4.h, '0.97');          // full-page wash
  c += rect(0, 0, A4.w, 3, '0.9');              // frame
  c += rect(0, A4.h - 3, A4.w, 3, '0.9');
  c += rect(0, 0, 3, A4.h, '0.9');
  c += rect(A4.w - 3, 0, 3, A4.h, '0.9');

  c += text(60, 790, 10, 'FLIPKART  |  Faint Frame Test', 'F2');
  c += text(60, 740, 9, 'AWB 7770001112223333');
  c += bars(60, 690, 34, pseudoRandomBars(5, 80, 4));
  c += text(60, 668, 9, 'SHIP TO: Faint Frame Customer, Mumbai 400001');
  c += text(60, 610, 7.5, 'Not for resale. Flipkart Internet Pvt. Ltd.');

  c += text(50, 460, 12, 'Tax Invoice', 'F2');
  c += text(50, 438, 9, 'GSTIN: 29ABCDE1234F1Z5     Invoice No: FKT/2026/000777');
  c += hline(45, 410, 550);
  c += text(50, 394, 9, 'Total: Rs 899.00', 'F2');
  c += text(50, 60, 7.5, 'Seller: Flipkart Internet Pvt Ltd.');
  return c;
}

function pageRealistic() {
  // Emulates the real Flipkart combined sheet as seen in the field:
  //  * the label is a bordered box sitting in the middle of the width
  //  * pale pink vertical bands hug the label box on both sides
  //  * a dashed "cut here" line runs across the page between the sections
  // None of that decoration should reach the crop.
  const bx = 152.6, by = 370, bw = 290, bh = 430;
  let c = '';

  // ---- decoration (must be ignored)
  c += '0.94 0.80 0.82 rg\n';
  c += `${bx - 22} ${by} 20 ${bh} re f\n`;          // pink band 2pt from the box
  c += `${bx + bw + 2} ${by} 20 ${bh} re f\n`;      // pink band on the right
  c += '0 g\n';
  for (let x = 40; x < 555; x += 20) c += `${x} 350 12 1.6 re f\n`;   // dashed cut line (20pt below the box)

  // ---- shipping label (bordered box, like a 4x6" thermal label)
  c += `0.9 w\n${bx} ${by} ${bw} ${bh} re S\n`;
  c += `${bx} ${by + bh - 40} ${bw} 0.1 re f\n`;
  c += `${bx + 80} ${by + bh - 40} 0.1 ${40} re f\n`;
  c += text(bx + 8, by + bh - 26, 9, 'STD   E-Kart Logistics   FRAGILE');
  c += text(bx + 8, by + bh - 54, 8, 'OD438660020868551100   PREPAID');
  c += text(bx + 8, by + bh - 70, 7, 'Ordered through');
  c += text(bx + 8, by + bh - 86, 9, 'Flipkart', 'F2');
  c += bars(bx + 22, by + 210, 140, pseudoRandomBars(9, 70, 3));        // vertical barcode
  c += text(bx + 52, by + 190, 7, 'AWB No. FMPP4288503525');
  c += rect(bx + 110, by + 250, 170, 140, 0);                           // QR block
  c += text(bx + 110, by + 168, 7.5, 'Shipping/Customer address:', 'F2');
  c += text(bx + 110, by + 154, 7, 'Name: Selesh Patni');
  c += text(bx + 110, by + 140, 7, '2764, shubh laxmi nagar, Gujarat');
  c += text(bx + 110, by + 126, 7, 'Vivekanand Nagar, Chandkheda,');
  c += text(bx + 110, by + 112, 7, 'Ahmedabad - 382424, IN-GJ');
  c += text(bx + 8, by + 96, 7, 'Sold By NAMO ENTERPRISES, Rohini sector 21, Delhi');
  c += text(bx + 8, by + 72, 7, 'GSTIN: 07DDHPI1682J1ZB');
  c += text(bx + 8, by + 52, 7.5, 'SKU ID | Description            QTY', 'F2');
  c += text(bx + 8, by + 38, 7, 'Halwa72ss | Steel Vegetable Bowl  1');
  c += text(bx + 8, by + 20, 7, 'FMPP4288503525');
  c += bars(bx + 8, by + 50, 14, pseudoRandomBars(4, 60, 3));
  c += text(bx + 240, by + 62, 11, 'B3', 'F2');
  c += text(bx + 8, by + 8, 7, 'Not for resale.     Printed at 2114 hrs, 20/09/26');

  // ---- tax invoice section
  c += text(50, 300, 12, 'Tax Invoice', 'F2');
  c += text(50, 280, 9, 'GSTIN: 29ABCDE1234F1Z5     Invoice No: FKT/2026/000123');
  c += hline(45, 250, 550);
  c += text(50, 234, 9, 'Halwa72ss | 7323 | 1 | 999.00');
  c += text(50, 60, 7.5, 'Seller: Flipkart Internet Pvt Ltd.');
  return c;
}

function pagePerforation(gapPt, ruleAbove) {
  // The real-world killer: the label is a bordered box in the middle of the
  // sheet, and the full-width dashed perforation line sits IMMEDIATELY below
  // it (1pt). Any crop built from "all surviving components" therefore spans
  // the perforation line's width = nearly the whole page -> blank white paper.
  const bx = 152.6, by = 370, bw = 290, bh = 430;
  let c = '';
  c += '0.94 0.80 0.82 rg\n';
  c += `${bx - 10} ${by} 8 ${bh} re f\n`;
  c += `${bx + bw + 2} ${by} 8 ${bh} re f\n`;
  c += '0 g\n';
  for (let x = 40; x < 520; x += 12) c += `${x} ${by - gapPt} 7 1.6 re f\n`;   // dashed cut line
  for (let x = 520; x < 555; x += 6) c += `${x} ${by - gapPt} 3 1.6 re f\n`;
  if (ruleAbove) c += `40 ${by + bh + gapPt} 515 1.6 re f\n`;                 // solid rule above

  c += `0.9 w\n${bx} ${by} ${bw} ${bh} re S\n`;
  c += text(bx + 8, by + bh - 26, 9, 'STD   E-Kart Logistics   FRAGILE');
  c += text(bx + 8, by + bh - 54, 8, 'OD438660020868551100   PREPAID');
  c += text(bx + 8, by + bh - 74, 9, 'Flipkart', 'F2');
  c += bars(bx + 22, by + 210, 140, pseudoRandomBars(9, 70, 3));
  c += rect(bx + 110, by + 250, 170, 140, 0);
  c += text(bx + 110, by + 168, 7.5, 'Shipping/Customer address:', 'F2');
  c += text(bx + 110, by + 154, 7, 'Name: Selesh Patni');
  c += text(bx + 110, by + 140, 7, '2764, shubh laxmi nagar, Gujarat');
  c += text(bx + 8, by + 96, 7, 'Sold By NAMO ENTERPRISES, Rohini sector 21');
  c += text(bx + 8, by + 72, 7, 'GSTIN: 07DDHPI1682J1ZB');
  c += text(bx + 8, by + 52, 7.5, 'SKU ID | Description      QTY', 'F2');
  c += text(bx + 8, by + 38, 7, 'Halwa72ss | Steel Bowl  1');
  c += bars(bx + 8, by + 50, 14, pseudoRandomBars(4, 60, 3));
  c += text(bx + 8, by + 14, 7, 'Not for resale.  Printed at 2114 hrs');

  c += text(50, 300, 12, 'Tax Invoice', 'F2');
  c += text(50, 280, 9, 'GSTIN: 29ABCDE1234F1Z5     Invoice No: FKT/2026/000321');
  c += hline(45, 250, 550);
  c += text(50, 234, 9, 'Halwa72ss | 7323 | 1 | 999.00');
  c += text(50, 60, 7.5, 'Seller: Flipkart Internet Pvt Ltd.');
  return c;
}

/* --------------------------------------------------------------- PDF writer */

function buildPdf(pageStreams) {
  const n = pageStreams.length;
  const fontF1 = 3 + 2 * n;     // object numbering: 1 catalog, 2 pages, then page/content pairs
  const fontF2 = fontF1 + 1;
  const objects = [];
  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  const kids = [];
  pageStreams.forEach((stream, i) => {
    const pageNum = 3 + 2 * i;
    kids.push(pageNum + ' 0 R');
    objects[pageNum - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] ` +
      `/Resources << /Font << /F1 ${fontF1} 0 R /F2 ${fontF2} 0 R >> >> /Contents ${pageNum + 1} 0 R >>`;
    objects[pageNum] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`;
  });
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${n} >>`;
  objects[fontF1 - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[fontF2 - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [];
  objects.forEach((body, idx) => {
    offsets[idx] = Buffer.byteLength(out, 'latin1');
    out += `${idx + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => { out += String(o).padStart(10, '0') + ' 00000 n \n'; });
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/* ------------------------------------------------------------------ output */

const dir = path.join(__dirname, 'fixtures');
fs.mkdirSync(dir, { recursive: true });

const single = buildPdf([page1()]);
fs.writeFileSync(path.join(dir, 'combined-order-A.pdf'), single);

const multi = buildPdf([page1(), page2(), page3()]);
fs.writeFileSync(path.join(dir, 'combined-order-B-multipage.pdf'), multi);

const runsplit = buildPdf([pageRunSplitA(), pageRunSplitB()]);
fs.writeFileSync(path.join(dir, 'combined-order-C-runsplit.pdf'), runsplit);

fs.writeFileSync(path.join(dir, 'combined-order-D-faintframe.pdf'), buildPdf([pageFaintFrame()]));

fs.writeFileSync(path.join(dir, 'combined-order-E-realistic.pdf'), buildPdf([pageRealistic()]));

fs.writeFileSync(path.join(dir, 'combined-order-F-perforation.pdf'), buildPdf([pagePerforation(1, false)]));

fs.writeFileSync(path.join(dir, 'combined-order-G-perforation-2.pdf'), buildPdf([pagePerforation(3, true)]));

fs.writeFileSync(path.join(dir, 'corrupted.pdf'), Buffer.from(
  '%PDF-1.4\nthis file is intentionally broken and has no valid xref\n%%EOF\n', 'latin1'));

fs.writeFileSync(path.join(dir, 'not-a-pdf.pdf'), Buffer.from(
  'Just some text pretending to be a PDF document.\n', 'latin1'));

console.log('fixtures written to', dir);
fs.readdirSync(dir).forEach((f) => console.log(' -', f, fs.statSync(path.join(dir, f)).size + ' bytes'));
