import { Router } from "express";
import { config } from "../config.js";
import { generateDailyBrief, getTodayBrief, markBriefSent } from "../services/brief.js";
import { sendEmail } from "../services/email.js";
import { notifyTelegramUsers } from "../telegram/notify.js";

export const briefRouter = Router();

briefRouter.get("/today", async (_req, res) => {
  try {
    let content = getTodayBrief();
    if (!content) {
      content = await generateDailyBrief();
    }
    res.json({ date: new Date().toISOString().slice(0, 10), content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Brief generation failed" });
  }
});

briefRouter.post("/send-daily", async (_req, res) => {
  try {
    const content = await generateDailyBrief();
    const subject = `Daily Brief — ${new Date().toLocaleDateString()}`;
    if (config.email.to) {
      await sendEmail({
        subject,
        text: content,
        html: content.replace(/\n/g, "<br>"),
      });
    }
    const preview = content.length > 3500 ? content.slice(0, 3497) + "…" : content;
    await notifyTelegramUsers(`📋 ${subject}\n\n${preview}`);
    markBriefSent();
    res.json({ sent: true, content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to send brief" });
  }
});
