import { toUserResponse } from './users.mapper.js';

export function createAuthController(service) {
  return {
    async register(req, res) {
      const user = await service.register(req.validated.body);
      return res.status(201).json(toUserResponse(user));
    },
  };
}
