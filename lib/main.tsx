import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "lib/app"
import "lib/styles.css"

const root = document.getElementById("root")

if (!root) throw new Error("Missing #root element")

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
