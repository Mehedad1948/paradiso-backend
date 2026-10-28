// Seeds sample comment threads on movies already in the catalogue.
//
//   node scripts/seed-movie-comments.cjs            dry run (rolls back)
//   node scripts/seed-movie-comments.cjs --apply    insert missing seed comments
//   node scripts/seed-movie-comments.cjs --remove   delete the seed comments
//
// Authors are looked up by username; movies by TMDb ID, and missing ones are
// skipped. Re-running is safe: a comment with the same author, movie and text
// is not inserted twice. Needs the movie comment replies migration.
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { Client } = require('pg');

const authors = { me: 'Mehrdad', mehro: 'mehro', steve: 'Steve' };

// [tmdbId, author, hoursAgo, text, spoiler, replies: [author, text, spoiler?][]]
const threads = [
  [33273, 'me', 96, 'Cell 211 starts as a prison thriller and turns into a study of how fast a man can change sides. Luis Tosar as Malamadre is terrifying and oddly sympathetic.', false, [
    ['mehro', 'Malamadre is one of the best Spanish film characters of the 2000s. That voice!'],
    ['steve', 'The first ten minutes are so tense. Watched it with no idea what it was about, highly recommend that.'],
  ]],
  [33273, 'steve', 60, 'The ending is brutal. Juan never really had a way out once the guards decided he was expendable.', true, [
    ['me', 'That is what makes it so bleak. The system turns on him faster than the prisoners do.', true],
  ]],
  [25376, 'me', 90, 'The Secret in Their Eyes has that famous single-shot stadium sequence, but what stays with me is the love story that never gets said out loud.', false, [
    ['mehro', 'The stadium shot is still unreal. I rewound it three times.'],
    ['steve', 'Way better than the American remake. Ricardo Darín carries every scene.'],
    ['me', 'Agreed, the remake missed the quiet parts that make the original work.'],
  ]],
  [25376, 'mehro', 40, 'Morales’ choice in the last act changed how I saw the whole film. Justice and revenge are very close in this one.', true, [
    ['me', 'That final reveal at the farm is one of the most chilling endings I know.', true],
  ]],
  [60243, 'me', 80, 'A Separation never tells you who to side with. Every time I rewatch it I end up blaming a different character.', false, [
    ['steve', 'That is exactly it. Everyone is a little bit right and a little bit lying.'],
    ['mehro', 'Farhadi writes dialogue like nobody else. Not one wasted line.'],
  ]],
  [496243, 'steve', 72, 'Parasite is the rare film that is funny, thrilling and devastating in the same two hours.', false, [
    ['me', 'The way the house itself tells the story, upstairs versus the basement, is brilliant.'],
    ['mehro', 'The flood sequence is when it stopped being a comedy for me.'],
  ]],
  [157336, 'mehro', 55, 'Interstellar on a big screen with that organ score is an experience. The science is debatable, the emotion is not.', false, [
    ['me', 'The docking scene still gets my heart rate up every single time.'],
    ['steve', 'Miller’s planet broke me. Twenty-three years of messages.'],
  ]],
  [244786, 'me', 30, 'Whiplash plays like a war film about jazz. The last nine minutes are some of the best editing I have ever seen.', false, [
    ['steve', 'Not quite my tempo.'],
    ['mehro', 'Is Fletcher a monster or a mentor? I still cannot decide.'],
    ['me', 'Both, which is why it is so uncomfortable to watch.'],
  ]],
  [46738, 'me', 20, 'Incendies is one of the hardest films I have watched and one of the most important. Go in knowing nothing.', false, [
    ['mehro', 'The twist hit me like a truck. I sat in silence for a long time afterwards.', true],
    ['steve', 'Villeneuve before Hollywood was already a master.'],
  ]],
  [872585, 'steve', 12, 'Oppenheimer is three hours that feel like a countdown. The silence before the Trinity sound hits is a bold choice.', false, [
    ['me', 'Cillian Murphy deserved every award. His face does half the storytelling.'],
  ]],
];

const seedTexts = threads.flatMap(([, , , text, , replies]) => [
  text,
  ...replies.map(([, reply]) => reply),
]);

