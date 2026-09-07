# CFAM

CFAM means **Call Family**: a serverless communication app for private chats, image messages, voice calls, and video calls.

## Project details

- **Project name:** CFAM
- **Package name:** `cfam`
- **Stack:** React + TypeScript + Vite
- **Authentication:** Firebase Authentication with email/password and email verification
- **History:** Cloud Firestore realtime listeners for profiles, conversations, messages, and presence
- **Images:** compressed JPEG data URLs stored in Firestore message documents, capped below the Firestore 1 MiB document limit
- **Calls:** browser WebRTC media with Firestore signaling documents; no custom server required
- **Hosting:** Firebase Hosting or GitHub Pages

The current UI is a working front-end prototype. The Firebase client is prepared in `src/lib/firebase.ts`; connect the auth, Firestore listeners, and WebRTC signaling before production use.

## Firebase setup

1. Create a Firebase project named `cfam-call-family` (or another globally available ID) at https://console.firebase.google.com.
2. Add a Web app named `CFAM Web`.
3. Enable **Authentication > Sign-in method > Email/Password**.
4. Add the deployed domain under **Authentication > Settings > Authorized domains**.
5. Enable **Authentication > Settings > Email enumeration protection**.
6. In **Authentication > Templates**, set the verification email sender and authorized domain.
  Set the verification email action text to **Verify your account**, use CFAM as the sender name,
  and keep the action URL on the deployed CFAM domain. The app passes the deployed site as the
  post-verification destination so users return to a familiar CFAM address after clicking.
7. Create a Firestore database in production mode.
8. Copy the web app configuration into a local `.env` file based on `.env.example`.
9. Install and log in to the Firebase CLI:

```powershell
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore:rules,firestore:indexes
```

For Firebase Hosting after building:

```powershell
npm run build
firebase deploy --only hosting
```

Never commit `.env`. `VITE_FIREBASE_*` values identify the web app but do not replace Firestore rules or Authentication controls.

## Firestore data model

```text
users/{uid}
  username, usernameLower, firstName, lastName, age, photoUrl, emailVerified

usernames/{usernameLower}
  uid

conversations/{conversationId}
  memberIds: [uid, uid], lastMessage, lastMessageAt, updatedAt

conversations/{conversationId}/messages/{messageId}
  senderId, text, imageBase64?, createdAt, type: text | image

presence/{uid}
  online, lastSeen
```

Use `onSnapshot` for the conversation list and the active message subcollection. Presence should be written on sign-in, tab visibility changes, and `beforeunload`; treat it as best-effort because a browser can disappear without sending a final event.

## Image message constraint

Firestore documents have a 1 MiB maximum. CFAM compresses selected images in the browser to JPEG and the rules allow at most 700,000 characters for `imageBase64`. Reject larger images in the UI and store a thumbnail for the conversation preview. Do not use this approach for large media libraries; use Firebase Storage for that future feature.

## Calls without a server

Use `RTCPeerConnection` for audio/video. Store the offer, answer, and ICE candidates in a short-lived Firestore `calls/{callId}` document and its candidate subcollections. Delete the signaling document after the call ends. Public STUN servers can work for development; production reliability generally needs a TURN provider.

## Public APIs reference

The linked `public-apis/public-apis` repository is a catalog, not a single API and does not provide authentication, realtime messaging, or WebRTC signaling. CFAM therefore does not depend on a random third-party API for core communication. It can be used later for optional features such as avatars, time zones, or link previews; keep those calls client-side and never send Firebase credentials to them.

## Development

```powershell
npm install
npm run dev
```

The local preview is available at http://127.0.0.1:5173/.
