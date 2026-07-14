const nodemailer = require("nodemailer");

// Create reusable connection pool transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.hostinger.com",
  port: parseInt(process.env.SMTP_PORT) || 465,
  secure: true, // Use TLS directly on port 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  // Hostinger specific cipher fallback handling (fixes connection drop/timeout bugs)
  tls: {
    ciphers: "SSLv3",
    rejectUnauthorized: true
  },
  pool: true, // Reuse SMTP connections for better response latency
  maxConnections: 5,
  maxMessages: 100
});

/**
 * Sends an styled transactional HTML email containing an authorization code.
 * @param {string} toEmail - The recipient user's email address
 * @param {string} otpCode - Generated 6-digit string code
 */
const sendOtpEmail = async (toEmail, otpCode) => {
  const mailOptions = {
    from: `"Ludoovictory Support" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: "Your Security Verification Code",
    text: `Your Ludoovictory verification code is: ${otpCode}. It is valid for 10 minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; border: 1px solid #e2e8f0; padding: 24px; border-radius: 8px;">
        <h2 style="color: #1e293b; margin-bottom: 8px; text-align: center;">Ludoovictory Verification</h2>
        <p style="color: #64748b; font-size: 15px; text-align: center;">Use the security code below to confirm your identity session identity.</p>
        <div style="background-color: #f1f5f9; padding: 14px 24px; font-size: 32px; font-weight: bold; letter-spacing: 6px; text-align: center; color: #4f46e5; border-radius: 6px; margin: 20px 0;">
          ${otpCode}
        </div>
        <p style="color: #94a3b8; font-size: 12px; text-align: center; line-height: 1.5;">
          This code is active for 10 minutes. <br/>
          If you did not initiate this validation request, you can safely disregard this message.
        </p>
      </div>
    `,
  };

  return await transporter.sendMail(mailOptions);
};

module.exports = { sendOtpEmail };