const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 44;
const MARGIN_TOP = 42;
const MARGIN_BOTTOM = 46;
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN_X * 2);

const sanitizeText = (value, maxLen = 500) => String(value ?? '')
  .replace(/[<>]/g, ' ')
  .replace(/[\u0000-\u001F\u007F]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, maxLen);

const toPdfText = (value) => sanitizeText(value, 2000)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\x20-\x7E]/g, '?');

const pdfString = (value) => `(${toPdfText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')})`;

const formatMoney = (value) => Number(value || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const toDate = (value) => {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T12:00:00.000Z`);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const formatDate = (value) => new Intl.DateTimeFormat('pt-BR').format(toDate(value));

const estimateTextWidth = (text, size = 10, bold = false) => {
  const factor = bold ? 0.56 : 0.52;
  return toPdfText(text).length * size * factor;
};

class SimplePdf {
  constructor() {
    this.pages = [];
    this.current = null;
    this.y = 0;
    this.addPage();
  }

  addPage() {
    this.current = { commands: [] };
    this.pages.push(this.current);
    this.y = PAGE_HEIGHT - MARGIN_TOP;
  }

  command(value) {
    this.current.commands.push(value);
  }

  ensureSpace(height) {
    if ((this.y - height) < MARGIN_BOTTOM) {
      this.addPage();
      return true;
    }
    return false;
  }

  text(value, x, y, options = {}) {
    const size = Number(options.size || 10);
    const font = options.bold ? 'F2' : 'F1';
    this.command(`BT /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td ${pdfString(value)} Tj ET`);
  }

  line(x1, y1, x2, y2, width = 0.7) {
    this.command(`${width.toFixed(2)} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }

  rect(x, y, width, height) {
    this.command(`${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re S`);
  }

  wrap(value, maxWidth, size = 10, bold = false) {
    const words = toPdfText(value).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (line && estimateTextWidth(next, size, bold) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
    return lines.length ? lines : ['-'];
  }

  wrappedText(value, x, maxWidth, options = {}) {
    const size = Number(options.size || 10);
    const lineHeight = Number(options.lineHeight || (size + 4));
    const bold = options.bold === true;
    const lines = this.wrap(value, maxWidth, size, bold);
    this.ensureSpace(lines.length * lineHeight);
    lines.forEach((line) => {
      this.text(line, x, this.y, { size, bold });
      this.y -= lineHeight;
    });
    return lines.length * lineHeight;
  }

  build() {
    const objects = [];
    const addObject = (body) => {
      objects.push(body);
      return objects.length;
    };

    const catalogId = 1;
    const pagesId = 2;
    objects[catalogId - 1] = '';
    objects[pagesId - 1] = '';
    const fontRegularId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const fontBoldId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const pageIds = [];

    this.pages.forEach((page) => {
      const stream = page.commands.join('\n');
      const contentId = addObject(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
      const pageId = addObject([
        '<< /Type /Page',
        `/Parent ${pagesId} 0 R`,
        `/MediaBox [0 0 ${PAGE_WIDTH.toFixed(2)} ${PAGE_HEIGHT.toFixed(2)}]`,
        `/Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >>`,
        `/Contents ${contentId} 0 R`,
        '>>',
      ].join('\n'));
      pageIds.push(pageId);
    });

    objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

    let output = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((body, index) => {
      offsets[index + 1] = Buffer.byteLength(output, 'latin1');
      output += `${index + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xrefOffset = Buffer.byteLength(output, 'latin1');
    output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objects.length; i += 1) {
      output += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    return Buffer.from(output, 'latin1');
  }
}

const normalizeClinicAddress = (clinic = {}) => {
  if (typeof clinic?.endereco === 'string' && clinic.endereco.trim()) return sanitizeText(clinic.endereco, 180);
  const endereco = clinic?.endereco && typeof clinic.endereco === 'object' ? clinic.endereco : {};
  return [
    [endereco?.rua || clinic?.rua, endereco?.numero || clinic?.numero].filter(Boolean).join(', '),
    endereco?.bairro || clinic?.bairro,
    [endereco?.cidade || clinic?.cidade, endereco?.uf || clinic?.uf].filter(Boolean).join(' - '),
    endereco?.cep || clinic?.cep,
  ].filter(Boolean).join(' | ');
};

const drawHeader = (pdf, { clinic, title }) => {
  const logoText = sanitizeText(clinic.logoLabel || 'VO', 8).slice(0, 3).toUpperCase();
  pdf.rect(MARGIN_X, 770, 54, 38);
  pdf.text(logoText, MARGIN_X + 14, 790, { size: 12, bold: true });
  pdf.text(sanitizeText(clinic.nome || 'Clinica', 140), MARGIN_X + 66, 800, { size: 12, bold: true });
  pdf.text(sanitizeText(clinic.contato || '', 180), MARGIN_X + 66, 785, { size: 8 });
  pdf.text(sanitizeText(clinic.endereco || '', 180), MARGIN_X + 66, 773, { size: 8 });
  pdf.line(MARGIN_X, 760, PAGE_WIDTH - MARGIN_X, 760);
  pdf.y = 735;
  pdf.text(title, MARGIN_X, pdf.y, { size: 18, bold: true });
  pdf.y -= 28;
};

const drawFooter = (pdf, { clinic }) => {
  const pageCount = pdf.pages.length;
  pdf.pages.forEach((page, index) => {
    page.commands.push(`0.70 w ${MARGIN_X.toFixed(2)} 32.00 m ${(PAGE_WIDTH - MARGIN_X).toFixed(2)} 32.00 l S`);
    page.commands.push(`BT /F1 8 Tf ${MARGIN_X.toFixed(2)} 20.00 Td ${pdfString(sanitizeText(clinic.rodape || '', 180))} Tj ET`);
    page.commands.push(`BT /F1 8 Tf ${(PAGE_WIDTH - MARGIN_X - 70).toFixed(2)} 20.00 Td ${pdfString(`Pagina ${index + 1}/${pageCount}`)} Tj ET`);
  });
};

const addLabelValue = (pdf, label, value) => {
  pdf.ensureSpace(18);
  pdf.text(label, MARGIN_X, pdf.y, { size: 9, bold: true });
  pdf.wrappedText(value || '-', MARGIN_X + 100, CONTENT_WIDTH - 100, { size: 10, lineHeight: 13 });
  pdf.y -= 3;
};

const addProceduresTable = (pdf, procedures = [], clinic = {}) => {
  const nameX = MARGIN_X;
  const unitX = MARGIN_X + 335;
  const totalX = MARGIN_X + 430;
  const rowLineX = PAGE_WIDTH - MARGIN_X;

  pdf.ensureSpace(38);
  pdf.text('Procedimento', nameX, pdf.y, { size: 9, bold: true });
  pdf.text('Valor individual', unitX, pdf.y, { size: 9, bold: true });
  pdf.text('Total', totalX, pdf.y, { size: 9, bold: true });
  pdf.y -= 8;
  pdf.line(MARGIN_X, pdf.y, rowLineX, pdf.y);
  pdf.y -= 12;

  procedures.forEach((item) => {
    const detail = [
      item.codigo ? `Codigo: ${item.codigo}` : '',
      item.dentes && item.dentes !== '-' ? `Dentes: ${item.dentes}` : '',
      item.observacoes ? `Obs: ${item.observacoes}` : '',
    ].filter(Boolean).join(' | ');
    const nameLines = pdf.wrap(item.nome || 'Procedimento', 310, 10, true);
    const detailLines = detail ? pdf.wrap(detail, 310, 8, false) : [];
    const rowHeight = Math.max(28, (nameLines.length * 13) + (detailLines.length * 11) + 8);
    const startedNewPage = pdf.ensureSpace(rowHeight + 8);
    if (startedNewPage) {
      drawHeader(pdf, { clinic, title: 'ORCAMENTO' });
    }
    const startY = pdf.y;
    nameLines.forEach((line) => {
      pdf.text(line, nameX, pdf.y, { size: 10, bold: true });
      pdf.y -= 13;
    });
    detailLines.forEach((line) => {
      pdf.text(line, nameX, pdf.y, { size: 8 });
      pdf.y -= 11;
    });
    pdf.text(formatMoney(item.valorUnitario), unitX, startY, { size: 9 });
    pdf.text(formatMoney(item.valorTotal), totalX, startY, { size: 9 });
    pdf.y = startY - rowHeight;
    pdf.line(MARGIN_X, pdf.y + 4, rowLineX, pdf.y + 4);
  });
};

const createOrcamentoPdfBuffer = ({ clinic = {}, patient = {}, document = {} } = {}) => {
  const pdf = new SimplePdf();
  drawHeader(pdf, { clinic, title: 'ORCAMENTO' });

  if (clinic.cabecalho) {
    pdf.wrappedText(clinic.cabecalho, MARGIN_X, CONTENT_WIDTH, { size: 10, lineHeight: 13 });
    pdf.y -= 8;
  }

  addLabelValue(pdf, 'Paciente', document.pacienteNome || patient.fullName || patient.nome || '-');
  addLabelValue(pdf, 'Data', formatDate(document.data || document.documentDate || new Date()));
  addLabelValue(pdf, 'Profissional', document.profissionalNome || '-');
  pdf.y -= 6;
  addProceduresTable(pdf, document.procedimentos || [], clinic);
  pdf.y -= 8;
  pdf.ensureSpace(36);
  pdf.text(`Total do orcamento: ${formatMoney(document.valorTotal)}`, MARGIN_X + 300, pdf.y, { size: 12, bold: true });
  pdf.y -= 28;
  addLabelValue(pdf, 'Observacoes', document.observacoes || '-');

  pdf.ensureSpace(90);
  pdf.y -= 28;
  pdf.line(MARGIN_X + 145, pdf.y, MARGIN_X + 365, pdf.y);
  pdf.y -= 16;
  pdf.text(document.assinaturaNome || document.profissionalNome || clinic.assinaturaNome || 'Assinatura', MARGIN_X + 165, pdf.y, { size: 10 });
  if (document.assinaturaRegistro || clinic.assinaturaRegistro) {
    pdf.y -= 13;
    pdf.text(document.assinaturaRegistro || clinic.assinaturaRegistro, MARGIN_X + 185, pdf.y, { size: 9 });
  }

  drawFooter(pdf, { clinic });
  return pdf.build();
};

module.exports = {
  createOrcamentoPdfBuffer,
  normalizeClinicAddress,
  sanitizeText,
};
