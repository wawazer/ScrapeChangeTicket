import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import zlib from 'node:zlib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { generatePdf } from '../../src/pdf.js';

const root = path.resolve(import.meta.dirname, '../..');

async function renderPage(filePath) {
  const data = new Uint8Array(await fs.readFile(filePath));
  const pdf = await pdfjsLib.getDocument({
    data,
    disableWorker: true,
    disableFontFace: true,
    standardFontDataUrl: pathToFileURL(path.join(root, 'node_modules/pdfjs-dist/standard_fonts/')).href
  }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1.5 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return canvas;
}

function darkCount(image, y, from = 0, to = image.width) {
  let count = 0;
  for (let x = from; x < to; x += 1) {
    const offset = (y * image.width + x) * 4;
    if (image.data[offset] < 220 && image.data[offset + 1] < 220 && image.data[offset + 2] < 220) count += 1;
  }
  return count;
}

function hasDarkLine(image, coordinate, horizontal) {
  for (let delta = -2; delta <= 2; delta += 1) {
    const count = horizontal ? darkCount(image, coordinate + delta, 90, 815) : darkCountVertical(image, coordinate + delta, 150, 1020);
    if (count > (horizontal ? 400 : 120)) return true;
  }
  return false;
}

function darkCountVertical(image, x, from, to) {
  let count = 0;
  for (let y = from; y < to; y += 1) {
    const offset = (y * image.width + x) * 4;
    if (image.data[offset] < 220 && image.data[offset + 1] < 220 && image.data[offset + 2] < 220) count += 1;
  }
  return count;
}

test('Pelindo PDF visual fixture embeds the local logo and evidence in Letter layout', async () => {
  const fixture = JSON.parse(await fs.readFile(path.join(root, 'tests/fixtures/pelindo-ticket.json'), 'utf8'));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pelindo-visual-'));
  const output = path.join(directory, 'pelindo-reference-layout.pdf');
  await generatePdf(fixture, output, {
    period: '01 September 2026',
    screenshots: { CTASK0016523: path.join(root, 'assets/reference-evidence.png') }
  });
  const pdf = await fs.readFile(output);
  const source = pdf.toString('latin1');
  assert.match(source, /612 792/);
  assert.ok((source.match(/\/Subtype \/Image/g) || []).length >= 2, 'PDF should contain logo and evidence images');
  const streams = [];
  let cursor = 0;
  while ((cursor = pdf.indexOf(Buffer.from('stream\n'), cursor)) >= 0) {
    const start = cursor + 7;
    const end = pdf.indexOf(Buffer.from('endstream'), start);
    if (end < 0) break;
    try { streams.push(zlib.inflateSync(pdf.subarray(start, end)).toString('latin1')); } catch { /* image streams are checked above */ }
    cursor = end + 9;
  }
  const content = streams.join('\n');
  assert.match(content, /546963/); // Ticket
  assert.match(content, /416374696f6e20506c616e/); // Action Plan

  const canvas = await renderPage(output);
  const image = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  assert.equal(canvas.width, 918);
  assert.equal(canvas.height, 1188);
  // These are the measured reference table boundaries at 1.5x render scale.
  for (const y of [173, 202, 289, 373, 432, 461, 491, 607, 636, 694, 900, 1016]) assert.ok(hasDarkLine(image, y, true), `missing horizontal boundary near y=${y}`);
  for (const x of [96, 196, 346, 473, 807]) assert.ok(hasDarkLine(image, x, false), `missing vertical boundary near x=${x}`);
  // A blue logo pixel must exist in the measured header area.
  let bluePixels = 0;
  for (let y = 20; y < 100; y += 1) for (let x = 540; x < 790; x += 1) {
    const offset = (y * image.width + x) * 4;
    if (image.data[offset + 2] > image.data[offset] + 40) bluePixels += 1;
  }
  assert.ok(bluePixels > 100, 'rendered logo is missing from the header');
});
