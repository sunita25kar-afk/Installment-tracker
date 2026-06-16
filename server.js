const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const https = require('https');

const PORT = process.env.PORT || 8000;
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data.json');
const OTP_STORE = {};
const OTP_EXPIRY_MS = 1 * 60 * 1000; // 1 minute
const OWNER_NAME = 'Gopal Chandro Kar';
const OWNER_MOBILE = '7828123727';

// // SMS Gateway configuration (using MSG91 or Twilio)
// const SMS_PROVIDER = process.env.SMS_PROVIDER || 'msg91'; // 'msg91' or 'twilio'
// const SMS_API_KEY = (process.env.SMS_API_KEY || '').trim();
// const SMS_SENDER_ID = (process.env.SMS_SENDER_ID || 'RepayTrack').trim();
// const SMS_BASE_URL = (process.env.SMS_BASE_URL || '').trim();
// const SMS_METHOD = (process.env.SMS_METHOD || 'POST').toUpperCase();

function isPlaceholderSmsKey(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['demo', 'test', 'placeholder', 'change_me', 'your_api_key'].includes(normalized);
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function getDataStore() {
  return readJsonFile(DATA_FILE, { clients: [] });
}

function findClientByNameAndMobile(name, mobile) {
  const store = getDataStore();
  return store.clients.find(client =>
    normalizeText(client.name) === normalizeText(name) &&
    normalizeText(client.mobile) === normalizeText(mobile)
  ) || null;
}

function filterDataForClient(data, clientId) {
  if (!clientId) return data;
  const filteredClients = (data.clients || []).filter(client => client.id === clientId);
  return { ...data, clients: filteredClients };
}

function serveStatic(req, res) {
  const reqUrl = req.url.split('?')[0];
  let filePath = path.join(ROOT, reqUrl === '/' ? 'index.html' : reqUrl);

  if (!fs.existsSync(filePath)) {
    filePath = path.join(ROOT, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
  };

  fs.readFile(filePath, (err, content) => {
    if (err) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain; charset=utf-8' });
    res.end(content);
  });
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function sendSmsViaMsg91(mobile, message) {
  return new Promise((resolve, reject) => {
    if (!SMS_API_KEY) {
      console.warn('SMS API key not configured. Set SMS_API_KEY env variable.');
      resolve({ success: false, error: 'SMS provider not configured' });
      return;
    }

    const baseUrl = SMS_BASE_URL || 'https://sms.gonlinesites.com/app/sms/api';
    const requestBody = new URLSearchParams({
      apikey: SMS_API_KEY,
      sender: SMS_SENDER_ID,
      number: mobile,
      message
    });

    const requestOptions = {
      method: SMS_METHOD,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    };

    const request = https.request(baseUrl, requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          const success = response.status === 'success' || response.success === true || response.code === '200';
          const errorMessage = response.message || response.error || 'Invalid response from SMS provider';
          resolve({ success, error: success ? null : errorMessage });
        } catch (e) {
          const text = data.trim();
          if (text && !/[{}\[\]]/.test(text)) {
            resolve({ success: true, error: null });
          } else {
            resolve({ success: false, error: 'Invalid response from SMS provider' });
          }
        }
      });
    });

    request.on('error', reject);

    if (SMS_METHOD === 'GET') {
      const queryUrl = new URL(baseUrl);
      queryUrl.searchParams.set('apikey', SMS_API_KEY);
      queryUrl.searchParams.set('sender', SMS_SENDER_ID);
      queryUrl.searchParams.set('number', mobile);
      queryUrl.searchParams.set('message', message);
      request.end();
      return;
    }

    request.write(requestBody.toString());
    request.end();
  });
}

