import logger from '../utils/logger.js';

const brevoConfig = {
  apiKey: process.env.BREVO_API_KEY,
  sender: {
    name: process.env.BREVO_SENDER_NAME || 'No-Due Portal',
    email: process.env.BREVO_SENDER_EMAIL || process.env.SMTP_USER // Fallback to existing env
  },
  apiUrl: 'https://api.brevo.com/v3/smtp/email'
};

if (!brevoConfig.apiKey) {
  logger.warn('BREVO_API_KEY is not set. Brevo API delivery will be unavailable.');
} else {
  logger.info('Brevo API Configuration loaded');
}

export default brevoConfig;
