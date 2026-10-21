export async function renderInvoicePdf(invoice) {
  return `invoices/${invoice.id}.pdf`;
}
