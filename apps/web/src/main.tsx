import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { applyTheme } from "./lib/theme";

applyTheme();

// Dev-only UI fixtures: the branch is dropped from production builds.
const Mock = import.meta.env.DEV ? lazy(() => import("./mock/Mock").then((m) => ({ default: m.Mock }))) : null;
const mock = Mock ? new URLSearchParams(location.search).get("mock") : null;

const root = document.getElementById("root");
if (!root) throw new Error("root element missing");

createRoot(root).render(
  <StrictMode>
    {Mock && mock ? (
      <Suspense>
        <Mock variant={mock} />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
