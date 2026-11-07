# InnovateX

Responsive innovation challenge management app with a custom paper, ink, and chartreuse visual identity. It includes a browser demo and an Express/MongoDB API with JWT authentication, role checks, uploads, weighted review scoring, rankings, notifications, and seeded demo records. When served by Express, use the profile arrow and sign in with a demo account to switch the same UI into database-backed mode.

## Run the browser demo

Open `index.html` directly in a modern browser. Demo edits persist in that browser's local storage. Use the arrow beside the profile at the bottom of the sidebar to switch between Administrator, Participant, and Reviewer demo roles.

On Windows, you can double-click `Open-InnovateX-Demo.bat` to open the browser demo without starting Node.js or MongoDB.

## Run the API application

Requirements: Node.js 18 or later, npm, and MongoDB 6 or later.

1. In MongoDB Atlas, open **Connect → Drivers**, choose **Node.js**, and copy the connection string.
2. Open this project's `.env` file in the same folder as `package.json`. Replace the entire placeholder value on the `MONGODB_URI=` line with the copied URI, change the database name to `innovatex`, and replace `<password>` with the database user's password. URL-encode special characters in the username or password (for example, `@` as `%40`). Use a MongoDB **database user**, not your Atlas website password.
3. In Atlas **Network Access**, allow the IP address of the computer that will run InnovateX.
4. From this directory run `npm run db:check`. It reports success or a sanitized error and never prints the URI.
5. After the connection check passes, run `npm start` and open `http://localhost:4173`. The first server start seeds the database with sample challenges, users, proposals, and reviews.

The `.env` file is ignored by Git. Keep it private and do not paste its contents into chat or commit it.

Demo credentials:

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@demo.com` | `DemoAdmin123!` |
| Participant | `aarav@demo.com` | `DemoUser123!` |
| Reviewer | `anika@demo.com` | `DemoReview123!` |

Set `SEED_DEMO=false` for production. Demo users are only inserted into an empty database when `SEED_DEMO=true`.

## API routes

All protected routes use `Authorization: Bearer <token>`.

| Area | Routes |
| --- | --- |
| Authentication | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` |
| Challenges | `GET/POST /api/challenges`, `GET/PATCH/DELETE /api/challenges/:id`, `POST /api/challenges/:id/register`, `GET /api/challenges/:id/registrations`, `PUT /api/challenges/:id/reviewers` |
| Proposals | `GET/POST /api/proposals`, `GET/PATCH/DELETE /api/proposals/:id`, `POST /api/proposals/:id/reviews` |
| Reviews | `GET /api/reviews`, `PATCH /api/reviews/:id` (admin revision) |
| Results | `GET /api/leaderboard`, `GET /api/results`, `POST /api/results/:id/shortlist`, `POST /api/results/:id/winner` |
| Workspace | `GET /api/users`, `GET /api/analytics`, `GET /api/notifications`, `PATCH /api/notifications/:id/read` |

Proposal create/update requests use `multipart/form-data` with an optional `attachment` field. Allowed file types are PDF, PPT/PPTX, and DOC/DOCX; default size limit is 10 MB. Evaluation requests pass a `scores` object keyed by each challenge criterion name and an optional `feedback` string. Duplicate registration and reviewer evaluation are blocked. Admins can release feedback with `PUT /api/proposals/:id/feedback` and `{ "released": true }`.

When the site is opened directly as a file, it uses the local demo. To use the API-backed experience, start the Express server and open its `http://localhost:4173` address. The API-backed UI supports account login/registration, role-aware data loading, challenge creation/editing and reviewer assignment, participant registration and proposal editing, protected attachment downloads, review scoring, feedback release, shortlisting, and winner announcements. Demo seed credentials are intended for local demonstration; replace them and configure a private secret before deployment.