function sendSmViaTwilio(mobile, message) {
  return new Promise((resolve, reject) => {
    if (!SMS_API_KEY) {
      console.warn('Twilio API key not configured. Set SMS_API_KEY env variable.');
      resolve({ success: false, error: 'SMS provider not configured' });
      return;
    }

    const [accountSid, authToken] = SMS_API_KEY.split(':');
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    
    const postData = `To=%2B91${mobile}&From=${SMS_SENDER_ID}&Body=${encodeURIComponent(message)}`;
    
    const options = {
      hostname: 'api.twilio.com',
      path: `/2010-04-01/Accounts/${accountSid}/Messages.json`,
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve({ success: !!response.sid, error: response.message || 'SMS sent' });
        } catch (e) {
          resolve({ success: false, error: 'Invalid response from Twilio' });
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(postData);
    req.end();
  });
}

async function sendOtpViaSms(mobile, otp) {
  const message = `Your RepayTrack OTP is: ${otp}. Valid for 1 minute. Never share this code.`;

  if (!SMS_API_KEY || isPlaceholderSmsKey(SMS_API_KEY)) {
    console.warn('SMS API key is missing or placeholder. Using demo OTP mode.');
    return { success: true, error: null, demoMode: true };
  }

  try {
    let result;
    if (SMS_PROVIDER === 'twilio') {
      result = await sendSmViaTwilio(mobile, message);
    } else {
      result = await sendSmsViaMsg91(mobile, message);
    }
    return { ...result, demoMode: false };
  } catch (error) {
    console.error('SMS sending error:', error);
    return { success: false, error: error.message, demoMode: false };
  }
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);

  if (parsedUrl.pathname === '/api/data') {
    if (req.method === 'GET') {
      const data = readJsonFile(DATA_FILE, { clients: [] });
      const clientId = parsedUrl.query && parsedUrl.query.clientId;
      const responseData = clientId ? filterDataForClient(data, clientId) : data;
      sendJson(res, 200, responseData);
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          writeJsonFile(DATA_FILE, payload);
          sendJson(res, 200, { ok: true });
        } catch (e) {
          sendJson(res, 400, { ok: false, error: 'Invalid JSON' });
        }
      });
      return;
    }
  }

  if (parsedUrl.pathname === '/api/login') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const { name, mobile } = JSON.parse(body || '{}');
          if (!name || !mobile) {
            sendJson(res, 400, { ok: false, error: 'Name and mobile are required' });
            return;
          }

          const isOwner = normalizeText(name) === normalizeText(OWNER_NAME) &&
            normalizeText(mobile) === normalizeText(OWNER_MOBILE);
          const client = findClientByNameAndMobile(name, mobile);

          if (!isOwner && !client) {
            sendJson(res, 404, { ok: false, error: 'Access not allowed for this name/mobile combination' });
            return;
          }

          sendJson(res, 200, {
            ok: true,
            role: isOwner ? 'owner' : 'client',
            clientId: isOwner ? null : client?.id || null
          });
        } catch (e) {
          sendJson(res, 400, { ok: false, error: 'Invalid JSON' });
        }
      });
      return;
    }
  }

  if (parsedUrl.pathname === '/api/otp') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const { name, mobile } = JSON.parse(body || '{}');
          if (!name || !mobile) {
            sendJson(res, 400, { ok: false, error: 'Name and mobile are required' });
            return;
          }

          const isOwner = normalizeText(name) === normalizeText(OWNER_NAME) &&
            normalizeText(mobile) === normalizeText(OWNER_MOBILE);
          const isClient = !!findClientByNameAndMobile(name, mobile);

          if (!isOwner && !isClient) {
            sendJson(res, 404, { ok: false, error: 'Access not allowed for this name/mobile combination' });
            return;
          }

          const otp = generateOtp();
          const smsResult = await sendOtpViaSms(mobile, otp);
          const demoMode = smsResult.demoMode || !SMS_API_KEY || isPlaceholderSmsKey(SMS_API_KEY);

          if (smsResult.success || demoMode) {
            OTP_STORE[mobile] = {
              name,
              mobile,
              otp,
              createdAt: Date.now(),
              expiresAt: Date.now() + OTP_EXPIRY_MS
            };
            sendJson(res, 200, {
              ok: true,
              otp,
              message: demoMode
                ? 'OTP generated successfully for login (demo mode).'
                : 'OTP sent successfully to your mobile'
            });
          } else {
            sendJson(res, 500, { ok: false, error: `Failed to send OTP: ${smsResult.error}` });
          }
        } catch (e) {
          sendJson(res, 400, { ok: false, error: 'Invalid JSON' });
        }
      });
      return;
    }
  }

  if (parsedUrl.pathname === '/api/verify') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const { name, mobile, otp } = JSON.parse(body || '{}');
          const stored = OTP_STORE[mobile];
          const client = findClientByNameAndMobile(name, mobile);
          const normalizedName = normalizeText(name);
          const normalizedMobile = normalizeText(mobile);

          if (
            stored &&
            normalizeText(stored.name) === normalizedName &&
            normalizeText(stored.mobile || mobile) === normalizedMobile &&
            stored.otp === otp
          ) {
            delete OTP_STORE[mobile];
            const isOwner = normalizedName === normalizeText(OWNER_NAME) &&
              normalizedMobile === normalizeText(OWNER_MOBILE);
            sendJson(res, 200, {
              ok: true,
              role: isOwner ? 'owner' : 'client',
              clientId: isOwner ? null : client?.id || null
            });
          } else {
            sendJson(res, 401, { ok: false, error: 'Invalid OTP' });
          }
        } catch (e) {
          sendJson(res, 400, { ok: false, error: 'Invalid JSON' });
        }
      });
      return;
    }
  }

  // Handle API endpoints with unsupported methods
  if (parsedUrl.pathname.startsWith('/api/')) {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
