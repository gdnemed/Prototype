module.exports = {

  test: {
    client: 'sqlite3',
    useNullAsDefault: true,
    connection: {filename: './db/coro_test.db'},
    migrations: {directory: './db/migrations'},
    seeds: {directory: './db/seeds/test'}
  },

  development: {
    client: 'sqlite3',
    useNullAsDefault: true,
    connection: {filename: './db/coro_develop_2.db'},
    migrations: {directory: './db/migrations'},
    seeds: {directory: './db/seeds/development'}
  }
}
