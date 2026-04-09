const bcrypt = require('bcryptjs');
const path = require('path');
const { randomUUID } = require('crypto');
const {
  fsPromises,
  pathExists,
  ensureDir,
  readJsonFile,
  writeJsonFile,
} = require('./utils/fileStore');

const DEFAULT_CLINIC_ID = 'defaultClinic';
const SESSION_TTL_HOURS = 12;

const ROLE_BY_TIPO = {
  admin: 'ADMIN',
  dentista: 'DENTISTA',
  recepcionista: 'RECEPCAO',
  recepcao: 'RECEPCAO',
};

const TIPO_BY_ROLE = {
  ADMIN: 'admin',
  DENTISTA: 'dentista',
  RECEPCAO: 'recepcionista',
};

const createAuthService = ({ usersPath, usersFile, clinicsPath, clinicsFile, sessionFile }) => {
  const dentistColorPalette = [
    '#1FA87A',
    '#2563EB',
    '#F59E0B',
    '#8B5CF6',
    '#EF4444',
    '#0EA5E9',
    '#10B981',
    '#F97316',
    '#14B8A6',
    '#DB2777',
  ];

  const superAdminEmail = String(process.env.VOITHOS_SUPERADMIN_EMAIL || 'superadmin@voithos.local').trim().toLowerCase();
  const superAdminPassword = String(process.env.VOITHOS_SUPERADMIN_PASSWORD || 'voithos@2026').trim();

  const generateId = () => (
    typeof randomUUID === 'function'
      ? randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );

  const nowIso = () => new Date().toISOString();

  const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

  const normalizeColor = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const match = raw.match(/^#([0-9a-fA-F]{6})$/);
    return match ? `#${match[1].toUpperCase()}` : '';
  };

  const normalizeClinicStatus = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    return raw === 'suspended' ? 'suspended' : 'active';
  };

  const normalizeTipo = (tipo, role) => {
    const rawTipo = String(tipo || '').trim().toLowerCase();
    if (rawTipo === 'admin' || rawTipo === 'dentista' || rawTipo === 'recepcionista' || rawTipo === 'recepcao') {
      return rawTipo === 'recepcao' ? 'recepcionista' : rawTipo;
    }
    const normalizedRole = String(role || '').trim().toUpperCase();
    return TIPO_BY_ROLE[normalizedRole] || 'recepcionista';
  };

  const normalizeRole = (role, tipo) => {
    const rawRole = String(role || '').trim().toUpperCase();
    if (rawRole === 'ADMIN' || rawRole === 'DENTISTA' || rawRole === 'RECEPCAO' || rawRole === 'SUPER_ADMIN') {
      return rawRole;
    }
    return ROLE_BY_TIPO[String(tipo || '').trim().toLowerCase()] || 'RECEPCAO';
  };

  const sanitizeReceituario = (input = {}) => ({
    assinaturaNome: String(input?.assinaturaNome || '').trim().slice(0, 160),
    assinaturaRegistro: String(input?.assinaturaRegistro || '').trim().slice(0, 160),
    assinaturaImagemFile: String(input?.assinaturaImagemFile || '').trim().slice(0, 140),
  });

  const persistReceitaSignatureImage = async ({ userId, currentFile = '', payload = {} }) => {
    let signatureFile = String(payload?.assinaturaImagemFile || currentFile || '').trim();
    const shouldRemove = Boolean(payload?.assinaturaImagemRemove);

    if (shouldRemove && signatureFile) {
      try {
        await fsPromises.unlink(path.join(usersPath, signatureFile));
      } catch (_) {
      }
      signatureFile = '';
    }

    const assinaturaImagemData = String(payload?.assinaturaImagemData || '').trim();
    if (assinaturaImagemData.startsWith('data:')) {
      const match = assinaturaImagemData.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
      if (match) {
        const ext = match[1] === 'jpeg' ? 'jpg' : match[1].toLowerCase();
        const base64 = match[2];
        const fileName = `user-signature-${userId}.${ext}`;
        const filePath = path.join(usersPath, fileName);
        await fsPromises.writeFile(filePath, Buffer.from(base64, 'base64'));
        if (signatureFile && signatureFile !== fileName) {
          try {
            await fsPromises.unlink(path.join(usersPath, signatureFile));
          } catch (_) {
          }
        }
        signatureFile = fileName;
      }
    }

    return signatureFile;
  };

  const appendReceituarioPreviewData = async (user) => {
    const safe = { ...user, receituario: sanitizeReceituario(user?.receituario || {}) };
    const file = safe.receituario.assinaturaImagemFile;
    if (!file) return safe;
    try {
      const filePath = path.join(usersPath, file);
      if (!(await pathExists(filePath))) return safe;
      const buffer = await fsPromises.readFile(filePath);
      const ext = path.extname(file).replace('.', '') || 'png';
      safe.receituario.assinaturaImagemData = `data:image/${ext};base64,${buffer.toString('base64')}`;
    } catch (_) {
    }
    return safe;
  };

  const pickDentistColor = (used = new Set()) => {
    const available = dentistColorPalette.filter((c) => !used.has(c));
    if (available.length) {
      return available[Math.floor(Math.random() * available.length)];
    }
    return dentistColorPalette[Math.floor(Math.random() * dentistColorPalette.length)];
  };

  const buildDefaultClinic = () => {
    const stamp = nowIso();
    return {
      clinicId: DEFAULT_CLINIC_ID,
      nomeFantasia: 'Clinica Padrao',
      razaoSocial: 'Clinica Padrao',
      cnpjOuCpf: '00000000000000',
      emailClinica: '',
      telefone: '',
      whatsapp: '',
      endereco: {
        rua: '',
        numero: '',
        bairro: '',
        cidade: '',
        uf: '',
        cep: '',
      },
      logoPath: '',
      status: 'active',
      createdAt: stamp,
      updatedAt: stamp,
    };
  };

  const sanitizeClinic = (clinic) => {
    if (!clinic) return null;
    return {
      clinicId: String(clinic.clinicId || '').trim(),
      nomeFantasia: String(clinic.nomeFantasia || '').trim(),
      razaoSocial: String(clinic.razaoSocial || '').trim(),
      cnpjOuCpf: String(clinic.cnpjOuCpf || '').trim(),
      emailClinica: normalizeEmail(clinic.emailClinica || ''),
      telefone: String(clinic.telefone || '').trim(),
      whatsapp: String(clinic.whatsapp || '').trim(),
      endereco: {
        rua: String(clinic?.endereco?.rua || '').trim(),
        numero: String(clinic?.endereco?.numero || '').trim(),
        bairro: String(clinic?.endereco?.bairro || '').trim(),
        cidade: String(clinic?.endereco?.cidade || '').trim(),
        uf: String(clinic?.endereco?.uf || '').trim(),
        cep: String(clinic?.endereco?.cep || '').trim(),
      },
      logoPath: String(clinic.logoPath || '').trim(),
      status: normalizeClinicStatus(clinic.status),
      createdAt: clinic.createdAt || nowIso(),
      updatedAt: clinic.updatedAt || nowIso(),
    };
  };

  const ensureClinicsFile = async () => {
    await ensureDir(clinicsPath);
    if (!(await pathExists(clinicsFile))) {
      await writeJsonFile(clinicsFile, [buildDefaultClinic()]);
    }
  };

  const readClinics = async () => {
    await ensureClinicsFile();
    let changed = false;
    const raw = await readJsonFile(clinicsFile).catch(() => []);
    const list = Array.isArray(raw) ? raw : [];
    const normalized = [];

    list.forEach((clinic) => {
      const sanitized = sanitizeClinic(clinic);
      if (!sanitized?.clinicId) return;
      normalized.push(sanitized);
      if (JSON.stringify(clinic) !== JSON.stringify(sanitized)) changed = true;
    });

    if (!normalized.find((c) => c.clinicId === DEFAULT_CLINIC_ID)) {
      normalized.unshift(buildDefaultClinic());
      changed = true;
    }

    if (!normalized.length) {
      normalized.push(buildDefaultClinic());
      changed = true;
    }

    if (changed) {
      await writeJsonFile(clinicsFile, normalized);
    }

    return normalized;
  };

  const writeClinics = async (clinics) => {
    await ensureClinicsFile();
    await writeJsonFile(clinicsFile, clinics.map(sanitizeClinic));
  };

  const findClinicById = async (clinicId) => {
    const normalizedClinicId = String(clinicId || '').trim() || DEFAULT_CLINIC_ID;
    const clinics = await readClinics();
    return clinics.find((clinic) => clinic.clinicId === normalizedClinicId) || null;
  };

  const generateInitialAdminPassword = () => {
    const fromEnv = String(process.env.VOITHOS_ADMIN_PASSWORD || '').trim();
    if (fromEnv) return fromEnv;
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  };

  const defaultPermissions = () => ({
    admin: true,
    'users.manage': true,
    'clinic.manage': true,
    'procedures.manage': true,
    'data.import': true,
    'agenda.settings': true,
    'agenda.availability': true,
    'notifications.manage': true,
    'agenda.view': true,
    'agenda.edit': true,
    'finance.view': true,
    'finance.edit': true,
  });

  const buildDefaultAdminUsers = async () => {
    const initialPassword = generateInitialAdminPassword();
    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(initialPassword, salt);
    const stamp = nowIso();
    const users = [{
      id: 'admin001',
      userId: 'admin001',
      clinicId: DEFAULT_CLINIC_ID,
      nome: 'Administrador',
      login: 'admin@voithos.local',
      email: 'admin@voithos.local',
      senhaHash,
      tipo: 'admin',
      role: 'ADMIN',
      isActive: true,
      mustChangePassword: false,
      tempPasswordIssuedAt: '',
      permissionsEnabled: true,
      permissions: defaultPermissions(),
      receituario: sanitizeReceituario({}),
      cro: '',
      createdAt: stamp,
      updatedAt: stamp,
    }];
    console.warn('[AUTH] Usuario admin inicial criado. Senha temporaria:', initialPassword);
    console.warn('[AUTH] Defina VOITHOS_ADMIN_PASSWORD para controlar a senha inicial em novos ambientes.');
    console.warn('[AUTH] Super Admin Voithos:', superAdminEmail);
    return users;
  };

  const ensureUsersFile = async () => {
    await ensureDir(usersPath);
    await ensureClinicsFile();
    if (!(await pathExists(usersFile))) {
      const adminUser = await buildDefaultAdminUsers();
      await writeJsonFile(usersFile, adminUser);
    }
  };

  const ensureSessionFile = async () => {
    await ensureDir(usersPath);
    if (!(await pathExists(sessionFile))) {
      await writeJsonFile(sessionFile, null);
    }
  };

  const migrateUsers = async (users) => {
    const clinics = await readClinics();
    const validClinicIds = new Set(clinics.map((clinic) => clinic.clinicId));
    const usedEmails = new Set();
    let changed = false;

    const next = users.map((rawUser, index) => {
      const source = rawUser || {};
      const userId = String(source.userId || source.id || generateId()).trim();
      const clinicIdRaw = String(source.clinicId || '').trim();
      const clinicId = validClinicIds.has(clinicIdRaw) ? clinicIdRaw : DEFAULT_CLINIC_ID;
      const tipo = normalizeTipo(source.tipo, source.role);
      const role = normalizeRole(source.role, tipo);

      let email = normalizeEmail(source.email || source.login || '');
      if (!email) {
        email = `usuario${index + 1}@${clinicId}.local`;
      }
      if (!email.includes('@')) {
        email = `${email}@${clinicId}.local`;
      }
      let uniqueEmail = email;
      let suffix = 1;
      while (usedEmails.has(uniqueEmail)) {
        const [local, domain = 'local'] = email.split('@');
        uniqueEmail = `${local}+${suffix}@${domain}`;
        suffix += 1;
      }
      usedEmails.add(uniqueEmail);

      const receituario = sanitizeReceituario(source.receituario || {});

      const migrated = {
        ...source,
        id: userId,
        userId,
        clinicId,
        nome: String(source.nome || '').trim(),
        login: uniqueEmail,
        email: uniqueEmail,
        tipo,
        role,
        isActive: typeof source.isActive === 'boolean' ? source.isActive : true,
        mustChangePassword: typeof source.mustChangePassword === 'boolean' ? source.mustChangePassword : false,
        tempPasswordIssuedAt: source.tempPasswordIssuedAt || '',
        permissionsEnabled: typeof source.permissionsEnabled === 'boolean' ? source.permissionsEnabled : !!source.permissionsEnabled,
        permissions: source.permissions || {},
        corDentista: tipo === 'dentista' ? normalizeColor(source.corDentista) : '',
        cro: tipo === 'dentista'
          ? String(source.cro || source?.receituario?.assinaturaRegistro || '').trim().slice(0, 160)
          : '',
        receituario,
        createdAt: source.createdAt || nowIso(),
        updatedAt: source.updatedAt || source.createdAt || nowIso(),
      };
      if (migrated.tipo === 'dentista' && !migrated.receituario.assinaturaRegistro && migrated.cro) {
        migrated.receituario.assinaturaRegistro = migrated.cro;
      }

      if (JSON.stringify(source) !== JSON.stringify(migrated)) {
        changed = true;
      }

      return migrated;
    });

    return { users: next, changed };
  };

  const ensureDentistColors = async (users) => {
    let changed = false;
    const used = new Set(users.map((u) => normalizeColor(u.corDentista)).filter(Boolean));
    const updated = users.map((u) => {
      if (u.tipo !== 'dentista') {
        if (u.corDentista) {
          changed = true;
          return { ...u, corDentista: '' };
        }
        return u;
      }
      const existing = normalizeColor(u.corDentista);
      if (existing) return { ...u, corDentista: existing };
      const corDentista = pickDentistColor(used);
      used.add(corDentista);
      changed = true;
      return { ...u, corDentista };
    });
    return { users: updated, changed };
  };

  const readUsers = async () => {
    await ensureUsersFile();
    try {
      const data = await readJsonFile(usersFile);
      const rawUsers = Array.isArray(data) ? data : [];
      const migrated = await migrateUsers(rawUsers);
      const colored = await ensureDentistColors(migrated.users);
      const changed = migrated.changed || colored.changed;
      if (changed) {
        await writeJsonFile(usersFile, colored.users);
      }
      return colored.users;
    } catch (err) {
      console.warn('Erro ao ler usuarios, recriando arquivo.', err);
      try {
        if (await pathExists(usersFile)) {
          const backupPath = `${usersFile}.broken-${Date.now()}`;
          await fsPromises.copyFile(usersFile, backupPath);
        }
      } catch (_) {
      }
      const adminUser = await buildDefaultAdminUsers();
      await writeJsonFile(usersFile, adminUser);
      return adminUser;
    }
  };

  const writeUsers = async (users) => {
    await ensureUsersFile();
    await writeJsonFile(usersFile, users);
  };

  const isSuperAdminUser = (user) => String(user?.tipo || user?.role || '').trim().toLowerCase() === 'super_admin';
  const isClinicAdminUser = (user) => !isSuperAdminUser(user) && String(user?.tipo || '').trim().toLowerCase() === 'admin';
  const isClinicMemberUser = (user) => !isSuperAdminUser(user) && ['admin', 'dentista', 'recepcionista'].includes(String(user?.tipo || '').trim().toLowerCase());
  const getAccessProfile = (user) => {
    if (!user) return 'ANONYMOUS';
    if (isSuperAdminUser(user)) return 'SUPERADMIN';
    if (isClinicAdminUser(user)) return 'CLINIC_ADMIN';
    if (isClinicMemberUser(user)) return 'CLINIC_USER';
    return 'ANONYMOUS';
  };

  const buildAccessContext = (user) => {
    const safeUser = user || null;
    const isSuperAdmin = isSuperAdminUser(safeUser);
    const isImpersonatedSession = safeUser?.isImpersonatedSession === true;
    const tenantScope = isSuperAdmin && !isImpersonatedSession ? 'global' : 'clinic';
    const clinicId = tenantScope === 'clinic'
      ? (String(safeUser?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID)
      : '';
    const permissions = safeUser?.permissions || {};

    return {
      accessProfile: getAccessProfile(safeUser),
      tenantScope,
      clinicId,
      isSuperAdmin,
      isImpersonatedSession,
      canAccessSuperAdmin: isSuperAdmin,
      canAccessGlobalClinicData: isSuperAdmin && !isImpersonatedSession,
      canAccessWhatsAppGlobal: isSuperAdmin && !isImpersonatedSession,
      canManageClinic: isSuperAdmin || permissions.admin === true || permissions['clinic.manage'] === true || isClinicAdminUser(safeUser),
      canManageUsers: isSuperAdmin || permissions.admin === true || permissions['users.manage'] === true || isClinicAdminUser(safeUser),
      canManageFinance: isSuperAdmin || permissions.admin === true || permissions['finance.edit'] === true || isClinicAdminUser(safeUser),
      canViewFinance: isSuperAdmin || permissions.admin === true || permissions['finance.view'] === true || isClinicAdminUser(safeUser),
      canManageAgenda: isSuperAdmin || permissions.admin === true || permissions['agenda.edit'] === true || isClinicAdminUser(safeUser),
    };
  };

  const sanitizeUser = (user) => {
    if (!user) return null;
    const { senhaHash, ...safeUser } = user;
    const receituario = sanitizeReceituario(safeUser.receituario || {});
    const accessContext = buildAccessContext(safeUser);
    if (safeUser?.receituario?.assinaturaImagemData) {
      receituario.assinaturaImagemData = String(safeUser.receituario.assinaturaImagemData);
    }
    return {
      ...safeUser,
      accessProfile: accessContext.accessProfile,
      tenantScope: accessContext.tenantScope,
      receituario,
    };
  };

  const resolveUserByLoginIdentifier = (users, identifier) => {
    const needle = normalizeEmail(identifier);
    return users.find((u) => normalizeEmail(u.email) === needle || normalizeEmail(u.login) === needle);
  };

  const buildSuperAdminUser = () => ({
    id: 'super-admin',
    userId: 'super-admin',
    clinicId: 'voithos',
    nome: 'Super Admin Voithos',
    email: superAdminEmail,
    login: superAdminEmail,
    tipo: 'super_admin',
    role: 'SUPER_ADMIN',
    isActive: true,
    mustChangePassword: false,
    isImpersonatedSession: false,
    permissionsEnabled: true,
    permissions: { admin: true },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });

  const validateClinicStatus = async (clinicId) => {
    if (!clinicId) return;
    const clinic = await findClinicById(clinicId);
    if (!clinic) throw new Error('Clinica nao encontrada.');
    if (clinic.status !== 'active') throw new Error('Clinica suspensa.');
  };

  const loginUser = async ({ email, login, senha }) => {
    const identifier = normalizeEmail(email || login);
    if (!identifier || !senha) {
      throw new Error('Informe e-mail e senha.');
    }

    if (identifier === superAdminEmail) {
      if (senha !== superAdminPassword) throw new Error('Usuario ou senha invalidos.');
      return buildSuperAdminUser();
    }

    const users = await readUsers();
    const user = resolveUserByLoginIdentifier(users, identifier);
    if (!user) throw new Error('Usuario ou senha invalidos.');
    if (!user.isActive) throw new Error('Usuario inativo.');

    await validateClinicStatus(user.clinicId);

    const isMatch = await bcrypt.compare(senha, user.senhaHash);
    if (!isMatch) throw new Error('Usuario ou senha invalidos.');
    return {
      ...user,
      isImpersonatedSession: false,
    };
  };

  const createSession = async (user, ttlHours = SESSION_TTL_HOURS, options = {}) => {
    await ensureSessionFile();
    const token = String(options.remoteToken || generateId()).trim();
    const expiresAt = new Date(Date.now() + Math.max(1, Number(ttlHours) || SESSION_TTL_HOURS) * 60 * 60 * 1000).toISOString();
    const payload = {
      token,
      source: String(options.source || 'local').trim() || 'local',
      remoteToken: String(options.remoteToken || '').trim(),
      userId: user?.userId || user?.id || '',
      clinicId: user?.clinicId || DEFAULT_CLINIC_ID,
      isSuperAdmin: user?.tipo === 'super_admin',
      isImpersonatedSession: options.isImpersonatedSession === true,
      userSnapshot: options.userSnapshot || null,
      createdAt: nowIso(),
      expiresAt,
    };
    await writeJsonFile(sessionFile, payload);
    return payload;
  };

  const clearSession = async () => {
    await ensureSessionFile();
    await writeJsonFile(sessionFile, null);
  };

  const readSessionCache = async () => {
    await ensureSessionFile();
    return readJsonFile(sessionFile).catch(() => null);
  };

  const restoreSession = async () => {
    const session = await readSessionCache();
    if (!session || !session.expiresAt) return null;

    const expiry = new Date(session.expiresAt).getTime();
    if (!Number.isFinite(expiry) || Date.now() > expiry) {
      await clearSession();
      return null;
    }

    if (session.isSuperAdmin) {
      return {
        ...buildSuperAdminUser(),
        isImpersonatedSession: false,
      };
    }

    if (String(session.source || '').trim() === 'central' && session.userSnapshot && typeof session.userSnapshot === 'object') {
      return {
        ...session.userSnapshot,
        isImpersonatedSession: session?.isImpersonatedSession === true,
      };
    }

    const users = await readUsers();
    const user = users.find((u) => String(u.userId || u.id) === String(session.userId || ''));
    if (!user || !user.isActive) {
      await clearSession();
      return null;
    }

    await validateClinicStatus(user.clinicId);
    return {
      ...user,
      isImpersonatedSession: session?.isImpersonatedSession === true,
    };
  };

  const changePassword = async ({ currentUser, senhaAtual, novaSenha }) => {
    if (!currentUser) throw new Error('Usuario nao autenticado.');
    if (currentUser.tipo === 'super_admin') throw new Error('Nao e permitido alterar esta senha por aqui.');
    if (!senhaAtual || !novaSenha) throw new Error('Informe as senhas.');

    const users = await readUsers();
    const userIndex = users.findIndex((u) => String(u.userId || u.id) === String(currentUser.userId || currentUser.id));
    if (userIndex === -1) throw new Error('Usuario nao encontrado.');

    const user = users[userIndex];
    const isMatch = await bcrypt.compare(senhaAtual, user.senhaHash);
    if (!isMatch) throw new Error('Senha atual incorreta.');

    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(novaSenha, salt);
    users[userIndex] = {
      ...user,
      senhaHash,
      mustChangePassword: false,
      tempPasswordIssuedAt: '',
      updatedAt: nowIso(),
    };
    await writeUsers(users);

    return sanitizeUser(users[userIndex]);
  };

  const filterByClinic = (users, clinicId) => {
    const normalized = String(clinicId || '').trim();
    if (!normalized) return users;
    return users.filter((user) => user.clinicId === normalized);
  };

  const listUsersPublic = async ({ clinicId } = {}) => {
    const users = filterByClinic(await readUsers(), clinicId);
    const enriched = await Promise.all(users.map(appendReceituarioPreviewData));
    return enriched.map(({ id, userId, nome, login, tipo, role, clinicId: cid, corDentista, cro, email, telefone, isActive, permissions, permissionsEnabled, receituario }) => ({
      id,
      userId,
      nome,
      login,
      tipo,
      role,
      clinicId: cid,
      corDentista,
      cro: String(cro || receituario?.assinaturaRegistro || '').trim(),
      email,
      telefone,
      isActive,
      permissions,
      permissionsEnabled,
      receituario: sanitizeReceituario(receituario || {}),
    }));
  };

  const resetPassword = async ({ id, novaSenha, clinicId }) => {
    if (!id || !novaSenha) throw new Error('Dados invalidos.');

    const users = await readUsers();
    const idx = users.findIndex((u) => String(u.userId || u.id) === String(id));
    if (idx === -1) throw new Error('Usuario nao encontrado.');
    if (clinicId && users[idx].clinicId !== clinicId) throw new Error('Acesso negado.');

    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(novaSenha, salt);
    users[idx] = { ...users[idx], senhaHash, updatedAt: nowIso() };
    await writeUsers(users);
    return sanitizeUser(users[idx]);
  };

  const listUsers = async ({ clinicId } = {}) => {
    const users = filterByClinic(await readUsers(), clinicId);
    const enriched = await Promise.all(users.map(appendReceituarioPreviewData));
    return enriched.map(sanitizeUser);
  };

  const ensureEmailUnique = (users, email, ignoreUserId = '') => {
    const normalized = normalizeEmail(email);
    if (!normalized) throw new Error('E-mail obrigatorio.');
    const duplicated = users.find((u) => normalizeEmail(u.email) === normalized && String(u.userId || u.id) !== String(ignoreUserId || ''));
    if (duplicated) throw new Error('O e-mail informado ja existe.');
    return normalized;
  };

  const createUser = async (userData, generateCustomId, context = {}) => {
    const { nome, senha } = userData;
    const tipo = normalizeTipo(userData.tipo, userData.role);
    const role = normalizeRole(userData.role, tipo);
    const emailInput = userData.email || userData.login;
    const clinicId = String(context.clinicId || userData.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;

    if (!nome || !senha || !tipo || !emailInput) throw new Error('Todos os campos obrigatorios devem ser preenchidos.');
    if (!['admin', 'recepcionista', 'dentista'].includes(tipo)) throw new Error('Tipo de usuario invalido.');

    await validateClinicStatus(clinicId);

    const users = await readUsers();
    const email = ensureEmailUnique(users, emailInput);

    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(senha, salt);
    const id = typeof generateCustomId === 'function'
      ? generateCustomId()
      : generateId();

    let corDentista = '';
    if (tipo === 'dentista') {
      const normalized = normalizeColor(userData.corDentista);
      corDentista = normalized || pickDentistColor(new Set(users.map((u) => normalizeColor(u.corDentista)).filter(Boolean)));
    }

    const receituario = sanitizeReceituario(userData.receituario || {});
    const cro = String(userData.cro || receituario.assinaturaRegistro || '').trim().slice(0, 160);
    if (!receituario.assinaturaRegistro && cro) receituario.assinaturaRegistro = cro;
    receituario.assinaturaImagemFile = await persistReceitaSignatureImage({
      userId: id,
      currentFile: '',
      payload: userData.receituario || {},
    });

    const stamp = nowIso();
    const newUser = {
      id,
      userId: id,
      clinicId,
      nome: String(nome || '').trim(),
      login: email,
      email,
      senhaHash,
      tipo,
      role,
      dentistaId: tipo === 'dentista' ? id : null,
      corDentista,
      telefone: String(userData.telefone || '').trim(),
      cro: tipo === 'dentista' ? cro : '',
      isActive: userData.isActive !== false,
      mustChangePassword: typeof userData.mustChangePassword === 'boolean' ? userData.mustChangePassword : false,
      tempPasswordIssuedAt: userData.tempPasswordIssuedAt || '',
      permissionsEnabled: !!userData.permissionsEnabled,
      permissions: userData.permissions || {},
      receituario,
      createdAt: stamp,
      updatedAt: stamp,
    };

    users.push(newUser);
    await writeUsers(users);
    return sanitizeUser(await appendReceituarioPreviewData(newUser));
  };

  const deleteUser = async (id, context = {}) => {
    const users = await readUsers();
    const target = users.find((u) => String(u.userId || u.id) === String(id));
    if (!target) throw new Error('Usuario nao encontrado.');
    if (context.clinicId && target.clinicId !== context.clinicId) throw new Error('Acesso negado.');

    if (target?.receituario?.assinaturaImagemFile) {
      try {
        await fsPromises.unlink(path.join(usersPath, target.receituario.assinaturaImagemFile));
      } catch (_) {
      }
    }

    const next = users.filter((u) => String(u.userId || u.id) !== String(id));
    await writeUsers(next);
    return { success: true };
  };

  const updateUser = async ({ id, ...data }, context = {}) => {
    const users = await readUsers();
    const userIndex = users.findIndex((u) => String(u.userId || u.id) === String(id));
    if (userIndex === -1) throw new Error('Usuario nao encontrado.');

    const current = users[userIndex];
    if (context.clinicId && current.clinicId !== context.clinicId) throw new Error('Acesso negado.');

    const tipo = normalizeTipo(data.tipo || current.tipo, data.role || current.role);
    const role = normalizeRole(data.role || current.role, tipo);
    const emailInput = data.email || data.login || current.email;
    const email = ensureEmailUnique(users, emailInput, current.userId || current.id);

    const normalizedColor = normalizeColor(data.corDentista);
    let corDentista = current.corDentista || '';
    if (tipo === 'dentista') {
      corDentista = normalizedColor || corDentista || pickDentistColor(new Set(users.map((u) => normalizeColor(u.corDentista)).filter(Boolean)));
    } else {
      corDentista = '';
    }

    const currentReceituario = sanitizeReceituario(current.receituario || {});
    const incomingReceituario = data?.receituario && typeof data.receituario === 'object'
      ? sanitizeReceituario(data.receituario)
      : currentReceituario;
    const incomingCro = String((data?.cro ?? current?.cro ?? incomingReceituario.assinaturaRegistro ?? '')).trim().slice(0, 160);
    if (!incomingReceituario.assinaturaRegistro && incomingCro) {
      incomingReceituario.assinaturaRegistro = incomingCro;
    }
    incomingReceituario.assinaturaImagemFile = await persistReceitaSignatureImage({
      userId: current.userId || current.id,
      currentFile: currentReceituario.assinaturaImagemFile || '',
      payload: data?.receituario || {},
    });

    users[userIndex] = {
      ...current,
      nome: String(data.nome || current.nome || '').trim(),
      login: email,
      email,
      tipo,
      role,
      dentistaId: tipo === 'dentista' ? (current.dentistaId || current.userId || current.id) : null,
      corDentista,
      telefone: String(data.telefone ?? current.telefone ?? '').trim(),
      cro: tipo === 'dentista' ? incomingCro : '',
      permissionsEnabled: data.permissionsEnabled ?? current.permissionsEnabled ?? false,
      permissions: data.permissions || current.permissions || {},
      receituario: incomingReceituario,
      isActive: typeof data.isActive === 'boolean' ? data.isActive : (current.isActive !== false),
      mustChangePassword: typeof data.mustChangePassword === 'boolean' ? data.mustChangePassword : (current.mustChangePassword === true),
      tempPasswordIssuedAt: data.tempPasswordIssuedAt ?? current.tempPasswordIssuedAt ?? '',
      updatedAt: nowIso(),
    };

    if (data.senha) {
      const salt = await bcrypt.genSalt(10);
      users[userIndex].senhaHash = await bcrypt.hash(data.senha, salt);
    }

    await writeUsers(users);
    return sanitizeUser(await appendReceituarioPreviewData(users[userIndex]));
  };

  const listClinics = async () => {
    return readClinics();
  };

  const superAdminImpersonateClinic = async (clinicId) => {
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedClinicId) throw new Error('clinicId obrigatorio.');

    await validateClinicStatus(normalizedClinicId);

    const users = await readUsers();
    const admin = users.find((user) =>
      String(user.clinicId || '') === normalizedClinicId
      && user.tipo === 'admin'
      && user.isActive !== false
    );

    if (!admin) {
      throw new Error('Administrador da clinica nao encontrado.');
    }

    return {
      ...admin,
      isImpersonatedSession: true,
    };
  };

  const createClinicWithAdmin = async (payload, generateCustomId) => {
    const clinicInput = payload?.clinic || payload || {};
    const adminInput = payload?.admin || {};

    const clinicName = String(clinicInput.nomeFantasia || clinicInput.razaoSocial || '').trim();
    const razaoSocial = String(clinicInput.razaoSocial || clinicName).trim();
    const cnpjOuCpf = String(clinicInput.cnpjOuCpf || '').trim();
    if (!clinicName || !razaoSocial || !cnpjOuCpf) {
      throw new Error('Dados da clinica incompletos.');
    }

    const adminNome = String(adminInput.nome || '').trim();
    const adminEmail = normalizeEmail(adminInput.email || '');
    if (!adminNome || !adminEmail) {
      throw new Error('Nome e e-mail do admin inicial sao obrigatorios.');
    }

    const clinics = await readClinics();
    const duplicatedClinic = clinics.find((clinic) => String(clinic.cnpjOuCpf || '').trim() === cnpjOuCpf);
    if (duplicatedClinic) {
      throw new Error('Ja existe clinica cadastrada com este CNPJ/CPF.');
    }

    const users = await readUsers();
    ensureEmailUnique(users, adminEmail);

    const clinicId = typeof generateCustomId === 'function' ? generateCustomId() : generateId();
    const stamp = nowIso();
    const newClinic = sanitizeClinic({
      clinicId,
      nomeFantasia: clinicName,
      razaoSocial,
      cnpjOuCpf,
      emailClinica: clinicInput.emailClinica || '',
      telefone: clinicInput.telefone || '',
      whatsapp: clinicInput.whatsapp || '',
      endereco: clinicInput.endereco || {},
      logoPath: clinicInput.logoPath || '',
      status: 'active',
      createdAt: stamp,
      updatedAt: stamp,
    });

    const tempPassword = String(adminInput.senhaTemporaria || `${Math.random().toString(36).slice(2, 6)}${Date.now().toString(36).slice(-4)}!A`).slice(0, 32);
    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(tempPassword, salt);
    const adminId = typeof generateCustomId === 'function' ? generateCustomId() : generateId();

    const adminUser = {
      id: adminId,
      userId: adminId,
      clinicId,
      nome: adminNome,
      login: adminEmail,
      email: adminEmail,
      senhaHash,
      tipo: 'admin',
      role: 'ADMIN',
      dentistaId: null,
      corDentista: '',
      telefone: String(adminInput.telefone || '').trim(),
      isActive: true,
      mustChangePassword: true,
      tempPasswordIssuedAt: stamp,
      permissionsEnabled: true,
      permissions: defaultPermissions(),
      receituario: sanitizeReceituario({}),
      cro: '',
      createdAt: stamp,
      updatedAt: stamp,
    };

    clinics.push(newClinic);
    users.push(adminUser);

    await writeClinics(clinics);
    await writeUsers(users);

    return {
      clinic: newClinic,
      admin: sanitizeUser(adminUser),
      credentials: {
        email: adminEmail,
        senhaTemporaria: tempPassword,
      },
    };
  };

  const ensureTenantBootstrap = async () => {
    await ensureClinicsFile();
    await ensureUsersFile();
    await ensureSessionFile();
    await readClinics();
    await readUsers();
  };

  return {
    DEFAULT_CLINIC_ID,
    SESSION_TTL_HOURS,
    ensureTenantBootstrap,
    ensureUsersFile,
    ensureSessionFile,
    readUsers,
    writeUsers,
    sanitizeUser,
    loginUser,
    createSession,
    clearSession,
    readSessionCache,
    restoreSession,
    changePassword,
    listUsersPublic,
    resetPassword,
    listUsers,
    createUser,
    deleteUser,
    updateUser,
    readClinics,
    writeClinics,
    listClinics,
    superAdminImpersonateClinic,
    findClinicById,
    createClinicWithAdmin,
    isSuperAdminUser,
    isClinicAdminUser,
    isClinicMemberUser,
    getAccessProfile,
    buildAccessContext,
  };
};

module.exports = { createAuthService };
