import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { config } from './config.js';
import { reportTicket } from './parsers.js';

// Measurements taken from page 2 of the reference PDF. Border coordinates are
// the centres of the 1 pt table strokes, which is how the Word/LibreOffice
// export draws its table.
const layout = {
  page: { width: 612, height: 792 },
  table: { left: 89.375, right: 524.375, top: 72.375, topWithHeading: 108.375 },
  columns: { label: 150.375, split: 242.375, detail: 320.375 },
  rows: { date: 18, ticket: 54, requestor: 52, contact: 36, location: 18, application: 18, pic: 18, description: 35, result: 127, notice: 35 },
  text: { left: 95.85, value: 156.6, split: 248.1, detail: 326.8, pad: 5.25, size: 10, line: 13.2, labelLine: 17.25 },
  logo: { x: 375.6, y: 22.7, width: 125.25, height: 27.75 },
  footer: {
    block: { x: 62.85, y: 759.3, width: 47.25, height: 26.25 },
    rule: { from: 119.85, to: 521.85, y: 760 },
    label: { right: 491.5, baseline: 767, size: 10, color: '#808080' },
    number: { right: 100.25, baseline: 778.4, size: 13 }
  }
};

const font = 'Helvetica';
const bold = 'Helvetica-Bold';
const checkbox = { size: 8.4, gap: 4.1, left: 0.817, top: 7.258, width: 8.416, height: 7.291, stroke: 0.3, tick: 0.95, tickTop: 1.35 };
const borderWidth = 1;
// Word/LibreOffice centres its 1 pt table strokes 0.125 pt below and right of
// the measured cell boundaries once the page is rasterised.
const borderOffset = 0.125;

function display(value) {
  return value === undefined || value === null || value === '-' ? '' : String(value);
}

function ticketKind(number, detail) {
  const value = String(detail?.tipe_task || number || '').toLowerCase();
  if (value.includes('incident') || value.startsWith('inc')) return 'Incident';
  if (value.includes('request') || value.startsWith('req')) return 'Request';
  return 'Change';
}

function line(doc, x1, y1, x2, y2, width = borderWidth, offset = 0) {
  doc.save().lineWidth(width).strokeColor('#000000').moveTo(x1 + offset, y1 + offset).lineTo(x2 + offset, y2 + offset).stroke().restore();
}

function wrap(doc, value, width, options = {}) {
  const fontName = options.bold ? bold : font;
  const size = options.size || layout.text.size;
  doc.font(fontName).fontSize(size);
  const lines = [];
  for (const paragraph of String(value ?? '').split('\n')) {
    if (!paragraph) { lines.push(''); continue; }
    let current = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (doc.widthOfString(candidate) <= width) { current = candidate; continue; }
      if (current) lines.push(current);
      current = '';
      let fragment = '';
      for (const char of word) {
        if (doc.widthOfString(fragment + char) <= width || !fragment) { fragment += char; continue; }
        lines.push(fragment);
        fragment = char;
      }
      current = fragment;
    }
    if (current) lines.push(current);
  }
  return lines.length ? lines : [''];
}

function text(doc, value, x, baseline, width, options = {}) {
  const content = options.keepDash ? (value === undefined || value === null || value === '' ? '-' : String(value)) : value;
  const lines = wrap(doc, content, width, options);
  const lineHeight = options.lineHeight || layout.text.line;
  doc.font(options.bold ? bold : font).fontSize(options.size || layout.text.size).fillColor(options.color || '#000000');
  lines.forEach((content, index) => {
    doc.text(content, x, baseline + index * lineHeight, { baseline: 'alphabetic', lineBreak: false });
  });
  return lines;
}

function check(doc, x, baseline, selected) {
  const left = x + checkbox.left;
  const top = baseline - checkbox.top;
  const inset = checkbox.stroke / 2;
  doc.save().lineWidth(checkbox.stroke).strokeColor('#000000')
    .rect(left + inset, top + inset, checkbox.width - checkbox.stroke, checkbox.height - checkbox.stroke).stroke();
  if (selected) {
    doc.lineCap('round').lineJoin('round').strokeColor('#000000');
    doc.lineWidth(checkbox.tick).moveTo(left + 0.2, top + 3.95).lineTo(left + 2.12, top + 5.95).stroke();
    doc.lineWidth(checkbox.tickTop).moveTo(left + 2.1, top + 5.95).lineTo(left + 7.7, top + 0.35).stroke();
  }
  doc.restore();
}

