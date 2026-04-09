# WorkReady Portal

The single-page student workstation for the WorkReady simulation.

The portal transforms based on the student's state — pre-hire it shows the
primer and job board, post-hire it themes itself to the assigned company
and reveals task workspace, work inbox, team view, and intranet access.

## Configuration

Edit `config.js` to set the API base URL and external links.

For local development, override the API base in the browser console:
```javascript
localStorage.setItem('workready_api_base', 'http://localhost:8000');
```

## Local Development

Open `index.html` in a browser, or serve with a static file server:
```bash
python3 -m http.server 8080
```

Make sure the WorkReady API is running and CORS allows your origin.

## States

| State | Trigger | What's visible |
|-------|---------|---------------|
| `NOT_APPLIED` | New student, no applications | Primer + job board links |
| `APPLIED` | Submitted resume, awaiting outcome | Personal inbox + application history |
| `HIRED` | Resume passed, advanced to interview | Theme switches to company; tasks, work inbox, intranet, team |
| `COMPLETED` | All 6 stages done | Final reflection + replay option |

## Repos

- [workready-api](https://github.com/michael-borck/workready-api) — backend
- [workready-jobs](https://github.com/michael-borck/workready-jobs) — job board
- [workready-primer](https://github.com/michael-borck/workready-primer) — Ink interactive fiction
