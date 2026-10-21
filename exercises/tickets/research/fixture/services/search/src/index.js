/** Product search. Listens to product.updated only; it has no payment handlers. */
export async function handleProductUpdated(event, index) {
  await index.upsert(event.data.productId, event.data);
  return { status: 200 };
}
