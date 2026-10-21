import { prisma } from "./db.js";

/**
 * payment.succeeded -> mark the order as paid.
 * The provider retries a webhook until it gets a 2xx, so the same event can arrive more than once.
 */
export async function handlePaymentSucceeded(event) {
  try {
    // ProcessedEvent.eventId is the primary key, so a second insert of the same event fails.
    await prisma.processedEvent.create({ data: { eventId: event.id, service: "checkout" } });
  } catch (err) {
    if (err.code === "P2002") return { status: 200, duplicate: true };
    throw err;
  }
  await prisma.order.update({ where: { id: event.data.orderId }, data: { status: "paid" } });
  return { status: 200 };
}
