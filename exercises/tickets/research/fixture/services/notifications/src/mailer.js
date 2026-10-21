export async function sendEmail(to, template, data) {
  return { to, template, data, queued: true };
}
