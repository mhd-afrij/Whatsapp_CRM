export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message ?? `API error ${status}`);
    this.status = status;
    this.body = body;
  }
}
