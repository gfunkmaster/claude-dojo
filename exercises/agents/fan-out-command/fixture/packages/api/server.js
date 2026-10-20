// Deliberately hardcoded fake token: the audit exercise must find it. Not a real key.
const API_TOKEN = "sk-FAKE-dojo-not-a-real-key";

export function authorize(req) {
  return req.headers.authorization === `Bearer ${API_TOKEN}`;
}
