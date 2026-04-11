import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';

/**
 * Production-grade Email Service using SMTP (Brevo)
 */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
  port: process.env.SMTP_PORT || 587,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

/**
 * Send credential email to new users
 */
export const sendCredentialEmail = async (to, name, identifier, password, role) => {
  try {
    const loginUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    
    const mailOptions = {
      from: `No-Due Portal <${process.env.SMTP_FROM || 'noreply@mits.ac.in'}>`,
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