function loadEnv() {
  for (const file of [
    '.env.local',
    `.env.${process.env.NODE_ENV || 'development'}`,
  ]) {
    const full = path.resolve(file);
    if (fs.existsSync(full)) dotenv.config({ path: full, quiet: true });
  }
  const url = process.env.NEON_DB || process.env.DATABASE_URL;
  if (!url) throw new Error('Set NEON_DB or DATABASE_URL.');
  return url;
}

async function insertOnce(db, values) {
  const existing = await db.query(
    'SELECT id FROM movie_comment WHERE "authorId" = $1 AND "movieId" = $2 AND text = $3',
    [values.authorId, values.movieId, values.text],
  );
  if (existing.rowCount) return { id: existing.rows[0].id, added: false };
  const { rows } = await db.query(
    `INSERT INTO movie_comment ("movieId", "authorId", "parentId", text, spoiler, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, now() - make_interval(mins => $6), now() - make_interval(mins => $6))
     RETURNING id`,
    [values.movieId, values.authorId, values.parentId, values.text, values.spoiler, values.minutesAgo],
  );
  return { id: rows[0].id, added: true };
}

async function seed(db) {
  const users = new Map();
  for (const [key, username] of Object.entries(authors)) {
    const { rows } = await db.query(
      'SELECT id FROM "user" WHERE username = $1',
      [username],
    );
    if (!rows[0]) throw new Error(`User not found: ${username}`);
    users.set(key, rows[0].id);
  }

  let comments = 0;
  let replies = 0;
  const skipped = new Set();
  // Oldest first so IDs follow creation time, as the API pages by ID.
  for (const [tmdbId, author, hoursAgo, text, spoiler, thread] of [...threads].sort(
    (a, b) => b[2] - a[2],
  )) {
    const movie = (
      await db.query('SELECT id FROM movie WHERE "dbId" = $1', [tmdbId])
    ).rows[0];
    if (!movie) {
      skipped.add(tmdbId);
      continue;
    }
    const root = await insertOnce(db, {
      movieId: movie.id,
      authorId: users.get(author),
      parentId: null,
      text,
      spoiler,
      minutesAgo: hoursAgo * 60,
    });
    if (root.added) comments++;
    for (const [index, [replyAuthor, replyText, replySpoiler]] of thread.entries()) {
      // Replies trail the comment by about forty minutes each.
      const reply = await insertOnce(db, {
        movieId: movie.id,
        authorId: users.get(replyAuthor),
        parentId: root.id,
        text: replyText,
        spoiler: replySpoiler ?? false,
        minutesAgo: Math.max(hoursAgo * 60 - 40 * (index + 1), 5),
      });
      if (reply.added) replies++;
    }
  }
  console.log(
    `Added ${comments} comments and ${replies} replies.`,
    skipped.size ? `Skipped missing TMDb IDs: ${[...skipped].join(', ')}.` : '',
  );
}

async function remove(db) {
  const authorIds = (
    await db.query('SELECT id FROM "user" WHERE username = ANY($1)', [
      Object.values(authors),
    ])
  ).rows.map((row) => row.id);
  // Deleting a top-level comment also removes its replies.
  const { rowCount } = await db.query(
    'DELETE FROM movie_comment WHERE text = ANY($1) AND "authorId" = ANY($2)',
    [seedTexts, authorIds],
  );
  console.log(`Removed ${rowCount} seed comments.`);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const removing = process.argv.includes('--remove');
  const db = new Client({
    connectionString: loadEnv(),
    connectionTimeoutMillis: 15000,
  });
  await db.connect();
  try {
    await db.query('BEGIN');
    await (removing ? remove(db) : seed(db));
    if (apply || removing) {
      await db.query('COMMIT');
      console.log('Committed.');
    } else {
      await db.query('ROLLBACK');
      console.log('Dry run rolled back. Use --apply to keep the seed data.');
    }
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  // Connection errors can contain credentials; report only the code or message.
  console.error('Seed failed:', error.code || error.message);
  process.exitCode = 1;
});
