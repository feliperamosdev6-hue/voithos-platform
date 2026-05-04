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

module.exports = {
  asaasService: {
    isConfigured,
    createCustomer,
    createPayment,
  },
};
