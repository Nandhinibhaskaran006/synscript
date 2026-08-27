const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  // Create transporter using SMTP settings from environment variables
  // Fallbacks provided for local testing / Ethereal SMTP if env is missing
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  });

  const message = {
    from: `${process.env.FROM_NAME || 'SYNCSCRIPT Support'} <${process.env.FROM_EMAIL || 'no-reply@syncscript.com'}>`,
    to: options.email,
    subject: options.subject,
    html: options.html,
  };

  const info = await transporter.sendMail(message);
  console.log('Email sent successfully: %s', info.messageId);
  return info;
};

module.exports = sendEmail;
