# MMR Admin Dashboard Endpoints

These endpoints power the MMR (Rally) section of the admin dashboard. They are accessible to admins with role `super_admin` or `mmr_admin`.

All routes are mounted under `/api/admin` and require a valid admin JWT, sent either as:

- Cookie: `admin_token`, or
- Header: `Authorization: Bearer <token>`

Obtained via `POST /api/admin/login`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/mmr/users` | List registered & active mobile users |
| GET | `/api/admin/mmr/users/rally-performance` | List active mobile users with rally submission stats |
| GET | `/api/admin/mmr/users/:userId/rally-performance` | Detailed rally submission breakdown for one user |
| GET | `/api/admin/mmr/submissions` | List raw rally submissions (existing endpoint, kept for reference) |

Common error responses across all endpoints below:

| Status | Meaning |
|--------|---------|
| 401 | Missing/invalid/expired admin token |
| 403 | Admin is not `mmr_admin`/`super_admin`, or account deactivated |
| 500 | Server/database error |

---

## 1. `GET /api/admin/mmr/users`

Returns registered mobile app users who are currently **active** (`isActive: true`, not soft-deleted).

### Query params (optional)

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `search` | string | — | Case-insensitive partial match on `fullName` only (not email) |
| `page` | number | 1 | Page number |
| `limit` | number | 50 | Max 200 per page |

### Response `200`

```json
{
  "success": true,
  "data": [
    {
      "_id": "6a199c388fa1e8b64320fac9",
      "firebaseUid": "GhtDC1L5nKgWYibRV9owemvSENF3",
      "fullName": "Mishen Appuhamy",
      "email": "mikki@example.com",
      "vibes": ["rooftop", "live music", "beachside"],
      "isActive": true,
      "deletedAt": null,
      "createdAt": "2026-05-29T14:01:28.672Z",
      "updatedAt": "2026-05-29T14:05:03.320Z"
    }
  ],
  "pagination": { "total": 8, "page": 1, "limit": 50, "totalPages": 1 },
  "activeUserCount": 8
}
```

- `pagination.total` — count matching the current filter/page (respects `search`).
- `activeUserCount` — total count of ALL active users, unaffected by `search`; good for a dashboard stat card.

---

## 2. `GET /api/admin/mmr/users/rally-performance`

Returns the same active-user population as endpoint 1, but merged with their rally checkpoint progress. Intended for a dashboard **table/overview** of rally performance across users.

### Query params (optional)

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `search` | string | — | Case-insensitive partial match on `fullName` |
| `page` | number | 1 | Page number |
| `limit` | number | 50 | Max 200 per page |

### Response `200`

```json
{
  "success": true,
  "data": [
    {
      "_id": "6a1ae65a91e2ae68788d6e5c",
      "fullName": "Sandaru Abeyratne",
      "email": "sandaru.abeyratne@gmail.com",
      "registeredAt": "2026-05-30T13:30:02.617Z",
      "totalSubmissions": 5,
      "checkpointsCompleted": 2,
      "totalCheckpoints": 6,
      "completionRate": 0.33,
      "allCheckpointsCompleted": false,
      "missingCheckpoints": [3, 4, 5, 6],
      "latestDriverName": "Sandaru Abeyratne",
      "firstSubmissionAt": "2026-07-14T13:37:37.302Z",
      "lastSubmissionAt": "2026-07-26T16:32:40.172Z"
    }
  ],
  "pagination": { "total": 8, "page": 1, "limit": 50, "totalPages": 1 }
}
```

### Field notes

- `totalSubmissions` — raw count of rally answers submitted by the user (includes re-submissions at the same checkpoint).
- `checkpointsCompleted` — count of **distinct** checkpoints (1–6) the user has submitted an answer for. Re-submitting the same checkpoint does not increase this.
- `completionRate` — `checkpointsCompleted / 6`, rounded to 2 decimals.
- `missingCheckpoints` — checkpoint numbers (1–6) the user hasn't submitted an answer for yet.
- Users with zero submissions are still included, with `totalSubmissions: 0` and `firstSubmissionAt`/`lastSubmissionAt`/`latestDriverName` set to `null`.

---

## 3. `GET /api/admin/mmr/users/:userId/rally-performance`

Detailed drill-down for a single user — use this when an admin clicks a row from endpoint 2 (or from the users list in endpoint 1).

`:userId` is the mobile user's MongoDB `_id` (same id returned by endpoints 1 and 2).

### Response `200`

```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "6a1ae65a91e2ae68788d6e5c",
      "fullName": "Sandaru Abeyratne",
      "email": "sandaru.abeyratne@gmail.com",
      "vibes": ["rooftop", "live-music", "late-night", "family", "beach"],
      "isActive": true,
      "registeredAt": "2026-05-30T13:30:02.617Z"
    },
    "summary": {
      "totalSubmissions": 5,
      "checkpointsCompleted": 2,
      "totalCheckpoints": 6,
      "completionRate": 0.33,
      "allCheckpointsCompleted": false,
      "missingCheckpoints": [3, 4, 5, 6],
      "firstSubmissionAt": "2026-07-14T13:37:37.302Z",
      "lastSubmissionAt": "2026-07-26T16:32:40.172Z"
    },
    "checkpointProgress": {
      "1": {
        "completed": true,
        "submissionCount": 4,
        "latestSubmission": {
          "_id": "6a56436c9c6a3f9b2086441a",
          "location": 1,
          "dealId": { "_id": "...", "dealName": "...", "rallyLocation": 1 },
          "driverId": "DRV-JZrMJ2",
          "driverName": "Sandaru Abeyratne",
          "question": "What is the name of the tallest mountain in Sri Lanka?",
          "answer": "Adams Peak",
          "submittedBy": "0iYmbQmn23Uncu9mjCXFzcJZrMJ2",
          "createdAt": "2026-07-14T14:10:52.179Z",
          "updatedAt": "2026-07-14T14:10:52.179Z"
        }
      },
      "2": { "completed": true, "submissionCount": 1, "latestSubmission": { "...": "..." } },
      "3": { "completed": false, "submissionCount": 0, "latestSubmission": null },
      "4": { "completed": false, "submissionCount": 0, "latestSubmission": null },
      "5": { "completed": false, "submissionCount": 0, "latestSubmission": null },
      "6": { "completed": false, "submissionCount": 0, "latestSubmission": null }
    },
    "submissions": [
      { "_id": "...", "location": 2, "question": "...", "answer": "...", "createdAt": "..." },
      { "_id": "...", "location": 1, "question": "...", "answer": "...", "createdAt": "..." }
    ]
  }
}
```

### Field notes

- `checkpointProgress` — an object keyed by checkpoint number `"1"`–`"6"`, each with:
  - `completed` — whether the user has at least one submission for that checkpoint
  - `submissionCount` — how many times they submitted an answer for that checkpoint
  - `latestSubmission` — the most recent submission document for that checkpoint (or `null`), with `dealId` populated to `{ dealName, rallyLocation }`
- `submissions` — the user's full rally submission history, newest first. Useful for a timeline/activity view.

### Additional error response

| Status | Meaning |
|--------|---------|
| 400 | `:userId` is not a valid MongoDB ObjectId |
| 404 | No mobile user found with that id |

---

## Data model reference

**`RallySubmission`** (`backend/models/rallySubmissionModel.js`)

| Field | Notes |
|-------|-------|
| `location` | Checkpoint number, `1`–`6` |
| `dealId` | Ref to the rally `Deal` for that checkpoint |
| `driverId`, `driverName` | Entered by the user at submission time |
| `question`, `answer` | Snapshot of the question and the submitted answer |
| `submittedBy` | Firebase UID of the mobile user, matched against `MobileUser.firebaseUid` |
| `createdAt` | Submission timestamp |




