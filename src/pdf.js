import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { config } from './config.js';
import { reportTicket } from './parsers.js';

// Coordinates are measured from the supplied 938 x 1217 reference. The reference
// has the proportions of US Letter (612 x 792), so the PDF uses Letter rather
// than A4. Keeping these values in one place prevents table drift.
const layout = {
  page: { width: 612, height: 792 },
  table: { left: 64, right: 538, top: 115 },
  columns: { label: 130.5, split: 231, detail: 315.8 },
  rows: { date: 19.5, ticket: 58, requestor: 56.6, contact: 39.1, location: 19.5, application: 19.5, change: 77.5, pic: 19.5, description: 38.5, result: 137.5, warning: 77 }
};

const font = 'Helvetica';
const bold = 'Helvetica-Bold';
const pad = 6.5;
const textSize = 10.5;
const checkboxSize = 6;

function display(value) {
  return value === undefined || value === null || value === '-' ? '' : String(value);
}

function ticketKind(number, detail) {
  const value = String(detail?.tipe_task || number || '').toLowerCase();
  if (value.includes('incident') || value.startsWith('inc')) return 'Incident';
  if (value.includes('request') || value.startsWith('req')) return 'Request';
  return 'Change';
}

function check(doc, x, y, selected) {
  doc.save().lineWidth(0.65).rect(x, y, checkboxSize, checkboxSize).stroke();
  if (selected) {
    doc.lineWidth(1).moveTo(x + 1, y + 3).lineTo(x + 2.5, y + 5).lineTo(x + 5.5, y + 0.8).stroke();
  }
  doc.restore();
}

function text(doc, value, x, y, width, height, options = {}) {
  doc.font(options.bold ? bold : font).fontSize(options.size || textSize).fillColor('#000000');
  doc.text(options.keepDash && (value === undefined || value === null || value === '') ? '-' : options.keepDash && value === '-' ? '-' : display(value), x, y, { width, height, lineGap: options.lineGap || 0, continued: false });
}

function line(doc, x1, y1, x2, y2) {
  doc.save().lineWidth(0.8).strokeColor('#000000').moveTo(x1, y1).lineTo(x2, y2).stroke().restore();
}

function cell(doc, x, y, width, height, value, options = {}) {
  text(doc, value, x + pad, y + (options.top || 3), width - pad * 2, height - 4, options);
}

function drawHeader(doc, period, pageNumber, logoPath) {
  // The reference has no title block: only the Pelindo mark and the report
  // sequence/date line above the table.
  doc.image(logoPath, 377, 20, { fit: [136, 34], align: 'center', valign: 'center' });
  doc.font(bold).fontSize(10.5).fillColor('#000000');
  doc.text(`${pageNumber}.1`, 80, 91, { width: 30, lineBreak: false });
  doc.text(period || '-', 111, 91, { width: 180, lineBreak: false });
}

function drawTicketType(doc, data, x, y, width, height, number, detail) {
  const selected = ticketKind(number, detail);
  const change = display(data.change);
  const changeValue = change && change !== number && change !== '-' ? `${change}-${number}` : number;
  const entries = [
    ['Incident', selected === 'Incident', '................'],
    ['Request', selected === 'Request', '................'],
    ['Change', selected === 'Change', ` ${changeValue}`]
  ];
  entries.forEach(([label, isSelected, suffix], index) => {
    const rowY = y + 5 + index * 20;
    check(doc, x + pad, rowY + 1, isSelected);
    text(doc, `${label}${suffix}`, x + pad + checkboxSize + 3, rowY, width - pad * 2 - checkboxSize - 3, 16);
  });
}

function drawChange(doc, data, x0, x1, x2, x3, y, height) {
  check(doc, x1 + pad, y + 6, true);
  text(doc, 'Application', x1 + pad + checkboxSize + 3, y + 3, x2 - x1 - pad * 2 - checkboxSize - 3, 18);
  check(doc, x1 + pad, y + 45, false);
  text(doc, 'Database', x1 + pad + checkboxSize + 3, y + 42, x2 - x1 - pad * 2 - checkboxSize - 3, 18);
  const detailRows = [['IP Address Server', data.ip_address_server], ['Version', data.version], ['Directory', data.directory]];
  detailRows.forEach(([label, value], index) => {
    const rowY = y + index * (height / 3);
    if (index) line(doc, x2, rowY, x3, rowY);
    text(doc, label, x2 + pad, rowY + 3, x3 - x2 - pad * 2, height / 3 - 4);
    text(doc, value, x3 + pad, rowY + 3, layout.table.right - x3 - pad * 2, height / 3 - 4, { keepDash: true });
  });
}

function drawResult(doc, data, x0, x1, x2, x3, y, height, evidencePath) {
  const result = ['Success', 'Warning', 'Error', 'Other'];
  result.forEach((name, index) => {
    const rowY = y + 7 + index * 20;
    check(doc, x1 + pad, rowY + 1, String(data.result).toLowerCase() === name.toLowerCase());
    text(doc, name, x1 + pad + checkboxSize + 3, rowY, x2 - x1 - pad * 2 - checkboxSize - 3, 16);
  });
  if (evidencePath) {
    if (!fs.existsSync(evidencePath)) throw new Error(`Bukti perubahan tidak ditemukan: ${evidencePath}`);
    doc.image(evidencePath, x2 + 2, y + 2, { fit: [x3 - x2 - 4, height - 4], align: 'center', valign: 'center' });
  }
}

