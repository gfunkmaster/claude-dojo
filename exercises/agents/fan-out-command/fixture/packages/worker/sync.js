const UPSTREAM = "http://billing.internal.example.com/export";

export async function sync() {
  const res = await fetch(UPSTREAM);
  return res.json();
}
