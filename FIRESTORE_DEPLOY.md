# Firestore: Fix "Missing or insufficient permissions" and index errors

If you see **Missing or insufficient permissions** or **query needs a composite index**, deploy your Firestore rules and indexes:

```bash
firebase deploy --only firestore
```

This will:
1. **Publish `firestore.rules`** – so notifications, match_requests, users, etc. are readable/writable as intended.
2. **Create indexes from `firestore.indexes.json`** – for conversations, match_requests, and notifications queries.

Make sure you’re in the project root and have run `firebase use <your-project-id>` if you use multiple projects.

After deployment, wait a minute for indexes to build, then try the app again.
