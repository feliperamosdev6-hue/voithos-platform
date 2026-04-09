const path = require('path');

const DEFAULT_CLINIC_ID = 'defaultClinic';

const imageMimeFromExt = (ext) => {
  const clean = String(ext || '').toLowerCase();
  if (clean === '.png') return 'image/png';
  if (clean === '.jpg' || clean === '.jpeg') return 'image/jpeg';
  if (clean === '.webp') return 'image/webp';
  return 'application/octet-stream';
};

const getDefaultClinicProfile = () => ({
  clinicId: DEFAULT_CLINIC_ID,
  nomeFantasia: '',
  razaoSocial: '',
  cnpj: '',
  endereco: {
    rua: '',
    numero: '',
    bairro: '',
    cidade: '',
    uf: '',
    cep: '',
  },
  telefone: '',
  whatsapp: '',
  email: '',
  cro: '',
  responsavelTecnico: '',
  logoPath: '',
  logoVersion: '',
  logoDataUrlCache: '',
  isIncomplete: true,
});

const normalizeProfile = (raw = {}, clinicPath, clinicId = DEFAULT_CLINIC_ID) => {
  const base = getDefaultClinicProfile();
  const normalizedClinicId = String(clinicId || raw.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
  const nomeFantasia = String(raw.nomeFantasia || raw.nomeClinica || '').trim();
  const razaoSocial = String(raw.razaoSocial || '').trim();
  const cnpj = String(raw.cnpj || raw.cnpjCpf || '').trim();
  const logoPathRaw = String(raw.logoPath || '').trim();
  const logoPath = logoPathRaw
    ? (path.isAbsolute(logoPathRaw) ? logoPathRaw : path.join(clinicPath, logoPathRaw))
    : '';

  const profile = {
    ...base,
    clinicId: normalizedClinicId,
    nomeFantasia,
    razaoSocial,
    cnpj,
    endereco: {
      rua: String(raw?.endereco?.rua || raw.rua || '').trim(),
      numero: String(raw?.endereco?.numero || raw.numero || '').trim(),
      bairro: String(raw?.endereco?.bairro || raw.bairro || '').trim(),
      cidade: String(raw?.endereco?.cidade || raw.cidade || '').trim(),
      uf: String(raw?.endereco?.uf || raw.estado || '').trim(),
      cep: String(raw?.endereco?.cep || raw.cep || '').trim(),
    },
    telefone: String(raw.telefone || '').trim(),
    whatsapp: String(raw.whatsapp || '').trim(),
    email: String(raw.email || '').trim(),
    cro: String(raw.cro || '').trim(),
    responsavelTecnico: String(raw.responsavelTecnico || '').trim(),
    logoPath,
    logoVersion: String(raw.logoVersion || '').trim(),
    logoDataUrlCache: String(raw.logoDataUrlCache || '').trim(),
    isIncomplete: false,
  };

  const hasNome = Boolean(profile.nomeFantasia || profile.razaoSocial);
  const hasCnpj = Boolean(profile.cnpj);
  profile.isIncomplete = !(hasNome && hasCnpj);
  return profile;
};

const createClinicProfileService = ({
  clinicPath,
  clinicFile,
  ensureDir,
  pathExists,
  readJsonFile,
  writeJsonFile,
  fsPromises,
  readSessionCache,
  centralBackendAdapter,
}) => {
  const profilesPath = path.join(clinicPath, 'profiles');
  const logosPath = path.join(clinicPath, 'logos');

  const normalizeClinicId = (value) => {
    const raw = String(value || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
    return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
  };

  const isDefaultProfile = (clinicId) => {
    const normalized = normalizeClinicId(clinicId);
    return normalized === DEFAULT_CLINIC_ID || normalized === 'default';
  };

  const getProfileFile = (clinicId) => path.join(profilesPath, `${normalizeClinicId(clinicId)}.json`);
  const getLogoDir = (clinicId) => path.join(logosPath, normalizeClinicId(clinicId));
  const canUseCentral = () => (
    centralBackendAdapter?.isEnabled?.() === true
    && typeof centralBackendAdapter?.getClinicProfileWithToken === 'function'
    && typeof centralBackendAdapter?.updateClinicProfileWithToken === 'function'
  );
  const getUserToken = async () => {
    if (typeof readSessionCache !== 'function') return '';
    const session = await readSessionCache().catch(() => null);
    return String(session?.remoteToken || session?.token || '').trim();
  };

  const ensureClinicRecord = async (clinicId) => {
    await ensureDir(clinicPath);
    await ensureDir(profilesPath);

    const profileFile = getProfileFile(clinicId);
    if (!(await pathExists(profileFile))) {
      if (isDefaultProfile(clinicId) && (await pathExists(clinicFile))) {
        const legacy = await readJsonFile(clinicFile).catch(() => ({}));
        const profileSource = legacy?.clinicProfile || legacy || {};
        const normalized = normalizeProfile(profileSource, clinicPath, normalizeClinicId(clinicId));
        await writeJsonFile(profileFile, { clinicProfile: normalized });
      } else {
        const normalized = normalizeProfile({}, clinicPath, normalizeClinicId(clinicId));
        await writeJsonFile(profileFile, { clinicProfile: normalized });
      }
    }

    if (isDefaultProfile(clinicId) && !(await pathExists(clinicFile))) {
      await writeJsonFile(clinicFile, {});
    }
  };

  const readClinicRecord = async (clinicId) => {
    const normalizedClinicId = normalizeClinicId(clinicId);
    await ensureClinicRecord(normalizedClinicId);

    const profileFile = getProfileFile(normalizedClinicId);
    try {
      return (await readJsonFile(profileFile)) || {};
    } catch (_) {
      if (isDefaultProfile(normalizedClinicId)) {
        try {
          return (await readJsonFile(clinicFile)) || {};
        } catch (_) {
          return {};
        }
      }
      return {};
    }
  };

  const writeClinicRecord = async (record = {}, clinicId) => {
    const normalizedClinicId = normalizeClinicId(clinicId);
    await ensureClinicRecord(normalizedClinicId);

    const profileFile = getProfileFile(normalizedClinicId);
    await writeJsonFile(profileFile, record);

    if (isDefaultProfile(normalizedClinicId)) {
      await writeJsonFile(clinicFile, record);
    }
  };

  const hasMeaningfulProfileData = (profile = {}) => Boolean(
    String(profile?.nomeFantasia || profile?.razaoSocial || '').trim()
    || String(profile?.cnpj || '').trim()
    || String(profile?.telefone || '').trim()
    || String(profile?.email || '').trim()
    || String(profile?.whatsapp || '').trim()
    || String(profile?.cro || '').trim()
    || String(profile?.responsavelTecnico || '').trim()
  );

  const toCentralProfilePatch = (profile = {}) => ({
    nomeFantasia: String(profile?.nomeFantasia || '').trim(),
    razaoSocial: String(profile?.razaoSocial || '').trim(),
    cnpj: String(profile?.cnpj || '').trim(),
    telefone: String(profile?.telefone || '').trim(),
    whatsapp: String(profile?.whatsapp || '').trim(),
    email: String(profile?.email || '').trim(),
    cro: String(profile?.cro || '').trim(),
    responsavelTecnico: String(profile?.responsavelTecnico || '').trim(),
    endereco: {
      rua: String(profile?.endereco?.rua || '').trim(),
      numero: String(profile?.endereco?.numero || '').trim(),
      bairro: String(profile?.endereco?.bairro || '').trim(),
      cidade: String(profile?.endereco?.cidade || '').trim(),
      uf: String(profile?.endereco?.uf || '').trim(),
      cep: String(profile?.endereco?.cep || '').trim(),
    },
  });

  const getClinicProfile = async (_clinicId = DEFAULT_CLINIC_ID) => {
    const clinicId = normalizeClinicId(_clinicId);
    const record = await readClinicRecord(clinicId);
    const profileSource = record?.clinicProfile || record || {};
    const localProfile = normalizeProfile(profileSource, clinicPath, clinicId);

    if (canUseCentral()) {
      const userToken = await getUserToken();
      if (userToken) {
        try {
          const remote = await centralBackendAdapter.getClinicProfileWithToken(userToken);
          const remoteProfile = normalizeProfile(remote || {}, clinicPath, clinicId);
          const shouldSeedCentral = !hasMeaningfulProfileData(remoteProfile) && hasMeaningfulProfileData(localProfile);
          const effectiveRemote = shouldSeedCentral
            ? normalizeProfile(await centralBackendAdapter.updateClinicProfileWithToken(userToken, toCentralProfilePatch(localProfile)), clinicPath, clinicId)
            : remoteProfile;

          const effective = normalizeProfile({
            ...effectiveRemote,
            logoPath: localProfile.logoPath || '',
            logoVersion: localProfile.logoVersion || '',
            logoDataUrlCache: localProfile.logoDataUrlCache || '',
          }, clinicPath, clinicId);

          const nextRecord = {
            ...(record || {}),
            clinicProfile: effective,
            clinicId,
            nomeClinica: effective.nomeFantasia,
            razaoSocial: effective.razaoSocial,
            cnpjCpf: effective.cnpj,
            telefone: effective.telefone,
            email: effective.email,
            rua: effective.endereco.rua,
            numero: effective.endereco.numero,
            bairro: effective.endereco.bairro,
            cidade: effective.endereco.cidade,
            estado: effective.endereco.uf,
            cep: effective.endereco.cep,
            cro: effective.cro,
            responsavelTecnico: effective.responsavelTecnico,
            logoPath: effective.logoPath,
            logoFile: effective.logoPath ? path.basename(effective.logoPath) : '',
            updatedAt: new Date().toISOString(),
          };
          await writeClinicRecord(nextRecord, clinicId).catch(() => null);
          return effective;
        } catch (_) {
          // fallback local
        }
      }
    }

    return localProfile;
  };

  const getClinicLogoDataUrl = async (_clinicId = DEFAULT_CLINIC_ID) => {
    const clinicId = normalizeClinicId(_clinicId);
    const profile = await getClinicProfile(clinicId);
    if (!profile.logoPath) return '';
    try {
      if (!(await pathExists(profile.logoPath))) return '';
      const ext = path.extname(profile.logoPath);
      const mime = imageMimeFromExt(ext);
      const buffer = await fsPromises.readFile(profile.logoPath);
      return `data:${mime};base64,${buffer.toString('base64')}`;
    } catch (_) {
      return '';
    }
  };

  const updateClinicProfile = async (_clinicId = DEFAULT_CLINIC_ID, patch = {}) => {
    const clinicId = normalizeClinicId(_clinicId);
    const record = await readClinicRecord(clinicId);
    const current = normalizeProfile(record?.clinicProfile || record || {}, clinicPath, clinicId);

    let merged = normalizeProfile(
      {
        ...current,
        ...patch,
        clinicId,
        endereco: {
          ...current.endereco,
          ...(patch.endereco || {}),
        },
      },
      clinicPath,
      clinicId,
    );

    const logoData = String(patch.logoData || '').trim();
    const logoRemove = patch.logoRemove === true;
    if (logoRemove && merged.logoPath) {
      try {
        if (await pathExists(merged.logoPath)) {
          await fsPromises.unlink(merged.logoPath);
        }
      } catch (_) {
      }
      merged.logoPath = '';
      merged.logoVersion = new Date().toISOString();
      merged.logoDataUrlCache = '';
    }

    if (logoData.startsWith('data:')) {
      const match = logoData.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
      if (match) {
        const ext = match[1] === 'jpeg' ? 'jpg' : match[1].toLowerCase();
        const logoDir = getLogoDir(clinicId);
        await ensureDir(logoDir);
        const fileName = `clinic-logo.${ext}`;
        const absolute = path.join(logoDir, fileName);
        await fsPromises.writeFile(absolute, Buffer.from(match[2], 'base64'));
        merged.logoPath = absolute;
        merged.logoVersion = new Date().toISOString();
        merged.logoDataUrlCache = '';
      }
    }

    if (canUseCentral()) {
      const userToken = await getUserToken();
      if (userToken) {
        try {
          const remote = await centralBackendAdapter.updateClinicProfileWithToken(userToken, toCentralProfilePatch(merged));
          merged = normalizeProfile({
            ...(remote || {}),
            logoPath: merged.logoPath,
            logoVersion: merged.logoVersion,
            logoDataUrlCache: merged.logoDataUrlCache,
          }, clinicPath, clinicId);
        } catch (_) {
          merged = normalizeProfile(merged, clinicPath, clinicId);
        }
      } else {
        merged = normalizeProfile(merged, clinicPath, clinicId);
      }
    } else {
      merged = normalizeProfile(merged, clinicPath, clinicId);
    }

    const logoFile = merged.logoPath ? path.basename(merged.logoPath) : '';
    const nextRecord = {
      ...(record || {}),
      clinicProfile: merged,
      clinicId,
      nomeClinica: merged.nomeFantasia,
      razaoSocial: merged.razaoSocial,
      cnpjCpf: merged.cnpj,
      telefone: merged.telefone,
      email: merged.email,
      rua: merged.endereco.rua,
      numero: merged.endereco.numero,
      bairro: merged.endereco.bairro,
      cidade: merged.endereco.cidade,
      estado: merged.endereco.uf,
      cep: merged.endereco.cep,
      cro: merged.cro,
      responsavelTecnico: merged.responsavelTecnico,
      logoPath: merged.logoPath,
      logoFile,
      updatedAt: new Date().toISOString(),
    };

    await writeClinicRecord(nextRecord, clinicId);
    return merged;
  };

  return {
    getDefaultClinicProfile,
    getClinicProfile,
    updateClinicProfile,
    getClinicLogoDataUrl,
  };
};

module.exports = { createClinicProfileService };
