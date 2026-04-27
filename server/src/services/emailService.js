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

const selectBrevoAccountIndex = async () => {
  if (brevoConfig.accounts.length === 0) return -1;

  try {
    const today = new Date().toISOString().split('T')[0];
    const quota = await EmailQuota.findOneAndUpdate(
      { date: today },
      { $setOnInsert: { usage: {} } },
      { upsert: true, new: true, lean: true }
    );
    
    if (!quota) return 0; // Fallback to first account if something is weird

    for (let i = 0; i < brevoConfig.accounts.length; i++) {
      const accountId = (-(i + 1)).toString();
      const sentCount = (quota.usage && quota.usage[accountId]) || 0;
      if (sentCount < ACCOUNT_LIMIT) {
        return i;
      }
    }
  } catch (err) {
    logger.error('selectBrevoAccountIndex failed (DB issue):', err);
    return 0; // Default to first account if DB fails
  }

  return -1;
};

const selectAccountIndex = async () => {
  if (_accounts.length === 0) discoverAccounts();
  if (_accounts.length === 0) return -1;

  try {
    const today = new Date().toISOString().split('T')[0];
    const quota = await EmailQuota.findOneAndUpdate(
      { date: today },
      { $setOnInsert: { usage: {} } },
      { upsert: true, new: true, lean: true }
    );
    
    if (!quota) return 0;

    for (let i = 0; i < _accounts.length; i++) {
      const sentCount = (quota.usage && quota.usage[i.toString()]) || 0;
      if (sentCount < ACCOUNT_LIMIT) {
        return i;
      }
    }
  } catch (err) {
    logger.error('selectAccountIndex failed (DB issue):', err);
    return 0;
  }

  return -1; 
};

