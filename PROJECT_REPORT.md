Spill – Project Progress Report

Prepared for supervisor meeting


1. Product overview

Spill is a mobile social app (React Native / Expo, Firebase backend) for one specific niche: mental wellbeing and emotional support. Unlike general-purpose social media, it is built only for anonymous venting, mood tracking, and lightweight peer support. The goal is to give users (e.g. students and young adults) a safe place to share, get support, and build better mental wellbeing habits—a dedicated social space for that niche rather than a corner of a larger, identity-driven platform.


Why Spill when people have Instagram, Twitter, YouTube?

Those apps are built for reach, identity, and entertainment. People use them to grow a following, get likes, or consume content. Venting about real struggles there is risky: same audience as friends, family, and employers; algorithms that can push sensitive posts to the wrong people; and a culture that often rewards performance rather than honesty.

Spill is built for the opposite. It is a dedicated space for emotional venting and wellbeing. Users can post anonymously or under a separate identity so they can be honest without social cost. The community is there for the same reason (to vent and support), not to argue or go viral. We add mood tracking, gratitude, and (future) 1:1 therapist sessions, and we moderate for harm with tools like Perspective API and admin review. Universities and institutions can deploy Spill as a purpose-built wellbeing tool with privacy and analytics, instead of telling students to use Twitter or Instagram. So the reason to use Spill is: when you need a place to vent and get support, not to perform or broadcast to the whole world.


2. Features delivered

2.1 Authentication and users

- Email/password sign-up and login (Firebase Auth)
- Email verification, password reset, profile (display name, anonymous username, avatar)
- Roles: normal users, staff (can log in without email verification), and one super admin
- Staff accounts created by admin via Cloud Function

2.2 Feed and posting

- Main feed with posts (text + media), categories, upvotes/downvotes, view and comment counts
- Vent mode: short-lived, time-limited posts
- Post menu: delete (own post), report (others' posts)
- Anonymous posting option

2.3 Emotional tools

- Mood posts and venting
- Gratitude / positive reflections
- Anonymous identity separate from main profile

2.4 Connections and messaging

- Follow system (followers / following)
- One-to-one DMs (conversations + messages in Firestore)
- Basic chat UI

2.5 Groups and community

- Groups with members, activities, and streaks (partly still on Supabase; migration path to Firebase defined)

2.6 Admin dashboard

- Admin-only area with:
  - Login stats: logins per day (last 14 days), chart
  - Time in app: total minutes per day and per user (session-based tracking)
  - Reports: list of reported posts; actions: remove post, send warning, terminate account
- Add-staff flow for creating staff accounts

2.7 Safety and moderation

- User reports: users can report posts, creates report for admin
- Auto-toxicity: Cloud Function calls Google Perspective API on new posts; high toxicity means post flagged and system report created for admin
- Admin can remove post, send warning, or terminate user (blocked from app)

2.8 Backend and tracking

- Migration from Supabase to Firebase for core features (auth, users, posts, comments, DMs, followers, reports, session logs)
- Login tracking: every login recorded in login_logs
- Time-in-app: session start/end tracked; minutes per day (and per user) available to admin


3. Premium and future: therapists (1:1 sessions)

3.1 Premium today

- Premium tier is supported in the data model (is_premium, premium_activated_at, premium_expires_at on users)
- Ready for gating premium-only features (e.g. extended vent mode, advanced mood tools, or exclusive groups)

3.2 Future: therapists for premium members

Planned feature: Premium members will be able to book 1:1 sessions with therapists inside the app.

- Who: Licensed therapists (onboarded and verified by Spill)
- Who can book: Premium subscribers only
- Flow (to be built): Browse/select therapist, book slot, 1:1 session (e.g. in-app video or link to secure platform)
- Business: Premium subscription revenue plus possible revenue share or fee per session with therapists

This positions Spill not only as a peer-support and self-help tool but as a path to professional support for paying users.


4. Business potential

B2C – Premium subscriptions: Paid tier for vent mode, mood tools, and (future) therapist sessions and other premium-only features.

B2B – Universities / institutions: Offer Spill as a wellbeing platform for students: anonymous venting, mood tracking, admin analytics (logins, time in app), and harm protection. License or subscription per institution.

Therapist network (future): Premium members get access to 1:1 sessions with therapists; revenue from subscriptions and/or per-session fees.

Research and insights: Aggregated, anonymized data on engagement and usage (with strict privacy and ethics) for research or institutional reports.


5. What is working right now

- Firebase: Auth, Firestore, Cloud Functions in use for core app and admin
- Admin: Login stats, time-in-app stats, reports list, add staff, terminate account
- Moderation: User reports plus Perspective API auto-flagging (function implemented; API key configured)
- Time-in-app: Session tracking and per-day / per-user stats
- Data model: Premium fields on users; ready for therapist/session features later


6. Next steps

- Test and tune Perspective API (thresholds, edge cases)
- In Admin Reports, clearly label System (toxicity) vs User report
- Finish migrating remaining Supabase features (groups, streaks) to Firebase
- Define premium feature set and pricing; then design and build therapist onboarding and 1:1 booking for premium members


 Premium therapist feature is planned for a future release.
