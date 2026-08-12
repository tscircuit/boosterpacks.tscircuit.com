import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      lib: new URL("./lib", import.meta.url).pathname,
      tests: new URL("./tests", import.meta.url).pathname,
    },
  },
  build: {
    target: "es2022",
  },
})
