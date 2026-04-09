/**
 * @typedef {Object} CreateClinicInput
 * @property {string} nomeFantasia
 * @property {string=} razaoSocial
 * @property {string=} cnpjCpf
 * @property {string=} email
 * @property {string=} telefoneComercial
 * @property {string=} endereco
 */

/**
 * @typedef {Object} CreateUserInput
 * @property {string} clinicId
 * @property {string} nome
 * @property {string} email
 * @property {string} passwordHash
 * @property {string} role
 * @property {boolean=} ativo
 */

/**
 * @typedef {Object} CreateSessionInput
 * @property {string} userId
 * @property {string} token
 * @property {Date|string} expiresAt
 */

/**
 * @typedef {Object} CreatePatientInput
 * @property {string} clinicId
 * @property {string} nome
 * @property {string=} cpf
 * @property {string=} rg
 * @property {Date|string=} dataNascimento
 * @property {string=} telefone
 * @property {string=} email
 * @property {string=} endereco
 */

const toRequiredString = (value, fieldName) => {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }
  return normalized;
};

const toNullableString = (value) => {
  const normalized = String(value || '').trim();
  return normalized || null;
};

const toOptionalDate = (value) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid date value.');
  }
  return parsed;
};

module.exports = {
  toRequiredString,
  toNullableString,
  toOptionalDate,
};
