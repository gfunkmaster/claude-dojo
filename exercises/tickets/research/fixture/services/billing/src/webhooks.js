import { prisma } from "./db.js";
import { renderInvoicePdf } from "./pdf.js";

/** payment.succeeded -> create an invoice and store its PDF. */
export async function handlePaymentSucceeded(event) {
  const { orderId, amountOre } = event.data;
  const invoice = await prisma.invoice.create({ data: { orderId, amountOre } });
  await renderInvoicePdf(invoice);
  return { status: 200, invoiceId: invoice.id };
}

/** payment.refunded -> credit the latest invoice for the order. */
export async function handlePaymentRefunded(event) {
  const invoice = await prisma.invoice.findFirst({ where: { orderId: event.data.orderId }, orderBy: { createdAt: "desc" } });
  if (!invoice) return { status: 200, ignored: true };
  await prisma.invoice.create({ data: { orderId: invoice.orderId, amountOre: -invoice.amountOre } });
  return { status: 200 };
}
