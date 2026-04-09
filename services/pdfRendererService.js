const path = require('path');

const createPdfRendererService = ({
  BrowserWindow,
  fsPromises,
  ensureDir,
  getClinicProfile,
  getClinicLogoDataUrl,
  allowedOutputDirs = [],
}) => {
  const logoCache = new Map();

  const escapeHtml = (value) => {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const sanitizePayload = (payload) => {
    if (payload === null || payload === undefined) return '';
    if (Array.isArray(payload)) return payload.map(sanitizePayload);
    if (typeof payload === 'object') {
      return Object.keys(payload).reduce((acc, key) => {
        acc[String(key)] = sanitizePayload(payload[key]);
        return acc;
      }, {});
    }
    if (typeof payload === 'number' || typeof payload === 'boolean') return payload;
    return escapeHtml(String(payload));
  };

  const normalizeOutputPath = (outputPath) => {
    const normalized = path.resolve(String(outputPath || ''));
    if (!normalized) throw new Error('Caminho de saida invalido.');
    const roots = (Array.isArray(allowedOutputDirs) ? allowedOutputDirs : [])
      .map((dir) => path.resolve(String(dir || '')))
      .filter(Boolean);
    if (!roots.length) return normalized;
    const valid = roots.some((root) => normalized === root || normalized.startsWith(`${root}${path.sep}`));
    if (!valid) throw new Error('Caminho de saida fora do diretorio permitido.');
    return normalized;
  };

  const resolveClinicBranding = async (clinicId = 'default') => {
    const profile = await getClinicProfile(clinicId);
    const logoPath = String(profile?.logoPath || '').trim();
    const logoVersion = String(profile?.logoVersion || '').trim();
    let logoDataUrl = '';

    if (logoPath) {
      const cached = logoCache.get(clinicId);
      if (cached && cached.logoPath === logoPath && cached.logoVersion === logoVersion) {
        logoDataUrl = cached.logoDataUrl || '';
      } else {
        logoDataUrl = await getClinicLogoDataUrl(clinicId);
        logoCache.set(clinicId, { logoPath, logoVersion, logoDataUrl });
      }
    } else if (logoCache.has(clinicId)) {
      logoCache.delete(clinicId);
    }

    return {
      profile: profile || {},
      logoDataUrl,
    };
  };

  const invalidateLogoCache = (clinicId = 'default') => {
    logoCache.delete(clinicId);
  };

   const buildHeaderHTML = (clinicProfile = {}, options = {}) => {
    const logoDataUrl = String(options.logoDataUrl || '').trim();
    const docType = String(options.docType || '').trim().toLowerCase();
    const isAtestado = docType === 'atestado';
    const nome = String(clinicProfile?.razaoSocial || clinicProfile?.nomeFantasia || '').trim();
    const cnpj = String(clinicProfile?.cnpj || '').trim();
    const telefone = String(clinicProfile?.telefone || '').trim();
    const email = String(clinicProfile?.email || '').trim();
    const aviso = clinicProfile?.isIncomplete ? 'Perfil da clinica incompleto.' : '';
    const meta = [cnpj ? `CNPJ: ${cnpj}` : '', telefone, email].filter(Boolean).join(' | ');
    const endereco = clinicProfile?.endereco || {};
    const enderecoLinha = [
      [endereco?.rua, endereco?.numero].filter(Boolean).join(', '),
      endereco?.bairro,
      [endereco?.cidade, endereco?.uf].filter(Boolean).join(' - '),
      endereco?.cep,
    ].filter(Boolean).join(' - ');
    const wrapperFontSize = isAtestado ? '10px' : '9px';
    const logoBoxWidth = isAtestado ? '120px' : '96px';
    const logoBoxHeight = isAtestado ? '44px' : '34px';
    const logoMaxHeight = isAtestado ? '44px' : '34px';
    const titleFontSize = isAtestado ? '12px' : '10px';
    const paddingBottom = isAtestado ? '8px' : '6px';

    return `
      <div style="width:100%;font-family:Arial,sans-serif;font-size:${wrapperFontSize};color:#1f2937;padding:0 8px ${paddingBottom};border-bottom:1px solid #dbe2ea;display:flex;justify-content:space-between;align-items:center;gap:10px;">
        <div style="min-width:42px;max-width:${logoBoxWidth};height:${logoBoxHeight};display:flex;align-items:center;">
          ${logoDataUrl ? `<img src="${escapeHtml(logoDataUrl)}" style="max-height:${logoMaxHeight};max-width:${logoBoxWidth};object-fit:contain;" />` : ''}
        </div>
        <div style="flex:1;min-width:0;line-height:1.28;">
          <div style="font-weight:700;font-size:${titleFontSize};">${escapeHtml(nome || 'Clinica')}</div>
          <div>${escapeHtml(meta)}</div>
          ${isAtestado && enderecoLinha ? `<div>${escapeHtml(enderecoLinha)}</div>` : ''}
          ${aviso ? `<div style="color:#b45309;">${escapeHtml(aviso)}</div>` : ''}
        </div>
      </div>
    `;
  };

  const buildFooterHTML = (clinicProfile = {}, options = {}) => {
    const docType = String(options.docType || '').trim().toLowerCase();
    const isAtestado = docType === 'atestado';
    const endereco = clinicProfile?.endereco || {};
    const enderecoTexto = [
      endereco?.rua,
      endereco?.numero,
      endereco?.bairro,
      [endereco?.cidade, endereco?.uf].filter(Boolean).join('/'),
      endereco?.cep,
    ].filter(Boolean).join(' - ');
    const contato = [clinicProfile?.telefone, clinicProfile?.email].filter(Boolean).join(' | ');
    const emitidoEm = String(options.emitidoEm || new Date().toLocaleString('pt-BR'));
    if (isAtestado) {
      return `
        <div style="width:100%;font-family:Arial,sans-serif;font-size:8px;color:#475569;padding:4px 8px 0;border-top:1px solid #dbe2ea;display:flex;justify-content:flex-end;align-items:center;gap:10px;">
          <span>Pagina <span class="pageNumber"></span> de <span class="totalPages"></span></span>
        </div>
      `;
    }

    return `
      <div style="width:100%;font-family:Arial,sans-serif;font-size:8px;color:#475569;padding:6px 8px 0;border-top:1px solid #dbe2ea;display:flex;justify-content:space-between;align-items:center;gap:10px;">
        <div style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${escapeHtml([enderecoTexto, contato].filter(Boolean).join(' | '))}
        </div>
        <div style="display:flex;gap:10px;white-space:nowrap;">
          <span>Emitido em: ${escapeHtml(emitidoEm)}</span>
          <span>Pagina <span class="pageNumber"></span> de <span class="totalPages"></span></span>
        </div>
      </div>
    `;
  };

  const extractBody = (contentHTML) => {
    const raw = String(contentHTML || '');
    const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return bodyMatch ? bodyMatch[1] : raw;
  };

  const extractHeadStyles = (contentHTML) => {
    const raw = String(contentHTML || '');
    const headMatch = raw.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    const source = headMatch ? headMatch[1] : raw;
    const styleBlocks = [];
    const styleRegex = /<style[^>]*>[\s\S]*?<\/style>/gi;
    let match = styleRegex.exec(source);
    while (match) {
      styleBlocks.push(match[0]);
      match = styleRegex.exec(source);
    }
    return styleBlocks.join('\n');
  };

  const wrapHTML = (contentHTML, _headerHTML, _footerHTML, options = {}) => {
    const docType = String(options.docType || '').trim().toLowerCase();
    const isAtestado = docType === 'atestado';
    const pageMargin = isAtestado ? '110px 24px 54px' : '96px 24px 82px';
    const content = extractBody(contentHTML);
    const externalStyles = extractHeadStyles(contentHTML);
    return `<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8" />
  ${externalStyles}
  <style>
    @page { margin: ${pageMargin}; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; color: #0f172a; }
  </style>
</head>
<body>${content}</body>
</html>`;
  };

  const renderPdf = async ({
    clinicId = 'default',
    docType = 'documento',
    payload = {},
    outputPath,
    contentHTML = '',
    headerOptions = {},
    footerOptions = {},
  }) => {
    const safePayload = sanitizePayload(payload || {});
    const { profile, logoDataUrl } = await resolveClinicBranding(clinicId);
    const safeOutputPath = normalizeOutputPath(outputPath);
    await ensureDir(path.dirname(safeOutputPath));

    const headerHTML = buildHeaderHTML(profile, { ...headerOptions, logoDataUrl, docType });
    const footerHTML = buildFooterHTML(profile, { ...footerOptions, docType });
    const html = wrapHTML(contentHTML || `<h1>${escapeHtml(docType)}</h1><pre>${escapeHtml(JSON.stringify(safePayload, null, 2))}</pre>`, headerHTML, footerHTML, { docType });

    const win = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true },
    });

    try {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      const pdfBuffer = await win.webContents.printToPDF({
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: headerHTML,
        footerTemplate: footerHTML,
        preferCSSPageSize: true,
      });
      await fsPromises.writeFile(safeOutputPath, pdfBuffer);
    } finally {
      win.close();
    }

    return {
      outputPath: safeOutputPath,
      clinicId,
      docType,
      profileIncomplete: !!profile?.isIncomplete,
    };
  };

  return {
    buildHeaderHTML,
    buildFooterHTML,
    wrapHTML,
    renderPdf,
    sanitizePayload,
    invalidateLogoCache,
  };
};

module.exports = { createPdfRendererService };
