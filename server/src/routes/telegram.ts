import { Router } from "express";
import { getTelegramStatus } from "../telegram/bot.js";

export const telegramRouter = Router();

telegramRouter.get("/status", (_req, res) => {
  res.json(getTelegramStatus());
});
