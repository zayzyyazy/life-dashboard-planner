import { Router } from "express";
import {
  addKnowledge,
  deleteKnowledge,
  getProfile,
  listKnowledge,
  updateProfile,
} from "../services/profile.js";
import { isLifeDomain } from "../types/domains.js";

export const profileRouter = Router();

profileRouter.get("/profile", (_req, res) => {
  res.json({
    profile: getProfile(),
    knowledge: listKnowledge(),
  });
});

profileRouter.put("/profile", (req, res) => {
  const body = req.body as Record<string, string | undefined>;
  const profile = updateProfile({
    name: body.name,
    summary: body.summary,
    personal_work_context: body.personal_work_context,
    university_context: body.university_context,
    personal_life_context: body.personal_life_context,
    preferences: body.preferences,
  });
  res.json({ profile });
});

profileRouter.get("/knowledge", (req, res) => {
  const domain = req.query.domain as string | undefined;
  if (domain && !isLifeDomain(domain)) {
    res.status(400).json({ error: "Invalid domain" });
    return;
  }
  res.json(listKnowledge(domain as import("../types/domains.js").LifeDomain | undefined));
});

profileRouter.post("/knowledge", (req, res) => {
  const { domain, title, content } = req.body as {
    domain?: string;
    title?: string;
    content?: string;
  };
  if (!domain || !isLifeDomain(domain) || !title?.trim() || !content?.trim()) {
    res.status(400).json({ error: "domain, title, and content are required" });
    return;
  }
  const entry = addKnowledge({
    domain,
    title: title.trim(),
    content: content.trim(),
    source: "dashboard",
  });
  res.json(entry);
});

profileRouter.delete("/knowledge/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!deleteKnowledge(id)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ deleted: true });
});
