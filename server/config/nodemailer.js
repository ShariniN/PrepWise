import nodemailer from 'nodemailer';

// Outside production, emails are NOT sent unless MAIL_IN_DEV=true. Demo and test data use made-up
// addresses (some on real mail domains), so a development server must never mail real inboxes by
// accident. Suppressed emails are logged to the console instead (that is how you read an OTP locally).
export const createGuardedTransport = (real, { env = process.env, log = console.log } = {}) => ({
  sendMail: async (message) => {
    const production = env.NODE_ENV === 'production';
    if (!production && env.MAIL_IN_DEV !== 'true') {
      const text = String(message.html || message.text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      log(`[mail suppressed: not production] to=${message.to} subject="${message.subject}" body="${text.slice(0, 300)}"`);
      return { suppressed: true, messageId: null };
    }
    return real.sendMail(message);
  },
});

const realTransport = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const transporter = createGuardedTransport(realTransport);

export default transporter;
