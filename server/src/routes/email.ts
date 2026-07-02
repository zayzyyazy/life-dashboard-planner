import { Router } from "express";
import { sendEmail } from "../services/email.js";

export const emailRouter = Router();

emailRouter.post("/send-test", async (req, res) => {
  try {
    const { to, subject, message } = req.body as {
      to?: string;
      subject?: string;
      message?: string;
    };
    await sendEmail({
      to,
      subject: subject ?? "Life Planner Agent — Test Email",
      text: message ?? "Your Life Planner Agent email is working.",
      html: `<p>${message ?? "Your Life Planner Agent email is working."}</p>`,
    });
    res.json({ sent: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Email failed" });
  }
});
