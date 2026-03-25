'use strict';

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { PDFParse } = require('pdf-parse');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure upload directory exists
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer configuration — store uploads in memory for direct processing
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB limit
  fileFilter(_req, file, cb) {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted.'));
    }
  },
});

/**
 * Build a docx Document from an array of text lines extracted from a PDF.
 */
function buildDocxFromLines(lines) {
  const paragraphs = lines.map((line) => {
    const trimmed = line.trim();

    // Heuristic: treat short ALL-CAPS lines or very short lines at the top as headings
    const isHeading =
      trimmed.length > 0 &&
      trimmed.length <= 80 &&
      trimmed === trimmed.toUpperCase() &&
      /[A-Z]/.test(trimmed);

    if (isHeading) {
      return new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: trimmed, bold: true })],
      });
    }

    return new Paragraph({
      children: [new TextRun(trimmed)],
    });
  });

  return new Document({
    sections: [
      {
        properties: {},
        children: paragraphs.length > 0 ? paragraphs : [new Paragraph({ children: [new TextRun('')] })],
      },
    ],
  });
}

// POST /convert  — accepts a PDF, returns a .docx file
app.post('/convert', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Please upload a PDF file.' });
    }

    // Parse PDF
    const parser = new PDFParse({ data: req.file.buffer });
    const pdfData = await parser.getText();
    await parser.destroy();
    const rawText = pdfData.text || '';

    // Split text into non-empty lines
    const lines = rawText.split('\n').filter((l) => l.trim().length > 0);

    // Build Word document
    const doc = buildDocxFromLines(lines);
    const docxBuffer = await Packer.toBuffer(doc);

    // Derive output filename from original PDF name
    const originalName = path.basename(req.file.originalname, '.pdf');
    const outputFilename = `${originalName}.docx`;

    res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.send(docxBuffer);
  } catch (err) {
    console.error('Conversion error:', err);
    res.status(500).json({ error: 'Failed to convert the document. Please try again.' });
  }
});

// Error handler for multer errors (e.g. wrong file type, file too large)
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError || err.message) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'Internal server error.' });
});

const server = app.listen(PORT, () => {
  console.log(`Document Convertor server running on http://localhost:${PORT}`);
});

module.exports = { app, server };
