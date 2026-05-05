const axios = require('axios');

const buildTodayDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeAsaasApiBaseUrl = (value) => {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) return '';

  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const currentPath = String(url.pathname || '').replace(/\/+$/, '');

    if (host === 'sandbox.asaas.com') {
      url.hostname = 'api-sandbox.asaas.com';
      url.pathname = '/v3';
      return url.toString().replace(/\/+$/, '');
    }

    if (host === 'asaas.com') {
      url.hostname = 'api.asaas.com';
      url.pathname = '/v3';
      return url.toString().replace(/\/+$/, '');
    }

    if (host === 'api-sandbox.asaas.com' || host === 'api.asaas.com') {
      url.pathname = currentPath === '/api/v3' || currentPath === '/v3' ? '/v3' : '/v3';
      return url.toString().replace(/\/+$/, '');
    }

    if (/\/api\/v3$/i.test(raw)) {
      return raw.replace(/sandbox\.asaas\.com\/api\/v3$/i, 'api-sandbox.asaas.com/v3')
        .replace(/asaas\.com\/api\/v3$/i, 'api.asaas.com/v3');
    }

    if (/\/v3$/i.test(raw)) {
      return raw;
    }
  } catch (_error) {
    // Fall through to string normalization.
  }

  return raw
    .replace(/^https?:\/\/sandbox\.asaas\.com\/api\/v3\/?$/i, 'https://api-sandbox.asaas.com/v3')
    .replace(/^https?:\/\/asaas\.com\/api\/v3\/?$/i, 'https://api.asaas.com/v3');
};

const resolveAsaasCheckoutBaseUrl = (apiBaseUrl) => {
  const normalized = String(apiBaseUrl || '').trim().toLowerCase();
  if (normalized.includes('api-sandbox.asaas.com')) {
    return 'https://sandbox.asaas.com';
  }
  return 'https://asaas.com';
};

const createClient = () => axios.create({
  baseURL: normalizeAsaasApiBaseUrl(process.env.ASAAS_API_URL),
  headers: {
    'Content-Type': 'application/json',
    access_token: process.env.ASAAS_API_KEY,
  },
});

const isConfigured = () => Boolean(String(process.env.ASAAS_API_KEY || '').trim() && normalizeAsaasApiBaseUrl(process.env.ASAAS_API_URL));

const buildCheckoutUrl = (checkoutId) => {
  const normalizedCheckoutId = String(checkoutId || '').trim();
  if (!normalizedCheckoutId) return '';
  const host = resolveAsaasCheckoutBaseUrl(normalizeAsaasApiBaseUrl(process.env.ASAAS_API_URL));
  return `${host}/checkoutSession/show?id=${normalizedCheckoutId}`;
};

const createCustomer = async ({ name, email, cpfCnpj, phone }) => {
  try {
    const client = createClient();
    const response = await client.post('/customers', {
      name: String(name || '').trim(),
      email: String(email || '').trim() || null,
      cpfCnpj: String(cpfCnpj || '').replace(/\D/g, '') || null,
      phone: String(phone || '').replace(/\D/g, '') || null,
    });
    return response.data;
  } catch (error) {
    const message = error?.response?.data?.errors?.[0]?.description
      || error?.response?.data?.message
      || error?.message
      || 'Asaas customer creation failed.';
    throw new Error(message);
  }
};

const createPayment = async ({
  customerId,
  value,
  description,
}) => {
  try {
    const client = createClient();
    const response = await client.post('/payments', {
      customer: String(customerId || '').trim(),
      billingType: 'PIX',
      value: Number(value) || 0,
      dueDate: buildTodayDate(),
      description: String(description || '').trim(),
    });
    return response.data;
  } catch (error) {
    const message = error?.response?.data?.errors?.[0]?.description
      || error?.response?.data?.message
      || error?.message
      || 'Asaas payment creation failed.';
    throw new Error(message);
  }
};

const createCheckout = async (payload = {}) => {
  try {
    const client = createClient();
    const response = await client.post('/checkouts', payload || {});
    return response.data;
  } catch (error) {
    const message = error?.response?.data?.errors?.[0]?.description
      || error?.response?.data?.message
      || error?.message
      || 'Asaas checkout creation failed.';
    throw new Error(message);
  }
};

const listPaymentsByCheckoutSession = async (checkoutSessionId) => {
  try {
    const client = createClient();
    const response = await client.get('/lean/payments', {
      params: {
        checkoutSession: String(checkoutSessionId || '').trim(),
        limit: 20,
      },
    });
    return response.data;
  } catch (error) {
    const message = error?.response?.data?.errors?.[0]?.description
      || error?.response?.data?.message
      || error?.message
      || 'Asaas checkout payment lookup failed.';
    throw new Error(message);
  }
};

module.exports = {
  asaasService: {
    isConfigured,
    buildCheckoutUrl,
    normalizeAsaasApiBaseUrl,
    createCustomer,
    createCheckout,
    createPayment,
    listPaymentsByCheckoutSession,
  },
};
