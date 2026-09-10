/* Express 4 does not catch a rejected promise thrown inside an async
   route handler — it becomes an unhandled rejection, which (Node 15+)
   crashes the whole process instead of reaching the error middleware
   in index.js. Every async handler must be wrapped in this so a
   Mongoose/DB error becomes a clean JSON 500 instead of taking the
   server down mid-request. */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
