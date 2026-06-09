import { useEffect } from "react";
import { AppShell } from "./components/layout/AppShell";
import { AppProvider } from "./store/AppContext";

function AppBootProbe() {
  useEffect(() => {
    // #region agent log
    fetch("http://127.0.0.1:7669/ingest/3b256d4b-6996-4a4c-ac88-be9f62070b3a", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "21cca4" },
      body: JSON.stringify({
        sessionId: "21cca4",
        hypothesisId: "BUILD",
        location: "App.tsx:boot",
        message: "app boot",
        data: { buildStamp: __APP_BUILD_STAMP__, features: "day-assistant,palette-delete,full-view" },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, []);
  return null;
}

export default function App() {
  return (
    <AppProvider>
      <AppBootProbe />
      <AppShell />
    </AppProvider>
  );
}
