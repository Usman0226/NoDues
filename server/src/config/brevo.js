import logger from '../utils/logger.js';

const accounts = [];
if (process.env.BREVO_API_KEY) {
  accounts.push({
    apiKey: process.env.BREVO_API_KEY,
    sender: {
      name: process.env.BREVO_SENDER_NAME || 'No-Due Portal',
      email: process.env.BREVO_SENDER_EMAIL || process.env.SMTP_USER
    }
  });
}

let i = 2;
while (process.env[`BREVO_API_KEY_${i}`]) {
  accounts.push({
    apiKey: process.env[`BREVO_API_KEY_${i}`],
    sender: {
      name: process.env[`BREVO_SENDER_NAME_${i}`] || process.env.BREVO_SENDER_NAME || 'No-Due Portal',
      email: process.env[`BREVO_SENDER_EMAIL_${i}`] || process.env.BREVO_SENDER_EMAIL || process.env.SMTP_USER
    }
  });
  i++;
}

const brevoConfig = {
  accounts,
  apiUrl: 'https://api.brevo.com/v3/smtp/email'
};

if (brevoConfig.accounts.length === 0) {
  logger.warn('No Brevo API accounts found. Brevo API delivery will be unavailable.');
} else {
  logger.info(`Brevo API Configuration loaded with ${brevoConfig.accounts.length} accounts`);
}

export default brevoConfig;
