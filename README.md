# Our Shared Moments (99)

Build a couples-only shared memory calendar app called "우리의 기록" (Our Records).

Core concept:

- Exactly 2 users share one calendar (couple space)

- Each date can have: photos (up to 10), a visited location (with map pin), a memo, and individual star ratings (0.5~10 scale) from each partner

- Both partners see each other's ratings side by side

Tech stack:

- Supabase for auth, database, and photo storage

- React + Tailwind CSS

- React Router for navigation

Pages to scaffold (empty shells are fine for now):

1. /login — email/password login + signup

2. /connect — enter a 6-digit couple code to link with partner

3. /calendar — main monthly calendar view (home)

4. /date/:dateId — detail view for a specific date

5. /record/new — form to add a new record

6. /map — all visited locations on a map

7. /settings — profile and couple settings

Database tables (set up in Supabase):

- users: id, nickname, avatar_url, couple_id

- couples: id, user1_id, user2_id, couple_name, anniversary, invite_code

- records: id, couple_id, date, memo, tag, location_name, lat, lng, author_id, created_at

- photos: id, record_id, storage_url, order

- ratings: id, record_id, user_id, score

Use Row Level Security so each couple can only see their own data.

Start with the login page and Supabase auth setup.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://together-evermore.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c505a8f7-10ba-45d3-87b2-13935727e12b).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
