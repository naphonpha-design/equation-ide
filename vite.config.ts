import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // Monaco is inherently large and is loaded lazily after first paint.
    chunkSizeWarningLimit: 4000,
  },
  test: {
    globals: true,
    environment: "node",
  },
});
