function toUser(row) {
  if (!row) return null;
  return {
    id: row.id, email: row.email, passwordHash: row.password_hash,
    role: row.role, createdAt: row.created_at.toISOString(),
  };
}

export function createUsersRepository(db) {
  return {
    async findByEmail(email) {
      return toUser(await db('users').where({ email }).first());
    },
    async create({ email, passwordHash, role }) {
      const [row] = await db('users').insert({ email, password_hash: passwordHash, role }).returning('*');
      return toUser(row);
    },
  };
}
