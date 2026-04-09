export const toDigits = (value: string): string => String(value || '').replace(/\D/g, '');

export const normalizeBrPhone = (value: string): string => {
  const digits = toDigits(value);
  if (!digits) return '';
  if (digits.startsWith('55')) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
};

