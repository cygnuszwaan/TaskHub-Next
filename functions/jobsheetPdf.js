/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const path = require("path");
const PDFDocument = require("pdfkit");
const {pdfText, fmtMinutes} = require("./jobsheet");

// DejaVu Sans covers Latin with macrons and the other accents a name or place may carry, which the built-in PDF fonts do not.
const FONT_DIR = path.join(path.dirname(require.resolve("dejavu-fonts-ttf/package.json")), "ttf");
const REGULAR = path.join(FONT_DIR, "DejaVuSans.ttf");
const BOLD = path.join(FONT_DIR, "DejaVuSans-Bold.ttf");

const INK = "#111111";
const MUTED = "#666666";
const RULE = "#cccccc";
const TIME_WIDTH = 92;

// "4 tasks", "1 task"
function taskCount(n) {
  return `${n} ${n === 1 ? "task" : "tasks"}`;
}

// The count of a project's tasks, and the part of its time that comes from estimates: "4 tasks · includes 30m estimated".
function countLine(totals) {
  const est = totals.estimatedMinutes > 0 ? ` · includes ${fmtMinutes(totals.estimatedMinutes)} estimated` : "";
  return `${taskCount(totals.count)}${est}`;
}

// A project's figures in one line: "3h 20m (3.33 h) · 4 tasks · includes 30m estimated".
function totalsLine(totals) {
  return `${totals.text} · ${countLine(totals)}`;
}

function draw(doc, sheet) {
  doc.registerFont("Sans", REGULAR);
  doc.registerFont("Bold", BOLD);
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const limit = () => doc.page.height - doc.page.margins.bottom;
  const pageHeight = () => limit() - doc.page.margins.top;
  const textHeight = (text, font, size, w) => {
    doc.font(font).fontSize(size);
    return doc.heightOfString(text, {width: w});
  };
  const rule = (color = RULE) => {
    doc.save().moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(0.5).strokeColor(color).stroke().restore();
  };
  // Start a new page when the next block (of at most a page) would not fit on this one
  const ensure = (h) => {
    if (doc.y + h > limit() && h <= pageHeight()) doc.addPage();
  };

  // Header
  doc.font("Bold").fontSize(20).fillColor(INK).text("Job sheet", left, doc.y, {width});
  if (sheet.contractorInfo) {
    doc.font("Sans").fontSize(9.5).fillColor(INK).text(sheet.contractorInfo, left, doc.y + 4, {width});
    doc.y += 4;
  }
  doc.moveDown(0.3);
  doc.font("Bold").fontSize(14).fillColor(INK).text(sheet.heading || "", left, doc.y, {width});
  if (sheet.projectName) doc.font("Sans").fontSize(10).fillColor(MUTED).text(`Project: ${sheet.projectName}`, left, doc.y + 2, {width});
  if (sheet.period) doc.font("Sans").fontSize(10).fillColor(MUTED).text(sheet.period, left, doc.y + 2, {width});
  doc.font("Sans").fontSize(8.5).fillColor(MUTED).text(`Prepared ${sheet.generatedText} · Times in ${sheet.timeZone}`, left, doc.y + 4, {width});
  doc.moveDown(0.6);
  rule(INK);
  doc.y += 10;

  // Project figures
  if (sheet.totals) {
    doc.font("Sans").fontSize(8.5).fillColor(MUTED).text("TOTAL TIME", left, doc.y, {width});
    doc.font("Bold").fontSize(13).fillColor(INK).text(sheet.totals.text, left, doc.y + 1, {width});
    doc.font("Sans").fontSize(9).fillColor(MUTED).text(countLine(sheet.totals), left, doc.y + 1, {width});
    doc.y += 8;
    if (sheet.truncated) {
      doc.font("Sans").fontSize(8.5).fillColor(MUTED).text("This project has a very large number of completed tasks; only the newest are listed. The totals cover them all.", left, doc.y, {width});
      doc.y += 6;
    }
  }

  if (sheet.empty) {
    doc.font("Sans").fontSize(10).fillColor(MUTED).text("No completed tasks to list.", left, doc.y + 4, {width});
  }

  for (const section of sheet.sections) {
    if (section.heading) {
      ensure(60);
      doc.y += 6;
      const y = doc.y;
      const rightText = totalsLine(section.totals);
      const rightW = Math.min(300, width * 0.62);
      const headW = width - rightW - 8;
      const headH = textHeight(section.heading, "Bold", 11, headW);
      const rightH = textHeight(rightText, "Sans", 8.5, rightW);
      doc.font("Bold").fontSize(11).fillColor(INK).text(section.heading, left, y, {width: headW});
      doc.font("Sans").fontSize(8.5).fillColor(MUTED).text(rightText, left + width - rightW, y + 2, {width: rightW, align: "right"});
      doc.y = y + Math.max(headH, rightH) + 3;
      rule();
      doc.y += 6;
    }

    for (const entry of section.entries) {
      const titleW = width - TIME_WIDTH - 8;
      const meta = [entry.started ? `Started ${entry.started}` : "", entry.completed ? `Completed ${entry.completed}` : ""].filter(Boolean).join(" · ");
      const materials = entry.materials.length ? `Materials: ${entry.materials.join("; ")}` : "";
      const titleH = textHeight(entry.title, "Bold", 10.5, titleW);
      const metaH = meta ? textHeight(meta, "Sans", 8.5, width) + 1 : 0;
      const materialsH = materials ? textHeight(materials, "Sans", 8.5, width) + 2 : 0;
      const commentsH = entry.comments ? textHeight(entry.comments, "Sans", 9, width - 12) + 3 : 0;
      ensure(titleH + metaH + materialsH + commentsH + 12);

      const y = doc.y;
      doc.font("Bold").fontSize(10.5).fillColor(INK).text(entry.title, left, y, {width: titleW});
      doc.font("Bold").fontSize(10.5).fillColor(entry.estimated ? MUTED : INK).text(entry.timeText, left + width - TIME_WIDTH, y, {width: TIME_WIDTH, align: "right"});
      doc.y = y + titleH;
      if (meta) doc.font("Sans").fontSize(8.5).fillColor(MUTED).text(meta, left, doc.y + 1, {width});
      if (materials) doc.font("Sans").fontSize(8.5).fillColor(MUTED).text(materials, left, doc.y + 2, {width});
      if (entry.comments) doc.font("Sans").fontSize(9).fillColor(INK).text(entry.comments, left + 12, doc.y + 3, {width: width - 12});
      doc.y += 9;
    }
  }

  // Footer on every page. The bottom margin is lifted while it is drawn, or pdfkit would start a page for text below it.
  const range = doc.bufferedPageRange();
  const footer = pdfText(sheet.kind === "TASK" ? `Job sheet · ${sheet.heading}` : `Job sheet · ${sheet.heading} · ${sheet.period}`);
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 36;
    doc.font("Sans").fontSize(8).fillColor(MUTED);
    doc.text(footer, left, y, {width: width - 90, height: 11, ellipsis: true});
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, left + width - 80, y, {width: 80, align: "right"});
    doc.page.margins.bottom = bottom;
  }
}

// A job sheet (see buildJobSheet) as a PDF: resolves to a Buffer.
function renderJobSheetPdf(sheet) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: {top: 54, bottom: 60, left: 48, right: 48},
      bufferPages: true,
      info: {Title: pdfText(sheet.kind === "TASK" ? `Job sheet - ${sheet.heading}` : `Job sheet - ${sheet.heading} - ${sheet.period}`), Creator: "TaskHub Next"},
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      draw(doc, sheet);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {renderJobSheetPdf};
