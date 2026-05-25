const crypto = require('crypto');
const https = require('https');
const { AppError } = require('../errors/AppError');

const normalizeText = (value) => String(value || '').trim();

const hashSha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => crypto.createHmac('sha256', key).update(value).digest();
const hmacHex = (key, value) => crypto.createHmac('sha256', key).update(value).digest('hex');

const extractXmlTag = (body, tagName) => {
  const text = Buffer.isBuffer(body) ? body.toString('utf8') : String(body || '');
  const match = text.match(new RegExp(`<${tagName}>([^<]*)</${tagName}>`, 'i'));
  return match ? match[1].slice(0, 160) : '';
};

const parseR2Error = (response = {}) => ({
  statusCode: response.statusCode || 0,
  errorCode: extractXmlTag(response.body, 'Code') || '',
  errorMessage: extractXmlTag(response.body, 'Message') || '',
  requestId: String(response.headers?.['x-amz-request-id'] || response.headers?.['cf-ray'] || '').slice(0, 120),
});

const logR2Failure = ({ operation, key = '', response = null, error = null }) => {
  const payload = {
    operation,
    keyHash: key ? hashSha256(key).slice(0, 16) : '',
  };
  if (response) {
    Object.assign(payload, parseR2Error(response));
  }
  if (error) {
    payload.errorName = String(error.name || '').slice(0, 80);
    payload.errorCode = String(error.code || '').slice(0, 80);
    payload.errorMessage = String(error.message || '').slice(0, 160);
  }
  console.warn('[storage][r2]', payload);
};

const encodeKey = (key) => normalizeText(key)
  .split('/')
  .map((segment) => encodeURIComponent(segment))
  .join('/');

const formatAmzDate = (date = new Date()) => date.toISOString().replace(/[:-]|\.\d{3}/g, '');
const formatDateStamp = (date = new Date()) => formatAmzDate(date).slice(0, 8);

const buildEndpoint = ({ endpoint, accountId }) => {
  const explicitEndpoint = normalizeText(endpoint).replace(/\/+$/, '');
  if (explicitEndpoint) return explicitEndpoint;
  const normalizedAccountId = normalizeText(accountId);
  if (!normalizedAccountId) return '';
  return `https://${normalizedAccountId}.r2.cloudflarestorage.com`;
};

const getSigningKey = ({ secretAccessKey, dateStamp }) => {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, 'auto');
  const serviceKey = hmac(regionKey, 's3');
  return hmac(serviceKey, 'aws4_request');
};

const signRequest = ({ method, url, bodyBuffer, accessKeyId, secretAccessKey }) => {
  const now = new Date();
  const amzDate = formatAmzDate(now);
  const dateStamp = formatDateStamp(now);
  const payloadHash = hashSha256(bodyBuffer || Buffer.alloc(0));
  const canonicalUri = url.pathname;
  const canonicalQuery = url.search ? url.search.slice(1) : '';
  const host = url.host;
  const canonicalHeaders = [
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    '',
  ].join('\n');
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    hashSha256(canonicalRequest),
  ].join('\n');
  const signature = hmacHex(getSigningKey({ secretAccessKey, dateStamp }), stringToSign);

  return {
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    payloadHash,
    amzDate,
  };
};

const request = ({ method, url, bodyBuffer, headers = {} }) => new Promise((resolve, reject) => {
  const req = https.request(url, { method, headers }, (res) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => {
      resolve({
        statusCode: res.statusCode || 0,
        headers: res.headers || {},
        body: Buffer.concat(chunks),
      });
    });
  });
  req.on('error', reject);
  if (bodyBuffer?.length) req.write(bodyBuffer);
  req.end();
});

const createR2StorageClient = ({
  accountId,
  accessKeyId,
  secretAccessKey,
  bucket,
  endpoint,
} = {}) => {
  const resolvedEndpoint = buildEndpoint({ endpoint, accountId });
  const resolvedAccessKeyId = normalizeText(accessKeyId);
  const resolvedSecretAccessKey = normalizeText(secretAccessKey);
  const resolvedBucket = normalizeText(bucket);
  if (!resolvedEndpoint || !resolvedAccessKeyId || !resolvedSecretAccessKey || !resolvedBucket) {
    throw new AppError(503, 'R2_STORAGE_NOT_CONFIGURED', 'Cloudflare R2 storage is not configured.');
  }

  const buildObjectUrl = (key) => new URL(`/${encodeURIComponent(resolvedBucket)}/${encodeKey(key)}`, resolvedEndpoint);

  const send = async ({ method, key, bodyBuffer = Buffer.alloc(0), contentType = '' }) => {
    const url = buildObjectUrl(key);
    const signature = signRequest({
      method,
      url,
      bodyBuffer,
      accessKeyId: resolvedAccessKeyId,
      secretAccessKey: resolvedSecretAccessKey,
    });
    const headers = {
      Authorization: signature.authorization,
      'x-amz-content-sha256': signature.payloadHash,
      'x-amz-date': signature.amzDate,
    };
    if (bodyBuffer.length) headers['Content-Length'] = String(bodyBuffer.length);
    if (contentType) headers['Content-Type'] = contentType;

    return request({ method, url, bodyBuffer, headers });
  };

  return {
    putObject: async ({ key, buffer, contentType }) => {
      let response;
      try {
        response = await send({
          method: 'PUT',
          key,
          bodyBuffer: buffer,
          contentType,
        });
      } catch (error) {
        logR2Failure({ operation: 'putObject', key, error });
        throw new AppError(502, 'R2_UPLOAD_FAILED', 'Could not store document in R2.');
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        logR2Failure({ operation: 'putObject', key, response });
        throw new AppError(502, 'R2_UPLOAD_FAILED', 'Could not store document in R2.');
      }
    },

    getObject: async ({ key }) => {
      let response;
      try {
        response = await send({ method: 'GET', key });
      } catch (error) {
        logR2Failure({ operation: 'getObject', key, error });
        throw new AppError(502, 'R2_DOWNLOAD_FAILED', 'Could not read document from R2.');
      }
      if (response.statusCode === 404) {
        throw new AppError(404, 'R2_OBJECT_NOT_FOUND', 'Stored document file not found.');
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        logR2Failure({ operation: 'getObject', key, response });
        throw new AppError(502, 'R2_DOWNLOAD_FAILED', 'Could not read document from R2.');
      }
      return response.body;
    },

    deleteObject: async ({ key }) => {
      let response;
      try {
        response = await send({ method: 'DELETE', key });
      } catch (error) {
        logR2Failure({ operation: 'deleteObject', key, error });
        throw new AppError(502, 'R2_DELETE_FAILED', 'Could not remove document from R2.');
      }
      if (response.statusCode === 404) return;
      if (response.statusCode < 200 || response.statusCode >= 300) {
        logR2Failure({ operation: 'deleteObject', key, response });
        throw new AppError(502, 'R2_DELETE_FAILED', 'Could not remove document from R2.');
      }
    },
  };
};

module.exports = {
  createR2StorageClient,
};
