# WorkReady portal

The student workstation for WorkReady. Students sign in with issued contractor codes, track applications and use personal/work inboxes, interviews, tasks, Teams-style chat, coaching and the lunchroom.

[Project home](https://github.com/michael-borck/workready-deploy) · [Architecture](https://github.com/michael-borck/workready-deploy/blob/main/docs/architecture.md) · [Privacy](https://github.com/michael-borck/workready-deploy/blob/main/docs/privacy.md) · [Live portal](https://workready.eduserver.au/)

## Files and configuration

- `index.html`, `app.js`, `style.css` define the student interface.
- `config.js` defines the API base, company links, themes and journey-step copy.
- `session.js` is the shared session client also loaded by the job board and company forms. Changes can affect all those sites.
- `privacy.html` explains student data handling.
- `admin.html` is the lecturer interface served through the local publishing console. The Pages workflow excludes it from the public site.

The client exchanges a contractor code for an expiring bearer session and stores the token in `sessionStorage`. Other website origins have separate sessions. See [authentication design](https://github.com/michael-borck/workready-deploy/blob/main/docs/adr/0003-contractor-codes-and-sessions.md).

## Student states

| State | Meaning |
|---|---|
| `NOT_APPLIED` | No current application journey |
| `APPLIED` | Application submitted or outcome pending |
| `INTERVIEW` | Shortlisted and in the interview stage |
| `HIRED` | Placement activated after a successful hiring interview |
| `COMPLETED` | Placement completed; history and reflection remain available |

Application stage and status are separate fields. The portal changes its theme and available views during placement. Tasks, mail and social activities can overlap rather than form a strict sequence of screens.

## Development and checks

There is no asset build. From this repository:

```bash
node --check app.js
node --test tests/session.test.cjs
python3 -m http.server 8080
```

Open `http://localhost:8080` for visual inspection. A functional local setup requires agreement between the API URL, HTML Content Security Policy and backend CORS. Changing a localStorage override alone is insufficient. Use an isolated local API and synthetic identities, or the API repository's browser test described in [operations](https://github.com/michael-borck/workready-deploy/blob/main/docs/operations.md#checks-before-publishing).

## Publication

[The Pages workflow](.github/workflows/pages.yml) publishes repository-root assets after a push to `main`. Review and publish changes to `session.js` together with any dependent API/job-board/company changes. Versioned script URLs help prevent cached clients from mixing contracts.

Use the [local console](https://github.com/michael-borck/workready-deploy/blob/main/console/README.md) for lecturer access. Project-wide configuration and deployment instructions live in the [umbrella guides](https://github.com/michael-borck/workready-deploy/blob/main/docs/README.md).
