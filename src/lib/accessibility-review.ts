/** Enabled only on the isolated, credential-free accessibility review service. */
export function accessibilityReviewEnabled() {
  return process.env.ACCESSIBILITY_REVIEW_ONLY === "1";
}

export function accessibilityReviewAvailable() {
  return process.env.NODE_ENV === "development" || accessibilityReviewEnabled();
}
