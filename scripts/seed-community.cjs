// Seeds sample movie recommendations, comments and follows for the community
// feed. Movie metadata comes from the TMDB snapshot in seed/community-movies.json
// so the script needs no TMDB access.
//
//   node scripts/seed-community.cjs            dry run (rolls back)
//   node scripts/seed-community.cjs --apply    insert missing seed rows
//   node scripts/seed-community.cjs --remove   delete seed posts and unused seed movies
//
// Authors are the first three users by ID (slots 0–2, wrapping if fewer).
// Room posts go to the first room, written by its owner. Re-running is safe:
// existing movies (by TMDB ID) and posts (by author and text) are skipped.
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { Client } = require('pg');

const movies = require('./seed/community-movies.json');

// [tmdbId, authorSlot, hoursAgo, rating, text, comments: [slot, text][]]
const posts = [
  [11216, 2, 330, 9.5, 'Rewatched Cinema Paradiso last night and the kissing-reel ending wrecked me all over again. A love letter to every small-town projection booth and to the people who grew up inside them.', [
    [1, 'That final montage gets me every single time. Morricone\'s score does half the work.'],
    [0, 'Watch the director\'s cut sometime — it changes how you see Alfredo completely.'],
    [2, 'Agreed, though I still prefer the theatrical cut\'s restraint.'],
  ]],
  [60243, 1, 310, 9.0, 'A Separation is the most honest film about a family falling apart that I know. Nobody is a villain and everyone is lying a little. Farhadi makes a courtroom drama feel like a thriller.', [
    [2, 'The scene at the stairs — I held my breath for the whole conversation.'],
    [0, 'Termeh\'s face in the last shot is the whole movie.'],
  ]],
  [496243, 0, 290, 9.0, 'Parasite works as a heist comedy for an hour and then quietly turns into something much darker. The staircase motif is everywhere once you notice it.', [
    [1, 'The peach scene is a masterclass in editing.'],
  ]],
  [238, 2, 240, 10, 'Finally saw The Godfather on a big screen. The opening wedding sequence introduces twenty characters and you never feel lost. Pacino\'s transformation is terrifyingly gradual.', [
    [0, 'The baptism montage is still the best cross-cutting in cinema.'],
  ]],
  [157336, 0, 215, 8.0, 'Interstellar is uneven but the docking scene and the ocean planet are pure cinema. Hans Zimmer\'s organ makes the silence of space feel enormous.', [
    [1, 'The video messages scene hurts more every time I rewatch.'],
    [2, 'Science is shaky but the emotion lands. 8 feels right.'],
  ]],
  [244786, 2, 170, 8.5, 'Whiplash plays like a war movie about jazz drumming. The last nine minutes are the best ending of the 2010s, and I will not be taking questions.', [
    [0, 'Not quite my tempo.'],
    [1, 'Saw it with a drummer friend; he had to leave the room twice.'],
  ]],
  [27205, 0, 150, 8.0, 'Inception holds up. The hallway fight is practical effects at their best, and the ending is still a perfect conversation starter.', [
    [2, 'The top wobbles. Final answer.'],
  ]],
  [313369, 1, 130, 7.5, 'La La Land is about choosing between the person you love and the person you want to become. The epilogue \"what if\" sequence is devastating.', [
    [0, 'City of Stars has been stuck in my head for a week now.'],
  ]],
  [872585, 1, 70, 8.0, 'Oppenheimer is three hours that feel like a countdown. The Trinity test silence before the sound hits is a bold choice that pays off.', [
    [0, 'Seeing it in IMAX 70mm was worth the trip.'],
  ]],
  [278, 2, 48, 9.0, 'The Shawshank Redemption is comfort food cinema. Morgan Freeman\'s narration could make a grocery list sound profound.', [
    [0, 'Get busy living, or get busy dying.'],
  ]],
  [655, 2, 275, 9.0, "Paris, Texas is about how hard it is to say the one thing that matters. Harry Dean Stanton barely speaks for the first half hour, and the peep-show monologue near the end is one of the great scenes about regret.", [
    [1, "Ry Cooder's slide guitar is the sound of the desert itself."],
    [0, "That red cap and the vast empty landscapes — every frame is a painting."],
  ]],
  [2013, 1, 255, 8.5, "The Diving Bell and the Butterfly shoots the first act through the narrator's one working eye, and it is both claustrophobic and unexpectedly tender. A film about what a mind can do when the body cannot.", [
    [2, "Blinking an entire book into existence. Unbelievable."],
  ]],
  [632, 0, 235, 8.0, "Stalag 17 is a POW comedy-thriller where the real question is who the informant is. Billy Wilder lets the suspicion curdle the barracks from the inside. William Holden is superb.", [
    [1, "Sefton is such a great cynical lead."],
    [2, "Wilder never made the same film twice."],
  ]],
  [1585, 2, 205, 9.0, "It's a Wonderful Life is darker than its reputation: a man at the end of his rope is shown what his small, ordinary life actually built. Every December I think I'm done with it and every December it gets me.", [
    [0, "Every time the bell rings I tear up."],
    [1, "Capra at his most generous. Stewart gives everything."],
  ]],
  [389, 1, 185, 9.0, "12 Angry Men: one room, twelve men, and a whole argument about doubt. Lumet tightens the camera lenses as the heat rises. It is a masterclass in tension from nothing but dialogue.", [
    [2, "Juror 8 quietly dismantling everything is pure patience."],
  ]],
  [37165, 0, 165, 8.5, "The Truman Show was a comedy about reality TV that turned into a prophecy about life online. Jim Carrey's final look into the camera and his bow still gives me chills.", [
    [1, "And in case I don't see ya, good afternoon, good evening and good night!"],
    [2, "Christof is one of the best quiet villains in cinema."],
  ]],
  [77, 2, 100, 8.5, "Memento is told backward so you share Leonard's confusion, and then it quietly asks what you'd believe to feel purposeful. Rewatching it the clues are all right there.", [
    [0, "Don't trust your notes."],
    [1, "The black-and-white sequences click into place at the end — so clever."],
  ]],
  [329865, 1, 85, 8.0, "Arrival is a first-contact film that is really about grief, time and choosing to love anyway. Jóhannsson's score and the design of the heptapod language make it feel genuinely alien.", [
    [2, "The twist on time reframes the whole film on a rewatch."],
  ]],
  [87827, 0, 60, 7.5, "Life of Pi is worth seeing for the visuals alone — the glowing night sea, the island, the whale. And the final question about which story you prefer is surprisingly moving.", [
    [1, "Richard Parker is the best CGI tiger ever."],
  ]],
  [152601, 2, 20, 8.0, "Her is a gentle, melancholy love story set in a near-future that looks too plausible. Joaquin Phoenix carries it, and Scarlett Johansson's voice does what most actors need a face for.", [
    [0, "The soft pastel LA future is gorgeous."],
    [1, "Hits harder now than in 2013."],
  ]],
  [194, 1, 12, 8.0, 'Amélie is a warm blanket of a movie. Perfect pick for a group watch — everyone leaves smiling.', [
    [2, 'Adding this to our room\'s list!'],
  ]],
];

