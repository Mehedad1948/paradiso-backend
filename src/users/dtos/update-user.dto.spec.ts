import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UpdateUserDto } from './update-user.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
});
const parse = (body: object) =>
  pipe.transform(body, { type: 'body', metatype: UpdateUserDto });
// ValidationPipe puts the readable messages in the response body.
const rejection = async (body: object) => {
  const error: unknown = await parse(body).then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(BadRequestException);
  const { message } = (error as BadRequestException).getResponse() as {
    message: string[];
  };
  return message.join(' | ');
};
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('UpdateUserDto onboarding fields', () => {
  it('keeps every new field optional', async () => {
    await expect(parse({})).resolves.toEqual({});
    await expect(parse({ username: 'Ada' })).resolves.toMatchObject({
      username: 'Ada',
    });
  });

  describe('genreIds', () => {
    it('accepts a list, an empty list and exactly 10 IDs', async () => {
      await expect(parse({ genreIds: [uuid(1)] })).resolves.toBeDefined();
      await expect(parse({ genreIds: [] })).resolves.toEqual({ genreIds: [] });
      const ten = Array.from({ length: 10 }, (_, i) => uuid(i + 1));
      await expect(parse({ genreIds: ten })).resolves.toBeDefined();
    });

    it('rejects more than 10 IDs', async () => {
      const eleven = Array.from({ length: 11 }, (_, i) => uuid(i + 1));
      expect(await rejection({ genreIds: eleven })).toMatch(/more than 10/);
    });

    it('rejects duplicate IDs', async () => {
      expect(await rejection({ genreIds: [uuid(1), uuid(1)] })).toMatch(
        /unique/,
      );
    });

    it('rejects malformed IDs and non-arrays', async () => {
      expect(await rejection({ genreIds: ['12'] })).toMatch(/UUID/);
      expect(await rejection({ genreIds: [1] })).toMatch(/UUID/);
      expect(await rejection({ genreIds: uuid(1) })).toMatch(/array/);
      expect(await rejection({ genreIds: null })).toMatch(/array/);
    });
  });

  describe('onboarded', () => {
    it('accepts only the boolean true', async () => {
      await expect(parse({ onboarded: true })).resolves.toEqual({
        onboarded: true,
      });
      for (const value of [false, 'true', 1, null])
        expect(await rejection({ onboarded: value })).toMatch(
          /only be set to true/,
        );
    });
  });

  describe('avatar', () => {
    it('allows null to remove it and a bounded string', async () => {
      await expect(parse({ avatar: null })).resolves.toEqual({ avatar: null });
      await expect(
        parse({ avatar: 'https://cdn.example.test/a.png' }),
      ).resolves.toBeDefined();
    });

    it('rejects non-strings and overly long values', async () => {
      expect(await rejection({ avatar: 5 })).toMatch(/string/);
      expect(
        await rejection({
          avatar: 'https://cdn.example.test/' + 'a'.repeat(300),
        }),
      ).toMatch(/255/);
    });
  });
});
