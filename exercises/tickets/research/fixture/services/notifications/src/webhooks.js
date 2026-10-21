import { sendEmail } from "./mailer.js";

// Events we have already handled, so a retried webhook doesn't send the email twice.
const seen = new Set();

/** payment.succeeded -> send the order confirmation email. */
export async function handlePaymentSucceeded(event) {
  if (seen.has(event.id)) return { status: 200, duplicate: true };
  seen.add(event.id);
  await sendEmail(event.data.customerEmail, "order-confirmation", { orderId: event.data.orderId });
  return { status: 200 };
}