// Posts scoped to the first room, by its owner: [tmdbId, hoursAgo, rating, text]
const roomPosts = [
  [11216, 20, 9.5, 'Proposal for our next group watch: Cinema Paradiso. Fitting for a room with this name.'],
  [60243, 6, 9.0, 'If we do an Iranian cinema night, A Separation should open it. Then maybe Kiarostami?'],
];

const seedTexts = [...posts.map((p) => p[4]), ...roomPosts.map((p) => p[3])];

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

async function seed(db) {
  const users = (
    await db.query('SELECT id FROM "user" ORDER BY id LIMIT 3')
  ).rows.map((row) => row.id);
  if (users.length === 0) throw new Error('Create at least one user first.');
  const user = (slot) => users[slot % users.length];

  const movieIds = new Map();
  let moviesAdded = 0;
  for (const movie of movies) {
    const existing = await db.query('SELECT id FROM movie WHERE "dbId" = $1', [
      movie.dbId,
    ]);
    if (existing.rows[0]) {
      movieIds.set(movie.dbId, existing.rows[0].id);
      continue;
    }
    const { rows } = await db.query(
      `INSERT INTO movie ("dbId", title, original_title, release_date, overview,
         poster_path, vote_average, "imdbLink", "addedById")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        movie.dbId,
        movie.title,
        movie.original_title,
        movie.release_date,
        movie.overview,
        movie.poster_path,
        movie.vote_average,
        movie.imdbLink,
        user(2),
      ],
    );
    movieIds.set(movie.dbId, rows[0].id);
    moviesAdded++;
  }

  const room = (
    await db.query('SELECT id, "ownerId" FROM room ORDER BY id LIMIT 1')
  ).rows[0];
  // Insert oldest first so post IDs (the feed order) follow creation time.
  const queue = [
    ...posts.map(([tmdbId, slot, hoursAgo, rating, text, comments]) => ({
      tmdbId, authorId: user(slot), hoursAgo, rating, text, comments, roomId: null,
    })),
    ...(room?.ownerId
      ? roomPosts.map(([tmdbId, hoursAgo, rating, text]) => ({
          tmdbId, authorId: room.ownerId, hoursAgo, rating, text, comments: [], roomId: room.id,
        }))
      : []),
  ].sort((a, b) => b.hoursAgo - a.hoursAgo);

  let postsAdded = 0;
  let commentsAdded = 0;
  for (const post of queue) {
    const exists = await db.query(
      'SELECT 1 FROM community_post WHERE "authorId" = $1 AND text = $2',
      [post.authorId, post.text],
    );
    if (exists.rowCount) continue;
    const { rows } = await db.query(
      `INSERT INTO community_post ("authorId", "movieId", text, rating, "roomId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, now() - make_interval(hours => $6), now() - make_interval(hours => $6))
       RETURNING id`,
      [post.authorId, movieIds.get(post.tmdbId), post.text, post.rating, post.roomId, post.hoursAgo],
    );
    postsAdded++;
    for (const [index, [slot, text]] of post.comments.entries()) {
      // Comments trail the post by a couple of hours each.
      const hoursAgo = Math.max(post.hoursAgo - 2 * (index + 1), 0.5);
      await db.query(
        `INSERT INTO community_comment ("postId", "authorId", text, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, now() - make_interval(mins => $4), now() - make_interval(mins => $4))`,
        [rows[0].id, user(slot), text, Math.round(hoursAgo * 60)],
      );
      commentsAdded++;
    }
  }

  let followsAdded = 0;
  const distinct = [...new Set(users)];
  for (const follower of distinct)
    for (const following of distinct)
      if (follower !== following)
        followsAdded += (
          await db.query(
            `INSERT INTO user_follow ("followerId", "followingId") VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [follower, following],
          )
        ).rowCount;

  console.log(
    `Users ${distinct.join(', ')}${room ? `; room ${room.id}` : '; no room'}.`,
    `Added ${moviesAdded} movies, ${postsAdded} posts, ${commentsAdded} comments, ${followsAdded} follows.`,
  );
}

async function remove(db) {
  const deletedPosts = await db.query(
    'DELETE FROM community_post WHERE text = ANY($1)',
    [seedTexts],
  );
  // Keep seed movies that anything else now references.
  const deletedMovies = await db.query(
    `DELETE FROM movie m WHERE m."dbId" = ANY($1)
       AND NOT EXISTS (SELECT 1 FROM community_post p WHERE p."movieId" = m.id)
       AND NOT EXISTS (SELECT 1 FROM rating r WHERE r."movieId" = m.id)
       AND NOT EXISTS (SELECT 1 FROM room_movies_movie rm WHERE rm."movieId" = m.id)
       AND NOT EXISTS (SELECT 1 FROM room_message_movie mm WHERE mm."movieId" = m.id)`,
    [movies.map((movie) => movie.dbId)],
  );
  console.log(
    `Removed ${deletedPosts.rowCount} posts (with their comments) and ${deletedMovies.rowCount} movies. Follows are kept.`,
  );
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
