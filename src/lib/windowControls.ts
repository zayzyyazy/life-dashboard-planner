import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";

const NORMAL_SIZE = { width: 1200, height: 800 };
const MINI_SIZE = { width: 380, height: 560 };

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function toggleAlwaysOnTop(value: boolean): Promise<void> {
  if (!isTauriRuntime()) {
    console.warn("[windowControls] Always-on-top skipped (browser mode)");
    return;
  }
  try {
    await getCurrentWindow().setAlwaysOnTop(value);
  } catch (err) {
    console.warn("[windowControls] setAlwaysOnTop failed:", err);
  }
}

export async function enterMiniMode(): Promise<void> {
  if (!isTauriRuntime()) {
    console.warn("[windowControls] Mini window resize skipped (browser mode)");
    return;
  }
  try {
    const win = getCurrentWindow();
    await win.setAlwaysOnTop(true);
    await win.setSize(new LogicalSize(MINI_SIZE.width, MINI_SIZE.height));
    await win.setResizable(true);

    const monitor = await currentMonitor();
    if (monitor) {
      const { position, size } = monitor.workArea;
      const x = position.x + size.width - MINI_SIZE.width - 16;
      const y = position.y + 16;
      await win.setPosition(new LogicalPosition(x, y));
    }
  } catch (err) {
    console.warn("[windowControls] enterMiniMode failed:", err);
  }
}

export async function exitMiniMode(): Promise<void> {
  if (!isTauriRuntime()) {
    console.warn("[windowControls] Normal window restore skipped (browser mode)");
    return;
  }
  try {
    const win = getCurrentWindow();
    await win.setAlwaysOnTop(false);
    await win.setSize(new LogicalSize(NORMAL_SIZE.width, NORMAL_SIZE.height));
    await win.setResizable(true);
    await win.center();
  } catch (err) {
    console.warn("[windowControls] exitMiniMode failed:", err);
  }
}
