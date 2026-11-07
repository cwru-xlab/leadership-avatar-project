// `/interview` permanently redirects to `/practice/interviews` (next.config.js);
// this file only keeps the legacy segment from 404ing if the redirect is removed.
export { default } from "@/app/practice/interviews/page";
