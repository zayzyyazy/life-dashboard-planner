import { Router } from "express";
import { generateDailyBrief, getTodayBrief, markBriefSent } from "../services/brief.js";
import { sendEmail } from "../services/email.js";

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
    await sendEmail({
      subject: `Daily Brief — ${new Date().toLocaleDateString()}`,
      text: content,
      html: content.replace(/\n/g, "<br>"),
    });
    markBriefSent();
    res.json({ sent: true, content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to send brief" });
  }
});
