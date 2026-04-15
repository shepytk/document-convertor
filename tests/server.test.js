'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// Minimal valid PDF content for testing
const MINIMAL_PDF = Buffer.from(
  '%PDF-1.4\n' +
  '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
  '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
  '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ' +
  '/Contents 4 0 R /Resources << /Font << /F1 << /Type /Font ' +
  '/Subtype /Type1 /BaseFont /Helvetica >> >> >> >>\nendobj\n' +
  '4 0 obj\n<< /Length 44 >>\nstream\n' +
  'BT /F1 12 Tf 100 700 Td (Hello World) Tj ET\n' +
  'endstream\nendobj\n' +
  'xref\n0 5\n' +
  '0000000000 65535 f\n' +
  '0000000009 00000 n\n' +
  '0000000058 00000 n\n' +
  '0000000115 00000 n\n' +
  '0000000304 00000 n\n' +
  'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n403\n%%EOF'
);

let server;
let baseUrl;

before(async () => {
  const { server: srv } = require('../server');
  server = srv;
  await new Promise((resolve) => {
    if (server.listening) return resolve();
    server.once('listening', resolve);
  });
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(() => {
  server.close();
});

/**
 * Helper: perform a multipart/form-data POST with a single file field.
 */
function postFile(url, fieldName, filename, mimeType, fileBuffer) {
  return new Promise((resolve, reject) => {
    const boundary = `----FormBoundary${Date.now()}`;
    const CRLF = '\r\n';

    const header =
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"${CRLF}` +
      `Content-Type: ${mimeType}${CRLF}${CRLF}`;
    const footer = `${CRLF}--${boundary}--${CRLF}`;

    const body = Buffer.concat([
      Buffer.from(header),
      fileBuffer,
      Buffer.from(footer),
    ]);

    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    });

    req.on('response', (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Helper: GET request.
 */
function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

test('GET / serves the HTML frontend', async () => {
  const res = await get(`${baseUrl}/`);
  assert.equal(res.status, 200);
  assert.ok(res.headers['content-type'].includes('text/html'));
  const html = res.body.toString();
  assert.ok(html.includes('Document Convertor'));
  assert.ok(html.includes('/convert'));
});

test('GET /tlb/ serves the TLB finder page', async () => {
  const res = await get(`${baseUrl}/tlb/`);
  assert.equal(res.status, 200);
  assert.ok(res.headers['content-type'].includes('text/html'));
  const html = res.body.toString();
  assert.ok(html.includes('JCB 3CX Finder'));
  assert.ok(html.includes('R350&nbsp;000 – R450&nbsp;000'));
});

test('POST /convert with a valid PDF returns a .docx file', async () => {
  const res = await postFile(`${baseUrl}/convert`, 'file', 'test.pdf', 'application/pdf', MINIMAL_PDF);
  assert.equal(res.status, 200);
  assert.ok(
    res.headers['content-type'].includes('wordprocessingml'),
    `Expected DOCX content-type, got: ${res.headers['content-type']}`
  );
  assert.ok(
    res.headers['content-disposition'].includes('test.docx'),
    `Expected filename test.docx, got: ${res.headers['content-disposition']}`
  );
  assert.ok(res.body.length > 0, 'Response body should not be empty');
  // DOCX files start with the PK ZIP magic bytes
  assert.equal(res.body[0], 0x50); // 'P'
  assert.equal(res.body[1], 0x4b); // 'K'
});

test('POST /convert without a file returns 400', async () => {
  const res = await new Promise((resolve, reject) => {
    const req = http.request(`${baseUrl}/convert`, { method: 'POST' });
    req.on('response', (r) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => resolve({ status: r.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end();
  });
  assert.equal(res.status, 400);
  const json = JSON.parse(res.body);
  assert.ok(json.error);
});

test('POST /convert with a non-PDF file returns 400', async () => {
  const res = await postFile(
    `${baseUrl}/convert`,
    'file',
    'document.txt',
    'text/plain',
    Buffer.from('This is not a PDF')
  );
  assert.equal(res.status, 400);
  const json = JSON.parse(res.body.toString());
  assert.ok(json.error);
  assert.ok(json.error.toLowerCase().includes('pdf'));
});
