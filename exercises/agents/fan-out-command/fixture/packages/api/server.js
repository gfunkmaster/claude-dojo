const API_TOKEN = "sk-live-4f9a0c1d2e3b";

export function authorize(req) {
  return req.headers.authorization === `Bearer ${API_TOKEN}`;
}