const sendViaBrevo = async (mailOptions, accountIndex = 0) => {
  const account = brevoConfig.accounts[accountIndex];
  if (!account) throw new Error(`No Brevo API configuration found for account index ${accountIndex}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(brevoConfig.apiUrl, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': account.apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: mailOptions.sender || account.sender,
        to: Array.isArray(mailOptions.to) ? mailOptions.to : [{ email: mailOptions.to }],
        subject: mailOptions.subject,
        htmlContent: mailOptions.html
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `Brevo API Error: ${response.status}`);
    }
    return { success: true, messageId: data.messageId };
  } catch (error) {
    logger.error(`Brevo API Dispatch Failed for account ${accountIndex + 1}:`, error);
    throw error;
  }
};

const writeEmailLog = (logData) => {
  EmailLog.create(logData).catch(err => {
    logger.error('Failed to write email log to database:', err);
  });

  if (logData.status === 'success') {
    const today = new Date().toISOString().split('T')[0];
    EmailQuota.findOneAndUpdate(
      { date: today },
      { $inc: { [`usage.${logData.accountIndex}`]: 1 }, $set: { lastUpdated: new Date() } },
      { upsert: true }
    ).catch(err => logger.error('Failed to update email quota:', err));
  }
};

export const testConnection = async () => {
  discoverAccounts();
  const results = [];
  
  for (let i = 0; i < brevoConfig.accounts.length; i++) {
    const account = brevoConfig.accounts[i];
    try {
      const resp = await fetch('https://api.brevo.com/v3/account', {
        headers: { 'api-key': account.apiKey }
      });
      const data = await resp.json();
      if (resp.ok) {
        results.push({ 
          index: `brevo_${i + 1}`, 
          user: data.email || account.sender.email, 
          status: 'connected', 
          type: 'BREVO_API',
          plan: data.plan
        });
      } else {
        results.push({ index: `brevo_${i + 1}`, user: account.sender.email, status: 'error', error: data.message || 'Invalid API Key', type: 'BREVO_API' });
      }
    } catch (err) {
      results.push({ index: `brevo_${i + 1}`, user: account.sender.email, status: 'error', error: err.message, type: 'BREVO_API' });
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

export const sendMail = async ({ to, subject, html, role = 'system', triggeredBy = 'SYSTEM' }) => {
  // --- Method 1: Brevo API (Preferred) ---
  const brevoIdx = await selectBrevoAccountIndex();
  if (brevoIdx !== -1) {
    try {
      await sendViaBrevo({ to, subject, html }, brevoIdx);
      
      writeEmailLog({
        recipient: Array.isArray(to) ? to.map(t => t.email || t).join(', ') : to,
        subject,
        role,
        status: 'success',
        accountIndex: -(brevoIdx + 1),
        triggeredBy
      });
      return true;
    } catch (error) {
      logger.error(`Brevo API failed for account ${brevoIdx + 1}. Error: ${error.message}`);
    }
  } else if (brevoConfig.accounts.length > 0) {
    logger.warn(`Daily quota exhausted for all ${brevoConfig.accounts.length} Brevo accounts. Falling back to SMTP.`);
  }

  // --- Method 2: SMTP Fallback ---
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
      recipient: Array.isArray(to) ? to.join(', ') : to,
      subject,
      role,
      status: 'success',
      accountIndex,
      triggeredBy
    });

    return true;
  } catch (error) {
    logger.error(`Failed to send email to ${to} using SMTP Account ${accountIndex + 1}:`, error);
    
    writeEmailLog({
      recipient: Array.isArray(to) ? to.join(', ') : to,
      subject,
      role,
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

export const sendFeedbackEmail = async (feedbackData, user) => {
  const adminEmail = process.env.ADMIN_EMAIL || 'chandrakant@nodues.com';
  const { rating, category, description, page, userAgent } = feedbackData;
  
  const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
  const ratingColors = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e'];
  const ratingColor = ratingColors[rating - 1] || '#2563eb';

  const subject = `[Feedback ${rating}/5] ${category.toUpperCase()} - From ${user.name}`;
  const html = `
    <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; color: #1f2937;">
      <div style="background: #2563eb; padding: 24px; color: white;">
        <h2 style="margin: 0; font-size: 20px; font-weight: 600;">New Feedback Received</h2>
        <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 14px;">Submitted via No-Due Portal</p>
      </div>
      
      <div style="padding: 24px; background: white;">
        <div style="display: flex; align-items: center; margin-bottom: 24px;">
          <div style="font-size: 24px; color: ${ratingColor}; margin-right: 12px; letter-spacing: 2px;">
            ${stars}
          </div>
          <span style="background: #f3f4f6; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #4b5563;">
            ${category.replace('_', ' ')}
          </span>
        </div>

        <div style="background: #f9fafb; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb; margin-bottom: 24px;">
          <p style="margin: 0; line-height: 1.6; font-size: 15px; white-space: pre-wrap;">${description}</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; width: 120px;">Submitted By</td>
            <td style="padding: 8px 0; font-weight: 500;">${user.name}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Role</td>
            <td style="padding: 8px 0; font-weight: 500; text-transform: capitalize;">${user.role}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Identifier</td>
            <td style="padding: 8px 0; font-weight: 500;">${user.rollNo || user.email}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Page</td>
            <td style="padding: 8px 0; font-weight: 500;">${page}</td>
          </tr>
        </table>
      </div>

      <div style="padding: 16px 24px; background: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af;">
        <p style="margin: 0;">User Agent: ${userAgent || 'Unknown'}</p>
        <p style="margin: 4px 0 0 0;">Timestamp: ${new Date().toLocaleString()}</p>
      </div>
    </div>
  `;

  return sendMail({
    to: adminEmail,
    subject,
    html,
    role: 'admin',
    triggeredBy: (user._id || user.userId || 'anonymous').toString()
  });
};

export const sendCredentialEmail = async (to, name, identifier, password, role) => {
  if (role === 'student' && !process.env.ENABLE_STUDENT_EMAILS) return true;
  
  const loginUrl = process.env.FRONTEND_URL || 'https://nodues-arcclub.tech';
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

  return sendMail({ to, subject, html, role });
};
