import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as request from 'supertest';
import { Server } from 'node:http';
import { compare } from 'bcrypt';
import { User } from './users/user.entity';
import { Role } from './roles/role.entity';
import { Movie } from './movies/movie.entity';
import { Room } from './rooms/room.entity';
import { Genre } from './genres/genre.entity';
import { Rating } from './ratings/rating.entity';
import { Upload } from './uploads/upload.entity';
import { RoomInviteLink } from './room-invite-links/room-invite-link.entity';
import { RoomInvitation } from './room-invitations/room-invitation.entity';
import { CommunityPost } from './community/community-post.entity';
import { CommunityComment } from './community/community-comment.entity';
import { UserFollow } from './community/user-follow.entity';
import { Community1790985600000 } from './community/migrations/1790985600000-community';
import { GenerateTokensProvider } from './auth/providers/generate-tokens.provider';
import { MailService } from './mail/providers/mail.service';
import { createOpenApiDocument, setupOpenApi } from './openapi/document';
import { assertOpenApiResponse } from '../test/openapi-contract';

const databaseSuite =
  process.env.RUN_DATABASE_TESTS === 'true' ? describe : describe.skip;
databaseSuite('Endpoint integration with isolated PostgreSQL schema', () => {
  let app: INestApplication<Server>;
  let database: DataSource;
  let admin: DataSource;
  let tokens: GenerateTokensProvider;
  const schema = 'paradiso_test_' + randomUUID().replace(/-/g, '');
  const mail = { sendInvitationEmail: jest.fn().mockResolvedValue(undefined) };
  const users: User[] = [];
  const access: string[] = [];
  let publicRoom: number;
  let privateRoom: number;
  let movieId: string;

  beforeAll(async () => {
    const host = process.env.DATABASE_HOST ?? 'localhost';
    if (!['localhost', '127.0.0.1', '::1'].includes(host))
      throw new Error('Only local PostgreSQL is permitted');
    const options = {
      type: 'postgres' as const,
      host,
      port: Number(process.env.DATABASE_PORT ?? 5432),
      username: process.env.DATABASE_USERNAME,
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME,
    };
    admin = await new DataSource(options).initialize();
    await admin.query('CREATE SCHEMA "' + schema + '"');
    database = await new DataSource({
      ...options,
      schema,
      synchronize: true,
      entities: [
        User,
        Role,
        Movie,
        Room,
        Genre,
        Rating,
        Upload,
        RoomInviteLink,
        RoomInvitation,
        CommunityPost,
        CommunityComment,
        UserFollow,
      ],
    }).initialize();
    const { AppModule } = await import('./app.module');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDataSourceToken())
      .useValue(database)
      .overrideProvider(MailService)
      .useValue(mail)
      .compile();
    tokens = module.get(GenerateTokensProvider);
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    setupOpenApi(app);
    await app.init();
    const role = await database.getRepository(Role).save({ name: 'user' });
    for (let index = 0; index < 4; index++) {
      const user = await database.getRepository(User).save({
        email: 'user' + index + '@example.test',
        username: 'User ' + index,
        password: 'private-password-hash',
        isEmailVerified: true,
        verificationCode: 'private-code',
        role,
      });
      users.push(user);
      access.push((await tokens.generateTokens(user)).accessToken);
    }
    publicRoom = (
      await request(app.getHttpServer())
        .post('/rooms')
        .auth(access[0], { type: 'bearer' })
        .send({ name: 'Public test room', isPublic: true })
        .expect(201)
    ).body.id;
    privateRoom = (
      await request(app.getHttpServer())
        .post('/rooms')
        .auth(access[0], { type: 'bearer' })
        .send({ name: 'Private test room', isPublic: false })
        .expect(201)
    ).body.id;
    await database.getRepository(Genre).save({ tmdbId: 28, name: 'Action' });
    movieId = (
      await request(app.getHttpServer())
        .post('/movies')
        .auth(access[0], { type: 'bearer' })
        .send({
          dbId: 123,
          title: 'Integration movie',
          genres: [{ id: 28, name: 'Action' }],
        })
        .expect(201)
    ).body.id;
    await request(app.getHttpServer())
      .post('/rooms/add-movie/' + publicRoom)
      .auth(access[0], { type: 'bearer' })
      .send({ dbId: 123 })
      .expect(201);
    await request(app.getHttpServer())
      .post('/rooms/add-movie/' + privateRoom)
      .auth(access[0], { type: 'bearer' })
      .send({ dbId: 123 })
      .expect(201);
  }, 60000);

  it('supports public community reading, authenticated participation, follows and room privacy', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/community/posts')
      .send({ movieId, text: 'A great film', rating: 8.5 })
      .expect(401);
    const created = await request(server)
      .post('/community/posts')
      .auth(access[0], { type: 'bearer' })
      .send({ movieId, text: 'A great film', rating: 8.5 })
      .expect(201);
    const postId = created.body.id as number;
    assertOpenApiResponse(
      createOpenApiDocument(app),
      'Community_createPost',
      created.body,
    );
    const feed = await request(server).get('/community/posts').expect(200);
    expect(
      feed.body.data.some((post: { id: number }) => post.id === postId),
    ).toBe(true);
    expect(JSON.stringify(feed.body)).not.toMatch(
      /private-password-hash|private-code|@example.test/,
    );
    await request(server)
      .patch('/community/posts/' + postId)
      .auth(access[1], { type: 'bearer' })
      .send({ text: 'Hijacked' })
      .expect(403);
    await request(server)
      .patch('/community/posts/' + postId)
      .auth(access[0], { type: 'bearer' })
      .send({ text: 'Updated recommendation' })
      .expect(200);
    await request(server)
      .post('/community/posts/' + postId + '/comments')
      .send({ text: 'Nice' })
      .expect(401);
    const comment = await request(server)
      .post('/community/posts/' + postId + '/comments')
      .auth(access[1], { type: 'bearer' })
      .send({ text: 'Nice' })
      .expect(201);
    const detail = await request(server)
      .get('/community/posts/' + postId)
      .expect(200);
    expect(detail.body.commentCount).toBe(1);
    await request(server)
      .delete('/community/posts/' + postId + '/comments/' + comment.body.id)
      .auth(access[2], { type: 'bearer' })
      .expect(403);
    await request(server)
      .put('/community/users/' + users[0].id + '/follow')
      .auth(access[1], { type: 'bearer' })
      .expect(200);
    await request(server)
      .put('/community/users/' + users[0].id + '/follow')
      .auth(access[1], { type: 'bearer' })
      .expect(200);
    const profile = await request(server)
      .get('/community/users/' + users[0].id)
      .expect(200);
    expect(profile.body.followersCount).toBe(1);
    const followers = await request(server)
      .get('/community/users/' + users[0].id + '/followers')
      .expect(200);
    expect(followers.body.data).toEqual([
      { id: users[1].id, username: users[1].username, avatar: null },
    ]);
    const followedUsers = await request(server)
      .get('/community/users/' + users[1].id + '/following')
      .expect(200);
    expect(followedUsers.body.data[0].id).toBe(users[0].id);
    const following = await request(server)
      .get('/community/following')
      .auth(access[1], { type: 'bearer' })
      .expect(200);
    expect(
      following.body.data.some((post: { id: number }) => post.id === postId),
    ).toBe(true);
    const privatePost = await request(server)
      .post('/community/posts')
      .auth(access[0], { type: 'bearer' })
      .send({ movieId, text: 'Members only', rating: 9, roomId: privateRoom })
      .expect(201);
    await request(server)
      .get('/community/posts/' + privatePost.body.id)
      .expect(404);
    await request(server)
      .get('/community/rooms/' + privateRoom + '/posts')
      .expect(403);
    const roomFeed = await request(server)
      .get('/community/rooms/' + privateRoom + '/posts')
      .auth(access[0], { type: 'bearer' })
      .expect(200);
    expect(roomFeed.body.data).toHaveLength(1);
    const publicFeed = await request(server)
      .get('/community/posts')
      .expect(200);
    expect(
      publicFeed.body.data.some(
        (post: { id: number }) => post.id === privatePost.body.id,
      ),
    ).toBe(false);
    await request(server)
      .post('/community/posts')
      .auth(access[1], { type: 'bearer' })
      .send({ movieId, text: 'Unauthorized', rating: 7, roomId: publicRoom })
      .expect(403);
    await request(server)
      .delete('/community/posts/' + postId)
      .auth(access[0], { type: 'bearer' })
      .expect(200);
    expect(
      await database.getRepository(CommunityComment).countBy({ postId }),
    ).toBe(0);
  });

  it('applies and reverses the community migration in an isolated transactional schema', async () => {
    const runner = database.createQueryRunner();
    const migrationSchema = schema + '_migration';
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query('CREATE SCHEMA "' + migrationSchema + '"');
      await runner.query(
        'SET LOCAL search_path TO "' + migrationSchema + '", "' + schema + '"',
      );
      const migration = new Community1790985600000();
      await migration.up(runner);
      const rows = (await runner.query(
        'INSERT INTO community_post ("authorId", "movieId", text, rating) VALUES ($1, $2, $3, $4) RETURNING id',
        [users[0].id, movieId, 'Migration test', 8.5],
      )) as { id: number }[];
      await runner.query(
        'INSERT INTO community_comment ("authorId", "postId", text) VALUES ($1, $2, $3)',
        [users[1].id, rows[0].id, 'Reply'],
      );
      await runner.query('DELETE FROM community_post WHERE id = $1', [
        rows[0].id,
      ]);
      const counts = (await runner.query(
        'SELECT count(*)::integer AS count FROM community_comment',
      )) as { count: number }[];
      expect(counts[0].count).toBe(0);
      await migration.down(runner);
      const tables = (await runner.query(
        'SELECT tablename FROM pg_tables WHERE schemaname = $1',
        [migrationSchema],
      )) as unknown[];
      expect(tables).toHaveLength(0);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  afterAll(async () => {
    if (app) await app.close();
    if (database?.isInitialized) await database.destroy();
    if (admin?.isInitialized) {
      // This exact schema is generated by this suite; never drop the application schema.
      if (!/^paradiso_test_[a-f0-9]{32}$/.test(schema))
        throw new Error('Invalid cleanup schema');
      await admin.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
      await admin.destroy();
    }
  });

  it('allows public reads, denies private reads and nonmember writes', async () => {
    await request(app.getHttpServer())
      .get('/rooms/' + publicRoom)
      .auth(access[1], { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .get('/rooms/' + privateRoom)
      .auth(access[1], { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .get('/rooms/' + privateRoom + '/rating')
      .auth(access[1], { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/rooms/add-movie/' + publicRoom)
      .auth(access[1], { type: 'bearer' })
      .send({ dbId: 123 })
      .expect(403);
    await request(app.getHttpServer())
      .post('/ratings/' + publicRoom)
      .auth(access[1], { type: 'bearer' })
      .send({ movieId, rate: 8 })
      .expect(403);
  });

  it('applies the deployment index SQL to the isolated schema', async () => {
    const runner = database.createQueryRunner();
    await runner.connect();
    try {
      await runner.query('SET search_path TO "' + schema + '"');
      const statements = readFileSync(
        join(__dirname, '../database/endpoint-indexes.sql'),
        'utf8',
      )
        .replace(/--[^\r\n]*/g, '')
        .split(';')
        .map((statement) => statement.trim())
        .filter(Boolean);
      for (const statement of statements) await runner.query(statement);
      const indexes: { indexname: string }[] = await runner.query(
        'SELECT indexname FROM pg_indexes WHERE schemaname = $1',
        [schema],
      );
      expect(indexes.map((index) => index.indexname)).toEqual(
        expect.arrayContaining([
          'IDX_rating_room_movie',
          'IDX_movie_created_id',
          'IDX_invite_link_room_created',
          'IDX_invitation_room_created',
          'IDX_user_email_lower',
        ]),
      );
    } finally {
      await runner.query('RESET search_path');
      await runner.release();
    }
  });

  it('joins only the authenticated user and requires an invitation for private rooms', async () => {
    await request(app.getHttpServer())
      .post('/rooms/join')
      .auth(access[1], { type: 'bearer' })
      .send({ roomId: publicRoom, userId: users[2].id })
      .expect(201);
    expect(
      await database
        .getRepository(Room)
        .exists({ where: { id: publicRoom, users: { id: users[1].id } } }),
    ).toBe(true);
    expect(
      await database
        .getRepository(Room)
        .exists({ where: { id: publicRoom, users: { id: users[2].id } } }),
    ).toBe(false);
    await request(app.getHttpServer())
      .post('/rooms/join')
      .auth(access[1], { type: 'bearer' })
      .send({ roomId: privateRoom })
      .expect(403);
    const rooms = (
      await request(app.getHttpServer())
        .get('/rooms?usersRoom=true')
        .auth(access[1], { type: 'bearer' })
        .expect(200)
    ).body.data;
    expect(
      rooms[0].users.map((user: { id: number }) => user.id).sort(),
    ).toEqual([users[0].id, users[1].id].sort());
  });

  it('validates IDs, nested genres, body booleans, ratings and pagination', async () => {
    await request(app.getHttpServer()).get('/movies/not-a-uuid').expect(400);
    await request(app.getHttpServer()).get('/movies?limit=101').expect(400);
    await request(app.getHttpServer())
      .get('/movies/tmdb/search?query=%20%20')
      .expect(400);
    await request(app.getHttpServer())
      .post('/rooms')
      .auth(access[0], { type: 'bearer' })
      .send({ name: 'Bad', isPublic: 'false' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/ratings/' + publicRoom)
      .auth(access[0], { type: 'bearer' })
      .send({ movieId, rate: 11 })
      .expect(400);
    await request(app.getHttpServer())
      .post('/movies')
      .auth(access[0], { type: 'bearer' })
      .send({ title: 'Bad', dbId: 999, genres: [{ id: 'bad' }] })
      .expect(400);
    await request(app.getHttpServer())
      .put('/movies/' + movieId)
      .auth(access[0], { type: 'bearer' })
      .send({ dbId: 999 })
      .expect(400);
    await request(app.getHttpServer())
      .get('/rooms/' + publicRoom + '/rating?isWatchTogether=invalid')
      .auth(access[0], { type: 'bearer' })
      .expect(400);
  });

  it('keeps private ratings out of global results and sorts paginated aggregates', async () => {
    await request(app.getHttpServer())
      .post('/ratings/' + privateRoom)
      .auth(access[0], { type: 'bearer' })
      .send({ movieId, rate: 10 })
      .expect(201);
    await Promise.all(
      [7, 8].map((rate) =>
        request(app.getHttpServer())
          .post('/ratings/' + publicRoom)
          .auth(access[1], { type: 'bearer' })
          .send({ movieId, rate })
          .expect(201),
      ),
    );
    expect(
      await database.getRepository(Rating).count({
        where: {
          user: { id: users[1].id },
          room: { id: publicRoom },
          movie: { id: movieId },
        },
      }),
    ).toBe(1);
    const global = (
      await request(app.getHttpServer())
        .get('/ratings?sortBy=rate&limit=1')
        .auth(access[2], { type: 'bearer' })
        .expect(200)
    ).body;
    expect(
      global.movies.data[0].ratings.map(
        (rating: { rate: number }) => rating.rate,
      ),
    ).not.toContain(10);
    await request(app.getHttpServer())
      .get('/ratings?sortBy=userRate&sortByUserId=' + users[1].id)
      .auth(access[2], { type: 'bearer' })
      .expect(200);
    const detail = (
      await request(app.getHttpServer())
        .get('/ratings/movie/' + movieId)
        .auth(access[2], { type: 'bearer' })
        .expect(200)
    ).body;
    expect(
      detail.ratings.map((rating: { rate: number }) => rating.rate),
    ).not.toContain(10);
    const matrix = (
      await request(app.getHttpServer())
        .get(
          '/rooms/' +
            publicRoom +
            '/rating?isWatchTogether=false&sortBy=rate&limit=1',
        )
        .auth(access[1], { type: 'bearer' })
        .expect(200)
    ).body;
    expect(matrix.data).toHaveLength(1);
    expect(matrix.data[0].hasVoted).toBe(true);
    expect(matrix.data[0].averageRate).toBeGreaterThanOrEqual(7);
    expect(
      new URL(String(matrix.links.next)).searchParams.get('isWatchTogether'),
    ).toBe('false');
  });

  it('restricts link management to the owner and scopes deletion to the URL room', async () => {
    const invite = (
      await request(app.getHttpServer())
        .post('/rooms/' + privateRoom + '/invite-links')
        .auth(access[0], { type: 'bearer' })
        .send({ maxUsage: 1 })
        .expect(201)
    ).body;
    await request(app.getHttpServer())
      .get('/rooms/' + privateRoom + '/invite-links')
      .auth(access[1], { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/rooms/' + privateRoom + '/invite-links')
      .auth(access[1], { type: 'bearer' })
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .delete('/rooms/' + privateRoom + '/invite-links/' + invite.id)
      .auth(access[1], { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .delete('/rooms/' + publicRoom + '/invite-links/' + invite.id)
      .auth(access[0], { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .get('/invite-links/' + invite.token)
      .expect(200);
    const results = await Promise.all(
      [1, 2].map((index) =>
        request(app.getHttpServer())
          .post('/invite-links/verify/' + invite.token)
          .auth(access[index], { type: 'bearer' }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([201, 410]);
    const winner = results[0].status === 201 ? 1 : 2;
    await request(app.getHttpServer())
      .post('/invite-links/verify/' + invite.token)
      .auth(access[winner], { type: 'bearer' })
      .expect(201);
    expect(
      (
        await database
          .getRepository(RoomInviteLink)
          .findOneByOrFail({ id: invite.id })
      ).uses,
    ).toBe(1);
    await request(app.getHttpServer())
      .patch('/rooms/' + privateRoom + '/invite-links/' + invite.id)
      .auth(access[0], { type: 'bearer' })
      .send({ isActive: false })
      .expect(200);
    await request(app.getHttpServer())
      .post('/invite-links/verify/' + invite.token)
      .auth(access[winner], { type: 'bearer' })
      .expect(404);
  });

  it('accepts email invitations only for the verified recipient and recovers delivery failures', async () => {
    const route = '/rooms/' + privateRoom + '/invitations';
    mail.sendInvitationEmail.mockRejectedValueOnce(
      new Error('Delivery failure'),
    );
    await request(app.getHttpServer())
      .post(route)
      .auth(access[0], { type: 'bearer' })
      .send({ email: users[3].email })
      .expect(503);
    await request(app.getHttpServer())
      .post(route)
      .auth(access[0], { type: 'bearer' })
      .send({ email: users[3].email.toUpperCase() })
      .expect(201);
    const token = mail.sendInvitationEmail.mock.calls.at(-1)![0]
      .invitationToken as string;
    await request(app.getHttpServer())
      .post('/room-invitations/accept')
      .auth(access[1], { type: 'bearer' })
      .send({ token })
      .expect(403);
    await request(app.getHttpServer())
      .post('/room-invitations/accept')
      .auth(access[3], { type: 'bearer' })
      .send({ token })
      .expect(201);
    await request(app.getHttpServer())
      .post('/room-invitations/accept')
      .auth(access[3], { type: 'bearer' })
      .send({ token })
      .expect(201);
    const invitation = await database
      .getRepository(RoomInvitation)
      .findOneByOrFail({ email: users[3].email });
    expect(invitation.status).toBe('accepted');
    expect(
      await database
        .getRepository(Room)
        .exists({ where: { id: privateRoom, users: { id: users[3].id } } }),
    ).toBe(true);
    await request(app.getHttpServer())
      .get(route + '?limit=101')
      .auth(access[0], { type: 'bearer' })
      .expect(400);
  });

  it('rejects token purpose confusion and hides secrets in nested responses', async () => {
    const generated = await tokens.generateTokens(users[0]);
    await request(app.getHttpServer())
      .post('/auth/refresh-tokens')
      .send({ refreshToken: generated.accessToken })
      .expect(401);
    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh-tokens')
      .send({ refreshToken: generated.refreshToken })
      .expect(201);
    await request(app.getHttpServer())
      .get('/users/me')
      .auth(refreshed.body.accessToken as string, { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .get('/users/me')
      .auth(generated.refreshToken, { type: 'bearer' })
      .expect(401);
    const body = (await request(app.getHttpServer()).get('/movies').expect(200))
      .body;
    expect(JSON.stringify(body)).not.toContain('private-password-hash');
    expect(JSON.stringify(body)).not.toContain('private-code');
    const update = await request(app.getHttpServer())
      .put('/movies/' + movieId)
      .auth(access[0], { type: 'bearer' })
      .send({ title: 'Updated title' })
      .expect(200);
    expect(update.body.title).toBe('Updated title');
    await request(app.getHttpServer())
      .put('/movies/' + movieId)
      .auth(access[3], { type: 'bearer' })
      .send({ title: 'Forbidden edit' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/roles')
      .auth(access[0], { type: 'bearer' })
      .send({ name: 'admin' })
      .expect(403);
    await request(app.getHttpServer())
      .put('/users/' + users[0].id)
      .auth(access[0], { type: 'bearer' })
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .put('/users/' + users[0].id)
      .auth(access[0], { type: 'bearer' })
      .send({ password: null })
      .expect(400);
    await request(app.getHttpServer())
      .put('/users/' + users[0].id)
      .auth(access[3], { type: 'bearer' })
      .send({ password: 'changed-password' })
      .expect(403);
    await request(app.getHttpServer())
      .put('/users/' + users[0].id)
      .auth(access[0], { type: 'bearer' })
      .send({ password: 'changed-password' })
      .expect(200);
    const saved = await database
      .getRepository(User)
      .findOneByOrFail({ id: users[0].id });
    expect(saved.password).not.toBe('changed-password');
    expect(await compare('changed-password', saved.password)).toBe(true);
  });

  it('matches OpenAPI contracts against real serialized endpoint responses', async () => {
    const document = createOpenApiDocument(app);
    const exported = JSON.parse(
      readFileSync(join(__dirname, '../openapi.json'), 'utf8'),
    ) as unknown;
    expect(document).toEqual(exported);
    const reads: [string, string][] = [
      ['/movies', 'Movies_getMovies'],
      ['/movies/' + movieId, 'Movies_getMovieById'],
      ['/rooms', 'Rooms_getRooms'],
      ['/rooms/' + publicRoom, 'Rooms_getRoomById'],
      ['/rooms/' + publicRoom + '/rating', 'Rooms_getRoomRatings'],
      ['/ratings', 'Ratings_getRatings'],
      ['/ratings/movie/' + movieId, 'Ratings_getOneRating'],
      ['/users/me', 'Users_getCurrentUser'],
      ['/genres', 'Genres_findAll'],
      [
        '/rooms/' + privateRoom + '/invitations',
        'RoomInvitations_getRoomInvitations',
      ],
      ['/rooms/' + privateRoom + '/invite-links', 'RoomInviteLinks_findAll'],
    ];
    for (const [url, operation] of reads) {
      await request(app.getHttpServer())
        .get(url)
        .auth(access[0], { type: 'bearer' })
        .expect(200)
        .expect((response) =>
          assertOpenApiResponse(document, operation, response.body),
        );
    }
    const invite = await request(app.getHttpServer())
      .post('/rooms/' + privateRoom + '/invite-links')
      .auth(access[0], { type: 'bearer' })
      .send({})
      .expect(201)
      .expect((response) =>
        assertOpenApiResponse(
          document,
          'RoomInviteLinks_create',
          response.body,
        ),
      );
    await request(app.getHttpServer())
      .get('/invite-links/' + invite.body.token)
      .expect(200)
      .expect((response) =>
        assertOpenApiResponse(
          document,
          'PublicInviteLinks_getOneByToken',
          response.body,
        ),
      );
    await request(app.getHttpServer())
      .patch('/rooms/' + privateRoom + '/invite-links/' + invite.body.id)
      .auth(access[0], { type: 'bearer' })
      .send({ maxUsage: 2 })
      .expect(200)
      .expect((response) =>
        assertOpenApiResponse(
          document,
          'RoomInviteLinks_update',
          response.body,
        ),
      );
    await request(app.getHttpServer())
      .delete('/rooms/' + privateRoom + '/invite-links/' + invite.body.id)
      .auth(access[0], { type: 'bearer' })
      .expect(200)
      .expect((response) =>
        assertOpenApiResponse(
          document,
          'RoomInviteLinks_remove',
          response.body,
        ),
      );
    await request(app.getHttpServer())
      .post('/ratings/' + publicRoom)
      .auth(access[0], { type: 'bearer' })
      .send({ movieId, rate: 9 })
      .expect(201)
      .expect((response) =>
        assertOpenApiResponse(document, 'Ratings_addRating', response.body),
      );
    await request(app.getHttpServer())
      .put('/movies/' + movieId)
      .auth(access[0], { type: 'bearer' })
      .send({ title: 'Contract checked movie' })
      .expect(200)
      .expect((response) =>
        assertOpenApiResponse(
          document,
          'Movies_updateMovieById',
          response.body,
        ),
      );
    await request(app.getHttpServer())
      .post('/rooms')
      .auth(access[0], { type: 'bearer' })
      .send({ name: 'Contract checked room' })
      .expect(201)
      .expect((response) =>
        assertOpenApiResponse(document, 'Rooms_createRoom', response.body),
      );
    await request(app.getHttpServer())
      .post('/movies')
      .auth(access[0], { type: 'bearer' })
      .send({ title: 'Contract checked second movie', dbId: 456 })
      .expect(201)
      .expect((response) =>
        assertOpenApiResponse(document, 'Movies_createMovie', response.body),
      );
    const generated = await tokens.generateTokens(users[0]);
    await request(app.getHttpServer())
      .post('/auth/refresh-tokens')
      .send({ refreshToken: generated.refreshToken })
      .expect(201)
      .expect((response) =>
        assertOpenApiResponse(document, 'Auth_refreshTokens', response.body),
      );
  });

  it('removes a movie and its ratings atomically without touching other rooms', async () => {
    await request(app.getHttpServer())
      .delete('/rooms/delete-movie/' + publicRoom)
      .auth(access[1], { type: 'bearer' })
      .send({ movieId })
      .expect(403);
    await request(app.getHttpServer())
      .delete('/rooms/delete-movie/' + publicRoom)
      .auth(access[0], { type: 'bearer' })
      .send({ movieId })
      .expect(200);
    expect(
      await database
        .getRepository(Rating)
        .count({ where: { room: { id: publicRoom }, movie: { id: movieId } } }),
    ).toBe(0);
    expect(
      await database.getRepository(Rating).count({
        where: { room: { id: privateRoom }, movie: { id: movieId } },
      }),
    ).toBe(1);
    expect(
      await database
        .getRepository(Room)
        .exists({ where: { id: publicRoom, movies: { id: movieId } } }),
    ).toBe(false);
    await request(app.getHttpServer())
      .post('/ratings/' + publicRoom)
      .auth(access[0], { type: 'bearer' })
      .send({ movieId, rate: 5 })
      .expect(409);
  });
});
