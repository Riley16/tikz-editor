import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { setActiveEditorPlatform } from "@tikz-editor/app/platform/current";
import { installAgentScreenshotHandler } from "./agent-screenshot";
import { createDesktopPlatformAdapter } from "./platform/desktop-platform";

async function bootstrap() {
  setActiveEditorPlatform(createDesktopPlatformAdapter());
  const { App } = await import("@tikz-editor/app");
  // Fire-and-forget: agent screenshot handler is a debug feature; failure
  // to install should not prevent the app from starting.
  void installAgentScreenshotHandler().catch((error) => {
    console.warn("[agent-screenshot] handler install failed:", error);
  });

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

void bootstrap();
