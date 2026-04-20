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

  const today = new Date().toISOString().split('T')[0];
  let quota = await EmailQuota.findOne({ date: today });
  
  if (!quota) {
    quota = await EmailQuota.create({ date: today, usage: {} });
  }

  for (let i = 0; i < brevoConfig.accounts.length; i++) {
    // Brevo accounts are stored as -1, -2, -3... in usage map
    const accountId = (-(i + 1)).toString();
    const sentCount = quota.usage.get(accountId) || 0;
    if (sentCount < ACCOUNT_LIMIT) {
      return i; // Returns 0-based index for accounts array
    }
  }

  return -1;
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

  return -1; 
};

const sendViaBrevo = async (mailOptions, accountIndex = 0) => {
  const account = brevoConfig.accounts[accountIndex];
  if (!account) throw new Error(`No Brevo API configuration found for account index ${accountIndex}`);

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
      })
    });

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
  const { type, description, page, userAgent } = feedbackData;
  
  const subject = `New Feedback: [${type.toUpperCase()}] from ${user.name}`;
  const html = `
    <div style="font-family: sans-serif; padding: 20px; color: #333;">
      <h2 style="color: #2563eb;">New ${type} submitted</h2>
      <p><strong>From:</strong> ${user.name} (${user.role})</p>
      <p><strong>Identifier:</strong> ${user.rollNo || user.email}</p>
      <p><strong>Page:</strong> ${page}</p>
      <p><strong>User Agent:</strong> ${userAgent || 'Unknown'}</p>
      <hr style="border: 1px solid #eee;" />
      <p><strong>Description:</strong></p>
      <div style="background: #f9fafb; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb;">
        ${description.replace(/\n/g, '<br/>')}
      </div>
      <p style="font-size: 12px; color: #6b7280; margin-top: 20px;">
        Submitted at: ${new Date().toLocaleString()}
      </p>
    </div>
  `;

  return sendMail({
    to: adminEmail,
    subject,
    html,
    role: 'admin',
    triggeredBy: user._id.toString()
  });
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

  return sendMail({ to, subject, html, role });
};
