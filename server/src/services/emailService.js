import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';
import EmailLog from '../models/EmailLog.js';
import EmailQuota from '../models/EmailQuota.js';
import brevoConfig from '../config/brevo.js';

const ACCOUNT_LIMIT = parseInt(process.env.SMTP_DAILY_LIMIT) || 300;
let _transporters = [];
let _accounts = [];

const discoverAccounts = () => {
  const accounts = [];
  
  // Account 1 (standard)
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    accounts.push({
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
      from: process.env.SMTP_FROM || `No-Due Portal <${process.env.SMTP_USER}>`
    });
  }

  // Failover accounts (2, 3, 4...)
  let i = 2;
  while (process.env[`SMTP_USER_${i}`] && process.env[`SMTP_PASS_${i}`]) {
    accounts.push({
      user: process.env[`SMTP_USER_${i}`],
      pass: process.env[`SMTP_PASS_${i}`],
      host: process.env[`SMTP_HOST_${i}`] || process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env[`SMTP_PORT_${i}`]) || parseInt(process.env.SMTP_PORT) || 587,
      from: process.env[`SMTP_FROM_${i}`] || process.env.SMTP_FROM || `No-Due Failover ${i} <${process.env[`SMTP_USER_${i}`]}>`
    });
    i++;
  }

  _accounts = accounts;
  return accounts;
};

