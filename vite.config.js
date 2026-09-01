import { defineConfig } from "vite";

export default defineConfig({
  base: "/coimbatore-3d-property-map/",
  build: {
    target: ["es2020", "safari15"],
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  }
});
