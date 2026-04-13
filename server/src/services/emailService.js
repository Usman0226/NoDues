import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';

let _transporter = null;

const getTransporter = () => {
  if (!_transporter) {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      logger.error('SMTP configuration missing. Emails cannot be sent.');
      return null;
    }
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: parseInt(process.env.SMTP_PORT) === 465, // Use SSL for 465, STARTTLS for others
      pool: true, 
      maxConnections: 5,
      maxMessages: 100,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      connectionTimeout: 10000,
      greetingTimeout: 5000,
      socketTimeout: 30000,
      tls: {
        rejectUnauthorized: false
      }
    });
    
    _transporter.verify((error) => {
      if (error) {
        logger.error('SMTP Transporter verification failed:', error);
      } else {
        logger.info('SMTP Transporter ready for messages');
      }
    });
  }
  return _transporter;
};

export const sendCredentialEmail = async (to, name, identifier, password, role) => {
  try {
    if (role === 'student' && !process.env.ENABLE_STUDENT_EMAILS) return true;
    const loginUrl = 'https://no-dues-psi.vercel.app/';
    
    const mailOptions = {
      from: process.env.SMTP_FROM || 'No-Due Portal Dept. Of Data Science <projects.clg.mits@gmail.com>',
      to,
      subject: `Your Credentials for ${role === 'student' ? 'Student Portal' : 'Faculty Portal'} - NDS`,
      html: `
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
      `
    };

    const transporter = getTransporter();
    if (!transporter) {
      logger.error('Unable to send email: Transporter not initialized');
      return false;
    }
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Email sent to ${to}: ${info.messageId}`, {
      actor: 'SYSTEM',
      action: 'EMAIL_SEND',
      resource_id: identifier
    });
    return true;
  } catch (error) {
    logger.error('Failed to send email:', error);
    return false;
  }
};