const getTransporter = (index) => {
  if (!_transporters[index]) {
    const acc = _accounts[index];
    if (!acc) return null;

    _transporters[index] = nodemailer.createTransport({
      host: acc.host,
      port: acc.port,
      secure: acc.port === 465,
      pool: true,
      maxConnections: 5,
      auth: {
        user: acc.user,
        pass: acc.pass
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    _transporters[index].verify((error) => {
      if (error) {
        logger.error(`SMTP Account ${index + 1} (${acc.user}) verification failed:`, error);
      } else {
        logger.info(`SMTP Account ${index + 1} (${acc.user}) ready`);
      }
    });
  }
  return _transporters[index];
};

const selectAccountIndex = async () => {
  if (_accounts.length === 0) discoverAccounts();
  if (_accounts.length === 0) return -1;

  const today = new Date().toISOString().split('T')[0];
  let quota = await EmailQuota.findOne({ date: today });
  
  if (!quota) {
    quota = await EmailQuota.create({ date: today, usage: {} });
  }

  for (let i = 0; i < _accounts.length; i++) {
    const sentCount = quota.usage.get(i.toString()) || 0;
    if (sentCount < ACCOUNT_LIMIT) {
      return i;
    }
  }

  return -1; // All quotas exhausted
};

const sendViaBrevo = async (mailOptions) => {
  try {
    const response = await fetch(brevoConfig.apiUrl, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': brevoConfig.apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: mailOptions.sender || brevoConfig.sender,
        to: Array.isArray(mailOptions.to) ? mailOptions.to : [{ email: mailOptions.to }],
        subject: mailOptions.subject,
        htmlContent: mailOptions.html
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `Brevo API Error: ${response.status}`);
    }
    return { success: true, messageId: data.messageId };
  } catch (error) {
    logger.error('Brevo API Dispatch Failed:', error);
    throw error;
  }
};

/**
 * Log email status to database (Fire and forget)
 */
const writeEmailLog = (logData) => {
  EmailLog.create(logData).catch(err => {
    logger.error('Failed to write email log to database:', err);
  });

  // Increment quota if success
  if (logData.status === 'success') {
    const today = new Date().toISOString().split('T')[0];
    EmailQuota.findOneAndUpdate(
      { date: today },
      { $inc: { [`usage.${logData.accountIndex}`]: 1 }, $set: { lastUpdated: new Date() } },
      { upsert: true }
    ).catch(err => logger.error('Failed to update email quota:', err));
  }
};

/**
 * Diagnostic function to test all configured accounts
 */
export const testConnection = async () => {
  discoverAccounts();
  const results = [];
  
  // Test Brevo API if configured
  if (brevoConfig.apiKey) {
    try {
      // Small dummy request to check key validity (account info endpoint is better but smtp check is fine)
      const resp = await fetch('https://api.brevo.com/v3/account', {
        headers: { 'api-key': brevoConfig.apiKey }
      });
      if (resp.ok) {
        results.push({ index: 'api', user: brevoConfig.sender.email, status: 'connected', type: 'BREVO_API' });
      } else {
        results.push({ index: 'api', user: brevoConfig.sender.email, status: 'error', error: 'Invalid API Key', type: 'BREVO_API' });
      }
    } catch (err) {
      results.push({ index: 'api', user: brevoConfig.sender.email, status: 'error', error: err.message, type: 'BREVO_API' });
    }
  }

  for (let i = 0; i < _accounts.length; i++) {
    const transporter = getTransporter(i);
    try {
      await transporter.verify();
      results.push({ index: i, user: _accounts[i].user, status: 'connected' });
    } catch (err) {
      results.push({ index: i, user: _accounts[i].user, status: 'error', error: err.message });
    }
  }
  
  return results;
};

export const sendCredentialEmail = async (to, name, identifier, password, role) => {
  if (role === 'student' && !process.env.ENABLE_STUDENT_EMAILS) return true;
  
  const loginUrl = process.env.FRONTEND_URL || 'https://no-dues-psi.vercel.app/';
  const subject = `Your Credentials for ${role === 'student' ? 'Student Portal' : 'Faculty Portal'} - NDS`;
  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
      <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">Welcome to No-Due System (NDS)</h2>
      <p>Hello <strong>${name}</strong>,</p>
      <p>Your account has been created on the No-Due Clearance System. Please use the following credentials to log in:</p>
      
      <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>${role === 'student' ? 'Roll Number' : 'Email'}:</strong> ${identifier}</p>
        <p style="margin: 5px 0;"><strong>Temporary Password:</strong> ${password}</p>
      </div>
      
      <p>You can access the portal here: <a href="${loginUrl}" style="color: #3498db;">${loginUrl}</a></p>
      
      <p style="background-color: #fff3cd; color: #856404; padding: 10px; border-radius: 5px; border-left: 5px solid #ffeeba;">
        <strong>Note:</strong> You will be required to change your password upon your first login for security reasons.
      </p>
      
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 12px; color: #7f8c8d;">This is an automated message. Please do not reply to this email.</p>
    </div>
  `;

  // --- Method 1: Brevo API (Preferred for Production/Render) ---
  if (brevoConfig.apiKey) {
    try {
      await sendViaBrevo({ to, subject, html });
      
      writeEmailLog({
        recipient: to,
        subject,
        role: role || 'system',
        status: 'success',
        accountIndex: -1, // -1 denotes API delivery
        triggeredBy: 'SYSTEM'
      });
      return true;
    } catch (error) {
      logger.error(`Brevo API fallback in effect for ${to}. Error: ${error.message}`);
      // Fall through to SMTP if API fails
    }
  }

  // --- Method 2: SMTP Rotation (Fallback for Local/Legacy) ---
  const accountIndex = await selectAccountIndex();
  if (accountIndex === -1) {
    logger.error('Email aborted: Daily quota exhausted across all accounts.');
    return false;
  }

  const acc = _accounts[accountIndex];
  const transporter = getTransporter(accountIndex);

  try {
    const mailOptions = { from: acc.from, to, subject, html };
    await transporter.sendMail(mailOptions);
    
    writeEmailLog({
      recipient: to,
      subject,
      role: role || 'system',
      status: 'success',
      accountIndex,
      triggeredBy: 'SYSTEM'
    });

    return true;
  } catch (error) {
    logger.error(`Failed to send email to ${to} using SMTP Account ${accountIndex + 1}:`, error);
    
    writeEmailLog({
      recipient: to,
      subject,
      role: role || 'system',
      status: 'failure',
      accountIndex,
      error: {
        message: error.message,
        code: error.code,
        stack: error.stack
      }
    });

    return false;
  }
};
