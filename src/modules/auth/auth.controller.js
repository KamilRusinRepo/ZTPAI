import { toUserResponse } from './users.mapper.js';

export function createAuthController(service) {
  return {
    async login(req, res) {
      return res.json(await service.login(req.validated.body));
    },
    async me(req, res) {
      return res.json(toUserResponse(await service.getCurrentUser(req.user.id)));
    },
    async register(req, res) {
      const user = await service.register(req.validated.body);
      return res.status(201).json(toUserResponse(user));
    },
  };
}
