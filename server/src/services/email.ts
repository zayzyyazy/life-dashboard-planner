import { config } from "../config.js";

export interface SendEmailOptions {
  to?: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const to = options.to ?? config.email.to;
  if (!to) {
    throw new Error("EMAIL_TO is not configured");
  }
  if (!config.email.from) {
    throw new Error("EMAIL_FROM is not configured");
  }

  if (config.email.provider === "resend") {
    await sendViaResend({ ...options, to });
    return;
  }
  await sendViaSmtp({ ...options, to });
}

async function sendViaResend(options: SendEmailOptions & { to: string }) {
  if (!config.email.resendApiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.email.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.email.from,
      to: [options.to],
      subject: options.subject,
      text: options.text,
      html: options.html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error: ${res.status} ${body}`);
  }
}

async function sendViaSmtp(options: SendEmailOptions & { to: string }) {
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: config.email.smtp.host,
    port: config.email.smtp.port,
    secure: config.email.smtp.port === 465,
    auth: config.email.smtp.user
      ? { user: config.email.smtp.user, pass: config.email.smtp.pass }
      : undefined,
  });

  await transporter.sendMail({
    from: config.email.from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });
}