function drawHeader(doc, group, date, logoPath) {
  doc.image(logoPath, layout.logo.x, layout.logo.y, { width: layout.logo.width, height: layout.logo.height });
  if (!group) return;
  doc.font(bold).fontSize(layout.text.size).fillColor('#000000');
  doc.text(group, 104.1, 94.88, { baseline: 'alphabetic', lineBreak: false });
  doc.text(date || '-', 132.6, 94.88, { baseline: 'alphabetic', lineBreak: false });
}

function drawFooter(doc) {
  const { block, rule, label, number } = layout.footer;
  doc.save().rect(block.x, block.y, block.width, block.height).fill('#000000').restore();
  doc.font(font).fontSize(number.size).fillColor('#ffffff');
  const numberWidth = doc.widthOfString('1');
  doc.text('1', number.right - numberWidth, number.baseline, { baseline: 'alphabetic', lineBreak: false });
  line(doc, rule.from, rule.y, rule.to, rule.y, 1.25);
  doc.font(font).fontSize(label.size).fillColor(label.color);
  const labelWidth = doc.widthOfString('Laporan Patch Release');
  doc.text('Laporan Patch Release', label.right - labelWidth, label.baseline, { baseline: 'alphabetic', lineBreak: false });
}

function rowHeights(doc, data) {
  const valueWidth = layout.table.right - layout.text.pad - layout.text.value;
  const requestorWidth = 76;
  const ipWidth = layout.columns.detail - layout.text.pad - layout.text.split;
  const emailWidth = 185;
  const requestorLines = wrap(doc, display(data.requestor), requestorWidth).length;
  const emailLines = wrap(doc, display(data.email), emailWidth).length;
  const ipLines = wrap(doc, 'IP Address Server', ipWidth).length;
  const descriptionLines = wrap(doc, display(data.description), valueWidth).length;
  const causeLines = wrap(doc, display(data.cause), valueWidth - 51).length;
  const actionLines = wrap(doc, display(data.action_plan), valueWidth - 68).length;
  return {
    date: layout.rows.date,
    ticket: layout.rows.ticket,
    requestor: Math.max(layout.rows.requestor, Math.ceil(Math.max(1, requestorLines) * layout.text.labelLine)),
    contact: Math.max(layout.rows.location, Math.max(1, emailLines) * 18),
    location: layout.rows.location,
    application: layout.rows.application,
    change: Math.max(layout.rows.location, Math.ceil(Math.max(1, ipLines) * layout.text.labelLine)) + layout.rows.location * 2,
    pic: layout.rows.pic,
    description: Math.max(layout.rows.description, Math.ceil(descriptionLines * layout.text.line + 10.25)),
    result: layout.rows.result,
    cause: Math.max(layout.rows.notice, Math.ceil(causeLines * layout.text.line + 10.25)),
    action: Math.max(layout.rows.notice, Math.ceil(actionLines * layout.text.line + 10.25))
  };
}

function drawTicketType(doc, data, y, number, detail) {
  const selected = ticketKind(number, detail);
  const change = display(data.change);
  const changeValue = change && change !== number ? `${change}-${number}` : number;
  const entries = [
    ['Incident', selected === 'Incident', ' ………………'],
    ['Request', selected === 'Request', ' ………………'],
    ['Change', selected === 'Change', ` ${changeValue}`]
  ];
  entries.forEach(([label, isSelected, suffix], index) => {
    const baseline = y + 10.25 + index * 18;
    check(doc, layout.text.value, baseline, isSelected);
    text(doc, `${label}${suffix}`, layout.text.value + checkbox.size + checkbox.gap, baseline, 340, { lineHeight: 18 });
  });
}

