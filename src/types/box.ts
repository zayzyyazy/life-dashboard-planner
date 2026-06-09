export type BoxKind = "work" | "study" | "cleaning" | "gym" | "admin";

export type PaletteItem =
  | { type: "builtin"; kind: BoxKind }
  | { type: "template"; templateId: string };

export type DropPlacement = {
  date: string;
  startTime: string;
};

export type PendingDrop =
  | { type: "work"; placement: DropPlacement }
  | { type: "study"; placement: DropPlacement }
  | { type: "template"; placement: DropPlacement; templateId: string }
  | null;
