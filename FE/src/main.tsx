import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
// After a new deploy the old lazy chunks are gone; reload once to pick up the new index.html.
window.addEventListener("vite:preloadError", (event) => {
  const key = "scms:chunk-reload";
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, "1");
  event.preventDefault();
  window.location.reload();
});
window.addEventListener("load", () => setTimeout(() => sessionStorage.removeItem("scms:chunk-reload"), 10000));
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
import "./shared/detail.css";
