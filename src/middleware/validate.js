import { ValidationError } from '../errors/AppError.js';

export function validate(schemas) {
  return (req, res, next) => {
    const validated = {};
    const details = [];

    for (const location of ['params', 'query', 'body']) {
      if (!schemas[location]) continue;
      const result = schemas[location].safeParse(req[location] ?? {});
      if (result.success) {
        validated[location] = result.data;
      } else {
        for (const issue of result.error.issues) {
          // Zod grupuje nieznane klucze; każdy dostaje własny wpis w odpowiedzi.
          const fields = issue.code === 'unrecognized_keys' ? issue.keys : [issue.path.join('.')];
          for (const field of fields) {
            details.push({ location, field, message: issue.message });
          }
        }
      }
    }

    if (details.length) return next(new ValidationError(details));
    req.validated = validated;
    return next();
  };
}
