// Usage (run on the server, once per library):  npm run create-owner
const readline = require('readline');
const { pool, query, withTransaction } = require('../db');
const auth = require('../services/auth');
const { recordAudit } = require('../services/audit');

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

// Asks for both passwords in one input session, showing * for each character.
// Using one session avoids losing keystrokes between the two prompts.
function askPasswords() {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      return reject(new Error('Run this command in a normal terminal window'));
    }
    const stdin = process.stdin;
    const labels = [
      'Owner password (at least 10 characters, typing is hidden): ',
      'Repeat password: ',
    ];
    const answers = [];
    let value = '';
    process.stdout.write(labels[0]);

    const finish = () => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };

    const onData = (chunk) => {
      for (const ch of chunk.toString('utf8')) {
        if (ch === '\n') continue; // ignore the second half of Enter on Windows
        if (ch === '\r') {
          answers.push(value);
          value = '';
          process.stdout.write('\n');
          if (answers.length === 2) {
            finish();
            return resolve(answers);
          }
          process.stdout.write(labels[1]);
        } else if (ch === '\u0003') { // Ctrl + C
          finish();
          process.stdout.write('\n');
          return reject(new Error('Cancelled'));
        } else if (ch === '\u007f' || ch === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else {
          value += ch;
          process.stdout.write('*');
        }
      }
    };

    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let library;
  let fullName;
  let email;

  try {
    const slug = String(await ask(rl, 'Library slug (lowercase, e.g. test-library): ')).trim().toLowerCase();
    if (!/^[a-z0-9-]{3,80}$/.test(slug)) {
      throw new Error('Slug must be 3-80 characters: lowercase letters, numbers, or hyphens');
    }

    library = (await query('SELECT library_id, name FROM libraries WHERE slug = $1', [slug])).rows[0];

    if (!library) {
      const name = String(await ask(rl, 'This library is new. Enter its full name: ')).trim();
      if (!name) throw new Error('Library name is required');

      library = await withTransaction(async (q) => {
        const created = await q(
          'INSERT INTO libraries (name, slug) VALUES ($1, $2) RETURNING library_id, name',
          [name, slug]
        );
        await q('INSERT INTO fine_rules (library_id) VALUES ($1)', [created.rows[0].library_id]);
        return created.rows[0];
      });
      console.log(`Created library "${library.name}".`);
    } else {
      console.log(`Found library "${library.name}".`);
    }

    const owners = await query("SELECT 1 FROM users WHERE library_id = $1 AND role = 'owner'", [library.library_id]);
    if (owners.rows.length > 0) {
      throw new Error(`"${library.name}" already has an owner. Only one owner is allowed per library.`);
    }

    fullName = String(await ask(rl, 'Owner full name: ')).trim();
    email = auth.normalizeEmail(await ask(rl, 'Owner email: '));
    if (!fullName) throw new Error('Name is required');
    if (!auth.isValidEmail(email)) throw new Error('Email is not valid');

    const taken = await query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (taken.rows.length > 0) throw new Error('That email already has an account');
  } finally {
    rl.close();
  }

    const [password, repeat] = await askPasswords();
  if (password !== repeat) throw new Error('Passwords do not match');
  auth.validatePassword(password);

  const passwordHash = await auth.hashPassword(password);

  const owner = await withTransaction(async (q) => {
    const inserted = await q(
      `INSERT INTO users (library_id, full_name, email, password_hash, role, email_verified_at)
       VALUES ($1, $2, $3, $4, 'owner', NOW())
       RETURNING user_id`,
      [library.library_id, fullName, email, passwordHash]
    );
    await recordAudit(q, {
      library_id: library.library_id,
      actor_user_id: null,
      action: 'owner_created',
      entity: 'user',
      entity_id: inserted.rows[0].user_id,
      details: { created_by: 'command_line' },
    });
    return inserted.rows[0];
  });

  console.log(`\nOwner created for "${library.name}" (user_id ${owner.user_id}). You can now log in.`);
}

main()
  .catch((error) => {
    console.error(`\nFailed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());