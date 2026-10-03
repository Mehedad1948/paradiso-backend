<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

The application uses Neon PostgreSQL. Set `NEON_DB` to the connection URL
in `.env.development` or in the production service's environment settings.
Keep `sslmode=require` in the Neon URL. `DATABASE_URL` is also supported;
`NEON_DB` takes precedence when both are set. The old `DATABASE_HOST`,
`DATABASE_PORT`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`, and `DATABASE_NAME`
settings are no longer used by the application.

Neon CLI commands target project `mute-breeze-23233617`, branch `production`:

```sh
neon login
neon link --project-id mute-breeze-23233617 --branch production -y
neon deploy
node scripts/check-neon.cjs
```

The CLI writes `.env.local`, which the app loads before `.env.development`
(or `.env.production`). Process environment variables take precedence.
`neon.ts` manages Neon service configuration; `neon deploy` does not deploy
the NestJS server or create its TypeORM tables. Production keeps
`DATABASE_SYNCHRONIZE=false`; provision the schema before serving traffic.
For a new empty Neon database, run `npm run build`, then
`node scripts/init-neon.cjs` to generate `database/neon-initial-schema.sql`.
Run `node scripts/init-neon.cjs --apply` to create the tables, indexes, and
default `user`/`admin` roles. The initializer refuses existing public tables;
it does not copy records from the previous database.

Image uploads use Cloudflare R2. Add these settings to `.env.development`
(or `.env.production` for production):

```dotenv
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_BUCKET_NAME=your-r2-bucket-name
R2_PUBLIC_URL=https://images.example.com
S3_ACCESS_KEY_ID=your-r2-access-key-id
S3_SECRET_ACCESS_KEY=your-r2-secret-access-key
jurisdiction=default
```

Alternatively, set `R2_ENDPOINT` to the full HTTPS S3 API endpoint shown in
your R2 dashboard instead of setting `R2_ACCOUNT_ID`. With an account ID,
`jurisdiction` selects the endpoint (`default`, `eu`, `us`, or `fedramp`).
An explicit endpoint takes precedence and must match the bucket's jurisdiction.

`R2_PUBLIC_URL` must be the bucket's connected custom domain or enabled public
`r2.dev` URL, not its S3 API endpoint. Use a custom domain for production.
The S3 credentials need Object Read & Write access to this bucket.
`CLOUDFLAER_TOKEN` is not needed for S3 uploads; the two S3 credentials are used
for authentication. The previous `LIARA_*` settings are no longer used.

`POST /uploads/file` keeps the existing multipart fields (`file`, optional
`folder`) and response shape. New files retain the key format
`paradiso/<folder>/<filename>` and their public R2 URL is saved in `Upload.path`.
Existing database URLs still point to Liara; migrating existing objects and
rewriting those URLs is a separate data migration.

```bash
$ npm install
```

## Compile and run the project

```bash
# build and run the compiled application
$ npm run build
$ npm start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

### Render

Configure the existing web service with:

- **Build Command:** `npm ci --include=dev && npm run build`
- **Start Command:** `npm start` (or `npm run start:prod`)
- **Environment:** `NODE_ENV=production` and `DATABASE_SYNCHRONIZE=false`

The build needs development dependencies, including the Nest CLI and TypeScript.
Both start commands run `node dist/main.js` directly. Do not use `nest start`
as Render's start command: it recompiles the application at runtime and can
exhaust the smaller runtime instance's memory before opening a port. Keep
compilation in the build phase rather than increasing the runtime heap limit.

The server listens on `0.0.0.0` and Render's `PORT` environment variable.
Set the required application environment variables in Render's dashboard:
`NEON_DB` (the Neon PostgreSQL URL with `sslmode=require`),
`DATABASE_AUTOLOADENTITIES=true`, `PROFILE_API_KEY`, `JWT_SECRET`,
`JWT_TOKEN_AUDIENCE`,
`JWT_TOKEN_ISSUER`, `JWT_ACCESS_TOKEN_TTL`, `JWT_REFRESH_TOKEN_TTL`,
`JWT_INVITATION_TOKEN_TTL`, `API_VERSION`, `PRODUCT_BASE_URL`, and `TMDB_API_KEY`.
Also configure `MAIL_HOST`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `R2_BUCKET_NAME`,
`R2_ACCOUNT_ID` (or `R2_ENDPOINT`), `R2_PUBLIC_URL`, `S3_ACCESS_KEY_ID`, and
`S3_SECRET_ACCESS_KEY` for mail and uploads. Keep credentials in Render's
environment settings, not in the repository. Provision the database schema before serving
traffic; production disables automatic schema synchronization.

After pushing these changes, redeploy the service. Confirm that the startup log
shows `node dist/main.js`, followed by a successful Nest application startup.
The dependency audit warnings in the original build log are a separate issue;
this startup fix does not remediate those vulnerabilities.

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
