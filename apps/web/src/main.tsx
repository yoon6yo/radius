import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { applyTheme } from "./lib/theme";
import { DirMock } from "./mock/DirMock";

applyTheme();

const dir = new URLSearchParams(location.search).get("dir");

const root = document.getElementById("root");
if (!root) throw new Error("root element missing");

createRoot(root).render(
  <StrictMode>
    {dir ? <DirMock dir={dir} /> : <App />}
  </StrictMode>,
);
