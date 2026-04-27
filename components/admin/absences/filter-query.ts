export function buildAbsenceFilterSearchParams(
  current: URLSearchParams,
  key: string,
  value: string,
): URLSearchParams {
  const params = new URLSearchParams(current.toString());

  // Keep explicit status=ALL so the page does not fall back to OPEN.
  if (key === "status" && value === "ALL") {
    params.set(key, value);
    return params;
  }

  if (value === "ALL" || value === "") {
    params.delete(key);
  } else {
    params.set(key, value);
  }

  return params;
}