function drawChange(doc, data, y, height) {
  const labelRight = layout.columns.split;
  const detailRight = layout.columns.detail;
  const valueRight = layout.table.right;
  const ipHeight = height - layout.rows.location * 2;
  const versionTop = y + ipHeight;
  const directoryTop = versionTop + layout.rows.location;
  check(doc, layout.text.value, y + 10.05, true);
  text(doc, 'Application', layout.text.value + checkbox.size + checkbox.gap, y + 10.05, labelRight - layout.text.value - 12.5);
  check(doc, layout.text.value, y + 44.4, false);
  text(doc, 'Database', layout.text.value + checkbox.size + checkbox.gap, y + 44.4, labelRight - layout.text.value - 12.5);
  text(doc, 'IP Address Server', layout.text.split, y + 10, detailRight - layout.text.split - layout.text.pad, { lineHeight: layout.text.labelLine });
  text(doc, display(data.ip_address_server), layout.text.detail, y + 10, valueRight - layout.text.detail - layout.text.pad, { keepDash: true });
  line(doc, layout.columns.split, versionTop, layout.columns.detail, versionTop, borderWidth, borderOffset);
  text(doc, 'Version', layout.text.split, versionTop + 9.5, detailRight - layout.text.split - layout.text.pad);
  text(doc, display(data.version), layout.text.detail, versionTop + 9.5, valueRight - layout.text.detail - layout.text.pad, { keepDash: true });
  line(doc, layout.columns.split, directoryTop, layout.columns.detail, directoryTop, borderWidth, borderOffset);
  text(doc, 'Directory', layout.text.split, directoryTop + 10, detailRight - layout.text.split - layout.text.pad);
  text(doc, display(data.directory), layout.text.detail, directoryTop + 10, valueRight - layout.text.detail - layout.text.pad, { keepDash: true });
}

function drawResult(doc, data, y, height, evidencePath) {
  ['Success', 'Warning', 'Error', 'Other'].forEach((name, index) => {
    const baseline = y + 10.25 + index * 18;
    check(doc, layout.text.value, baseline, String(data.result).toLowerCase() === name.toLowerCase());
    text(doc, name, layout.text.value + checkbox.size + checkbox.gap, baseline, layout.columns.split - layout.text.value - 12.5, { lineHeight: 18 });
  });
  if (evidencePath) {
    if (!fs.existsSync(evidencePath)) throw new Error(`Bukti perubahan tidak ditemukan: ${evidencePath}`);
    doc.image(evidencePath, layout.columns.split + 7.225, y + 2.54, { width: 270, height: 116.25 });
  }
}

function drawTable(doc, data, ticket, evidencePath, tableTop) {
  const x0 = layout.table.left;
  const x1 = layout.columns.label;
  const x2 = layout.columns.split;
  const x3 = layout.columns.detail;
  const x4 = layout.table.right;
  const top = tableTop;
  const heights = rowHeights(doc, data);
  const order = ['date', 'ticket', 'requestor', 'contact', 'location', 'application', 'change', 'pic', 'description', 'result', 'cause', 'action'];
  const y = {};
  let cursor = top;
  for (const name of order) { y[name] = cursor; cursor += heights[name]; }
  const bottom = cursor;
  if (bottom > 740) throw new Error(`Isi tiket ${ticket.nomor_tiket} terlalu panjang untuk satu halaman laporan`);

  doc.save().lineWidth(borderWidth).strokeColor('#000000');
  doc.rect(x0 + borderOffset, top + borderOffset, x4 - x0, bottom - top).stroke();
  for (const name of order.slice(1)) line(doc, x0, y[name], x4, y[name], borderWidth, borderOffset);
  line(doc, x1, top, x1, bottom, borderWidth, borderOffset);
  for (const name of ['requestor', 'contact', 'change']) {
    line(doc, x2, y[name], x2, y[name] + heights[name], borderWidth, borderOffset);
    line(doc, x3, y[name], x3, y[name] + heights[name], borderWidth, borderOffset);
  }
  line(doc, x2, y.result, x2, y.result + heights.result, borderWidth, borderOffset);
  doc.restore();

  const labelWidth = x1 - layout.text.pad - layout.text.left;
  const valueWidth = x4 - layout.text.pad - layout.text.value;
  const splitWidth = x2 - layout.text.pad - layout.text.value;
  const requestorWidth = 76;
  const emailWidth = 185;

  text(doc, 'Date', layout.text.left, y.date + 10.25, labelWidth);
  text(doc, display(data.date), layout.text.value, y.date + 10.25, valueWidth);

  text(doc, 'Ticket\nNumber', layout.text.left, y.ticket + (heights.ticket - 34.5) / 2 + 9.9, labelWidth, { lineHeight: layout.text.labelLine });
  drawTicketType(doc, data, y.ticket, ticket.nomor_tiket, ticket.detail_tiket);

  text(doc, 'Requestor', layout.text.left, y.requestor + (heights.requestor - layout.text.labelLine) / 2 + 9.9, labelWidth);
  text(doc, display(data.requestor), layout.text.value, y.requestor + 10.25, requestorWidth, { lineHeight: layout.text.labelLine });
  text(doc, 'NIPP/NRK', layout.text.split, y.requestor + 10.25, x3 - layout.text.split - layout.text.pad);
  text(doc, display(data.nipp_nrk), layout.text.detail, y.requestor + 10.25, valueWidth);

  text(doc, 'Contact', layout.text.left, y.contact + (heights.contact - layout.text.labelLine) / 2 + 9.9, labelWidth);
  text(doc, display(data.contact), layout.text.value, y.contact + 10.7, splitWidth);
  text(doc, 'Email :', layout.text.split, y.contact + 10.7, x3 - layout.text.split - layout.text.pad);
  text(doc, display(data.email), layout.text.detail, y.contact + 10.7, emailWidth);

  text(doc, 'Location', layout.text.left, y.location + 10.25, labelWidth);
  text(doc, display(data.location), layout.text.value, y.location + 10.25, valueWidth);
  text(doc, 'Aplication', layout.text.left, y.application + 10.25, labelWidth);
  text(doc, display(data.application), layout.text.value, y.application + 10.25, valueWidth);

  text(doc, 'Change', layout.text.left, y.change + (heights.change - layout.text.labelLine) / 2 + 9.9, labelWidth);
  drawChange(doc, data, y.change, heights.change);

  text(doc, 'PIC', layout.text.left, y.pic + 10.25, labelWidth);
  text(doc, display(data.pic), layout.text.value, y.pic + 10.25, valueWidth);
  text(doc, 'Description', layout.text.left, y.description + 10.1, labelWidth, { lineHeight: layout.text.labelLine });
  text(doc, display(data.description), layout.text.value, y.description + 10.25, valueWidth);

  text(doc, 'Result', layout.text.left, y.result + (heights.result - layout.text.labelLine) / 2 + 9.9, labelWidth);
  drawResult(doc, data, y.result, heights.result, evidencePath);

  const noticeHeight = heights.cause + heights.action;
  text(doc, 'If warning\n/ Error', layout.text.left, y.cause + (noticeHeight - 34.5) / 2 + 9.9, labelWidth, { lineHeight: layout.text.labelLine });
  text(doc, 'Cause', layout.text.value, y.cause + 10.25, x4 - layout.text.value - layout.text.pad);
  text(doc, display(data.cause), layout.text.value + 51, y.cause + 10.25, x4 - layout.text.value - layout.text.pad - 51);
  text(doc, 'Action Plan', layout.text.value, y.action + 10.25, x4 - layout.text.value - layout.text.pad);
  text(doc, display(data.action_plan), layout.text.value + 68, y.action + 10.25, x4 - layout.text.value - layout.text.pad - 68);
}

