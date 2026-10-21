export class NotFoundError extends Error {
  status = 404;
}

export class ValidationError extends Error {
  status = 400;
}

/** The order is in a state that doesn't allow the operation. */
export class OrderStateError extends Error {
  status = 409;
}
