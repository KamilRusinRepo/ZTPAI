export function toUserResponse(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: new Date(user.createdAt).toISOString(),
  };
}
