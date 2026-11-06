/**
 * Client-side helpers shared by the resume and job-posting upload steps.
 *
 * The server is the authority on what a PDF is (it checks the `%PDF-` bytes);
 * these checks only save a round trip and must never reject a file the server
 * would accept.
 */

/** Value for the file input's `accept`: the extension helps pickers that ignore MIME. */
export const PDF_ACCEPT = ".pdf,application/pdf";

/**
 * Safari and Windows browsers can report a real .pdf as
 * `application/octet-stream` or with an empty type, so the name counts too.
 */
export function looksLikePdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/**
 * A specific, student-facing message for a failed upload response. Platform
 * errors (body too large, gateway timeout, expired sign-in) arrive without
 * the route's JSON `error`, so map them by status instead of falling back to
 * a message that blames the file.
 *
 * A signed-out API request is redirected to /login by middleware, and fetch
 * follows that redirect to a 404, so a redirect to /login counts as a 401.
 */
export function uploadFailureMessage(
  response: Pick<Response, "status" | "redirected" | "url"> | null,
  serverError?: string,
): string {
  const status = response?.status ?? 0;
  const toLogin =
    response?.redirected === true && /\/login(?:[?#]|$)/.test(response.url);
  if (status === 401 || toLogin) {
    return "Your sign-in has expired. Sign in again, then upload the PDF.";
  }
  if (status === 413) {
    return "That PDF is too large to upload. Save a smaller copy, for example with Print → Save as PDF, then try again.";
  }
  if (serverError) return serverError;
  if (status === 504 || status === 408) {
    return "Reading that PDF took too long. Try again, or upload a smaller PDF.";
  }
  return "We could not process that PDF. Try again in a moment.";
}
