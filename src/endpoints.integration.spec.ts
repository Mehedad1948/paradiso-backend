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
import { WatchlistItem } from './watchlist/watchlist-item.entity';
import { FavoriteMovie } from './favorites/favorite-movie.entity';
import { RoomBan } from './rooms/room-ban.entity';
import { Genre } from './genres/genre.entity';
import { Rating } from './ratings/rating.entity';
import { Upload } from './uploads/upload.entity';
import { RoomInviteLink } from './room-invite-links/room-invite-link.entity';
import { RoomInvitation } from './room-invitations/room-invitation.entity';
import { CommunityPost } from './community/community-post.entity';
import { CommunityComment } from './community/community-comment.entity';
import { CommunityPostReaction } from './community/community-post-reaction.entity';
import { UserFollow } from './community/user-follow.entity';
import {
  RoomChatRead,
  RoomMessage,
  RoomMessageMention,
  RoomMessageMovie,
  RoomMessageReaction,
} from './room-chat/room-message.entity';
import {
  RoomPoll,
  RoomPollOption,
  RoomPollVote,
} from './room-chat/room-poll.entity';
import { Community1790985600000 } from './community/migrations/1790985600000-community';
import { RoomChat1792368000000 } from './room-chat/migrations/1792368000000-room-chat';
import { OnboardingGenres1792627200000 } from './users/migrations/1792627200000-onboarding-genres';
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
        RoomBan,
        WatchlistItem,
        FavoriteMovie,
        Genre,
        Rating,
        Upload,
        RoomInviteLink,
        RoomInvitation,
        CommunityPost,
        CommunityComment,
        CommunityPostReaction,
        UserFollow,
        RoomMessage,
        RoomMessageMention,
        RoomMessageMovie,
        RoomMessageReaction,
        RoomChatRead,
        RoomPoll,
        RoomPollOption,
        RoomPollVote,
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
    const anonymousSuggested = await request(server)
      .get('/community/users/suggested?limit=20')
      .expect(200);
    assertOpenApiResponse(
      createOpenApiDocument(app),
      'Community_suggestedUsers',
      anonymousSuggested.body,
    );
    expect(anonymousSuggested.body.nextCursor).toBeUndefined();
    expect(anonymousSuggested.body.data).toContainEqual({
      id: users[0].id,
      username: users[0].username,
      avatar: null,
    });
    for (const viewer of [0, 1]) {
      const suggested = await request(server)
        .get('/community/users/suggested?limit=20')
        .auth(access[viewer], { type: 'bearer' })
        .expect(200);
      // users[0] is the viewer themselves or already followed by users[1].
      expect(
        suggested.body.data.map((user: { id: number }) => user.id),
      ).not.toContain(users[0].id);
    }
    await request(server)
      .get('/community/users/suggested?limit=21')
      .expect(400);
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

  it('keeps ordered profile favorites and derives recommendations from rated posts', async () => {
    const server = app.getHttpServer();
    const document = createOpenApiDocument(app);
    const userId = users[3].id;
    const otherMovieId = (
      await request(server)
        .post('/movies')
        .auth(access[3], { type: 'bearer' })
        .send({ dbId: 4567, title: 'Second favorite' })
        .expect(201)
    ).body.id as string;
    await request(server)
      .put('/favorites/' + movieId)
      .expect(401);
    for (const id of [movieId, movieId, otherMovieId])
      await request(server)
        .put('/favorites/' + id)
        .auth(access[3], { type: 'bearer' })
        .expect(200);
    const added = await request(server)
      .get('/favorites/users/' + userId)
      .expect(200);
    assertOpenApiResponse(document, 'Favorites_listForUser', added.body);
    expect(
      added.body.data.map((item: { movie: { id: string } }) => item.movie.id),
    ).toEqual([movieId, otherMovieId]);
    const reordered = await request(server)
      .put('/favorites')
      .auth(access[3], { type: 'bearer' })
      .send({ movieIds: [otherMovieId, movieId] })
      .expect(200);
    expect(
      reordered.body.data.map(
        (item: { position: number; movie: { id: string } }) => [
          item.position,
          item.movie.id,
        ],
      ),
    ).toEqual([
      [1, otherMovieId],
      [2, movieId],
    ]);
    expect(reordered.body.data[1].addedAt).toBe(added.body.data[0].addedAt);
    await request(server)
      .put('/favorites')
      .auth(access[3], { type: 'bearer' })
      .send({ movieIds: Array.from({ length: 11 }, () => randomUUID()) })
      .expect(400);
    await request(server)
      .put('/favorites')
      .auth(access[3], { type: 'bearer' })
      .send({ movieIds: [randomUUID()] })
      .expect(404);
    await request(server)
      .delete('/favorites/' + otherMovieId)
      .auth(access[3], { type: 'bearer' })
      .expect(200);
    const status = await request(server)
      .get('/favorites/' + otherMovieId)
      .auth(access[3], { type: 'bearer' })
      .expect(200);
    assertOpenApiResponse(document, 'Favorites_has', status.body);
    expect(status.body.isFavorite).toBe(false);
    await request(server).get('/favorites/users/999999').expect(404);

    const posts = database.getRepository(CommunityPost);
    const older = await posts.save({
      authorId: userId,
      movieId,
      text: 'Loved it',
      rating: 9,
    });
    const latest = await posts.save({
      authorId: userId,
      movieId,
      text: 'Loved it again',
      rating: 9.5,
    });
    await posts.save([
      { authorId: userId, movieId: otherMovieId, text: 'Meh', rating: 5 },
      {
        authorId: userId,
        movieId: otherMovieId,
        text: 'Room secret',
        rating: 10,
        roomId: privateRoom,
      },
    ]);
    const recommended = await request(server)
      .get('/community/users/' + userId + '/recommendations')
      .expect(200);
    assertOpenApiResponse(
      document,
      'Community_recommendations',
      recommended.body,
    );
    expect(recommended.body.data).toEqual([
      expect.objectContaining({
        id: latest.id,
        rating: 9.5,
        movie: expect.objectContaining({ id: movieId }),
      }),
    ]);
    expect(recommended.body.nextCursor).toBeNull();
    expect(older.id).toBeLessThan(latest.id);
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

  it('applies the room chat migration with the same columns as the entities', async () => {
    const runner = database.createQueryRunner();
    const migrationSchema = schema + '_chat';
    const tables = [
      'room_message',
      'room_message_mention',
      'room_message_movie',
      'room_message_reaction',
      'room_chat_read',
      'room_poll',
      'room_poll_option',
      'room_poll_vote',
    ];
    const columns = async (target: string) =>
      (await runner.query(
        'SELECT table_name, column_name, data_type, is_nullable, character_maximum_length FROM information_schema.columns WHERE table_schema = $1 AND table_name = ANY($2) ORDER BY table_name, column_name',
        [target, tables],
      )) as unknown[];
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query('CREATE SCHEMA "' + migrationSchema + '"');
      await runner.query(
        'SET LOCAL search_path TO "' + migrationSchema + '", "' + schema + '"',
      );
      const migration = new RoomChat1792368000000();
      await migration.up(runner);
      expect(await columns(migrationSchema)).toEqual(await columns(schema));
      const [message] = (await runner.query(
        'INSERT INTO room_message ("roomId", "authorId", text) VALUES ($1, $2, $3) RETURNING id',
        [publicRoom, users[0].id, 'Poll?'],
      )) as { id: number }[];
      await runner.query('INSERT INTO room_poll ("messageId") VALUES ($1)', [
        message.id,
      ]);
      const [option] = (await runner.query(
        'INSERT INTO room_poll_option ("messageId", position, text) VALUES ($1, 0, $2) RETURNING id',
        [message.id, 'A'],
      )) as { id: number }[];
      await runner.query(
        'INSERT INTO room_poll_vote ("optionId", "userId", "messageId") VALUES ($1, $2, $3)',
        [option.id, users[1].id, message.id],
      );
      await runner.query('DELETE FROM room_message WHERE id = $1', [
        message.id,
      ]);
      const votes = (await runner.query(
        'SELECT count(*)::integer AS count FROM room_poll_vote',
      )) as { count: number }[];
      expect(votes[0].count).toBe(0);
      await migration.down(runner);
      expect(
        await runner.query(
          'SELECT tablename FROM pg_tables WHERE schemaname = $1',
          [migrationSchema],
        ),
      ).toHaveLength(0);
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

  it('lets only the owner edit room details', async () => {
    const roomId = (
      await request(app.getHttpServer())
        .post('/rooms')
        .auth(access[0], { type: 'bearer' })
        .send({
          name: 'Editable room',
          description: 'Old',
          image: 'old.png',
          themeColor: '#FF5733',
        })
        .expect(201)
    ).body.id;
    await request(app.getHttpServer())
      .patch('/rooms/' + roomId)
      .auth(access[0], { type: 'bearer' })
      .send({ themeColor: 'red' })
      .expect(400);
    expect(
      (
        await request(app.getHttpServer())
          .get('/rooms/' + roomId)
          .auth(access[0], { type: 'bearer' })
          .expect(200)
      ).body.themeColor,
    ).toBe('#ff5733');
    await request(app.getHttpServer())
      .patch('/rooms/' + roomId)
      .auth(access[1], { type: 'bearer' })
      .send({ name: 'Hijacked' })
      .expect(403);
    await request(app.getHttpServer())
      .patch('/rooms/' + roomId)
      .auth(access[0], { type: 'bearer' })
      .send({ name: 'Public test room' })
      .expect(409);
    await request(app.getHttpServer())
      .patch('/rooms/' + roomId)
      .auth(access[0], { type: 'bearer' })
      .send({ name: '   ' })
      .expect(400);
    const updated = await request(app.getHttpServer())
      .patch('/rooms/' + roomId)
      .auth(access[0], { type: 'bearer' })
      .send({
        name: ' Renamed room ',
        description: 'New',
        image: null,
        isPublic: false,
        themeColor: null,
      })
      .expect(200);
    expect(updated.body).toMatchObject({
      id: roomId,
      name: 'Renamed room',
      description: 'New',
      image: null,
      isPublic: false,
      themeColor: null,
    });
    await request(app.getHttpServer())
      .get('/rooms/' + roomId)
      .auth(access[1], { type: 'bearer' })
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

  it('adds a manually entered movie with only a title and year', async () => {
    const server = app.getHttpServer();
    const body = { title: 'Uncatalogued Film', year: 2004 };
    await request(server)
      .post('/rooms/add-custom-movie/' + publicRoom)
      .auth(access[3], { type: 'bearer' })
      .send(body)
      .expect(403);
    await request(server)
      .post('/rooms/add-custom-movie/' + publicRoom)
      .auth(access[0], { type: 'bearer' })
      .send({ title: 'No year' })
      .expect(400);
    const added = await request(server)
      .post('/rooms/add-custom-movie/' + publicRoom)
      .auth(access[0], { type: 'bearer' })
      .send(body)
      .expect(201);
    assertOpenApiResponse(
      createOpenApiDocument(app),
      'Rooms_addCustomMovieToRoom',
      added.body,
    );
    const movie = await database.getRepository(Movie).findOne({
      where: { id: added.body.movieId },
      relations: { addedBy: true },
    });
    expect(movie).toMatchObject({
      dbId: null,
      title: 'Uncatalogued Film',
      release_date: '2004',
      addedBy: { id: users[0].id },
    });
    await request(server)
      .post('/rooms/add-custom-movie/' + publicRoom)
      .auth(access[0], { type: 'bearer' })
      .send({ title: 'uncatalogued film', year: 2004 })
      .expect(409);
    expect(
      await database
        .getRepository(Movie)
        .countBy({ title: 'uncatalogued film' }),
    ).toBe(0);
    // A second custom movie must not collide with the first on the null dbId.
    await request(server)
      .post('/rooms/add-custom-movie/' + privateRoom)
      .auth(access[0], { type: 'bearer' })
      .send(body)
      .expect(201);
    const listed = await request(server)
      .get('/rooms/' + publicRoom + '/rating')
      .auth(access[0], { type: 'bearer' })
      .expect(200);
    expect(listed.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: added.body.movieId,
          release_date: '2004',
        }),
      ]),
    );
  });
  it('runs room chat: mentions, replies, movie cards, reactions, polls, pins, sync and unread', async () => {
    const server = app.getHttpServer();
    const document = createOpenApiDocument(app);
    const chat = '/rooms/' + publicRoom + '/chat';
    // users[0] owns the room, users[1] joined it earlier, users[3] is outside.
    const as = (index: number) => ({
      get: (path: string) =>
        request(server)
          .get(chat + path)
          .auth(access[index], { type: 'bearer' }),
      post: (path: string, body?: object) =>
        request(server)
          .post(chat + path)
          .auth(access[index], { type: 'bearer' })
          .send(body),
      put: (path: string, body?: object) =>
        request(server)
          .put(chat + path)
          .auth(access[index], { type: 'bearer' })
          .send(body),
      patch: (path: string, body: object) =>
        request(server)
          .patch(chat + path)
          .auth(access[index], { type: 'bearer' })
          .send(body),
      delete: (path: string, body?: object) =>
        request(server)
          .delete(chat + path)
          .auth(access[index], { type: 'bearer' })
          .send(body),
    });
    const owner = as(0);
    const member = as(1);
    const outsider = as(3);
    const start = new Date(Date.now() - 1000).toISOString();

    await outsider.get('/messages').expect(403);
    await outsider.post('/messages', { text: 'Hi' }).expect(403);
    await owner.post('/messages', {}).expect(400);
    await owner.post('/messages', { text: '   ' }).expect(400);
    await owner
      .post('/messages', { text: 'Hi', mentionedUserIds: [users[3].id] })
      .expect(400);

    const roomMovie = (
      await request(server)
        .post('/rooms/add-custom-movie/' + publicRoom)
        .auth(access[0], { type: 'bearer' })
        .send({ title: 'Chat Night Film', year: 2010 })
        .expect(201)
    ).body.movieId as string;
    // movieId is in the private room only after the earlier removal test.
    await owner
      .post('/messages', { text: 'x', movies: [{ movieId }] })
      .expect(400);
    await owner
      .post('/messages', { movies: [{ movieId: roomMovie, tmdbId: 5 }] })
      .expect(400);

    const first = await owner
      .post('/messages', {
        text: '@User 1 watch these',
        mentionedUserIds: [users[1].id],
        // tmdbId 123 is in the local catalogue but not in this room.
        movies: [{ movieId: roomMovie }, { tmdbId: 123 }],
      })
      .expect(201);
    assertOpenApiResponse(document, 'RoomChat_sendMessage', first.body);
    expect(first.body).toMatchObject({
      text: '@User 1 watch these',
      author: { id: users[0].id },
      mentions: [{ id: users[1].id, username: 'User 1' }],
      movies: [
        { movieId: roomMovie, title: 'Chat Night Film', year: '2010' },
        { movieId: null, tmdbId: 123, title: expect.any(String) },
      ],
      replyTo: null,
      poll: null,
    });
    expect(JSON.stringify(first.body)).not.toMatch(/private-|example\.test/);

    const reply = await member
      .post('/messages', { text: 'Yes!', replyToId: first.body.id })
      .expect(201);
    expect(reply.body.replyTo).toMatchObject({
      id: first.body.id,
      text: '@User 1 watch these',
      author: { id: users[0].id },
      deleted: false,
    });

    await member
      .put('/messages/' + first.body.id + '/reactions', { emoji: 'popcorn' })
      .expect(400);
    await member
      .put('/messages/' + first.body.id + '/reactions', { emoji: '🍿' })
      .expect(200);
    await member
      .put('/messages/' + first.body.id + '/reactions', { emoji: '🍿' })
      .expect(200);
    const reacted = await owner
      .put('/messages/' + first.body.id + '/reactions', { emoji: '🍿' })
      .expect(200);
    assertOpenApiResponse(document, 'RoomChat_addReaction', reacted.body);
    expect(reacted.body.reactions).toEqual([
      {
        emoji: '🍿',
        count: 2,
        reactedByMe: true,
        userIds: [users[1].id, users[0].id],
      },
    ]);
    const unreacted = await owner
      .delete('/messages/' + first.body.id + '/reactions', { emoji: '🍿' })
      .expect(200);
    expect(unreacted.body.reactions).toEqual([
      expect.objectContaining({ count: 1, reactedByMe: false }),
    ]);

    await owner
      .post('/messages', { poll: { options: [{ text: 'A' }, { text: 'B' }] } })
      .expect(400);
    await owner
      .post('/messages', { text: 'Q?', poll: { options: [{ text: 'A' }] } })
      .expect(400);
    const poll = await member
      .post('/messages', {
        text: 'Friday movie?',
        poll: { options: [{ movieId: roomMovie }, { text: 'Something new' }] },
      })
      .expect(201);
    expect(poll.body.poll).toMatchObject({
      allowsMultiple: false,
      isClosed: false,
      totalVoters: 0,
      options: [
        { text: 'Chat Night Film', movieId: roomMovie, votes: 0 },
        { text: 'Something new', movieId: null, votes: 0 },
      ],
    });
    const [optionA, optionB] = poll.body.poll.options.map(
      (option: { id: number }) => option.id,
    );
    const vote = '/messages/' + poll.body.id + '/poll/vote';
    await owner.put(vote, { optionIds: [optionA, optionB] }).expect(400);
    await owner.put(vote, { optionIds: [999999] }).expect(400);
    await owner.put(vote, { optionIds: [optionA] }).expect(200);
    await owner.put(vote, { optionIds: [optionB] }).expect(200);
    const voted = await member.put(vote, { optionIds: [optionB] }).expect(200);
    assertOpenApiResponse(document, 'RoomChat_votePoll', voted.body);
    expect(voted.body.poll).toMatchObject({
      totalVoters: 2,
      options: [
        { votes: 0, votedByMe: false, voterIds: [] },
        { votes: 2, votedByMe: true, voterIds: [users[0].id, users[1].id] },
      ],
    });
    await owner
      .patch('/messages/' + poll.body.id, { text: 'Changed?' })
      .expect(403);
    await member
      .patch('/messages/' + poll.body.id, { text: 'Changed?' })
      .expect(400);
    const closed = await owner
      .post('/messages/' + poll.body.id + '/poll/close')
      .expect(200);
    expect(closed.body.poll.isClosed).toBe(true);
    await member.put(vote, { optionIds: [optionA] }).expect(400);

    await member
      .patch('/messages/' + first.body.id, { text: 'Hijack' })
      .expect(403);
    const edited = await owner
      .patch('/messages/' + first.body.id, {
        text: 'Edited',
        mentionedUserIds: [],
      })
      .expect(200);
    expect(edited.body).toMatchObject({ text: 'Edited', mentions: [] });
    expect(edited.body.editedAt).toEqual(expect.any(String));

    await member.put('/messages/' + first.body.id + '/pin').expect(403);
    await member.put('/messages/' + poll.body.id + '/pin').expect(200);
    const pinned = await owner.get('/pinned').expect(200);
    assertOpenApiResponse(document, 'RoomChat_listPinned', pinned.body);
    expect(pinned.body.data.map((m: { id: number }) => m.id)).toEqual([
      poll.body.id,
    ]);

    // The owner moderates a member's message; replies keep a tombstone.
    await outsider.delete('/messages/' + reply.body.id).expect(403);
    const removed = await owner
      .delete('/messages/' + reply.body.id)
      .expect(200);
    expect(removed.body).toMatchObject({
      text: null,
      mentions: [],
      reactions: [],
    });
    expect(removed.body.deletedAt).toEqual(expect.any(String));
    const toTombstone = await member
      .post('/messages', { text: 'Reply to me', replyToId: first.body.id })
      .expect(201);
    await member.delete('/messages/' + first.body.id).expect(403);
    await owner.delete('/messages/' + first.body.id).expect(200);
    const orphan = await member
      .get('/messages/' + toTombstone.body.id)
      .expect(200);
    assertOpenApiResponse(document, 'RoomChat_getMessage', orphan.body);
    expect(orphan.body.replyTo).toMatchObject({ deleted: true, text: null });
    await member
      .post('/messages', { text: 'late', replyToId: first.body.id })
      .expect(400);

    const history = await member.get('/messages?limit=2').expect(200);
    assertOpenApiResponse(document, 'RoomChat_listMessages', history.body);
    expect(history.body.data).toHaveLength(2);
    const [newest, second] = history.body.data as { id: number }[];
    expect(newest.id).toBeGreaterThan(second.id);
    const older = await member
      .get('/messages?limit=100&before=' + history.body.nextCursor)
      .expect(200);
    expect(older.body.nextCursor).toBeNull();

    const sync = await member
      .get('/messages/sync?since=' + encodeURIComponent(start))
      .expect(200);
    assertOpenApiResponse(document, 'RoomChat_syncMessages', sync.body);
    expect(sync.body.hasMore).toBe(false);
    expect(sync.body.data.map((m: { id: number }) => m.id).sort()).toEqual(
      [first.body.id, reply.body.id, poll.body.id, toTombstone.body.id].sort(),
    );
    const paged = await member
      .get('/messages/sync?limit=1&since=' + encodeURIComponent(start))
      .expect(200);
    expect(paged.body.hasMore).toBe(true);
    await member.get('/messages/sync?since=yesterday').expect(400);

    const unread = await owner.get('/unread').expect(200);
    assertOpenApiResponse(document, 'RoomChat_getUnread', unread.body);
    expect(unread.body).toMatchObject({
      lastReadMessageId: null,
      unreadCount: 2,
      mentionCount: 0,
    });
    const read = await owner
      .put('/read', { messageId: toTombstone.body.id })
      .expect(200);
    assertOpenApiResponse(document, 'RoomChat_markRead', read.body);
    expect(read.body).toMatchObject({ unreadCount: 0 });
    await owner.put('/read', { messageId: poll.body.id }).expect(200);
    expect(
      (await owner.get('/unread').expect(200)).body.lastReadMessageId,
    ).toBe(toTombstone.body.id);

    const mention = await owner
      .post('/messages', { text: 'ping', mentionedUserIds: [users[1].id] })
      .expect(201);
    expect((await member.get('/unread').expect(200)).body).toMatchObject({
      latestMessageId: mention.body.id,
      mentionCount: 1,
    });

    let limited = false;
    for (let index = 0; index < 12 && !limited; index++) {
      const response = await member.post('/messages', { text: 'spam' });
      limited = response.status === 429;
    }
    expect(limited).toBe(true);
  });
  describe('onboarding: favorite genres, onboardedAt and avatar', () => {
    const avatarBase = () =>
      (process.env.R2_PUBLIC_URL ?? '').replace(/\/+$/, '') +
      '/paradiso/avatars/';
    type Me = { genres: { id: string }[] };
    let genreIds: string[];
    const patchMe = (index: number, body: object) =>
      request(app.getHttpServer())
        .patch('/users/me')
        .auth(access[index], { type: 'bearer' })
        .send(body);
    const getMe = (index: number) =>
      request(app.getHttpServer())
        .get('/users/me')
        .auth(access[index], { type: 'bearer' });

    beforeAll(async () => {
      const repository = database.getRepository(Genre);
      await repository.save([
        { tmdbId: 35, name: 'Comedy' },
        { tmdbId: 18, name: 'Drama' },
      ]);
      for (let tmdbId = 1000; tmdbId < 1010; tmdbId++)
        await repository.save({ tmdbId, name: 'Extra ' + tmdbId });
      genreIds = (await repository.find({ order: { tmdbId: 'ASC' } })).map(
        (genre) => genre.id,
      );
    });

    it('returns empty genres, null onboardedAt and null avatar for a new user', async () => {
      const me = await getMe(2).expect(200);
      expect(me.body).toMatchObject({
        genres: [],
        onboardedAt: null,
        avatar: null,
      });
      assertOpenApiResponse(
        createOpenApiDocument(app),
        'Users_getCurrentUser',
        me.body,
      );
    });

    it('sets, replaces, keeps and clears favorite genres', async () => {
      const [first, second, third] = genreIds;
      const set = await patchMe(2, { genreIds: [first, second] }).expect(200);
      assertOpenApiResponse(
        createOpenApiDocument(app),
        'Users_updateCurrentUser',
        set.body,
      );
      const ids = (body: { genres: { id: string }[] }) =>
        body.genres.map((genre) => genre.id).sort();
      expect(ids(set.body)).toEqual([first, second].sort());
      expect(set.body.genres[0]).toEqual({
        id: expect.any(String),
        name: expect.any(String),
        tmdbId: expect.any(Number),
      });
      // Replaces the whole set, keeping the overlapping entry.
      await patchMe(2, { genreIds: [second, third] }).expect(200);
      expect(ids((await getMe(2).expect(200)).body as Me)).toEqual(
        [second, third].sort(),
      );
      // Omitting genreIds leaves the selection alone.
      await patchMe(2, { username: 'Renamed' }).expect(200);
      expect(ids((await getMe(2).expect(200)).body as Me)).toEqual(
        [second, third].sort(),
      );
      // Same set again is a no-op, not a duplicate-key error.
      await patchMe(2, { genreIds: [third, second] }).expect(200);
      const cleared = await patchMe(2, { genreIds: [] }).expect(200);
      expect(cleared.body.genres).toEqual([]);
      expect((await getMe(2).expect(200)).body.genres).toEqual([]);
    });

    it('rejects unknown, malformed, duplicate and more than 10 genre IDs without changing anything', async () => {
      await patchMe(3, { genreIds: [genreIds[0]] }).expect(200);
      const unknown = await patchMe(3, {
        genreIds: [genreIds[1], randomUUID()],
      }).expect(400);
      expect(JSON.stringify(unknown.body)).toMatch(/Unknown genre/);
      await patchMe(3, { genreIds: ['not-a-uuid'] }).expect(400);
      await patchMe(3, { genreIds: [genreIds[1], genreIds[1]] }).expect(400);
      await patchMe(3, { genreIds: genreIds.slice(0, 11) }).expect(400);
      await patchMe(3, { genreIds: 'abc' }).expect(400);
      expect(
        (await getMe(3).expect(200)).body.genres.map(
          (genre: { id: string }) => genre.id,
        ),
      ).toEqual([genreIds[0]]);
      // Exactly 10 is allowed.
      await patchMe(3, { genreIds: genreIds.slice(0, 10) }).expect(200);
    });

    it('deletes selections when the genre is deleted', async () => {
      const count = async () =>
        Number(
          (
            await database.query(
              'SELECT count(*) FROM "' +
                schema +
                '".user_genres WHERE "genreId" = $1',
              [genreIds[5]],
            )
          )[0].count,
        );
      await patchMe(3, { genreIds: [genreIds[5]] }).expect(200);
      expect(await count()).toBe(1);
      await database.getRepository(Genre).delete(genreIds[5]);
      expect(await count()).toBe(0);
      expect((await getMe(3).expect(200)).body.genres).toEqual([]);
    });

    it('sets onboardedAt once and keeps it on repeated calls', async () => {
      expect((await getMe(1).expect(200)).body.onboardedAt).toBeNull();
      const first = await patchMe(1, { onboarded: true }).expect(200);
      expect(typeof first.body.onboardedAt).toBe('string');
      await new Promise((resolve) => setTimeout(resolve, 20));
      const second = await patchMe(1, { onboarded: true }).expect(200);
      expect(second.body.onboardedAt).toBe(first.body.onboardedAt);
      // Cannot be unset through the API.
      await patchMe(1, { onboarded: false }).expect(400);
      await patchMe(1, { onboarded: 'true' }).expect(400);
      expect((await getMe(1).expect(200)).body.onboardedAt).toBe(
        first.body.onboardedAt,
      );
      // Other updates and an unauthenticated call never touch it.
      await patchMe(1, { username: 'Still onboarded' }).expect(200);
      expect((await getMe(1).expect(200)).body.onboardedAt).toBe(
        first.body.onboardedAt,
      );
      await request(app.getHttpServer())
        .patch('/users/me')
        .send({ onboarded: true })
        .expect(401);
    });

    it('accepts only our own https upload URLs as avatar and allows null', async () => {
      const valid = avatarBase() + 'avatar-1-abc.webp';
      const set = await patchMe(0, { avatar: valid }).expect(200);
      expect(set.body.avatar).toBe(valid);
      expect((await getMe(0).expect(200)).body.avatar).toBe(valid);
      for (const avatar of [
        'data:image/png;base64,AAAA',
        'http://' + avatarBase().replace(/^https:\/\//, ''),
        'https://evil.example.test/paradiso/avatars/a.png',
        avatarBase().replace('https://', 'https://user:pw@') + 'a.png',
        avatarBase() + '../secret.png',
        avatarBase() + 'a.png?x=1',
        'https://' + 'a'.repeat(300) + '.example.test/a.png',
        'not a url',
        42,
      ])
        await patchMe(0, { avatar }).expect(400);
      expect((await getMe(0).expect(200)).body.avatar).toBe(valid);
      const removed = await patchMe(0, { avatar: null }).expect(200);
      expect(removed.body.avatar).toBeNull();
      expect((await getMe(0).expect(200)).body.avatar).toBeNull();
    });

    it('returns non-https legacy avatars as null', async () => {
      await database
        .getRepository(User)
        .update(users[0].id, { avatar: 'javascript:alert(1)' });
      expect((await getMe(0).expect(200)).body.avatar).toBeNull();
      await database.getRepository(User).update(users[0].id, { avatar: null });
    });

    it('requires authentication for uploads', async () => {
      await request(app.getHttpServer())
        .post('/uploads/file')
        .field('folder', 'avatars')
        .attach('file', Buffer.from('x'), 'a.png')
        .expect(401);
    });

    it('applies and reverses the onboarding migration, backfilling existing users', async () => {
      const runner = database.createQueryRunner();
      const migrationSchema = schema + '_onboarding';
      await runner.connect();
      await runner.startTransaction();
      try {
        await runner.query('CREATE SCHEMA "' + migrationSchema + '"');
        await runner.query(
          'SET LOCAL search_path TO "' + migrationSchema + '"',
        );
        await runner.query(
          'CREATE TABLE "user" ("id" SERIAL PRIMARY KEY, "email" varchar NOT NULL)',
        );
        await runner.query('CREATE TABLE "genre" ("id" uuid PRIMARY KEY)');
        await runner.query(
          `INSERT INTO "user" (email) VALUES ('old@example.test')`,
        );
        const migration = new OnboardingGenres1792627200000();
        await migration.up(runner);
        expect(
          (await runner.query(
            'SELECT "onboardedAt" IS NOT NULL AS done FROM "user"',
          )) as { done: boolean }[],
        ).toEqual([{ done: true }]);
        const genreId = randomUUID();
        await runner.query('INSERT INTO genre (id) VALUES ($1)', [genreId]);
        await runner.query('INSERT INTO user_genres VALUES (1, $1)', [genreId]);
        await runner.query('SAVEPOINT duplicate_pair');
        await expect(
          runner.query('INSERT INTO user_genres VALUES (1, $1)', [genreId]),
        ).rejects.toThrow(/duplicate key/);
        await runner.query('ROLLBACK TO SAVEPOINT duplicate_pair');
        await runner.query('DELETE FROM genre');
        expect(
          (await runner.query(
            'SELECT count(*)::int AS n FROM user_genres',
          )) as { n: number }[],
        ).toEqual([{ n: 0 }]);
        await migration.down(runner);
        const tables = (await runner.query(
          'SELECT tablename FROM pg_tables WHERE schemaname = $1',
          [migrationSchema],
        )) as { tablename: string }[];
        expect(tables.map((table) => table.tablename).sort()).toEqual([
          'genre',
          'user',
        ]);
      } finally {
        await runner.rollbackTransaction();
        await runner.release();
      }
    });
  });
});
