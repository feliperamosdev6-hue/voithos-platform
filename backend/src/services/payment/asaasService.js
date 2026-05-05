const axios = require('axios');

const buildTodayDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const createClient = () => axios.create({
  baseURL: process.env.ASAAS_API_URL,
  headers: {
    'Content-Type': 'application/json',
    access_token: process.env.ASAAS_API_KEY,
  },
});

const isConfigured = () => Boolean(String(process.env.ASAAS_API_KEY || '').trim() && String(process.env.ASAAS_API_URL || '').trim());

const buildCheckoutUrl = (checkoutId) => {
  const normalizedCheckoutId = String(checkoutId || '').trim();
  if (!normalizedCheckoutId) return '';
  const apiUrl = String(process.env.ASAAS_API_URL || '').trim().toLowerCase();
  const host = apiUrl.includes('sandbox') ? 'https://sandbox.asaas.com' : 'https://asaas.com';
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
    createCustomer,
    createCheckout,
    createPayment,
    listPaymentsByCheckoutSession,
  },
};
