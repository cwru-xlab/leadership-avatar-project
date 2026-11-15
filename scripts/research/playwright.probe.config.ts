import base from "../../playwright.config";
import { defineConfig } from "@playwright/test";

/** Runs the research screenshot specs in this folder (the root config only sees ./e2e). */
export default defineConfig({ ...base, testDir: ".", testMatch: /.*-shots\.spec\.ts$/ });
