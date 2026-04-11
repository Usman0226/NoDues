import { Resend } from 'resend';
import { logger } from '../middlewares/logger.js';

let resend;

if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
  logger.info('Resend Email Client initialized');
} else {
  logger.warn('RESEND_API_KEY not found. Email service will be disabled.');
}

export default resend;