function drawTable(doc, data, ticket, evidencePath) {
  const x0 = layout.table.left;
  const x4 = layout.table.right;
  const x1 = layout.columns.label;
  const x2 = layout.columns.split;
  const x3 = layout.columns.detail;
  const widths = { full: x4 - x0, label: x1 - x0, value: x4 - x1 };
  const rowHeights = { ...layout.rows };
  const descriptionHeight = doc.heightOfString(display(data.description), { width: widths.value - pad * 2, font, fontSize: textSize, lineGap: 0 });
  rowHeights.description = Math.max(rowHeights.description, descriptionHeight + 8);
  const total = Object.values(rowHeights).reduce((sum, value) => sum + value, 0);
  if (layout.table.top + total > 775) throw new Error(`Isi tiket ${ticket.nomor_tiket} terlalu panjang untuk satu halaman laporan`);

  const y = {};
  let cursor = layout.table.top;
  for (const [name, height] of Object.entries(rowHeights)) { y[name] = cursor; cursor += height; }

  // Outer border and horizontal row boundaries.
  line(doc, x0, layout.table.top, x4, layout.table.top);
  line(doc, x0, cursor, x4, cursor);
  Object.values(y).slice(1).forEach((rowY) => line(doc, x0, rowY, x4, rowY));
  [x0, x1].forEach((x) => line(doc, x, layout.table.top, x, cursor));
  line(doc, x4, layout.table.top, x4, cursor);

  cell(doc, x0, y.date, widths.label, rowHeights.date, 'Date');
  cell(doc, x1, y.date, widths.value, rowHeights.date, data.date);

  cell(doc, x0, y.ticket, widths.label, rowHeights.ticket, 'Ticket\nNumber');
  drawTicketType(doc, data, x1, y.ticket, widths.value, rowHeights.ticket, ticket.nomor_tiket, ticket.detail_tiket);

  // Four-area Requestor and Contact rows.
  line(doc, x2, y.requestor, x2, y.requestor + rowHeights.requestor);
  line(doc, x3, y.requestor, x3, y.requestor + rowHeights.requestor);
  cell(doc, x0, y.requestor, x1 - x0, rowHeights.requestor, 'Requestor');
  cell(doc, x1, y.requestor, x2 - x1, rowHeights.requestor, data.requestor);
  cell(doc, x2, y.requestor, x3 - x2, rowHeights.requestor, 'NIPP/NRK');
  cell(doc, x3, y.requestor, x4 - x3, rowHeights.requestor, data.nipp_nrk);
  line(doc, x2, y.contact, x2, y.contact + rowHeights.contact);
  line(doc, x3, y.contact, x3, y.contact + rowHeights.contact);
  cell(doc, x0, y.contact, x1 - x0, rowHeights.contact, 'Contact');
  cell(doc, x1, y.contact, x2 - x1, rowHeights.contact, data.contact);
  cell(doc, x2, y.contact, x3 - x2, rowHeights.contact, 'Email :');
  cell(doc, x3, y.contact, x4 - x3, rowHeights.contact, data.email);

  cell(doc, x0, y.location, widths.label, rowHeights.location, 'Location');
  cell(doc, x1, y.location, widths.value, rowHeights.location, data.location);
  cell(doc, x0, y.application, widths.label, rowHeights.application, 'Aplication');
  cell(doc, x1, y.application, widths.value, rowHeights.application, data.application);

  line(doc, x2, y.change, x2, y.change + rowHeights.change);
  line(doc, x3, y.change, x3, y.change + rowHeights.change);
  [y.change + rowHeights.change / 3, y.change + (rowHeights.change * 2) / 3].forEach((rowY) => line(doc, x2, rowY, x4, rowY));
  cell(doc, x0, y.change, widths.label, rowHeights.change, 'Change');
  drawChange(doc, data, x0, x1, x2, x3, y.change, rowHeights.change);

  cell(doc, x0, y.pic, widths.label, rowHeights.pic, 'PIC');
  cell(doc, x1, y.pic, widths.value, rowHeights.pic, data.pic);
  cell(doc, x0, y.description, widths.label, rowHeights.description, 'Description');
  cell(doc, x1, y.description, widths.value, rowHeights.description, data.description);

  line(doc, x2, y.result, x2, y.result + rowHeights.result);
  cell(doc, x0, y.result, widths.label, rowHeights.result, 'Result');
  drawResult(doc, data, x0, x1, x2, x4, y.result, rowHeights.result, evidencePath);

  line(doc, x1, y.warning, x1, y.warning + rowHeights.warning);
  const warningMid = y.warning + rowHeights.warning / 2;
  line(doc, x1, warningMid, x4, warningMid);
  cell(doc, x0, y.warning, widths.label, rowHeights.warning, 'If warning\n/ Error');
  text(doc, 'Cause', x1 + pad, y.warning + 3, 48, 16);
  text(doc, display(data.cause), x1 + 51, y.warning + 3, x4 - x1 - 57, warningMid - y.warning - 5);
  text(doc, 'Action Plan', x1 + pad, warningMid + 3, 65, 16);
  text(doc, display(data.action_plan), x1 + 68, warningMid + 3, x4 - x1 - 74, cursor - warningMid - 5);
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
    if (!selected.length) {
      drawHeader(doc, period, 1, logoPath);
      text(doc, 'Tidak ada tiket untuk dilaporkan.', 64, 145, 474, 20);
    }
    selected.forEach((ticket, index) => {
      if (index) doc.addPage([layout.page.width, layout.page.height], { margin: 0 });
      drawHeader(doc, period, index + 1, logoPath);
      const data = reportTicket(ticket, options.overrides?.[ticket.nomor_tiket]);
      drawTable(doc, data, ticket, options.screenshots?.[ticket.nomor_tiket]);
    });
    doc.end();
  });
}
