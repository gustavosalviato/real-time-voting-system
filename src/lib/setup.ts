import { sql } from "./postgres";

async function setup() {
  await sql`
   CREATE TABLE IF NOT EXISTS polls (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   )
    `;

  await sql`
    CREATE TABLE IF NOT EXISTS poll_options (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      poll_id TEXT NOT NULL
    ); 
    `;

  await sql`
  CREATE TABLE IF NOT EXISTS vote (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    poll_id TEXT NOT NULL,
    poll_option_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`;

  await sql`
  ALTER TABLE poll_options ADD CONSTRAINT poll_id_fk FOREIGN KEY (poll_id) REFERENCES polls (id);
`;

  await sql`
  ALTER TABLE vote ADD CONSTRAINT vote_poll_id_fk FOREIGN KEY (poll_id) REFERENCES polls (id);
  `;

  await sql`
  ALTER TABLE vote ADD CONSTRAINT vote_poll_option_id_fk FOREIGN KEY (poll_option_id) REFERENCES poll_options (id);
`;

  await sql.end();
}

console.log("setup finished!");

setup();
