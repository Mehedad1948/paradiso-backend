import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource, In, IsNull, MoreThan } from 'typeorm';
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
import { Notification } from './notifications/notification.entity';
import { NotificationsService } from './notifications/notifications.service';
import { Notifications1792972800000 } from './notifications/migrations/1792972800000-notifications';
import { RoomBan } from './rooms/room-ban.entity';
import { Genre } from './genres/genre.entity';
import { Rating } from './ratings/rating.entity';
import { Upload } from './uploads/upload.entity';
import { RoomInviteLink } from './room-invite-links/room-invite-link.entity';
import { RoomInvitation } from './room-invitations/room-invitation.entity';
import { InvitationLifecycleService } from './room-invitations/invitation-lifecycle.service';
import { RoomUserInvitations1793059200000 } from './room-invitations/migrations/1793059200000-room-user-invitations';
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
      // Raw SQL in services names tables without a schema.
      extra: { options: '-c search_path=' + schema + ',public' },
      synchronize: true,
      entities: [
        User,
        Role,
        Movie,
        Room,
        RoomBan,
        WatchlistItem,
        FavoriteMovie,
        Notification,
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
      .findOneOrFail({
        where: { email: users[3].email },
        order: { id: 'DESC' },
      });
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
  it('creates, groups, pages, reads and cleans up notifications', async () => {
    const server = app.getHttpServer();
    const document = createOpenApiDocument(app);
    const as = (index: number) => ({
      get: (path: string) =>
        request(server).get(path).auth(access[index], { type: 'bearer' }),
      post: (path: string, body?: object) =>
        request(server)
          .post(path)
          .auth(access[index], { type: 'bearer' })
          .send(body),
      put: (path: string, body?: object) =>
        request(server)
          .put(path)
          .auth(access[index], { type: 'bearer' })
          .send(body),
      patch: (path: string, body?: object) =>
        request(server)
          .patch(path)
          .auth(access[index], { type: 'bearer' })
          .send(body),
      delete: (path: string) =>
        request(server).delete(path).auth(access[index], { type: 'bearer' }),
    });
    type Item = {
      id: string;
      type: string;
      read: boolean;
      actor: { id: number };
      actorCount: number;
      entity: { type: string; id: string };
      data: Record<string, unknown>;
      roomId: number | null;
    };
    const items = async (index: number, query = '') =>
      (
        await as(index)
          .get('/notifications' + query)
          .expect(200)
      ).body.items as Item[];
    const unread = async (index: number) =>
      (await as(index).get('/notifications/unread-count').expect(200)).body
        .count as number;
    const clear = (index: number) =>
      as(index).post('/notifications/read', { all: true }).expect(200);
    const react = (index: number, postId: number, value: 1 | -1) =>
      as(index)
        .put('/community/posts/' + postId + '/reaction', { value })
        .expect(200);
    await request(server).get('/notifications').expect(401);
    for (const index of [0, 1, 2, 3]) await clear(index);

    // users[0] owns the room; users[1] and users[2] join it.
    const roomId = (
      await as(0)
        .post('/rooms', { name: 'Notification room', isPublic: true })
        .expect(201)
    ).body.id as number;
    for (const index of [1, 2])
      await as(index).post('/rooms/join', { roomId }).expect(201);

    // movie_added reaches everyone in the room except the adder.
    await as(1)
      .post('/rooms/add-custom-movie/' + roomId, {
        title: 'Notified movie',
        year: 2001,
      })
      .expect(201);
    expect(await unread(1)).toBe(0);
    for (const index of [0, 2]) {
      const [added] = await items(index);
      expect(added).toMatchObject({
        type: 'movie_added',
        read: false,
        actor: { id: users[1].id },
        entity: { type: 'movie' },
        roomId,
        data: { roomName: 'Notification room', movieTitle: 'Notified movie' },
      });
    }
    const listed = await as(0).get('/notifications').expect(200);
    assertOpenApiResponse(document, 'Notifications_list', listed.body);

    // Chat: plain messages notify nobody; mentions and replies do.
    const chat = '/rooms/' + roomId + '/chat/messages';
    const plain = (await as(0).post(chat, { text: 'Hello room' }).expect(201))
      .body.id as number;
    expect(await unread(1)).toBe(0);
    const mention = (
      await as(0)
        .post(chat, {
          text: '@User 1 tonight?',
          mentionedUserIds: [users[1].id, users[0].id],
        })
        .expect(201)
    ).body.id as number;
    await as(2).post(chat, { text: 'Agreed', replyToId: plain }).expect(201);
    expect((await items(1))[0]).toMatchObject({
      type: 'chat_mention',
      entity: { type: 'message', id: String(mention) },
      data: { reason: 'mention', messageExcerpt: '@User 1 tonight?' },
    });
    expect((await items(0))[0]).toMatchObject({
      type: 'chat_mention',
      actor: { id: users[2].id },
      data: { reason: 'reply' },
    });
    // Editing notifies only people the edit newly mentions.
    await as(0)
      .patch(chat + '/' + mention, {
        text: '@User 1 @User 2 tonight?',
        mentionedUserIds: [users[1].id, users[2].id],
      })
      .expect(200);
    expect(
      (await items(1)).filter(
        (item) => item.type === 'chat_mention' && item.roomId === roomId,
      ),
    ).toHaveLength(1);
    expect((await items(2))[0]).toMatchObject({ type: 'chat_mention' });
    // Deleting the message removes its mention notifications.
    await as(0)
      .delete(chat + '/' + mention)
      .expect(200);
    expect(
      (await items(1)).some(
        (item) => item.type === 'chat_mention' && item.roomId === roomId,
      ),
    ).toBe(false);

    // Chat unread per room, and clearing it from the rooms list.
    const unreadIn = async (index: number, query: string) =>
      (
        (
          await as(index)
            .get('/rooms' + query)
            .expect(200)
        ).body.data as {
          id: number;
          unreadCount: number;
        }[]
      ).find((room) => room.id === roomId)!.unreadCount;
    const rooms = await as(1).get('/rooms?usersRoom=true').expect(200);
    assertOpenApiResponse(document, 'Rooms_getRooms', rooms.body);
    // The deleted mention no longer counts: "Hello room" and "Agreed".
    expect(await unreadIn(1, '?usersRoom=true')).toBe(2);
    const read = await as(1)
      .post('/rooms/' + roomId + '/read')
      .expect(200);
    assertOpenApiResponse(document, 'RoomRead_markRead', read.body);
    expect(read.body.unreadCount).toBe(0);
    expect(await unreadIn(1, '?usersRoom=true')).toBe(0);
    await as(3)
      .post('/rooms/' + roomId + '/read')
      .expect(403);
    expect(await unreadIn(3, '?limit=100')).toBe(0);

    // Likes group per post while unread; self-likes and dislikes are silent.
    for (const index of [0, 1, 2]) await clear(index);
    const postId = (
      await as(1)
        .post('/community/posts', { movieId, text: 'Group my likes' })
        .expect(201)
    ).body.id as number;
    await react(1, postId, 1);
    await react(3, postId, -1);
    expect(await unread(1)).toBe(0);
    await react(0, postId, 1);
    await react(0, postId, 1);
    await react(2, postId, 1);
    const count = await as(1).get('/notifications/unread-count').expect(200);
    assertOpenApiResponse(document, 'Notifications_unreadCount', count.body);
    expect(count.body.count).toBe(1);
    const [liked] = await items(1);
    expect(liked).toMatchObject({
      type: 'post_liked',
      actor: { id: users[2].id },
      actorCount: 2,
      entity: { type: 'post', id: String(postId) },
      data: { postExcerpt: 'Group my likes', movieTitle: expect.any(String) },
    });
    for (const index of [0, 2, 3])
      await as(index)
        .post('/community/posts/' + postId + '/comments', {
          text: 'Comment ' + index,
        })
        .expect(201);
    const [commented] = await items(1);
    expect(commented).toMatchObject({
      type: 'post_commented',
      actor: { id: users[3].id },
      actorCount: 3,
      data: { commentExcerpt: 'Comment 3' },
    });

    // Cursor pages are ordered by latest activity and do not overlap.
    const first = (await as(1).get('/notifications?limit=1').expect(200)).body;
    expect(first.items.map((item: Item) => item.id)).toEqual([commented.id]);
    const second = (
      await as(1)
        .get('/notifications?limit=1&cursor=' + first.nextCursor)
        .expect(200)
    ).body;
    expect(second.items.map((item: Item) => item.id)).toEqual([liked.id]);
    // Walking every page one at a time yields the unpaged list exactly.
    const walked: string[] = [];
    let cursor: string | null = '';
    while (cursor !== null) {
      const page = (
        await as(1)
          .get('/notifications?limit=1' + (cursor ? '&cursor=' + cursor : ''))
          .expect(200)
      ).body as { items: Item[]; nextCursor: string | null };
      walked.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    }
    expect(walked).toEqual(
      (await items(1, '?limit=50')).map((item) => item.id),
    );
    await as(1).get('/notifications?cursor=nope').expect(400);
    await as(1).get('/notifications?limit=51').expect(400);

    // Reading ends the group: the next like starts a new notification.
    await as(1).post('/notifications/read', {}).expect(400);
    await as(1)
      .post('/notifications/read', { ids: [liked.id], all: true })
      .expect(400);
    const marked = await as(1)
      .post('/notifications/read', { ids: [liked.id] })
      .expect(200);
    assertOpenApiResponse(document, 'Notifications_markRead', marked.body);
    expect(marked.body.updated).toBe(1);
    expect(
      (
        await as(1)
          .post('/notifications/read', { ids: [liked.id] })
          .expect(200)
      ).body.updated,
    ).toBe(0);
    await react(3, postId, 1);
    const likes = (await items(1)).filter((item) => item.type === 'post_liked');
    expect(likes.map((item) => [item.read, item.actorCount])).toEqual([
      [false, 1],
      [true, 2],
    ]);
    expect(
      (await items(1, '?unreadOnly=true')).map((item) => item.type),
    ).toEqual(['post_liked', 'post_commented']);

    // Only the recipient can delete a notification.
    await as(0)
      .delete('/notifications/' + liked.id)
      .expect(404);
    await as(1)
      .delete('/notifications/' + liked.id)
      .expect(204);
    await as(1).delete('/notifications/not-a-uuid').expect(400);

    // Deleting the post deletes its notifications.
    await as(1)
      .delete('/community/posts/' + postId)
      .expect(200);
    expect(await database.getRepository(Notification).countBy({ postId })).toBe(
      0,
    );

    // Invites to existing accounts reach the bell with an accept token.
    await as(0)
      .post('/rooms/' + roomId + '/invitations', { email: users[3].email })
      .expect(201);
    const [invite] = await items(3);
    expect(invite).toMatchObject({
      type: 'room_invite',
      actor: { id: users[0].id },
      entity: { type: 'room', id: String(roomId) },
      roomId,
      data: { roomName: 'Notification room' },
    });
    await as(3)
      .post('/room-invitations/accept', { token: invite.data.inviteToken })
      .expect(201);

    // Retention removes only read notifications older than 90 days.
    const repository = database.getRepository(Notification);
    const [recent] = await items(2);
    await repository.update(
      { id: invite.id },
      { readAt: new Date(Date.now() - 91 * 86_400_000) },
    );
    await repository.update({ id: recent.id }, { readAt: new Date() });
    await app.get(NotificationsService).pruneRead();
    expect(await repository.existsBy({ id: invite.id })).toBe(false);
    expect(await repository.existsBy({ id: recent.id })).toBe(true);
  });

  describe('inviting users to rooms from their profile', () => {
    const server = () => app.getHttpServer();
    let people: User[] = [];
    let token: string[] = [];
    const as = (index: number) => ({
      get: (path: string) =>
        request(server()).get(path).auth(token[index], { type: 'bearer' }),
      post: (path: string, body?: object) =>
        request(server())
          .post(path)
          .auth(token[index], { type: 'bearer' })
          .send(body),
      patch: (path: string, body?: object) =>
        request(server())
          .patch(path)
          .auth(token[index], { type: 'bearer' })
          .send(body),
      put: (path: string) =>
        request(server()).put(path).auth(token[index], { type: 'bearer' }),
      delete: (path: string) =>
        request(server()).delete(path).auth(token[index], { type: 'bearer' }),
    });
    // 0 owns the rooms, 1 is a member, 2..4 are people being invited, 5 is an outsider.
    const [OWNER, MEMBER, A, B, C, OUTSIDER] = [0, 1, 2, 3, 4, 5];
    let privateId: number;
    let publicId: number;
    const addMember = (roomId: number, userId: number) =>
      database
        .createQueryBuilder()
        .relation(Room, 'users')
        .of(roomId)
        .add(userId);
    const invite = (
      by: number,
      roomId: number,
      body: { userId?: number; email?: string },
    ) => as(by).post('/rooms/' + roomId + '/invitations', body);
    const notifications = async (index: number, type: string) =>
      (
        (await as(index).get('/notifications').expect(200)).body.items as {
          type: string;
          data: { invitationId?: number };
          actor: { id: number };
        }[]
      ).filter((item) => item.type === type);
    const statusOf = async (id: number) =>
      (await database.getRepository(RoomInvitation).findOneByOrFail({ id }))
        .status;

    beforeAll(async () => {
      const role = await database
        .getRepository(Role)
        .findOneByOrFail({ name: 'user' });
      for (let index = 0; index < 6; index++) {
        const user = await database.getRepository(User).save({
          email: 'invite' + index + '@example.test',
          username: 'Inviter ' + index,
          password: 'private-password-hash',
          isEmailVerified: true,
          role,
        });
        people.push(user);
        token.push((await tokens.generateTokens(user)).accessToken);
      }
      privateId = (
        await as(OWNER)
          .post('/rooms', { name: 'Invite private room', isPublic: false })
          .expect(201)
      ).body.id;
      publicId = (
        await as(OWNER)
          .post('/rooms', { name: 'Invite public room', isPublic: true })
          .expect(201)
      ).body.id;
      for (const roomId of [privateId, publicId])
        await addMember(roomId, people[MEMBER].id);
    });

    it('defaults the invite policy to everyone and lets users change it', async () => {
      expect(
        (await as(A).get('/users/me').expect(200)).body.roomInvitePolicy,
      ).toBe('everyone');
      await as(A).patch('/users/me', { roomInvitePolicy: 'bogus' }).expect(400);
      const updated = await as(A)
        .patch('/users/me', { roomInvitePolicy: 'nobody' })
        .expect(200);
      expect(updated.body.roomInvitePolicy).toBe('nobody');
      await as(A)
        .patch('/users/me', { roomInvitePolicy: 'everyone' })
        .expect(200);
    });

    it('lets only members invite and validates the body', async () => {
      await invite(OUTSIDER, privateId, { userId: people[A].id }).expect(403);
      await invite(OWNER, privateId, {}).expect(400);
      await invite(OWNER, privateId, {
        userId: people[A].id,
        email: 'x@example.test',
      }).expect(400);
      await invite(OWNER, privateId, { userId: 0 }).expect(400);
      await invite(OWNER, privateId, { userId: 999999 }).expect(404);
      await invite(OWNER, privateId, { userId: people[OWNER].id }).expect(400);
      await invite(OWNER, privateId, { userId: people[MEMBER].id }).expect(409);
      await invite(OWNER, 999999, { userId: people[A].id }).expect(404);
    });

    it('runs the owner flow: pending, notify, duplicate, decline, re-invite, accept', async () => {
      const created = await invite(OWNER, privateId, {
        userId: people[A].id,
      }).expect(201);
      assertOpenApiResponse(
        createOpenApiDocument(app),
        'RoomInvitations_inviteUser',
        created.body,
      );
      const id = created.body.id as number;
      expect(created.body).toMatchObject({
        status: 'pending',
        room: { id: privateId, name: 'Invite private room' },
        inviter: { id: people[OWNER].id },
        invitee: { id: people[A].id },
      });
      const days =
        (Date.parse(created.body.expiresAt) -
          Date.parse(created.body.createdAt)) /
        86_400_000;
      expect(Math.round(days)).toBe(14);
      expect((await notifications(A, 'room_invite'))[0]).toMatchObject({
        data: { invitationId: id },
        actor: { id: people[OWNER].id },
      });
      await invite(MEMBER, privateId, { userId: people[A].id }).expect(409);

      // Only the invitee can answer.
      await as(OUTSIDER)
        .post('/room-invitations/' + id + '/accept')
        .expect(403);
      await as(OWNER)
        .post('/room-invitations/' + id + '/decline')
        .expect(403);
      await as(A).post('/room-invitations/999999/accept').expect(404);

      const mine = await as(A).get('/me/room-invitations').expect(200);
      assertOpenApiResponse(
        createOpenApiDocument(app),
        'MyRoomInvitations_list',
        mine.body,
      );
      expect(mine.body.data.map((i: { id: number }) => i.id)).toContain(id);
      await as(A).get('/me/room-invitations?status=bogus').expect(400);
      await as(A)
        .get('/me/room-invitations?status=awaiting_approval')
        .expect(400);
      expect(
        (await as(A).get('/me/room-invitations?status=declined').expect(200))
          .body.data,
      ).toHaveLength(0);

      const declined = await as(A)
        .post('/room-invitations/' + id + '/decline')
        .expect(200);
      expect(declined.body.status).toBe('declined');
      expect(declined.body.respondedAt).toBeTruthy();
      expect(
        (await notifications(OWNER, 'room_invite_declined')).map(
          (item) => item.data.invitationId,
        ),
      ).toContain(id);
      await as(A)
        .post('/room-invitations/' + id + '/accept')
        .expect(409);
      expect(
        (await as(A).get('/me/room-invitations?status=declined').expect(200))
          .body.data,
      ).toHaveLength(1);

      const again = await invite(OWNER, privateId, {
        userId: people[A].id,
      }).expect(201);
      const accepted = await as(A)
        .post('/room-invitations/' + again.body.id + '/accept')
        .expect(200);
      assertOpenApiResponse(
        createOpenApiDocument(app),
        'RoomInvitationActions_accept',
        accepted.body,
      );
      expect(accepted.body.status).toBe('accepted');
      expect(
        await database.getRepository(Room).exists({
          where: { id: privateId, users: { id: people[A].id } },
        }),
      ).toBe(true);
      expect(
        (await notifications(OWNER, 'room_invite_accepted')).map(
          (item) => item.data.invitationId,
        ),
      ).toContain(again.body.id);
      // Accepting twice is harmless.
      await as(A)
        .post('/room-invitations/' + again.body.id + '/accept')
        .expect(200);
    });

    it('holds member invitations to private rooms for owner approval', async () => {
      const created = await invite(MEMBER, privateId, {
        userId: people[B].id,
      }).expect(201);
      const id = created.body.id as number;
      expect(created.body.status).toBe('awaiting_approval');
      expect(
        (await notifications(OWNER, 'room_invite_approval')).map(
          (item) => item.data.invitationId,
        ),
      ).toContain(id);
      expect(await notifications(B, 'room_invite')).toHaveLength(0);
      // The invitee cannot see or answer it yet.
      expect(
        (await as(B).get('/me/room-invitations').expect(200)).body.data,
      ).toHaveLength(0);
      await as(B)
        .post('/room-invitations/' + id + '/accept')
        .expect(404);
      await invite(OWNER, privateId, { userId: people[B].id }).expect(409);

      // Only the owner lists and reviews it.
      await as(MEMBER)
        .get('/rooms/' + privateId + '/invitations')
        .expect(403);
      const waiting = await as(OWNER)
        .get('/rooms/' + privateId + '/invitations?status=awaiting_approval')
        .expect(200);
      assertOpenApiResponse(
        createOpenApiDocument(app),
        'RoomInvitations_getRoomInvitations',
        waiting.body,
      );
      expect(waiting.body.data.map((i: { id: number }) => i.id)).toEqual([id]);
      await as(MEMBER)
        .post('/room-invitations/' + id + '/approve')
        .expect(403);
      await as(MEMBER)
        .post('/room-invitations/' + id + '/reject')
        .expect(403);
      await as(B)
        .post('/room-invitations/' + id + '/approve')
        .expect(403);

      const approved = await as(OWNER)
        .post('/room-invitations/' + id + '/approve')
        .expect(200);
      expect(approved.body).toMatchObject({
        status: 'pending',
        reviewedBy: { id: people[OWNER].id },
      });
      await as(OWNER)
        .post('/room-invitations/' + id + '/approve')
        .expect(409);
      expect((await notifications(B, 'room_invite'))[0].data.invitationId).toBe(
        id,
      );
      await as(B)
        .post('/room-invitations/' + id + '/accept')
        .expect(200);
      expect(
        (await notifications(MEMBER, 'room_invite_accepted')).map(
          (item) => item.data.invitationId,
        ),
      ).toContain(id);
    });

    it('rejects, cancels and lets the invite be sent again', async () => {
      const first = await invite(MEMBER, privateId, {
        userId: people[C].id,
      }).expect(201);
      await as(OWNER)
        .post('/room-invitations/' + first.body.id + '/reject')
        .expect(200);
      expect(await statusOf(first.body.id)).toBe('rejected');
      expect(
        (await notifications(MEMBER, 'room_invite_rejected')).map(
          (item) => item.data.invitationId,
        ),
      ).toContain(first.body.id);
      await as(OWNER)
        .post('/room-invitations/' + first.body.id + '/reject')
        .expect(409);
      // The invitee never learns about a rejected invitation.
      expect(
        (await as(C).get('/me/room-invitations').expect(200)).body.data,
      ).toHaveLength(0);

      const second = await invite(MEMBER, privateId, {
        userId: people[C].id,
      }).expect(201);
      await as(OWNER)
        .delete('/room-invitations/' + second.body.id)
        .expect(403);
      const cancelled = await as(MEMBER)
        .delete('/room-invitations/' + second.body.id)
        .expect(200);
      expect(cancelled.body.status).toBe('cancelled');
      await as(MEMBER)
        .delete('/room-invitations/' + second.body.id)
        .expect(409);
      await as(MEMBER)
        .post('/room-invitations/' + second.body.id + '/approve')
        .expect(403);
      await as(OWNER)
        .post('/room-invitations/' + second.body.id + '/approve')
        .expect(409);
    });

    it('skips approval in public rooms and for owners', async () => {
      const created = await invite(MEMBER, publicId, {
        userId: people[C].id,
      }).expect(201);
      expect(created.body.status).toBe('pending');
      expect(created.body.inviter.id).toBe(people[MEMBER].id);
      await as(MEMBER)
        .delete('/room-invitations/' + created.body.id)
        .expect(200);
    });

    it('describes your rooms for the profile invite menu', async () => {
      await invite(MEMBER, publicId, { userId: people[C].id }).expect(201);
      const response = await as(MEMBER)
        .get('/users/' + people[C].id + '/invitable-rooms')
        .expect(200);
      assertOpenApiResponse(
        createOpenApiDocument(app),
        'UserInvitableRooms_list',
        response.body,
      );
      const byName = Object.fromEntries(
        response.body.data.map((room: { name: string }) => [room.name, room]),
      );
      expect(byName['Invite private room']).toMatchObject({
        isMember: false,
        hasPendingInvite: false,
        requiresApproval: true,
      });
      expect(byName['Invite public room']).toMatchObject({
        isMember: false,
        hasPendingInvite: true,
        requiresApproval: false,
      });
      const asOwner = await as(OWNER)
        .get('/users/' + people[A].id + '/invitable-rooms')
        .expect(200);
      expect(
        asOwner.body.data.find(
          (room: { name: string }) => room.name === 'Invite private room',
        ),
      ).toMatchObject({ isMember: true, requiresApproval: false });
      await as(MEMBER)
        .get('/users/' + people[MEMBER].id + '/invitable-rooms')
        .expect(400);
      await as(MEMBER).get('/users/999999/invitable-rooms').expect(404);
      await as(MEMBER).get('/users/abc/invitable-rooms').expect(400);
      await request(server())
        .get('/users/' + people[C].id + '/invitable-rooms')
        .expect(401);
      await as(MEMBER)
        .delete('/room-invitations/' + (await latestInvitationId(publicId, C)))
        .expect(200);
    });

    const latestInvitationId = async (roomId: number, user: number) =>
      (
        await database.getRepository(RoomInvitation).findOneOrFail({
          where: { room: { id: roomId }, inviteeUserId: people[user].id },
          order: { id: 'DESC' },
        })
      ).id;

    it('honors the invitee policy', async () => {
      await as(C)
        .patch('/users/me', { roomInvitePolicy: 'nobody' })
        .expect(200);
      await invite(OWNER, privateId, { userId: people[C].id }).expect(403);
      await as(C)
        .patch('/users/me', { roomInvitePolicy: 'following' })
        .expect(200);
      await invite(OWNER, privateId, { userId: people[C].id }).expect(403);
      await as(C)
        .put('/community/users/' + people[OWNER].id + '/follow')
        .expect(200);
      const created = await invite(OWNER, privateId, {
        userId: people[C].id,
      }).expect(201);
      await as(OWNER)
        .delete('/room-invitations/' + created.body.id)
        .expect(200);

      // Blocking invites later stops an approval that was still waiting.
      await as(C)
        .patch('/users/me', { roomInvitePolicy: 'everyone' })
        .expect(200);
      const waiting = await invite(MEMBER, privateId, {
        userId: people[C].id,
      }).expect(201);
      expect(waiting.body.status).toBe('awaiting_approval');
      await as(C)
        .patch('/users/me', { roomInvitePolicy: 'nobody' })
        .expect(200);
      await as(OWNER)
        .post('/room-invitations/' + waiting.body.id + '/approve')
        .expect(403);
      await as(OWNER)
        .post('/room-invitations/' + waiting.body.id + '/reject')
        .expect(200);
      await as(C)
        .patch('/users/me', { roomInvitePolicy: 'everyone' })
        .expect(200);
    });

    it('cancels what a leaving inviter had waiting but keeps pending invitations', async () => {
      await addMember(privateId, people[OUTSIDER].id);
      const waiting = await invite(OUTSIDER, privateId, {
        userId: people[C].id,
      }).expect(201);
      expect(waiting.body.status).toBe('awaiting_approval');
      await as(OUTSIDER)
        .post('/rooms/' + privateId + '/leave', {})
        .expect(201);
      expect(await statusOf(waiting.body.id)).toBe('cancelled');

      const kept = await invite(OWNER, privateId, {
        userId: people[C].id,
      }).expect(201);
      await addMember(privateId, people[OUTSIDER].id);
      const pendingFromMember = await database
        .getRepository(RoomInvitation)
        .save({
          room: { id: privateId },
          inviterId: people[OUTSIDER].id,
          inviteeUserId: null,
          email: 'kept-after-leave@example.test',
          status: 'pending',
          pendingAt: new Date(),
          expiresAt: new Date(Date.now() + 86_400_000),
        });
      await as(OUTSIDER)
        .post('/rooms/' + privateId + '/leave', {})
        .expect(201);
      expect(await statusOf(kept.body.id)).toBe('pending');
      expect(await statusOf(pendingFromMember.id)).toBe('pending');
      await as(OWNER)
        .delete('/room-invitations/' + kept.body.id)
        .expect(200);
    });

    it('moves waiting invitations forward when the room becomes public', async () => {
      const room = (
        await as(OWNER)
          .post('/rooms', { name: 'Soon public room', isPublic: false })
          .expect(201)
      ).body.id as number;
      await addMember(room, people[MEMBER].id);
      const waiting = await invite(MEMBER, room, {
        userId: people[B].id,
      }).expect(201);
      expect(waiting.body.status).toBe('awaiting_approval');
      await as(OWNER)
        .patch('/rooms/' + room, { isPublic: true })
        .expect(200);
      expect(await statusOf(waiting.body.id)).toBe('pending');
      expect(
        (await notifications(B, 'room_invite')).map(
          (item) => item.data.invitationId,
        ),
      ).toContain(waiting.body.id);
      expect(
        (await as(B).get('/me/room-invitations?status=pending').expect(200))
          .body.data[0].room.id,
      ).toBe(room);

      // Joining with the Join button fulfils the invitation.
      await as(B).post('/rooms/join', { roomId: room }).expect(201);
      expect(await statusOf(waiting.body.id)).toBe('accepted');
      expect(
        (await notifications(MEMBER, 'room_invite_accepted')).map(
          (item) => item.data.invitationId,
        ),
      ).toContain(waiting.body.id);
    });

    it('marks open invitations accepted when the user joins by invite link', async () => {
      const created = await invite(OWNER, privateId, {
        userId: people[OUTSIDER].id,
      }).expect(201);
      const link = (
        await as(OWNER)
          .post('/rooms/' + privateId + '/invite-links', {})
          .expect(201)
      ).body;
      await as(OUTSIDER)
        .post('/invite-links/verify/' + link.token)
        .expect(201);
      expect(await statusOf(created.body.id)).toBe('accepted');
    });

    it('checks the current owner and handles a change of owner', async () => {
      const room = (
        await as(OWNER)
          .post('/rooms', { name: 'Changing owner room', isPublic: false })
          .expect(201)
      ).body.id as number;
      await addMember(room, people[MEMBER].id);
      const waiting = await invite(MEMBER, room, {
        userId: people[C].id,
      }).expect(201);
      await database
        .createQueryBuilder()
        .update(Room)
        .set({ owner: { id: people[MEMBER].id } })
        .where('id = :room', { room })
        .execute();
      await as(OWNER)
        .post('/room-invitations/' + waiting.body.id + '/approve')
        .expect(403);
      await as(MEMBER)
        .post('/room-invitations/' + waiting.body.id + '/approve')
        .expect(200);
    });

    it('expires overdue invitations on read, on answer and in the scheduled job', async () => {
      const room = publicId;
      const created = await invite(OWNER, room, {
        userId: people[OUTSIDER].id,
      }).expect(201);
      await database
        .getRepository(RoomInvitation)
        .update(created.body.id, { expiresAt: new Date(Date.now() - 1000) });
      expect(
        (
          await as(OUTSIDER)
            .get('/me/room-invitations?status=expired')
            .expect(200)
        ).body.data.map((i: { id: number }) => i.id),
      ).toContain(created.body.id);
      expect(
        (
          await as(OUTSIDER)
            .get('/me/room-invitations?status=pending')
            .expect(200)
        ).body.data.map((i: { id: number }) => i.id),
      ).not.toContain(created.body.id);
      await as(OUTSIDER)
        .post('/room-invitations/' + created.body.id + '/accept')
        .expect(410);
      expect(await statusOf(created.body.id)).toBe('expired');

      // An overdue invitation does not block a new one, even before the job runs.
      const overdue = await invite(OWNER, room, {
        userId: people[OUTSIDER].id,
      }).expect(201);
      await database
        .getRepository(RoomInvitation)
        .update(overdue.body.id, { expiresAt: new Date(Date.now() - 1000) });
      await invite(OWNER, room, { userId: people[OUTSIDER].id })
        .expect(201)
        .then(async (fresh) => {
          expect(await statusOf(overdue.body.id)).toBe('expired');
          await database
            .getRepository(RoomInvitation)
            .update(fresh.body.id, { expiresAt: new Date(Date.now() - 1000) });
        });
      await app.get(InvitationLifecycleService).expireOverdue();
      expect(
        await database.getRepository(RoomInvitation).countBy({
          inviteeUserId: people[OUTSIDER].id,
          status: In(['pending', 'awaiting_approval']),
        }),
      ).toBe(0);
    });

    it('limits how many invitations a user can send per day', async () => {
      const repo = database.getRepository(RoomInvitation);
      const recent = await repo.countBy({
        inviterId: people[OWNER].id,
        createdAt: MoreThan(new Date(Date.now() - 86_400_000)),
      });
      await repo.insert(
        Array.from({ length: 20 - recent }, () => ({
          room: { id: publicId },
          inviterId: people[OWNER].id,
          status: 'cancelled' as const,
          expiresAt: new Date(Date.now() + 86_400_000),
        })),
      );
      const limited = await invite(OWNER, publicId, { userId: people[B].id });
      expect(limited.status).toBe(429);
      // Other people are unaffected.
      await invite(MEMBER, publicId, { userId: people[B].id })
        .expect(201)
        .then((response) =>
          as(MEMBER)
            .delete('/room-invitations/' + response.body.id)
            .expect(200),
        );
      await repo.delete({
        inviterId: people[OWNER].id,
        status: 'cancelled',
        email: IsNull(),
        inviteeUserId: IsNull(),
      });
    });

    it('keeps email invitations on the token flow and approves them like the rest', async () => {
      const guest = 'guest-' + randomUUID() + '@example.test';
      mail.sendInvitationEmail.mockClear();
      const waiting = await invite(MEMBER, privateId, { email: guest }).expect(
        201,
      );
      expect(waiting.body).toMatchObject({
        status: 'awaiting_approval',
        email: guest,
        invitee: null,
      });
      expect(mail.sendInvitationEmail).not.toHaveBeenCalled();
      await invite(OWNER, privateId, { email: guest.toUpperCase() }).expect(
        409,
      );
      await as(OWNER)
        .post('/room-invitations/' + waiting.body.id + '/approve')
        .expect(200);
      expect(mail.sendInvitationEmail).toHaveBeenCalledTimes(1);
      expect(mail.sendInvitationEmail.mock.calls[0][0].email).toBe(guest);
      await as(MEMBER)
        .delete('/room-invitations/' + waiting.body.id)
        .expect(200);

      // An address that belongs to an account is an invitation to that account.
      const direct = await invite(OWNER, publicId, {
        email: people[B].email.toUpperCase(),
      }).expect(201);
      expect(direct.body.invitee.id).toBe(people[B].id);
      const note = (await notifications(B, 'room_invite')).find(
        (item) => item.data.invitationId === direct.body.id,
      );
      expect(note).toBeDefined();
      await as(OWNER)
        .delete('/room-invitations/' + direct.body.id)
        .expect(200);
    });

    it('lists the invitations you sent from every room with a status summary', async () => {
      await request(server()).get('/me/sent-room-invitations').expect(401);

      // Fresh people so earlier tests' invitations do not leak into the counts.
      const role = await database
        .getRepository(Role)
        .findOneByOrFail({ name: 'user' });
      const first = people.length;
      for (let index = 0; index < 5; index++) {
        const user = await database.getRepository(User).save({
          email: 'sent-' + randomUUID() + '@example.test',
          username: 'Sender ' + randomUUID().slice(0, 8),
          password: 'private-password-hash',
          isEmailVerified: true,
          role,
        });
        people.push(user);
        token.push((await tokens.generateTokens(user)).accessToken);
      }
      const [SENDER, P1, P2, P3, P4] = [0, 1, 2, 3, 4].map((i) => first + i);
      const ownId = (
        await as(SENDER)
          .post('/rooms', { name: 'Sender room', isPublic: true })
          .expect(201)
      ).body.id as number;
      await addMember(privateId, people[SENDER].id);

      const ids: number[] = [];
      const send = async (roomId: number, body: object) => {
        const response = await invite(SENDER, roomId, body).expect(201);
        ids.push(response.body.id);
        return response.body as { id: number; status: string };
      };
      const pending = await send(ownId, { userId: people[P1].id });
      expect(pending.status).toBe('pending');
      await send(ownId, {
        email: 'sent-guest-' + randomUUID() + '@example.test',
      });
      const waiting = await send(privateId, { userId: people[P2].id });
      expect(waiting.status).toBe('awaiting_approval');
      const rejected = await send(privateId, { userId: people[P3].id });
      await as(OWNER)
        .post('/room-invitations/' + rejected.id + '/reject')
        .expect(200);
      const overdue = await send(ownId, { userId: people[P4].id });
      await database
        .getRepository(RoomInvitation)
        .update(overdue.id, { expiresAt: new Date(Date.now() - 1000) });
      // Someone else's invitation is not listed.
      const other = await invite(OWNER, publicId, {
        userId: people[P1].id,
      }).expect(201);

      const all = await as(SENDER).get('/me/sent-room-invitations').expect(200);
      assertOpenApiResponse(
        createOpenApiDocument(app),
        'MySentRoomInvitations_list',
        all.body,
      );
      expect(all.body.data.map((i: { id: number }) => i.id)).toEqual(
        [...ids].reverse(),
      );
      expect(all.body.data.map((i: { id: number }) => i.id)).not.toContain(
        other.body.id,
      );
      const summary = {
        total: 5,
        awaiting_approval: 1,
        pending: 2,
        accepted: 0,
        declined: 0,
        rejected: 1,
        cancelled: 0,
        expired: 1,
      };
      expect(all.body.summary).toEqual(summary);
      expect(
        all.body.data.find((i: { id: number }) => i.id === overdue.id).status,
      ).toBe('expired');

      // The filter narrows data, never the summary.
      const filtered = await as(SENDER)
        .get('/me/sent-room-invitations?status=rejected')
        .expect(200);
      expect(filtered.body.data.map((i: { id: number }) => i.id)).toEqual([
        rejected.id,
      ]);
      expect(filtered.body.summary).toEqual(summary);
      expect(
        (
          await as(SENDER)
            .get('/me/sent-room-invitations?status=expired')
            .expect(200)
        ).body.data.map((i: { id: number }) => i.id),
      ).toEqual([overdue.id]);
      expect(
        (
          await as(SENDER)
            .get('/me/sent-room-invitations?status=awaiting_approval')
            .expect(200)
        ).body.data.map((i: { id: number }) => i.id),
      ).toEqual([waiting.id]);

      const paged = await as(SENDER)
        .get('/me/sent-room-invitations?limit=2&page=2')
        .expect(200);
      expect(paged.body.meta).toEqual({
        totalItems: 5,
        itemsPerPage: 2,
        totalPages: 3,
        currentPage: 2,
      });
      expect(paged.body.data.map((i: { id: number }) => i.id)).toEqual(
        [...ids].reverse().slice(2, 4),
      );

      for (const query of ['status=bogus', 'limit=51', 'limit=0', 'page=0'])
        await as(SENDER)
          .get('/me/sent-room-invitations?' + query)
          .expect(400);
      expect(
        (await as(P1).get('/me/sent-room-invitations').expect(200)).body.summary
          .total,
      ).toBe(0);

      await as(OWNER)
        .delete('/room-invitations/' + other.body.id)
        .expect(200);
    });

    it('applies the invitations migration with the same shape as the entities', async () => {
      const runner = database.createQueryRunner();
      const target = schema + '_invitations';
      const shape = async (name: string) => ({
        columns: (await runner.query(
          'SELECT table_name, column_name, data_type, is_nullable, character_maximum_length FROM information_schema.columns WHERE table_schema = $1 AND table_name IN ($2, $3) AND (table_name = $2 OR column_name = $4) ORDER BY table_name, column_name',
          [name, 'room_invitation', 'user', 'roomInvitePolicy'],
        )) as unknown[],
        indexes: (
          (await runner.query(
            'SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = $1 AND tablename = $2 ORDER BY indexname',
            [name, 'room_invitation'],
          )) as { indexname: string; indexdef: string }[]
        )
          .filter((index) => !/^PK_|_pkey$/.test(index.indexname))
          .map((index) => index.indexdef.split(name).join('')),
      });
      await runner.connect();
      await runner.startTransaction();
      try {
        await runner.query('CREATE SCHEMA "' + target + '"');
        await runner.query('SET LOCAL search_path TO "' + target + '"');
        await runner.query(`
          CREATE TABLE "user" ("id" SERIAL PRIMARY KEY, "email" varchar(255) NOT NULL);
          CREATE TABLE "room" ("id" SERIAL PRIMARY KEY);
          CREATE TABLE "notification" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "type" varchar(32) NOT NULL,
            CONSTRAINT "CHK_notification_type" CHECK ("type" IN ('room_invite', 'movie_added', 'chat_mention', 'post_liked', 'post_commented')));
          CREATE TYPE "room_invitation_status_enum" AS ENUM('pending', 'accepted', 'declined', 'expired');
          CREATE TYPE "room_invitation_userstatus_enum" AS ENUM('member', 'notVerified', 'guest');
          CREATE TABLE "room_invitation" ("id" SERIAL NOT NULL, "email" character varying NOT NULL,
            "status" "room_invitation_status_enum" NOT NULL DEFAULT 'pending',
            "userStatus" "room_invitation_userstatus_enum" NOT NULL DEFAULT 'guest',
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            "roomId" integer REFERENCES "room"("id") ON DELETE CASCADE, "invitedById" integer REFERENCES "user"("id") ON DELETE SET NULL,
            CONSTRAINT "UQ_31a34814d3264e21e9fdf2a2775" UNIQUE ("email", "roomId"), CONSTRAINT "PK_297d79115071f9e85633ceea6ab" PRIMARY KEY ("id"));
          CREATE INDEX "IDX_invitation_room_created" ON "room_invitation" ("roomId", "createdAt", "id");
          INSERT INTO "user" ("email") VALUES ('Member@Example.test'), ('inviter@example.test');
          INSERT INTO "room" DEFAULT VALUES;
          INSERT INTO "room_invitation" ("email", "status", "roomId", "invitedById") VALUES
            ('member@example.test', 'pending', 1, 2), ('nobody@example.test', 'accepted', 1, 2);
        `);
        const migration = new RoomUserInvitations1793059200000();
        await migration.up(runner);
        const rows = (await runner.query(
          'SELECT "email", "status", "inviterId", "inviteeUserId", "pendingAt" IS NOT NULL AS shown, "expiresAt" > now() AS open FROM "room_invitation" ORDER BY "id"',
        )) as Record<string, unknown>[];
        expect(rows).toEqual([
          {
            email: 'member@example.test',
            status: 'pending',
            inviterId: 2,
            inviteeUserId: 1,
            shown: true,
            open: true,
          },
          {
            email: 'nobody@example.test',
            status: 'accepted',
            inviterId: 2,
            inviteeUserId: null,
            shown: true,
            open: true,
          },
        ]);
        const migrated = await shape(target);
        const synchronized = await shape(schema);
        expect(migrated.columns).toEqual(synchronized.columns);
        expect(migrated.indexes).toEqual(synchronized.indexes);
        await runner.query(
          `INSERT INTO "notification" ("type") VALUES ('room_invite_accepted')`,
        );
        await migration.down(runner);
        expect(
          await runner.query(
            'SELECT "email", "status" FROM "room_invitation" ORDER BY "id"',
          ),
        ).toEqual([
          { email: 'member@example.test', status: 'pending' },
          { email: 'nobody@example.test', status: 'accepted' },
        ]);
      } finally {
        await runner.rollbackTransaction();
        await runner.release();
      }
    });
  });

  it('applies the notifications migration with the same shape as the entity', async () => {
    const runner = database.createQueryRunner();
    const migrationSchema = schema + '_notifications';
    const shape = async (target: string) => ({
      columns: (await runner.query(
        'SELECT column_name, data_type, is_nullable, character_maximum_length, datetime_precision FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY column_name',
        [target, 'notification'],
      )) as unknown[],
      indexes: (
        (await runner.query(
          'SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = $1 AND tablename = $2 ORDER BY indexname',
          [target, 'notification'],
        )) as { indexname: string; indexdef: string }[]
      )
        .filter((index) => !/^PK_|_pkey$/.test(index.indexname))
        .map((index) => index.indexdef.split(target).join('')),
    });
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query('CREATE SCHEMA "' + migrationSchema + '"');
      await runner.query(
        'SET LOCAL search_path TO "' + migrationSchema + '", "' + schema + '"',
      );
      const migration = new Notifications1792972800000();
      await migration.up(runner);
      const migrated = await shape(migrationSchema);
      const synchronized = await shape(schema);
      expect(migrated.columns).toEqual(synchronized.columns);
      expect(migrated.indexes).toEqual(synchronized.indexes);
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
