export function createUsersRepository() {
  const users = new Map();
  let nextId = 1;
  return {
    async findByEmail(email) {
      return structuredClone(users.get(email) ?? null);
    },
    async create({ email, passwordHash, role }) {
      if (users.has(email)) {
        const error = new Error('Duplicate email');
        error.code = '23505';
        error.constraint = 'users_email_unique';
        throw error;
      }
      const user = { id: nextId++, email, passwordHash, role, createdAt: new Date().toISOString() };
      users.set(email, user);
      return structuredClone(user);
    },
  };
}
