import knex from 'knex';
import config from '../../knexfile.js';

// Jedna pula połączeń współdzielona przez aplikację.
export const db = knex(config);
