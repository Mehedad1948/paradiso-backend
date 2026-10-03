import { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

// These describe serialized HTTP responses, not database entities. Relations
// differ by endpoint and private user fields must never enter the contract.
type Properties = Record<string, SchemaObject>;
const string: SchemaObject = { type: 'string' };
const integer: SchemaObject = { type: 'integer' };
const number: SchemaObject = { type: 'number' };
const boolean: SchemaObject = { type: 'boolean' };
const uuid: SchemaObject = { type: 'string', format: 'uuid' };
const date: SchemaObject = { type: 'string', format: 'date-time' };
const nullable = (schema: SchemaObject): SchemaObject =>
  '$ref' in schema
    ? { oneOf: [schema, { type: 'object', nullable: true, enum: [null] }] }
    : { ...schema, nullable: true };
export const ref = (name: string): SchemaObject & { $ref: string } => ({
  $ref: `#/components/schemas/${name}`,
});
const array = (items: SchemaObject): SchemaObject => ({ type: 'array', items });
const object = (
  properties: Properties,
  required = Object.keys(properties),
): SchemaObject => ({ type: 'object', properties, required });
const envelope = (schema: SchemaObject): SchemaObject =>
  object({ ...schema.properties, apiVersion: string }, [
    ...(schema.required ?? []),
    'apiVersion',
  ]);
const data = (schema: SchemaObject): SchemaObject =>
  envelope(object({ data: schema }));
const page = (items: SchemaObject): SchemaObject =>
  object({
    data: array(items),
    meta: ref('PaginationMeta'),
    links: ref('PaginationLinks'),
  });
const publicUser = object({
  id: integer,
  username: string,
  avatar: nullable(string),
});
const genre = object({ id: uuid, name: string, tmdbId: integer });
const movieProperties: Properties = {
  id: uuid,
  dbId: integer,
  title: string,
  poster_path: nullable(string),
  vote_average: nullable(number),
  overview: nullable(string),
  original_title: nullable(string),
  video: nullable(string),
  release_date: nullable(string),
  imdbRate: nullable(number),
  imdbLink: nullable(string),
  isWatchedTogether: boolean,
  createdAt: date,
  updatedAt: date,
  addedBy: nullable(ref('PublicUser')),
  genres: array(ref('Genre')),
};
const movie = object(movieProperties);
const linkProperties: Properties = {
  id: integer,
  token: uuid,
  expiresAt: nullable(date),
  maxUsage: integer,
  uses: integer,
  createdAt: date,
  isActive: boolean,
};
const roomProperties: Properties = {
  id: integer,
  name: string,
  description: nullable(string),
  image: nullable(string),
  isPublic: boolean,
};
const tmdbProperties: Properties = {
  id: integer,
  title: string,
  original_title: string,
  overview: string,
  release_date: string,
  poster_path: nullable(string),
  backdrop_path: nullable(string),
  adult: boolean,
  popularity: number,
  vote_average: number,
  vote_count: integer,
  original_language: string,
};
const user = object(
  {
    id: integer,
    email: { type: 'string', format: 'email' },
    username: string,
    avatar: nullable(string),
    role: string,
  },
  ['id', 'email', 'username'],
);
const updatedMovie = object({
  id: uuid,
  dbId: integer,
  title: string,
  release_date: nullable(string),
  imdbRate: nullable(number),
  imdbLink: nullable(string),
  poster_path: nullable(string),
  overview: nullable(string),
  isWatchedTogether: boolean,
  genres: array(ref('Genre')),
  addedBy: object({ username: nullable(string), avatar: nullable(string) }),
  createdAt: date,
  updatedAt: date,
});
const ratedMovie = object({
  ...movieProperties,
  ratings: array(ref('Rating')),
});

export const responseSchemas: Record<string, SchemaObject> = {
  CommunityPost: object({
    id: integer,
    text: string,
    rating: number,
    imageUrl: nullable(string),
    createdAt: date,
    updatedAt: date,
    author: ref('PublicUser'),
    movie: object({
      id: uuid,
      dbId: integer,
      title: string,
      poster_path: nullable(string),
    }),
    room: nullable(object({ id: integer, name: string })),
    promotion: nullable(
      object({
        room: object({ id: integer, name: string, image: nullable(string) }),
        canJoin: boolean,
        token: nullable(uuid),
      }),
    ),
    commentCount: integer,
  }),
  CommunityComment: object({
    id: integer,
    postId: integer,
    text: string,
    author: ref('PublicUser'),
    createdAt: date,
    updatedAt: date,
  }),
  CommunityPostResponse: {},
  CommunityPostPageResponse: envelope(
    object({
      data: array(ref('CommunityPost')),
      nextCursor: nullable(integer),
    }),
  ),
  CommunityCommentResponse: {},
  CommunityCommentPageResponse: envelope(
    object({
      data: array(ref('CommunityComment')),
      nextCursor: nullable(integer),
    }),
  ),
  CommunityProfileResponse: envelope(
    object({
      ...publicUser.properties,
      followersCount: integer,
      followingCount: integer,
    }),
  ),
  CommunityUserPageResponse: envelope(
    object({ data: array(ref('PublicUser')), nextCursor: nullable(integer) }),
  ),
  PublicUser: publicUser,
  UserResponse: envelope(user),
  Genre: genre,
  GenreResponse: envelope(genre),
  GenreListResponse: data(array(ref('Genre'))),
  PaginationMeta: object({
    itemsPerPage: integer,
    totalItems: integer,
    currentPage: integer,
    totalPages: integer,
  }),
  PaginationLinks: object({
    first: string,
    previous: string,
    next: string,
    last: string,
    current: string,
  }),
  Movie: movie,
  MovieResponse: envelope(movie),
  MovieListResponse: envelope(page(ref('Movie'))),
  CreatedMovieResponse: envelope(
    object({ ...movieProperties, addedBy: object({ id: integer }) }, [
      'id',
      'dbId',
      'title',
      'isWatchedTogether',
      'addedBy',
      'genres',
      'createdAt',
      'updatedAt',
    ]),
  ),
  UpdatedMovieResponse: envelope(updatedMovie),
  Rating: object({ id: uuid, rate: integer, user: ref('PublicUser') }),
  RatedMovie: ratedMovie,
  RatedMovieResponse: envelope(ratedMovie),
  RatingsResponse: envelope(
    object({
      movies: page(ref('RatedMovie')),
      users: array(ref('PublicUser')),
    }),
  ),
  AddedRatingResponse: envelope(
    object({
      rate: integer,
      movie: object(
        movieProperties,
        Object.keys(movieProperties).filter((key) => key !== 'genres'),
      ),
    }),
  ),
  RoomListItem: object({
    ...roomProperties,
    owner: object({ id: integer, username: string }),
    users: array(ref('PublicUser')),
    movies: array(
      object({
        id: uuid,
        title: string,
        genres: array(object({ id: uuid, name: string })),
      }),
    ),
  }),
  RoomListResponse: envelope(page(ref('RoomListItem'))),
  RoomResponse: envelope(
    object({
      ...roomProperties,
      owner: ref('PublicUser'),
      users: array(ref('PublicUser')),
      movies: array(
        object({ id: uuid, title: string, poster_path: nullable(string) }),
      ),
    }),
  ),
  CreatedRoomResponse: envelope(
    object(
      {
        message: string,
        id: integer,
        name: string,
        image: nullable(string),
        isPublic: boolean,
        owner: user,
      },
      ['message', 'id', 'name', 'isPublic', 'owner'],
    ),
  ),
  RoomRating: object({
    id: uuid,
    title: string,
    poster_path: nullable(string),
    release_date: nullable(string),
    isWatchedTogether: boolean,
    createdAt: date,
    addedBy: nullable(ref('PublicUser')),
    averageRate: nullable(number),
    userSpecificRate: nullable(number),
    ratings: array(
      object({ user: ref('PublicUser'), rate: nullable(integer) }),
    ),
    hasVoted: boolean,
  }),
  RoomRatingsResponse: envelope(page(ref('RoomRating'))),
  MessageResponse: envelope(object({ message: string })),
  AddedRoomMovieResponse: envelope(object({ message: string, movieId: uuid })),
  InvitationCreatedResponse: envelope(object({ message: string, id: integer })),
  Invitation: object({
    id: integer,
    email: { type: 'string', format: 'email' },
    status: {
      type: 'string',
      enum: ['pending', 'accepted', 'declined', 'expired'],
    },
    userStatus: { type: 'string', enum: ['member', 'notVerified', 'guest'] },
    createdAt: date,
    invitedBy: nullable(ref('PublicUser')),
  }),
  InvitationsResponse: envelope(page(ref('Invitation'))),
  InvitationAcceptedResponse: envelope(
    object({ roomId: integer, message: string }),
  ),
  CreatedInviteLinkResponse: envelope(
    object(
      {
        ...linkProperties,
        room: object({ id: integer }),
        createdBy: object({ id: integer }),
      },
      [
        'id',
        'token',
        'maxUsage',
        'uses',
        'createdAt',
        'isActive',
        'room',
        'createdBy',
      ],
    ),
  ),
  InviteLink: object({
    ...linkProperties,
    createdBy: nullable(ref('PublicUser')),
    inviteUrl: string,
  }),
  InviteLinksResponse: envelope(page(ref('InviteLink'))),
  UpdatedInviteLinkResponse: envelope(
    object({ ...linkProperties, inviteUrl: string }),
  ),
  RemovedInviteLinkResponse: envelope(object({ message: string, id: integer })),
  InvitePreviewResponse: envelope(
    object({
      room: object({
        id: integer,
        name: string,
        description: nullable(string),
        image: nullable(string),
      }),
      inviter: nullable(
        object({ id: integer, name: string, avatar: nullable(string) }),
      ),
      canJoin: boolean,
      message: nullable(string),
    }),
  ),
  InviteJoinedResponse: envelope(
    object({ room: object({ id: integer, name: string }), message: string }),
  ),
  TokensResponse: envelope(
    object({ accessToken: string, refreshToken: string }),
  ),
  TokensMessageResponse: envelope(
    object({ accessToken: string, refreshToken: string, message: string }),
  ),
  StringResponse: data(string),
  EmptyResponse: envelope(object({})),
  RoleResponse: envelope(object({ id: uuid, name: string })),
  UploadResponse: envelope(
    object({
      id: integer,
      name: string,
      path: string,
      type: string,
      mime: string,
      size: number,
      createDate: date,
      updateDate: date,
    }),
  ),
  TmdbGenre: object({ id: integer, name: string }),
  TmdbGenresResponse: data(array(ref('TmdbGenre'))),
  TmdbSearchMovie: {
    ...object(
      { ...tmdbProperties, genre_ids: array(integer), video: boolean },
      ['id', 'title'],
    ),
    additionalProperties: true,
  },
  TmdbSearchResponse: envelope(
    object({
      page: integer,
      total_results: integer,
      total_pages: integer,
      results: array(ref('TmdbSearchMovie')),
    }),
  ),
  TmdbMovieResponse: {
    ...envelope(
      object(
        { ...tmdbProperties, genres: array(ref('TmdbGenre')), video: boolean },
        ['id', 'title', 'genres'],
      ),
    ),
    additionalProperties: true,
  },
  ErrorResponse: object(
    {
      statusCode: integer,
      message: { oneOf: [string, array(string)] },
      error: string,
    },
    ['statusCode', 'message'],
  ),
};

responseSchemas.CommunityPostResponse = envelope(responseSchemas.CommunityPost);
responseSchemas.CommunityCommentResponse = envelope(
  responseSchemas.CommunityComment,
);

// Stable operation IDs are also the keys in generated frontend contracts.
// Adding a route without a response contract causes export/build checks to fail.
export const operationResponses: Record<string, string> = {
  Community_feed: 'CommunityPostPageResponse',
  Community_followingFeed: 'CommunityPostPageResponse',
  Community_roomFeed: 'CommunityPostPageResponse',
  Community_getPost: 'CommunityPostResponse',
  Community_createPost: 'CommunityPostResponse',
  Community_updatePost: 'CommunityPostResponse',
  Community_deletePost: 'MessageResponse',
  Community_listComments: 'CommunityCommentPageResponse',
  Community_createComment: 'CommunityCommentResponse',
  Community_deleteComment: 'MessageResponse',
  Community_profile: 'CommunityProfileResponse',
  Community_follow: 'MessageResponse',
  Community_unfollow: 'MessageResponse',
  Community_followers: 'CommunityUserPageResponse',
  Community_following: 'CommunityUserPageResponse',
  App_getHello: 'StringResponse',
  Auth_isAuthenticated: 'StringResponse',
  Auth_signIn: 'TokensResponse',
  Auth_refreshTokens: 'TokensResponse',
  Auth_verifyEmail: 'TokensMessageResponse',
  Auth_resetPassword: 'TokensMessageResponse',
  Auth_forgetPassword: 'MessageResponse',
  GoogleAuthentication_authenticate: 'ErrorResponse',
  Movies_getMovies: 'MovieListResponse',
  Movies_getMovieById: 'MovieResponse',
  Movies_updateMovieById: 'UpdatedMovieResponse',
  Movies_createMovie: 'CreatedMovieResponse',
  Movies_searchMoviesFromTmdb: 'TmdbSearchResponse',
  Movies_getTmdbGenres: 'TmdbGenresResponse',
  Movies_getTmdbMovieDetails: 'TmdbMovieResponse',
  Rooms_createRoom: 'CreatedRoomResponse',
  Rooms_joinRoom: 'MessageResponse',
  Rooms_getRooms: 'RoomListResponse',
  Rooms_getRoomById: 'RoomResponse',
  Rooms_addMovieToRoom: 'AddedRoomMovieResponse',
  Rooms_removeMovieFromRoom: 'MessageResponse',
  Rooms_getRoomRatings: 'RoomRatingsResponse',
  Ratings_addRating: 'AddedRatingResponse',
  Ratings_getRatings: 'RatingsResponse',
  Ratings_getOneRating: 'RatedMovieResponse',
  RoomInvitations_inviteUser: 'InvitationCreatedResponse',
  RoomInvitations_getRoomInvitations: 'InvitationsResponse',
  AcceptInvitation_accept: 'InvitationAcceptedResponse',
  RoomInviteLinks_create: 'CreatedInviteLinkResponse',
  RoomInviteLinks_findAll: 'InviteLinksResponse',
  RoomInviteLinks_update: 'UpdatedInviteLinkResponse',
  RoomInviteLinks_remove: 'RemovedInviteLinkResponse',
  PublicInviteLinks_getOneByToken: 'InvitePreviewResponse',
  PublicInviteLinks_verify: 'InviteJoinedResponse',
  Users_getCurrentUser: 'UserResponse',
  Users_createUser: 'UserResponse',
  Users_updateUser: 'UserResponse',
  Genres_create: 'GenreListResponse',
  Genres_findAll: 'GenreListResponse',
  Genres_findOne: 'GenreResponse',
  Genres_update: 'GenreResponse',
  Genres_remove: 'EmptyResponse',
  Roles_createRole: 'RoleResponse',
  Uploads_uploadFile: 'UploadResponse',
};