export async function generatePdf(run, outputPath, options = {}) {
  const selected = options.ticketNumbers?.length
    ? run.tickets.filter((ticket) => options.ticketNumbers.includes(ticket.nomor_tiket))
    : run.tickets;
  const logoPath = path.resolve(options.logoPath || config.logoPath);
  if (!fs.existsSync(logoPath)) throw new Error(`Logo Pelindo tidak ditemukan: ${logoPath}. Sediakan PNG/SVG lokal melalui PELINDO_LOGO_PATH.`);
  await fsPromises.mkdir(path.dirname(outputPath), { recursive: true });
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [layout.page.width, layout.page.height], margin: 0, bufferPages: true });
    const stream = fs.createWriteStream(outputPath);
    stream.on('finish', resolve); stream.on('error', reject); doc.on('error', reject); doc.pipe(stream);
    const period = options.period || run.metadata.filter_name || '-';
    let lastDate = null;
    let groupCount = 0;
    if (!selected.length) {
      drawHeader(doc, '', period, logoPath);
      drawFooter(doc);
      text(doc, 'Tidak ada tiket untuk dilaporkan.', 90.6, 145, 433, 20);
    }
    selected.forEach((ticket, index) => {
      if (index) doc.addPage([layout.page.width, layout.page.height], { margin: 0 });
      const data = reportTicket(ticket, options.overrides?.[ticket.nomor_tiket]);
      const date = display(data.date) || period;
      const firstOfGroup = date !== lastDate;
      if (firstOfGroup) { groupCount += 1; lastDate = date; }
      drawHeader(doc, firstOfGroup ? `1.${groupCount}` : '', date, logoPath);
      drawFooter(doc);
      drawTable(doc, data, ticket, options.screenshots?.[ticket.nomor_tiket], firstOfGroup ? layout.table.topWithHeading : layout.table.top);
    });
    doc.end();
  });
}
